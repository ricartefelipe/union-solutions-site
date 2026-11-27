#!/bin/sh
# Demonstração do Fornevia na VPS das demonstrações. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/fornevia, com .env preenchido a partir de .env.example (`segredos`).
#
# As imagens são construídas numa máquina de trabalho, a partir da tag do produto, e carregadas na VPS; `subir` e
# `reiniciar-dados` não compilam:
#   git -C fornevia archive v<tag> | tar -x -C /tmp/fornevia-<tag> && cd /tmp/fornevia-<tag>
#   docker build -f docker/php/Dockerfile --target prod -t demo-fornevia-app:<tag> .
#   docker build -f docker/php/Dockerfile --target web -t demo-fornevia-web:<tag> .
#   docker save demo-fornevia-app:<tag> demo-fornevia-web:<tag> | gzip | ssh root@<vps> 'gunzip | docker load'
# Ao trocar de tag, copie também docker/postgres/init/01-roles.sh da tag nova para postgres-init/.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: rode sh demo.sh segredos."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

# O Laravel só aceita X-Forwarded-* vindo da rede do proxy das demonstrações. A faixa é lida a cada execução, para
# seguir a rede mesmo se ela for recriada. Para parar, ver estado e logs, a rede não precisa existir.
rede_do_proxy() {
  DEMOS_PROXY_SUBNET=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$(value DEMOS_NETWORK)" 2>/dev/null | awk '{print $1}')
  if [ -z "$DEMOS_PROXY_SUBNET" ]; then
    [ "${1:-}" = "exigir" ] && { echo "Rede $(value DEMOS_NETWORK) não encontrada: suba o proxy das demonstrações antes."; exit 2; }
    DEMOS_PROXY_SUBNET=127.0.0.1/32
  fi
  export DEMOS_PROXY_SUBNET
}

ja_carregado() {
  n=$($COMPOSE exec -T postgres psql -U postgres -d fornevia -tAc 'SELECT count(*) FROM users' 2>/dev/null || true)
  [ -n "$n" ] && [ "$n" != "0" ]
}

# Banco e Redis, migrations com o papel de manutenção e a carga de demonstração do produto. A carga recusa
# APP_ENV=production: só este processo avulso roda com outro nome, pelo fornevia-start (que prepara o storage em tmpfs).
carregar_dados() {
  $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres redis
  $COMPOSE run --rm --no-deps migrate
  $COMPOSE run --rm --no-deps -e APP_ENV=demo app fornevia-start php artisan demo:seed --password="$(value FORNEVIA_DEMO_PASSWORD)"
}

status() {
  $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in DB_PASSWORD DB_OWNER_PASSWORD DB_RELAY_PASSWORD DB_SUPERUSER_PASSWORD REDIS_PASSWORD METRICS_TOKEN; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    sed -i "s|^APP_KEY=GERADO\$|APP_KEY=base64:$(head -c 32 /dev/urandom | base64)|" .env
    echo "Criado .env com os segredos gerados."
    ;;
  instalar)
    require_env
    sed "s|__DEMO_HOST__|$(value DEMO_HOST)|g" demo-fornevia.caddy > "$PROXY/sites/demo-fornevia.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  subir)
    require_env
    rede_do_proxy exigir
    $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres redis
    if ja_carregado; then $COMPOSE run --rm --no-deps migrate; else carregar_dados; fi
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    status
    ;;
  parar)
    rede_do_proxy
    $COMPOSE down
    ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-fornevia.timer;
    # também mantém a avaliação de 14 dias dos distribuidores da carga sempre dentro do prazo.
    require_env
    rede_do_proxy exigir
    $COMPOSE down -v --remove-orphans
    carregar_dados
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status)
    rede_do_proxy
    status
    ;;
  logs)
    shift
    rede_do_proxy
    $COMPOSE logs --tail=200 "$@"
    ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
