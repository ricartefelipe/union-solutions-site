# Mesma base, tema e realm nos dois ambientes.
FROM quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332 AS base
COPY themes/union /opt/keycloak/themes/union
COPY realm-union-portal.json /opt/keycloak/data/import/realm-union-portal.json
COPY --chmod=0755 portal-mfa-reset.sh /opt/keycloak/bin/portal-mfa-reset.sh
# O mesmo usuário sem privilégios da imagem oficial, declarado aqui para ficar explícito.
USER 1000

# Ambiente local: usa start-dev, no compose de deploy/local.
FROM base AS local

# Produção: opções de build fixadas na imagem, para iniciar com `start --optimized`.
FROM base AS producao
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true KC_HTTP_RELATIVE_PATH=/identidade
RUN ["/opt/keycloak/bin/kc.sh", "build"]
