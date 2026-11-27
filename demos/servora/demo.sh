#!/bin/sh
# Demonstração do Servora na VPS das demonstrações. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/servora, com .env preenchido a partir de .env.example (`segredos`).
#
# A imagem é construída numa máquina de trabalho, a partir da tag do produto, e carregada na VPS; `subir` e
# `reiniciar-dados` não compilam:
#   git -C servora archive v<tag> | tar -x -C /tmp/servora-<tag> && cd /tmp/servora-<tag>
#   docker build --target production -t demo-servora-app:<tag> .
#   docker save demo-servora-app:<tag> | gzip -1 | ssh root@<vps> 'gunzip | docker load'
# Ao trocar de tag, copie também db/setup/create_roles.sh da tag nova para postgres-init/10-create-roles.sh.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N"${1:-24}" -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: rode sh demo.sh segredos."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

exigir_rede() {
  docker network inspect "$(value DEMOS_NETWORK)" >/dev/null 2>&1 \
    || { echo "Rede $(value DEMOS_NETWORK) não encontrada: suba o proxy das demonstrações antes."; exit 2; }
}

psql_super() { $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d servora_production -tAc "$1"; }

ja_carregado() {
  n=$(psql_super 'SELECT count(*) FROM users' 2>/dev/null || true)
  [ -n "$n" ] && [ "$n" != "0" ]
}

# Ajustes da demonstração sobre a carga do produto, por serem contas compartilhadas (ver sem-bloqueio.sql): sem
# bloqueio por tentativas e sem exigência de segundo fator. Idempotente: roda a cada subir e reiniciar-dados.
ajustar_carga() {
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d servora_production < sem-bloqueio.sql >/dev/null
}

# Banco, migrations com o papel owner, privilégios do papel app e a carga de demonstração do produto (bin/db-prepare
# --seed: a carga roda com o papel app, sob Row-Level Security).
carregar_dados() {
  $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres
  $COMPOSE run --rm --no-deps migrate
  ajustar_carga
}

status() {
  $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in DB_SUPERUSER_PASSWORD DB_OWNER_PASSWORD DB_APP_PASSWORD; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    sed -i "s|^SECRET_KEY_BASE=GERADO\$|SECRET_KEY_BASE=$(random 64)|" .env
    for campo in AR_ENCRYPTION_PRIMARY_KEY AR_ENCRYPTION_DETERMINISTIC_KEY AR_ENCRYPTION_KEY_DERIVATION_SALT; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random 16)|" .env
    done
    echo "Criado .env com os segredos gerados."
    ;;
  instalar)
    require_env
    sed "s|__DEMO_HOST__|$(value DEMO_HOST)|g" demo-servora.caddy > "$PROXY/sites/demo-servora.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  subir)
    require_env
    exigir_rede
    $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres
    if ja_carregado; then $COMPOSE run --rm --no-deps migrate && ajustar_carga; else carregar_dados; fi
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    status
    ;;
  parar)
    $COMPOSE down
    ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração (banco, anexos e caixa do Mailpit) e sobe de novo. Agendado diariamente
    # pelo timer demo-servora.timer (06:55 UTC), depois da geração diária das preventivas do produto (01:30 em
    # Brasília, 04:30 UTC): o passo "Gerar ocorrências devidas" do roteiro vale de 03:55 até 01:30 do dia seguinte.
    require_env
    exigir_rede
    $COMPOSE down -v --remove-orphans
    carregar_dados
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status)
    status
    ;;
  logs)
    shift
    $COMPOSE logs --tail=200 "$@"
    ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
