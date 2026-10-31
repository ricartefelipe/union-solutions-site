#!/bin/bash
# Bancos e usuários separados na mesma instância, com permissão mínima. Pode ser executado de novo sem efeito.
set -euo pipefail

export PGHOST=postgres PGUSER=postgres PGDATABASE=postgres PGPASSWORD="$POSTGRES_PASSWORD"

ensure() {
  local role=$1 password=$2 database=$3
  psql -v ON_ERROR_STOP=1 -q -v role="$role" -v pw="$password" -v db="$database" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE', :'role') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'pw') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role') WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SQL
}

ensure portal "$PORTAL_DB_PASSWORD" portal
ensure keycloak "$KC_DB_PASSWORD" keycloak
ensure portal_web "$PORTAL_SESSION_DB_PASSWORD" portal_sessao
echo "Bancos prontos."
