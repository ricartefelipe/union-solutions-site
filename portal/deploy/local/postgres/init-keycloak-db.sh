#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE keycloak LOGIN PASSWORD '${KC_DB_PASSWORD}';
CREATE DATABASE keycloak OWNER keycloak;
SQL
