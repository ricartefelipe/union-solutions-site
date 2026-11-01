#!/bin/bash
# Restaura um snapshot sobre bancos e bucket. portal-prod.sh para os serviços da aplicação antes de chamar.
set -euo pipefail
source /ops/s3-env.sh

: "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY}"
: "${RESTIC_PASSWORD:?defina RESTIC_PASSWORD}"
SNAPSHOT=${1:-latest}
STAGE=/staging/restauracao
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT
rm -rf "$STAGE"
mkdir -p "$STAGE"

/ops/restic.sh restore "$SNAPSHOT" --host portal --tag portal --target "$STAGE" --quiet
ROOT=$(dirname "$(find "$STAGE" -name SHA256SUMS -type f | head -n 1)")
(cd "$ROOT" && sha256sum --quiet -c SHA256SUMS)
echo "Somas conferidas."

export PGHOST=postgres PGUSER=postgres PGPASSWORD="$POSTGRES_PASSWORD"
psql -v ON_ERROR_STOP=1 -q -d postgres \
  -c "DROP DATABASE IF EXISTS portal WITH (FORCE)" -c "CREATE DATABASE portal OWNER portal" -c "REVOKE ALL ON DATABASE portal FROM PUBLIC" \
  -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE)" -c "CREATE DATABASE keycloak OWNER keycloak" -c "REVOKE ALL ON DATABASE keycloak FROM PUBLIC"
PGUSER=portal PGPASSWORD="$PORTAL_DB_PASSWORD" pg_restore -h postgres -d portal --no-owner --exit-on-error "$ROOT/portal.dump"
PGUSER=keycloak PGPASSWORD="$KC_DB_PASSWORD" pg_restore -h postgres -d keycloak --no-owner --exit-on-error "$ROOT/keycloak.dump"

# Sessões não entram no backup: depois de restaurar, todos entram de novo.
psql -q -d portal_sessao -c "DROP TABLE IF EXISTS portal_session"

rclone sync "$ROOT/objetos" "LOCAL:$BUCKET" --transfers 4
/ops/reconciliar.sh
echo "Restauração dos dados concluída."
