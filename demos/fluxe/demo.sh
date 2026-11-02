#!/bin/sh
# Demonstração da Fluxe B2B Suite na VPS do portal. Uso: sh demo.sh <segredos|instalar|construir|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/fluxe, com .env preenchido a partir de .env.example. As imagens são construídas em outra
# máquina (`construir`) e carregadas na VPS: a compilação dos três frontends não cabe ao lado do portal em produção.
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

checkout() {
  repo=$1; tag=$2; dest=$(value FLUXE_SRC)/$repo
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q --tags origin; else git clone -q "https://github.com/ricartefelipe/$repo.git" "$dest"; fi
  git -C "$dest" checkout -q "$tag" && echo "$repo $tag ($(git -C "$dest" rev-parse --short HEAD))."
}

# Correções ainda não publicadas nos repositórios do produto (ver README). Reaplicar é inofensivo.
aplicar_correcao() {
  repo=$(value FLUXE_SRC)/$1
  git -C "$repo" apply --reverse --check "$DIR/patches/$2" 2>/dev/null || git -C "$repo" apply "$DIR/patches/$2"
}

# Ajustes na carga inicial do produto, feitos só aqui: as contas da plataforma têm senha pública no repositório do produto e
# um e-mail real, as regiões fictícias da carga não são as que a política de pagamentos das telas aceita, e a conta pública
# precisa abrir as três aplicações.
ajustar_carga() {
  $COMPOSE exec -T postgres psql -q -v ON_ERROR_STOP=1 -U fluxe -d saascore <<'SQL'
UPDATE users SET password_hash = 'desativada' WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE users SET email = 'plataforma@demo.example.com', name = 'Plataforma' WHERE email NOT LIKE '%@local' AND tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE audit_log SET actor_sub = 'plataforma@demo.example.com' WHERE actor_sub NOT LIKE '%@local' AND tenant_id = '00000000-0000-0000-0000-000000000001' OR actor_sub LIKE '%@gmail.com';
UPDATE tenants SET region = 'region-a';
UPDATE users SET roles = 'admin', name = 'Demonstração', email = 'visitante@demo-fluxe.unionsolutions.tech' WHERE email = 'ops@demo.example.com';
SQL
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in FLUXE_DB_PASSWORD FLUXE_REDIS_PASSWORD FLUXE_RABBIT_PASSWORD FLUXE_JWT_SECRET; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    echo "Criado .env com os segredos gerados. Confira DEMO_HOST e FLUXE_SRC."
    ;;
  instalar)
    require_env
    mkdir -p "$(value FLUXE_SRC)"
    checkout fluxe-b2b-suite "$(value FLUXE_TAG)"
    checkout spring-saas-core "$(value SAAS_CORE_TAG)"
    checkout node-b2b-orders "$(value ORDERS_TAG)"
    checkout py-payments-ledger "$(value PAYMENTS_TAG)"
    cp demo-fluxe.caddy "$PORTAL/sites/demo-fluxe.caddy"
    echo "Site instalado no proxy do portal. Reinicie o proxy: (cd $PORTAL && docker compose --env-file .env restart proxy)"
    ;;
  construir)
    require_env
    aplicar_correcao node-b2b-orders orders-total.patch
    aplicar_correcao fluxe-b2b-suite shop-confirmacao.patch
    docker build -q -t demo-fluxe-orders-base -f "$(value FLUXE_SRC)/node-b2b-orders/docker/api.Dockerfile" "$(value FLUXE_SRC)/node-b2b-orders"
    $COMPOSE build
    ;;
  subir)
    require_env
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    ajustar_carga
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-fluxe.timer.
    require_env
    $COMPOSE down -v
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    ajustar_carga
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|construir|subir|parar|reiniciar-dados|status|logs>" ;;
esac
