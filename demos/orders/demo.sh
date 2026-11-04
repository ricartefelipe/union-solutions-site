#!/bin/sh
# Demonstração do order-service na VPS das demonstrações. Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/orders, com .env preenchido a partir de .env.example. As imagens são construídas em outra
# máquina (`construir`) e carregadas na VPS; `subir` e `reiniciar-dados` não compilam.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: copie .env.example, preencha e use permissão 600."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

fixar() {
  repo=$1; versao=$2; dest=$(value ORDERS_SRC)/$repo
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q --tags origin; else git clone -q "https://github.com/ricartefelipe/$repo.git" "$dest"; fi
  git -C "$dest" checkout -q "$versao" && echo "$repo $(git -C "$dest" rev-parse --short HEAD)."
}

baixar() {
  fixar order-service "$(value ORDERS_COMMIT)"
}
# Token público da demonstração: só escopos de pedidos, na origem "visitante", válido por um ano; o segredo que o assina não sai do .env.
gerar_entrada() {
  destino=$1
  token=$(ORDERS_AUTH_SECRET="$(value ORDERS_AUTH_SECRET)" ORDERS_AUTH_ISSUER=order-service-demo ORDERS_AUTH_AUDIENCE=order-service \
    bash "$(value ORDERS_SRC)/order-service/scripts/issue-token.sh" visitante "orders:create orders:read" 31536000)
  mkdir -p "$destino"
  sed "s|__TOKEN__|$token|" entrar.html > "$destino/index.html"
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in ORDERS_DB_PASSWORD ORDERS_AUTH_SECRET; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    echo "Criado .env com os segredos gerados."
    ;;
  baixar)
    require_env
    baixar
    ;;
  instalar)
    require_env
    baixar
    cp demo-orders.caddy "$PROXY/sites/demo-orders.caddy"
    gerar_entrada "$PROXY/sites/orders-entrada"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  entrada)
    # Gera só a página /entrar na pasta indicada.
    require_env
    gerar_entrada "$2"
    ;;
  construir)
    require_env
    $COMPOSE build
    ;;
  subir)
    require_env
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-orders.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    # O token público dura um ano; refeito a cada reinício, ele nunca chega perto de vencer.
    gerar_entrada "$PROXY/sites/orders-entrada"
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>" ;;
esac
