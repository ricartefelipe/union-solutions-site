#!/bin/sh
# Operação do portal em produção. Uso: sh portal-prod.sh <comando>
# Nenhum comando imprime a configuração resolvida: `docker compose config` sem -q mostraria os segredos.
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"

ENV_FILE=${PORTAL_PROD_ENV:-$DIR/.env}
PROJECT=${PORTAL_PROD_PROJECT:-union-portal-prod}
# Só o ambiente de prova informa um arquivo adicional. Em produção, fica vazio.
EXTRA=${PORTAL_PROD_COMPOSE_EXTRA:-}
COMPOSE="docker compose -p $PROJECT --env-file $ENV_FILE -f $DIR/compose.yaml${EXTRA:+ -f $EXTRA}"
SERVICES="postgres armazenamento clamav keycloak backend frontend proxy"

random() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

# Backup, restauração e atualização passam um por vez por implantação. A trava fica ao lado da configuração
# (flock, por projeto). Um timer e uma chamada manual não se sobrepõem: o segundo espera até PORTAL_LOCK_WAIT segundos
# e desiste com aviso. `atualizar` chama `backup` com a trava já em mãos, herdada pela variável de ambiente.
LOCK_FILE=${PORTAL_LOCK_FILE:-$ENV_FILE.$PROJECT.lock}
LOCK_WAIT=${PORTAL_LOCK_WAIT:-600}
with_lock() {
  if [ "${PORTAL_LOCK_HELD:-}" = "$PROJECT" ]; then
    "$@"
    return
  fi
  exec 9>"$LOCK_FILE"
  if ! flock -w "$LOCK_WAIT" 9; then
    echo "Outra operação (backup, restauração ou atualização) está em andamento em '$PROJECT'. Desisti depois de ${LOCK_WAIT} s." >&2
    exit 75
  fi
  export PORTAL_LOCK_HELD=$PROJECT
  "$@"
  unset PORTAL_LOCK_HELD
  flock -u 9
}

backend_state() { docker inspect --format '{{.State.Status}} {{.State.Paused}}' "$PROJECT-backend-1" 2>/dev/null || echo "ausente"; }

# Despausa só o que esta execução pausou, e confere o resultado. Falha aqui é anunciada, nunca escondida.
PAUSED_BY_US=0
resume_backend() {
  [ "$PAUSED_BY_US" = 1 ] || return 0
  n=0
  while [ "$n" -lt 5 ]; do
    $COMPOSE unpause backend >/dev/null 2>&1 || true
    if [ "$(backend_state)" = "running false" ]; then
      PAUSED_BY_US=0
      return 0
    fi
    n=$((n + 1))
    sleep 2
  done
  echo "ATENÇÃO: a API continua pausada ($(backend_state)). Rode: docker compose -p $PROJECT unpause backend" >&2
  return 1
}

run_backup() {
  require_env
  # Identificador único: a área temporária é só desta execução.
  run_id=$(date +%Y%m%d-%H%M%S)-$$
  ops() { $COMPOSE run --rm --no-deps -T -e PORTAL_BACKUP_RUN="$run_id" ops /ops/backup.sh "$@"; }
  finish() {
    rc=$?
    resume_backend || rc=1
    ops limpar >/dev/null 2>&1 || echo "Área temporária $run_id não removida; será tratada na próxima execução." >&2
    exit $rc
  }
  trap finish EXIT
  trap 'exit 143' INT TERM
  case "$(backend_state)" in
    "running false") ;;
    "paused true") echo "A API já está pausada por outra atividade. Não vou mexer nela." >&2; exit 70 ;;
    *) echo "A API não está em execução ($(backend_state))." >&2; exit 70 ;;
  esac
  ops abandonadas
  # A API fica pausada só durante a cópia local: banco e objetos correspondem ao mesmo momento.
  # Pausar congela os processos; conexões em voo com banco e armazenamento ficam incompletas e não entram na cópia (ver OPERACAO.md).
  # A marca entra antes do comando: um sinal que chegue durante a pausa ainda leva à despausa na saída.
  PAUSED_BY_US=1
  $COMPOSE pause backend
  ops preparar
  resume_backend
  ops enviar
}

require_env() {
  [ -f "$ENV_FILE" ] || { echo "Arquivo de configuração ausente. Rode: sh portal-prod.sh segredos"; exit 1; }
}

value() { grep "^$1=" "$ENV_FILE" | head -n 1 | cut -d= -f2-; }

check_config() {
  require_env
  problems=0
  mode=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo desconhecido)
  case "$mode" in
    600|400) ;;
    *) echo "Permissão de $ENV_FILE é $mode: use 600."; problems=1 ;;
  esac
  for name in $(grep -E '^[A-Z0-9_]+=(.*SUBSTITUIR.*|GERADO)$' "$ENV_FILE" | cut -d= -f1); do
    echo "Falta preencher: $name"
    problems=1
  done
  host=$(value PORTAL_HOST)
  public=$(value PORTAL_PUBLIC_URL)
  [ "$public" = "https://$host" ] || { echo "PORTAL_PUBLIC_URL precisa ser https://PORTAL_HOST."; problems=1; }
  if [ -n "$(value PORTAL_DEMO_ENABLED)" ]; then echo "PORTAL_DEMO_ENABLED não pertence à produção."; problems=1; fi
  case "$(value RESTIC_REPOSITORY)" in
    sftp:*)
      # Conferido de dentro do container de operação: é ele quem precisa ler a chave e a identidade do servidor.
      $COMPOSE run --rm --no-deps -T --entrypoint sh ops -c 'test -r /run/backup-ssh/chave' </dev/null 2>/dev/null \
        || { echo "Backup por sftp sem chave legível pelo container: rode sh portal-prod.sh chave-backup."; problems=1; }
      $COMPOSE run --rm --no-deps -T --entrypoint sh ops -c 'test -s /run/backup-ssh/known_hosts' </dev/null 2>/dev/null \
        || { echo "Backup por sftp sem identidade do servidor: rode sh portal-prod.sh destino-backup <servidor> <porta>."; problems=1; }
      ;;
    /repositorio-local) echo "Aviso: backup provisório na própria VPS. Defina um destino externo antes de receber dados reais." ;;
  esac
  $COMPOSE config -q || problems=1
  return "$problems"
}

wait_ready() {
  $COMPOSE up -d --wait --wait-timeout "${1:-900}" $SERVICES
}

command=${1:-ajuda}
[ "$#" -gt 0 ] && shift

case "$command" in
  segredos)
    if [ -e "$ENV_FILE" ]; then
      echo "$ENV_FILE já existe: segredos preservados."
      exit 0
    fi
    umask 077
    while IFS= read -r line; do
      case "$line" in
        *=GERADO) echo "${line%=GERADO}=$(random)" ;;
        *) echo "$line" ;;
      esac
    done < .env.example > "$ENV_FILE"
    echo "Criado $ENV_FILE com permissão 600. Preencha os valores marcados com SUBSTITUIR."
    ;;
  verificar)
    check_config
    echo "Configuração sem pendências."
    ;;
  chave-backup)
    # Chave só do backup, lida pelo usuário ops (uid 1002) do container. A privada nunca sai da VPS.
    # A pasta inteira pertence ao usuário ops: sem isso o container não atravessa o diretório para ler a chave.
    mkdir -p "$DIR/backup-ssh" && chown 1002:1002 "$DIR/backup-ssh" && chmod 700 "$DIR/backup-ssh"
    [ -f "$DIR/backup-ssh/chave" ] || ssh-keygen -q -t ed25519 -N "" -C "union-portal-backup" -f "$DIR/backup-ssh/chave"
    chown 1002:1002 "$DIR/backup-ssh/chave" "$DIR/backup-ssh/chave.pub" && chmod 600 "$DIR/backup-ssh/chave"
    echo "Cadastre esta chave pública no destino do backup:"
    cat "$DIR/backup-ssh/chave.pub"
    ;;
  destino-backup)
    host=${1:-}; port=${2:-22}
    [ -n "$host" ] || { echo "Uso: sh portal-prod.sh destino-backup <servidor> [porta]"; exit 2; }
    mkdir -p "$DIR/backup-ssh" && chown 1002:1002 "$DIR/backup-ssh" && chmod 700 "$DIR/backup-ssh"
    ssh-keyscan -p "$port" -t ed25519 "$host" 2>/dev/null > "$DIR/backup-ssh/known_hosts"
    [ -s "$DIR/backup-ssh/known_hosts" ] || { echo "Não foi possível obter a identidade de $host:$port."; exit 1; }
    chown 1002:1002 "$DIR/backup-ssh/known_hosts" && chmod 644 "$DIR/backup-ssh/known_hosts"
    echo "Identidade fixada para $host:$port. Confira a impressão digital com o painel do destino, se ele a mostrar:"
    ssh-keygen -lf "$DIR/backup-ssh/known_hosts"
    ;;
  subir)
    check_config
    $COMPOSE --profile ops build
    # Os serviços de preparação terminam depois de executar: rodam antes, porque `--wait` trataria a saída como falha.
    $COMPOSE up -d --wait --wait-timeout 300 postgres armazenamento
    $COMPOSE run --rm --no-deps db-init
    $COMPOSE run --rm --no-deps storage-init
    wait_ready 900
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
    ;;
  parar)
    $COMPOSE stop
    ;;
  status)
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
    ;;
  logs)
    $COMPOSE logs --tail=200 "$@"
    ;;
  reiniciar-banco)
    # Com `restart: true` no depends_on, o Compose reinicia também o provedor e a API, que voltam com conexões novas.
    $COMPOSE restart postgres
    wait_ready 600
    ;;
  backup)
    with_lock run_backup
    ;;
  backup-status)
    require_env
    limit=$(value PORTAL_BACKUP_MAX_AGE_HOURS)
    latest=$($COMPOSE run --rm --no-deps -T --entrypoint sh ops -c '/ops/restic.sh snapshots --host portal --tag portal --latest 1 --json' | sed -n 's/.*"time":"\([^".]*\).*/\1/p' | head -n 1)
    [ -n "$latest" ] || { echo "Nenhum backup encontrado."; exit 1; }
    age=$(( ($(date -u +%s) - $(date -u -d "$latest" +%s)) / 3600 ))
    echo "Último backup: $latest UTC, há $age h. Limite: ${limit:-26} h."
    [ "$age" -le "${limit:-26}" ]
    ;;
  reconciliar)
    require_env
    $COMPOSE run --rm --no-deps -T ops /ops/reconciliar.sh
    ;;
  restaurar)
    check_config
    snapshot=${1:-latest}
    echo "Isto substitui bancos e arquivos de '$PROJECT' pelo backup '$snapshot'."
    printf "Digite RESTAURAR para confirmar: "
    read -r answer || answer=""
    [ "$answer" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
    do_restore() {
      $COMPOSE stop proxy frontend backend keycloak 2>/dev/null || true
      $COMPOSE --profile ops build
      $COMPOSE up -d --wait --wait-timeout 300 postgres armazenamento
      $COMPOSE run --rm --no-deps db-init
      $COMPOSE run --rm --no-deps storage-init
      $COMPOSE run --rm --no-deps -T ops /ops/restore.sh "$snapshot"
      wait_ready 900
      echo "Portal restaurado. Confira login, histórico e download de arquivo."
    }
    with_lock do_restore
    ;;
  atualizar)
    # Migrations só avançam: faça o backup antes. Se algo falhar, volte à imagem anterior e restaure o backup.
    check_config
    do_update() {
      sh "$DIR/portal-prod.sh" backup
      $COMPOSE --profile ops build
      $COMPOSE up -d --no-deps --wait --wait-timeout 300 postgres armazenamento
      $COMPOSE run --rm --no-deps db-init
      wait_ready 900
    }
    with_lock do_update
    ;;
  remover-mfa)
    # Recuperação do segundo fator. Exige motivo ou identificador de atendimento e registra o operador na auditoria.
    # O operador é quem executa no servidor (via sudo, o usuário original). Quem tem root ou acesso ao Docker consegue
    # fazer o mesmo por outros caminhos: este registro vale para quem segue o procedimento, não contra um administrador hostil.
    require_env
    email=${1:-}
    reason=${2:-}
    [ -n "$email" ] && [ -n "$reason" ] || { echo "Uso: sh portal-prod.sh remover-mfa <e-mail> \"<motivo ou atendimento>\""; exit 2; }
    operator=${SUDO_USER:-$(id -un)}; [ -n "${SUDO_USER:-}" ] && operator="$SUDO_USER (via sudo, uid $(id -u))"
    correlation=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
    portal_side() { $COMPOSE run --rm --no-deps -T ops /ops/mfa-reset-portal.sh "$@"; }
    log() { logger -t portal-prod "remover-mfa correlacao=$correlation conta=$email operador=$operator $*" 2>/dev/null || true; }
    if ! portal_side registrar "$email" "$operator" "$correlation" "$reason"; then
      echo "Auditoria indisponível: nada foi alterado." >&2; log "resultado=abortado-auditoria"; exit 3
    fi
    set +e
    out=$($COMPOSE exec -T ${PORTAL_MFA_KCADM:+-e PORTAL_MFA_KCADM=$PORTAL_MFA_KCADM} keycloak sh /opt/keycloak/bin/portal-mfa-reset.sh "$email" 2>/tmp/mfa-err-$$)
    rc=$?
    set -e
    err=$(cat /tmp/mfa-err-$$ 2>/dev/null | head -c 200); rm -f /tmp/mfa-err-$$
    sub=$(printf '%s\n' "$out" | sed -n 's/^SUB=//p'); removed=$(printf '%s\n' "$out" | sed -n 's/^REMOVIDOS=//p')
    if [ "$rc" -ne 0 ] && [ "$rc" -ne 6 ]; then
      portal_side concluir "$email" "$operator" "$correlation" "$reason" "" "${removed:-0}" "falha no provedor (saída $rc): $err" || true
      log "resultado=falha-provedor saida=$rc"
      echo "Recuperação não realizada: $err" >&2
      exit "$rc"
    fi
    # O segundo fator já foi removido. O que faltar a partir daqui é recuperação parcial e é anunciado como tal.
    partial=""
    [ "$rc" -eq 6 ] && partial="sessões do provedor não encerradas"
    if sessions=$(portal_side encerrar "$email" "$operator" "$correlation" "$reason" "$sub"); then
      :
    else
      sessions="?"; partial="${partial:+$partial; }sessões do portal não encerradas"
    fi
    result=${partial:+parcial: $partial}; result=${result:-sucesso}
    portal_side concluir "$email" "$operator" "$correlation" "$reason" "$sub" "${removed:-0}" "$result; sessões do portal encerradas=$sessions" || { echo "ATENÇÃO: desfecho não registrado na auditoria." >&2; partial="${partial:+$partial; }auditoria do desfecho"; }
    log "resultado=${partial:+parcial}${partial:-sucesso} otp_removidos=${removed:-0} sessoes_portal=$sessions"
    if [ -n "$partial" ]; then
      echo "Recuperação PARCIAL (correlação $correlation): segundo fator removido (${removed:-0}), mas: $partial." >&2
      echo "Repita o comando depois de resolver, ou encerre as sessões manualmente." >&2
      exit 6
    fi
    echo "Segundo fator removido (${removed:-0} credencial(is)); sessões encerradas no provedor e no portal ($sessions). Correlação $correlation."
    echo "A pessoa configura um novo segundo fator no próximo login."
    ;;
  *)
    echo "Comandos: segredos | verificar | subir | parar | status | logs [serviço] | reiniciar-banco"
    echo "          backup | backup-status | reconciliar | restaurar [snapshot] | atualizar | remover-mfa <e-mail> \"<motivo>\""
    ;;
esac
