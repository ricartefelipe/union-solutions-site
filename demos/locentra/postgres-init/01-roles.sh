#!/bin/sh
# Inicialização do cluster local: cria os papéis da aplicação e os bancos.
#
# - locentra_owner: proprietário do schema; usado somente por migrations.
# - locentra_app: papel da aplicação web/CLI. Sem superuser, sem BYPASSRLS, sem propriedade de tabelas.
# - locentra_worker: papel do worker. Mesmas restrições; políticas próprias apenas na fila.
# - locentra_backup: somente leitura com BYPASSRLS, usado por pg_dump (a RLS é forçada inclusive para o
#   proprietário; sem bypass o backup não enxergaria as linhas) e, por operador, nas consultas de
#   verificação somente leitura de docs/RUNBOOKS.md; nunca pela aplicação.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE locentra_owner LOGIN PASSWORD '${LOCENTRA_OWNER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE locentra_app LOGIN PASSWORD '${LOCENTRA_APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE locentra_worker LOGIN PASSWORD '${LOCENTRA_WORKER_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE locentra_backup LOGIN PASSWORD '${LOCENTRA_BACKUP_PASSWORD:-${LOCENTRA_OWNER_PASSWORD}-backup}' NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
GRANT pg_read_all_data TO locentra_backup;
CREATE DATABASE locentra OWNER locentra_owner;
CREATE DATABASE locentra_test OWNER locentra_owner;
SQL

for db in locentra locentra_test; do
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO locentra_owner;
GRANT USAGE ON SCHEMA public TO locentra_app, locentra_worker;
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $db TO locentra_owner, locentra_app, locentra_worker;
GRANT CONNECT ON DATABASE $db TO locentra_backup;
SQL
done
