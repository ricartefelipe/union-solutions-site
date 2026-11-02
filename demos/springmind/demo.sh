#!/bin/sh
# Demonstração do SpringMind na VPS das demonstrações. Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/springmind, com .env preenchido a partir de .env.example. As imagens são construídas em outra
# máquina (`construir`) e carregadas na VPS; `subir` e `reiniciar-dados` não compilam.
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

fixar() {
  repo=$1; versao=$2; dest=$(value SPRINGMIND_SRC)/$repo
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q --tags origin; else git clone -q "https://github.com/ricartefelipe/$repo.git" "$dest"; fi
  git -C "$dest" checkout -q "$versao" && echo "$repo $(git -C "$dest" rev-parse --short HEAD)."
}

baixar() {
  fixar springmind "$(value SPRINGMIND_COMMIT)"
  fixar reactmind "$(value REACTMIND_COMMIT)"
  fixar mind-shared "$(value MIND_SHARED_COMMIT)"
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in SPRINGMIND_DB_PASSWORD; do
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
    cp demo-springmind.caddy "$PROXY/sites/demo-springmind.caddy"
    echo "Site instalado no proxy das demonstrações. Reinicie o proxy: (cd $PROXY && docker compose --env-file .env restart proxy)"
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
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-springmind.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>" ;;
esac
