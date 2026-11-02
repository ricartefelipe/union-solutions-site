#!/bin/sh
# Demonstração do ComercialCloud na VPS do portal. Uso: sh demo.sh <instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/comercialcloud, com .env preenchido a partir de .env.example.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PORTAL=$DIR/../../portal/deploy/production
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { grep "^$1=" .env | head -n 1 | cut -d= -f2-; }

require_env() {
  [ -f .env ] || { echo "Falta .env: copie .env.example, preencha e use permissão 600."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    sed -i "s|^COMERCIALCLOUD_DB_PASSWORD=GERADO$|COMERCIALCLOUD_DB_PASSWORD=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')|" .env
    echo "Criado .env com a senha do banco gerada. Preencha o restante marcado com SUBSTITUIR."
    ;;
  instalar)
    require_env
    tag=$(value COMERCIALCLOUD_TAG); src=$(value COMERCIALCLOUD_SRC)
    if [ -d "$src/.git" ]; then git -C "$src" fetch -q --tags origin; else git clone -q https://github.com/ricartefelipe/comercial-cloud.git "$src"; fi
    git -C "$src" checkout -q "$tag" && echo "ComercialCloud $tag em $src ($(git -C "$src" rev-parse --short HEAD))."
    cp demo-comercialcloud.caddy "$PORTAL/sites/demo-comercialcloud.caddy"
    echo "Site instalado no proxy do portal. Reinicie o proxy: (cd $PORTAL && docker compose --env-file .env restart proxy)"
    ;;
  subir)
    require_env
    $COMPOSE up -d --build --wait --wait-timeout 600
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-comercialcloud.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
