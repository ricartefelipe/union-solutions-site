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
    require_env
    # A API fica pausada só durante a cópia local: banco e objetos correspondem ao mesmo momento.
    # O envio vem depois, com o portal de volta. Uma falha ou interrupção nunca deixa a API pausada.
    resume() { $COMPOSE unpause backend >/dev/null 2>&1 || true; }
    trap resume EXIT
    trap 'exit 143' INT TERM
    $COMPOSE pause backend
    $COMPOSE run --rm --no-deps -T ops /ops/backup.sh preparar
    resume
    $COMPOSE run --rm --no-deps -T ops /ops/backup.sh enviar
    ;;
  backup-status)
    require_env
    limit=$(value PORTAL_BACKUP_MAX_AGE_HOURS)
    latest=$($COMPOSE run --rm --no-deps -T --entrypoint sh ops -c 'restic snapshots --host portal --tag portal --latest 1 --json' | sed -n 's/.*"time":"\([^".]*\).*/\1/p' | head -n 1)
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
    read -r answer
    [ "$answer" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
    $COMPOSE stop proxy frontend backend keycloak 2>/dev/null || true
    $COMPOSE --profile ops build
    $COMPOSE up -d --wait --wait-timeout 300 postgres armazenamento
    $COMPOSE run --rm --no-deps db-init
    $COMPOSE run --rm --no-deps storage-init
    $COMPOSE run --rm --no-deps -T ops /ops/restore.sh "$snapshot"
    wait_ready 900
    echo "Portal restaurado. Confira login, histórico e download de arquivo."
    ;;
  atualizar)
    # Migrations só avançam: faça o backup antes. Se algo falhar, volte à imagem anterior e restaure o backup.
    check_config
    sh "$DIR/portal-prod.sh" backup
    $COMPOSE --profile ops build
    $COMPOSE up -d --no-deps --wait --wait-timeout 300 postgres armazenamento
    $COMPOSE run --rm --no-deps db-init
    wait_ready 900
    ;;
  remover-mfa)
    # Recuperação: quem perdeu o dispositivo volta a configurar o segundo fator no próximo login.
    email=${1:?informe o e-mail da conta}
    $COMPOSE exec -T -e ALVO="$email" keycloak sh -c '
      K=/opt/keycloak/bin/kcadm.sh; C=/tmp/kcadm-$$.config; trap "rm -f $C" EXIT
      $K config credentials --config $C --server http://localhost:8080/identidade --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
      id=$($K get users --config $C -r union-portal -q "email=$ALVO" -q exact=true --fields id --format csv --noquotes)
      [ -n "$id" ] || { echo "Conta não encontrada."; exit 1; }
      removed=0
      $K get "users/$id/credentials" --config $C -r union-portal --fields id,type --format csv --noquotes > /tmp/kc-cred-$$
      while IFS=, read -r credential type; do
        if [ "$type" = otp ]; then
          $K delete "users/$id/credentials/$credential" --config $C -r union-portal
          removed=1
        fi
      done < /tmp/kc-cred-$$
      rm -f /tmp/kc-cred-$$
      if [ "$removed" = 1 ]; then echo "Segundo fator removido: a pessoa configura de novo no próximo login."; else echo "Esta conta não tem segundo fator configurado."; fi
    '
    ;;
  *)
    echo "Comandos: segredos | verificar | subir | parar | status | logs [serviço] | reiniciar-banco"
    echo "          backup | backup-status | reconciliar | restaurar [snapshot] | atualizar | remover-mfa <e-mail>"
    ;;
esac
