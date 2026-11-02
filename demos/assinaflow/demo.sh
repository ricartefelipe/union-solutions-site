#!/bin/sh
# Demonstração do AssinaFlow na VPS do portal. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/assinaflow, com .env preenchido a partir de .env.example.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PORTAL=$DIR/../../portal/deploy/production
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { grep "^$1=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: copie .env.example, preencha e use permissão 600."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in ASSINAFLOW_DB_PASSWORD ASSINAFLOW_RABBIT_PASSWORD ASSINAFLOW_JWT_SECRET; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    echo "Criado .env com os segredos gerados. Confira DEMO_HOST e ASSINAFLOW_SRC."
    ;;
  instalar)
    require_env
    tag=$(value ASSINAFLOW_TAG); src=$(value ASSINAFLOW_SRC)
    if [ -d "$src/.git" ]; then git -C "$src" fetch -q --tags origin; else git clone -q https://github.com/ricartefelipe/assinaflow.git "$src"; fi
    git -C "$src" checkout -q "$tag" && echo "AssinaFlow $tag em $src ($(git -C "$src" rev-parse --short HEAD))."
    cp demo-assinaflow.caddy "$PORTAL/sites/demo-assinaflow.caddy"
    echo "Site instalado no proxy do portal. Reinicie o proxy: (cd $PORTAL && docker compose --env-file .env restart proxy)"
    ;;
  subir)
    require_env
    $COMPOSE up -d --build --wait --wait-timeout 600
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-assinaflow.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
