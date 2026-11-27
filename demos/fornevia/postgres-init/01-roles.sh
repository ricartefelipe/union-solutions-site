#!/bin/sh
# Provisiona papéis e bancos do Fornevia. Executado por um superusuário do
# PostgreSQL: automaticamente na primeira inicialização do container
# (docker-entrypoint-initdb.d) e explicitamente na CI.
#
# Papéis:
#   fornevia_owner  dono do schema; usado por migrations e manutenção
#   fornevia_app    aplicação; DML sujeito a RLS, sem BYPASSRLS
#   fornevia_relay  relay da outbox; acesso apenas às tabelas da outbox
#
# Variáveis: FORNEVIA_OWNER_PASSWORD, FORNEVIA_APP_PASSWORD,
# FORNEVIA_RELAY_PASSWORD, FORNEVIA_DATABASES (lista separada por espaço).
set -eu

: "${FORNEVIA_OWNER_PASSWORD:?defina FORNEVIA_OWNER_PASSWORD}"
: "${FORNEVIA_APP_PASSWORD:?defina FORNEVIA_APP_PASSWORD}"
: "${FORNEVIA_RELAY_PASSWORD:?defina FORNEVIA_RELAY_PASSWORD}"
DATABASES="${FORNEVIA_DATABASES:-fornevia fornevia_test fornevia_browser}"
SUPERUSER="${POSTGRES_USER:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname postgres \
    -v owner_pw="$FORNEVIA_OWNER_PASSWORD" \
    -v app_pw="$FORNEVIA_APP_PASSWORD" \
    -v relay_pw="$FORNEVIA_RELAY_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE fornevia_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fornevia_owner') \gexec
SELECT 'CREATE ROLE fornevia_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fornevia_app') \gexec
SELECT 'CREATE ROLE fornevia_relay LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fornevia_relay') \gexec
ALTER ROLE fornevia_owner PASSWORD :'owner_pw';
ALTER ROLE fornevia_app PASSWORD :'app_pw';
ALTER ROLE fornevia_relay PASSWORD :'relay_pw';
ALTER ROLE fornevia_app SET statement_timeout = '30s';
ALTER ROLE fornevia_app SET lock_timeout = '10s';
ALTER ROLE fornevia_app SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE fornevia_relay SET statement_timeout = '30s';
SQL

for db in $DATABASES; do
    psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname postgres -tAc \
        "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1 \
        || psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname postgres \
            -c "CREATE DATABASE \"$db\" OWNER fornevia_owner"

    psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname "$db" <<SQL
REVOKE ALL ON DATABASE "$db" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$db" TO fornevia_app, fornevia_relay;
ALTER SCHEMA public OWNER TO fornevia_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fornevia_app, fornevia_relay;
ALTER DEFAULT PRIVILEGES FOR ROLE fornevia_owner IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fornevia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fornevia_owner IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO fornevia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fornevia_owner IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE fornevia_owner IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO fornevia_app, fornevia_relay;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
done

echo "Papéis e bancos do Fornevia provisionados: $DATABASES"
