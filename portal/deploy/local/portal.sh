#!/bin/sh
# Comandos do ambiente local. Uso: sh portal/deploy/local/portal.sh <comando>
set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
COMPOSE="docker compose --env-file .env -f compose.yaml"
BACKUP_DIR=${PORTAL_BACKUP_DIR:-$DIR/../../../artifacts/portal-backups}

random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

init_env() {
  if [ -f .env ]; then
    # Variáveis novas de versões posteriores entram sem alterar as existentes.
    grep -q '^PORTAL_SESSION_DB_PASSWORD=' .env || echo "PORTAL_SESSION_DB_PASSWORD=$(random)" >> .env
    echo ".env já existe: segredos preservados."
    return
  fi
  umask 077
  cat > .env <<ENV
# Gerado por portal.sh init. Segredos só deste ambiente local: não versionar.
PORTAL_DB_PASSWORD=$(random)
KC_DB_PASSWORD=$(random)
KC_BOOTSTRAP_ADMIN_PASSWORD=$(random)
PORTAL_WEB_CLIENT_SECRET=$(random)
PORTAL_KEYCLOAK_ADMIN_SECRET=$(random)
PORTAL_SESSION_SECRET=$(random)$(random)
PORTAL_SESSION_DB_PASSWORD=$(random)
PORTAL_S3_ACCESS_KEY=$(random)
PORTAL_S3_SECRET_KEY=$(random)
PORTAL_DEMO_PASSWORD=$(random)
PORTAL_DEMO_ENABLED=${PORTAL_DEMO_ENABLED:-false}
PORTAL_BOOTSTRAP_ADMIN_EMAIL=${PORTAL_BOOTSTRAP_ADMIN_EMAIL:-admin@portal.invalid}
PORTAL_PRODUCT_LINK_HOSTS=${PORTAL_PRODUCT_LINK_HOSTS:-produto.demo.invalid}
ENV
  echo ".env criado com segredos locais novos."
}

# O realm só é importado na primeira subida. Em volumes antigos, acrescenta o que versões posteriores precisam.
update_realm() {
  $COMPOSE exec -T keycloak sh -c '
    K=/opt/keycloak/bin/kcadm.sh; C=/tmp/kcadm.config
    $K config credentials --config $C --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1
    $K get roles/portal-mfa --config $C -r union-portal >/dev/null 2>&1 || $K create roles --config $C -r union-portal -s name=portal-mfa >/dev/null
    $K add-roles --config $C -r union-portal --uusername service-account-portal-admin --cclientid realm-management --rolename view-realm >/dev/null
  '
}

case "${1:-help}" in
  init)
    init_env
    ;;
  up)
    init_env
    # session-db-init termina depois de preparar o banco: `--wait` trataria a saída como falha, então ele roda antes.
    $COMPOSE up -d --build --wait --wait-timeout 300 --no-deps postgres
    $COMPOSE up --build --no-deps --exit-code-from session-db-init session-db-init >/dev/null
    $COMPOSE up -d --build --wait --wait-timeout 900 postgres mailpit seaweedfs clamav keycloak backend frontend
    update_realm
    echo
    echo "Portal:      http://localhost:3100"
    echo "E-mails:     http://localhost:8025 (nenhum e-mail real é enviado)"
    echo "Keycloak:    http://localhost:8180"
    echo "Administrador inicial: $(grep '^PORTAL_BOOTSTRAP_ADMIN_EMAIL=' .env | cut -d= -f2). Defina a senha pelo e-mail recebido no Mailpit."
    ;;
  down)
    $COMPOSE down
    ;;
  destroy)
    echo "Isto apaga todos os dados locais do portal (bancos, arquivos e assinaturas do antivírus)."
    printf "Digite APAGAR para confirmar: "
    read -r answer
    [ "$answer" = "APAGAR" ] || { echo "Cancelado."; exit 1; }
    $COMPOSE down -v
    ;;
  status)
    $COMPOSE ps
    ;;
  logs)
    shift
    $COMPOSE logs --tail=100 "$@"
    ;;
  backup)
    # Inclui banco da aplicação, banco de identidade e arquivos: o banco sozinho não recupera o portal.
    stamp=$(date +%Y%m%d-%H%M%S)
    target="$BACKUP_DIR/$stamp"
    mkdir -p "$target"
    $COMPOSE exec -T postgres pg_dump -U portal -d portal --format=custom > "$target/portal.dump"
    $COMPOSE exec -T postgres pg_dump -U portal -d keycloak --format=custom > "$target/keycloak.dump"
    $COMPOSE exec -T seaweedfs tar -czf - -C /data . > "$target/seaweedfs-data.tar.gz"
    sha256sum "$target"/* > "$target/SHA256SUMS"
    echo "Backup em $target"
    ;;
  restore)
    # Restaura sobre o ambiente local em execução. Serviços da aplicação param durante a operação.
    source_dir=${2:?informe a pasta do backup}
    (cd "$source_dir" && sha256sum -c SHA256SUMS)
    $COMPOSE stop frontend backend keycloak seaweedfs
    $COMPOSE exec -T postgres psql -U portal -d postgres -c "DROP DATABASE IF EXISTS portal WITH (FORCE)" -c "CREATE DATABASE portal OWNER portal" \
      -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE)" -c "CREATE DATABASE keycloak OWNER keycloak"
    $COMPOSE exec -T postgres pg_restore -U portal -d portal --no-owner --role=portal < "$source_dir/portal.dump"
    $COMPOSE exec -T postgres pg_restore -U portal -d keycloak --no-owner --role=keycloak < "$source_dir/keycloak.dump"
    $COMPOSE run --rm --no-deps -T --entrypoint sh seaweedfs -c "rm -rf /data/* && tar -xzf - -C /data" < "$source_dir/seaweedfs-data.tar.gz"
    # Sessões não fazem parte do backup: depois de restaurar, todos entram de novo.
    $COMPOSE exec -T postgres psql -U portal -d portal_sessao -c "TRUNCATE portal_session"
    $COMPOSE up -d --wait --wait-timeout 600 postgres mailpit seaweedfs clamav keycloak backend frontend
    echo "Restauração concluída."
    ;;
  *)
    echo "Comandos: init | up | down | status | logs [serviço] | backup | restore <pasta> | destroy"
    ;;
esac
