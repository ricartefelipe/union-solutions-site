# Etapa de build: nenhuma ferramenta local é necessária além do Docker.
FROM maven:3.9-eclipse-temurin-21@sha256:99e61abcff91a9b1333463bd8451fb18495d6eba9250ac66a338b518f8278320 AS build
WORKDIR /app
COPY pom.xml .
COPY src src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine@sha256:82cf3d9ccbe1ed46252008d51b2f2329e6b9e8a2f4394c4bebefc3ea7f4b1372
# Correções de segurança do Alpine publicadas depois da imagem base entram em cada build.
RUN apk upgrade --no-cache \
  && addgroup -S portal && adduser -S portal -G portal \
  && mkdir -p /app /tmp/portal-uploads && chown portal:portal /tmp/portal-uploads
COPY --from=build /app/target/quarkus-app/ /app/
COPY dns.security /app/dns.security
USER portal
WORKDIR /app
ENV QUARKUS_HTTP_BODY_UPLOADS_DIRECTORY=/tmp/portal-uploads
ENV JAVA_OPTS_APPEND="-XX:MaxRAMPercentage=70"
EXPOSE 8080 9000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=12 \
  CMD wget -q -O /dev/null http://127.0.0.1:9000/q/health/ready || exit 1
# O cache de DNS fica fora de JAVA_OPTS_APPEND, que o Compose substitui nos ambientes de teste e local.
ENTRYPOINT ["sh", "-c", "exec java -Djava.security.properties=/app/dns.security $JAVA_OPTS_APPEND -jar quarkus-run.jar"]
