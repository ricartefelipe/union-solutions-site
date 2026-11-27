#!/usr/bin/env bash
# Creates the two PostgreSQL roles used by Servora. Idempotent.
#
# Must be executed with a superuser (or a role holding CREATEROLE) connection.
# It is mounted into the official PostgreSQL image as an init script and is also
# invoked by CI against the service container.
#
#   owner role: owns databases and schema objects, runs migrations (CREATEDB only)
#   app role:   used at runtime; no superuser, no BYPASSRLS, no CREATEDB and
#               owns nothing, so Row-Level Security is always enforced for it.
set -euo pipefail

: "${SERVORA_DB_OWNER_USER:=servora_owner}"
: "${SERVORA_DB_OWNER_PASSWORD:?SERVORA_DB_OWNER_PASSWORD is required}"
: "${SERVORA_DB_APP_USER:=servora_app}"
: "${SERVORA_DB_APP_PASSWORD:?SERVORA_DB_APP_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-${PGUSER:-postgres}}" \
  --dbname "${POSTGRES_DB:-postgres}" \
  -v owner_user="$SERVORA_DB_OWNER_USER" \
  -v owner_password="$SERVORA_DB_OWNER_PASSWORD" \
  -v app_user="$SERVORA_DB_APP_USER" \
  -v app_password="$SERVORA_DB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I', :'owner_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_user') \gexec
SELECT format('CREATE ROLE %I', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec

ALTER ROLE :"owner_user" WITH LOGIN CREATEDB NOSUPERUSER NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_password';
ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD :'app_password';
SQL

echo "Servora database roles are ready (${SERVORA_DB_OWNER_USER}, ${SERVORA_DB_APP_USER})."
