#!/bin/sh
# Demonstração do Pactor na VPS das demonstrações. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/pactor, com .env preenchido a partir de .env.example (`segredos`).
#
# As imagens são construídas numa máquina de trabalho, a partir da tag do produto, e carregadas na VPS; `subir` e
# `reiniciar-dados` não compilam:
#   git -C pactor archive v<tag> | tar -x -C /tmp/pactor-<tag> && cd /tmp/pactor-<tag>
#   docker build -t demo-pactor:<tag> .
#   docker save demo-pactor:<tag> | gzip -1 | ssh root@<vps> 'gunzip | docker load'
# Ao trocar de tag, copie também docker/postgres/10-roles.sh da tag nova para postgres-init/.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
# Assinaturas do ClamAV: fora do projeto, para o reinício diário (down -v) não apagar a base baixada.
ASSINATURAS=demo-pactor-clamav
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: rode sh demo.sh segredos."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

# O gunicorn só aceita X-Forwarded-* vindo da rede do proxy das demonstrações. A faixa é lida a cada execução, para
# seguir a rede mesmo se ela for recriada. Para parar, ver estado e logs, a rede não precisa existir.
rede_do_proxy() {
  DEMOS_PROXY_SUBNET=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$(value DEMOS_NETWORK)" 2>/dev/null | awk '{print $1}')
  if [ -z "$DEMOS_PROXY_SUBNET" ]; then
    [ "${1:-}" = "exigir" ] && { echo "Rede $(value DEMOS_NETWORK) não encontrada: suba o proxy das demonstrações antes."; exit 2; }
    DEMOS_PROXY_SUBNET=127.0.0.1/32
  fi
  export DEMOS_PROXY_SUBNET
}

# Banco, fila, cache e e-mail, com o download das assinaturas de vírus em paralelo; migrations com o papel proprietário; carga de demonstração do produto com o
# papel da aplicação. A carga só completa o que falta (não duplica nem restaura), então roda também em `subir`.
carregar_dados() {
  docker volume create "$ASSINATURAS" >/dev/null
  $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres rabbitmq redis mailpit
  # O clamd sobe no fim (up --wait), depois que o freshclam tiver a base.
  $COMPOSE up -d --no-build freshclam
  $COMPOSE run --rm --no-deps migrate
  $COMPOSE run --rm --no-deps web python manage.py seed_demo
}

status() {
  $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in PACTOR_SECRET_KEY PACTOR_SIMULATOR_WEBHOOK_SECRET POSTGRES_SUPERUSER_PASSWORD PACTOR_OWNER_PASSWORD \
      PACTOR_APP_PASSWORD PACTOR_BACKUP_PASSWORD RABBITMQ_PASSWORD REDIS_PASSWORD; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    # Caminho do admin do Django: imprevisível e, além disso, fechado no proxy.
    sed -i "s|^PACTOR_ADMIN_PATH=GERADO\$|PACTOR_ADMIN_PATH=admin-$(random | cut -c1-16)/|" .env
    echo "Criado .env com os segredos gerados."
    ;;
  instalar)
    require_env
    admin=$(value PACTOR_ADMIN_PATH)
    sed -e "s|__DEMO_HOST__|$(value DEMO_HOST)|g" -e "s|__ADMIN_PREFIX__|${admin%/}|g" \
      demo-pactor.caddy > "$PROXY/sites/demo-pactor.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  subir)
    require_env
    rede_do_proxy exigir
    carregar_dados
    $COMPOSE up -d --no-build --wait --wait-timeout 900
    status
    ;;
  parar)
    rede_do_proxy
    $COMPOSE down
    ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração (menos as assinaturas do ClamAV) e sobe de novo. Agendado diariamente pelo
    # timer demo-pactor.timer; também mantém o período de avaliação de 14 dias das organizações da carga.
    require_env
    rede_do_proxy exigir
    $COMPOSE down -v --remove-orphans
    carregar_dados
    $COMPOSE up -d --no-build --wait --wait-timeout 900
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
