# Somente para desenvolvimento: um servidor com os bancos do portal, do Keycloak e das sessões do BFF.
FROM postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
COPY init-keycloak-db.sh /docker-entrypoint-initdb.d/10-keycloak.sh
COPY init-session-db.sh /usr/local/bin/init-session-db.sh
