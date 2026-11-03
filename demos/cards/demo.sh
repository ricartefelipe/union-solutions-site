#!/bin/sh
# Demonstração do cards-api na VPS das demonstrações. Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/cards, com .env preenchido a partir de .env.example. As imagens são construídas em outra
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
  repo=$1; versao=$2; dest=$(value CARDS_SRC)/$repo
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q --tags origin; else git clone -q "https://github.com/ricartefelipe/$repo.git" "$dest"; fi
  git -C "$dest" checkout -q "$versao" && echo "$repo $(git -C "$dest" rev-parse --short HEAD)."
}

baixar() {
  fixar cards-api "$(value CARDS_TAG)"
}
# O login do console pede e-mail e os usuários da carga do produto não têm. A conta pública é ajustada aqui, só nesta demonstração.
ajustar_conta() {
  $COMPOSE exec -T -e SENHA="$(value CARDS_KEYCLOAK_ADMIN_PASSWORD)" keycloak sh -s <<'KC'
K=/opt/keycloak/bin/kcadm.sh
$K config credentials --config /tmp/kc --server http://127.0.0.1:8080 --realm master --user admin --password "$SENHA" >/dev/null 2>&1
ID=$($K get users --config /tmp/kc -r quarkus -q username=admin --fields id --format csv --noquotes)
$K update users/$ID --config /tmp/kc -r quarkus -s email=visitante@demo-cards.unionsolutions.tech -s emailVerified=true -s firstName=Visitante -s lastName=Demonstracao
$K set-password --config /tmp/kc -r quarkus --userid "$ID" --new-password union-demo
# Keycloak 26.8 recusa o token com Origin fora de webOrigins ("Invalid origin", 403); a carga do produto só traz endereços locais.
CID=$($K get clients --config /tmp/kc -r quarkus -q clientId=cards-admin --fields id --format csv --noquotes)
$K update clients/$CID --config /tmp/kc -r quarkus -s 'webOrigins=["https://demo-cards.unionsolutions.tech"]'
rm -f /tmp/kc
KC
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in CARDS_DB_PASSWORD CARDS_KEYCLOAK_ADMIN_PASSWORD CARDS_KEYCLOAK_CLIENT_SECRET; do
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
    cp demo-cards.caddy "$PROXY/sites/demo-cards.caddy"
    echo "Site instalado no proxy das demonstrações. Reinicie o proxy: (cd $PROXY && docker compose --env-file .env restart proxy)"
    ;;
  ajustar)
    require_env
    ajustar_conta
    ;;
  construir)
    require_env
    $COMPOSE build
    ;;
  subir)
    require_env
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    ajustar_conta
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-cards.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    ajustar_conta
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>" ;;
esac
