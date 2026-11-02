#!/bin/sh
# Demonstração do ArchLens na VPS das demonstrações. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/archlens, com .env preenchido a partir de .env.example.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
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
    for campo in ARCHLENS_DB_PASSWORD ARCHLENS_AUTH_SECRET ARCHLENS_DEMO_ADMIN_PASSWORD ARCHLENS_DEMO_VIEWER_PASSWORD; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    echo "Criado .env com os segredos gerados. Confira DEMO_HOST e ARCHLENS_SRC."
    ;;
  instalar)
    require_env
    commit=$(value ARCHLENS_COMMIT); src=$(value ARCHLENS_SRC)
    if [ -d "$src/.git" ]; then git -C "$src" fetch -q origin; else git clone -q https://github.com/ricartefelipe/archlens.git "$src"; fi
    git -C "$src" checkout -q "$commit" && echo "ArchLens $(git -C "$src" rev-parse --short HEAD) em $src."
    cp demo-archlens.caddy "$PROXY/sites/demo-archlens.caddy"
    mkdir -p "$PROXY/sites/archlens-amostra"
    cp amostra/analysis.json "$PROXY/sites/archlens-amostra/analysis.json"
    echo "Site e amostra instalados no proxy das demonstrações. Reinicie o proxy: (cd $PROXY && docker compose --env-file .env restart proxy)"
    ;;
  subir)
    require_env
    $COMPOSE up -d --build --wait --wait-timeout 600
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Contas fictícias são compartilhadas por todos os visitantes: descarta e recria para não acumular dados.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
