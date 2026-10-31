#!/bin/bash
# Executa a configuração de produção em ambiente isolado: projeto, volumes e portas exclusivos, usando o mesmo portal-prod.sh.
# Uso: bash prova.sh <iniciar|testes|auditar|backup|restaurar|medir|coletar|destruir>
set -euo pipefail

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROD=$DIR/..
ROOT=$(CDPATH= cd -- "$DIR/../../../.." && pwd)
STATE=${PROVA_DIR:-$HOME/.cache/union-portal-prova}
OUT=${PROVA_SAIDA:-$ROOT/artifacts/portal-qa/producao}
mkdir -p "$STATE" "$OUT"

export PORTAL_PROD_ENV=$STATE/env
export PORTAL_PROD_PROJECT=${PORTAL_PROD_PROJECT:-union-portal-prova}
export PORTAL_PROD_COMPOSE_EXTRA=$DIR/compose.teste.yaml
export E2E_COMPOSE_PROJECT=$PORTAL_PROD_PROJECT
COMPOSE="docker compose -p $PORTAL_PROD_PROJECT --env-file $PORTAL_PROD_ENV -f $PROD/compose.yaml -f $PORTAL_PROD_COMPOSE_EXTRA"
prod() { sh "$PROD/portal-prod.sh" "$@"; }

criar_env() {
  [ -f "$PORTAL_PROD_ENV" ] && return
  prod segredos >/dev/null
  # Valores só deste ambiente. Os hosts são os da implantação e só existem dentro das redes de teste.
  sed -i \
    -e 's|^PORTAL_SMTP_HOST=.*|PORTAL_SMTP_HOST=smtp-prova.unionsolutions.tech|' \
    -e 's|^PORTAL_SMTP_USER=.*|PORTAL_SMTP_USER=prova|' \
    -e 's|^PORTAL_SMTP_PASSWORD=.*|PORTAL_SMTP_PASSWORD=prova-smtp-local|' \
    -e 's|^PORTAL_BOOTSTRAP_ADMIN_EMAIL=.*|PORTAL_BOOTSTRAP_ADMIN_EMAIL=administracao-prova@unionsolutions.tech|' \
    -e 's|^PORTAL_PRODUCT_LINK_HOSTS=.*|PORTAL_PRODUCT_LINK_HOSTS=produtos-prova.unionsolutions.tech|' \
    -e 's|^RESTIC_REPOSITORY=.*|RESTIC_REPOSITORY=rest:http://restic-alvo:8000/portal|' \
    -e 's|^PORTAL_BACKUP_KEEP_DAILY=.*|PORTAL_BACKUP_KEEP_DAILY=7|' \
    -e 's|^PORTAL_BACKUP_KEEP_WEEKLY=.*|PORTAL_BACKUP_KEEP_WEEKLY=4|' \
    -e 's|^PORTAL_BACKUP_KEEP_MONTHLY=.*|PORTAL_BACKUP_KEEP_MONTHLY=3|' \
    "$PORTAL_PROD_ENV"
}

iniciar() {
  criar_env
  docker volume create union-portal-prova-evidencias >/dev/null
  docker volume create union-portal-prova-repositorio >/dev/null
  $COMPOSE run --rm --no-deps pki-init
  $COMPOSE up -d --no-deps --wait --wait-timeout 60 mailpit restic-alvo
  prod subir
}

testes() {
  $COMPOSE --profile prova build runner >/dev/null
  $COMPOSE --profile prova run --rm --no-deps -e E2E_RUN_ID="${E2E_RUN_ID:-$(date +%s | tail -c 6)}" ${E2E_BROWSER:+-e E2E_BROWSER=$E2E_BROWSER} runner "$@"
}

auditar() {
  echo "== Portas publicadas no host por serviço"
  docker ps --filter "label=com.docker.compose.project=$PORTAL_PROD_PROJECT" --format '{{.Label "com.docker.compose.service"}} {{.Ports}}' | sort | sed -E 's/, /; /g'
  echo "== Usuário de cada processo principal"
  for s in proxy frontend backend keycloak postgres armazenamento clamav; do
    printf '%s: uid=%s\n' "$s" "$(docker exec "$PORTAL_PROD_PROJECT-$s-1" id -u)"
  done
  printf 'clamav, processos: %s\n' "$(docker exec "$PORTAL_PROD_PROJECT-clamav-1" ps -eo user,comm 2>/dev/null | awk 'NR>1 {print $1":"$2}' | sort -u | tr '\n' ' ')"
  echo "== TLS verificado com a autoridade de teste"
  docker run --rm -v "${PORTAL_PROD_PROJECT}_pki:/pki:ro" --network "${PORTAL_PROD_PROJECT}_publica" alpine:3.22 sh -c '
    apk add --no-cache curl openssl >/dev/null
    H=clientes.unionsolutions.tech
    curl -sS --cacert /pki/ca.crt -o /dev/null -w "https %{http_code} verificacao=%{ssl_verify_result}\n" "https://$H/healthz"
    curl -sS -o /dev/null -w "http %{http_code} -> %{redirect_url}\n" "http://$H/projetos"
    curl -sS -o /dev/null "https://$H/" 2>&1 | head -n1 | cut -c1-120
    echo | openssl s_client -connect "$H:443" -servername "$H" -CAfile /pki/ca.crt -verify_return_error 2>/dev/null | grep -E "Verify return code|Protocol  *:" 
    curl -sSI --cacert /pki/ca.crt "https://$H/sessao-encerrada" | grep -iE "^(strict-transport|x-content-type|x-frame|content-security|referrer|server)" | cut -c1-110
  '
  echo "== Recusas de início com configuração de desenvolvimento"
  set +e
  $COMPOSE run --rm --no-deps -T -e PORTAL_DEMO_ENABLED=true backend 2>&1 | grep -oE 'Configuração inválida para produção|portal.demo.enabled[^,"]*' | sort -u
  $COMPOSE run --rm --no-deps -T -e PORTAL_PUBLIC_URL=https://portal.invalid -e PORTAL_SMTP_HOST=mailpit backend 2>&1 | grep -oE 'portal.public-url precisa[^,"]*|quarkus.mailer.host precisa[^,"]*' | sort -u
  $COMPOSE run --rm --no-deps -T -e PORTAL_PUBLIC_URL=http://localhost:3100 frontend 2>&1 | grep -oE 'PORTAL_PUBLIC_URL precisa[^"]*' | sort -u
  set -e
  echo "== Procura por dados sensíveis nos registros"
  for s in proxy frontend backend keycloak; do
    n=$(docker logs "$PORTAL_PROD_PROJECT-$s-1" 2>&1 | grep -cE 'eyJ[A-Za-z0-9_-]{10,}\.|Bearer |[?&](code|key|session_state|token)=[A-Za-z0-9_.-]{10,}|#t=[A-Za-z0-9_-]{10,}|client_secret' || true)
    printf '%s: %s linhas suspeitas\n' "$s" "$n"
  done
  echo "== Volumes e arquivo de configuração"
  stat -c 'env: %a' "$PORTAL_PROD_ENV"
  docker exec "$PORTAL_PROD_PROJECT-postgres-1" sh -c 'stat -c "postgres-data: %a %U" /var/lib/postgresql/data'
  docker exec "$PORTAL_PROD_PROJECT-armazenamento-1" sh -c 'stat -c "armazenamento-data: %a %U" /data'
}

medir() {
  rotulo=${1:-repouso}
  amostras=${2:-3}
  for i in $(seq 1 "$amostras"); do
    docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' $(docker ps -q --filter "label=com.docker.compose.project=$PORTAL_PROD_PROJECT") \
      | sed "s/^$PORTAL_PROD_PROJECT-/$rotulo $(date +%H:%M:%S) /; s/-1 / /" >> "$OUT/medicoes.txt"
    sleep 2
  done
}

coletar() {
  mkdir -p "$OUT"
  docker run --rm -v union-portal-prova-evidencias:/e alpine:3.22 sh -c 'cd /e && tar -cf - --exclude=estado.json --exclude=perfil-firefox --exclude=perfil-firefox/* . ' | tar -xf - --no-same-owner --no-same-permissions -C "$OUT" 2>/dev/null || true
  echo "Evidências em $OUT"
}

# Backup com falha: precisa acusar erro e devolver a API ao normal.
falhas_backup() {
  echo "== Espaço insuficiente"
  set +e
  PORTAL_BACKUP_MIN_FREE_MB=999999999 prod backup 2>&1 | grep -E 'Espaço insuficiente'
  echo "saída: ${PIPESTATUS[0]}; API: $(docker inspect --format '{{.State.Status}}, pausada={{.State.Paused}}' "$PORTAL_PROD_PROJECT-backend-1")"
  echo "== Destino indisponível"
  $COMPOSE stop restic-alvo >/dev/null 2>&1
  inicio=$(date +%s)
  PORTAL_BACKUP_TIMEOUT_SECONDS=30 sh "$PROD/portal-prod.sh" backup >/dev/null 2>&1
  echo "saída: $?, em $(( $(date +%s) - inicio )) s; API: $(docker inspect --format '{{.State.Status}}, pausada={{.State.Paused}}' "$PORTAL_PROD_PROJECT-backend-1")"
  echo "cópia temporária restante: $($COMPOSE run --rm --no-deps -T --entrypoint sh ops -c 'ls /staging | wc -l' 2>/dev/null)"
  $COMPOSE start restic-alvo >/dev/null 2>&1
  echo "== Interrupção durante o backup"
  ( $COMPOSE stop restic-alvo >/dev/null 2>&1
    PORTAL_BACKUP_TIMEOUT_SECONDS=120 sh "$PROD/portal-prod.sh" backup >/dev/null 2>&1 &
    pid=$!
    sleep 4
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
  )
  sleep 3
  docker ps -q --filter "label=com.docker.compose.project=$PORTAL_PROD_PROJECT" --filter 'label=com.docker.compose.oneoff=True' --filter 'label=com.docker.compose.service=ops' | xargs -r docker stop -t 2 >/dev/null
  echo "API depois de interromper: $(docker inspect --format '{{.State.Status}}, pausada={{.State.Paused}}' "$PORTAL_PROD_PROJECT-backend-1")"
  $COMPOSE start restic-alvo >/dev/null 2>&1
  set -e
}

# Ambiente separado para a restauração: outro projeto, outros volumes, mesma configuração e mesmo repositório de backup.
preparar_restauracao() {
  docker volume create union-portal-prova-evidencias >/dev/null
  docker volume create union-portal-prova-repositorio >/dev/null
  $COMPOSE run --rm --no-deps pki-init >/dev/null
  $COMPOSE up -d --no-deps --wait --wait-timeout 60 mailpit restic-alvo >/dev/null 2>&1
}

# Objeto apagado de propósito: a reconciliação precisa acusar.
reconciliacao_negativa() {
  $COMPOSE run --rm --no-deps -T --entrypoint bash ops -c 'source /ops/s3-env.sh; alvo=$(rclone lsf -R --files-only "LOCAL:$BUCKET" | head -n 1); rclone deletefile "LOCAL:$BUCKET/$alvo"' >/dev/null 2>&1
  set +e
  prod reconciliar 2>&1 | grep -E 'Reconciliação|sem objeto'
  echo "saída: ${PIPESTATUS[0]}"
  set -e
}

destruir() {
  $COMPOSE --profile prova --profile ops down -v --remove-orphans
}

comando=${1:-ajuda}
[ "$#" -gt 0 ] && shift
case "$comando" in
  iniciar) iniciar ;;
  testes) testes "$@" ;;
  auditar) auditar ;;
  medir) medir "$@" ;;
  backup) prod backup; prod backup-status ;;
  falhas-backup) falhas_backup ;;
  preparar-restauracao) preparar_restauracao ;;
  reconciliacao-negativa) reconciliacao_negativa ;;
  reiniciar-banco) prod reiniciar-banco ;;
  atualizar) prod atualizar ;;
  remover-mfa) prod remover-mfa "$@" ;;
  verificar-negativo)
    # Configuração recém-criada e com permissão aberta: precisa ser recusada, sem imprimir segredos.
    tmp=$(mktemp -d)
    PORTAL_PROD_ENV=$tmp/env sh "$PROD/portal-prod.sh" segredos >/dev/null
    set +e
    PORTAL_PROD_ENV=$tmp/env sh "$PROD/portal-prod.sh" verificar 2>&1 | cut -c1-90
    echo "saída sem preencher: ${PIPESTATUS[0]}"
    chmod 644 "$tmp/env"
    PORTAL_PROD_ENV=$tmp/env sh "$PROD/portal-prod.sh" verificar 2>&1 | grep -E 'Permissão' | sed "s|$tmp/env|env|"
    set -e
    grep -E '^(POSTGRES_PASSWORD|PORTAL_SESSION_SECRET)=' "$tmp/env" | sed -E 's/=.{8}.*/=<gerado>/'
    rm -rf "$tmp"
    ;;
  restaurar) echo RESTAURAR | prod restaurar "$@" ;;
  coletar) coletar ;;
  destruir) destruir ;;
  compose) $COMPOSE "$@" ;;
  *) echo "Uso: bash prova.sh <iniciar|testes|auditar|medir|backup|restaurar|coletar|destruir|compose>" ;;
esac
