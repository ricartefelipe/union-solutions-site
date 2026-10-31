#!/bin/sh
# Banco só para as sessões do BFF, com usuário próprio. Pode ser executado de novo sem efeito.
set -e
psql -v ON_ERROR_STOP=1 -v pw="$PORTAL_SESSION_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE portal_web LOGIN PASSWORD %L', :'pw') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_web') \gexec
SELECT format('ALTER ROLE portal_web PASSWORD %L', :'pw') \gexec
SELECT 'CREATE DATABASE portal_sessao OWNER portal_web' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'portal_sessao') \gexec
SQL
