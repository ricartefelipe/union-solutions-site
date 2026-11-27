#!/bin/sh
# Cria os papéis do Pactor na inicialização do volume do PostgreSQL.
#  - pactor_owner: proprietário do banco e das tabelas; usado só por migrations.
#  - pactor_app: papel da aplicação; sem superuser, sem BYPASSRLS, sem posse.
#  - pactor_backup: somente leitura com BYPASSRLS, exclusivo do pg_dump
#    (com RLS forçada, nem o proprietário consegue exportar as tabelas).
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname postgres \
  -v owner_password="$PACTOR_OWNER_PASSWORD" \
  -v app_password="$PACTOR_APP_PASSWORD" \
  -v backup_password="$PACTOR_BACKUP_PASSWORD" <<'SQL'
CREATE ROLE pactor_owner LOGIN CREATEDB NOSUPERUSER NOBYPASSRLS NOCREATEROLE PASSWORD :'owner_password';
CREATE ROLE pactor_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
CREATE ROLE pactor_backup LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'backup_password';
GRANT pg_read_all_data TO pactor_backup;
CREATE DATABASE pactor OWNER pactor_owner;
SQL
