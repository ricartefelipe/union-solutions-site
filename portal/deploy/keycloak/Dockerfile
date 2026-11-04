# Mesma base, tema e realm nos dois ambientes.
FROM quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332 AS base
# O Keycloak 26.8.1 embute a Guava 33.6.0-jre (CVE-2026-102554, alta, corrigida na 33.7.2) e ainda não há versão
# dele com a correção. Só esse JAR muda: o novo vem do Maven Central, conferido pelo SHA-256, e o nome dele é acertado
# nos índices do Quarkus (mesmo tamanho de texto). O `kc.sh build` da produção e o `start-dev` do local refazem o
# índice a partir deles. Quando o Keycloak publicar versão com a Guava corrigida, o `rm` falha: tire este bloco.
# Avaliação em docs/VULNERABILIDADES.md.
ADD --chown=1000:0 \
    https://repo1.maven.org/maven2/com/google/guava/guava/33.7.2-jre/guava-33.7.2-jre.jar \
    /opt/keycloak/lib/lib/main/com.google.guava.guava-33.7.2-jre.jar
RUN set -eu; cd /opt/keycloak/lib; \
    novo=lib/main/com.google.guava.guava-33.7.2-jre.jar; \
    echo "b530942257fb935f8b2cfaa5f8eb5bd59c555fd8e8d01b8ce98912e077ea606c  $novo" | sha256sum -c -; \
    chmod 664 "$novo"; \
    rm lib/main/com.google.guava.guava-33.6.0-jre.jar; \
    LC_ALL=C sed -i 's/33\.6\.0-jre/33.7.2-jre/g' \
      lib/deployment/appmodel.dat lib/deployment/deployment-class-path.dat quarkus/quarkus-application.dat; \
    if LC_ALL=C grep -rqa '33\.6\.0-jre' .; then echo 'Guava 33.6.0 ainda referenciada' >&2; exit 1; fi
COPY themes/union /opt/keycloak/themes/union
COPY realm-union-portal.json /opt/keycloak/data/import/realm-union-portal.json
COPY --chmod=0755 portal-mfa-reset.sh /opt/keycloak/bin/portal-mfa-reset.sh
COPY quarkus.properties dns.security /opt/keycloak/conf/
# kc.sh acrescenta JAVA_OPTS_APPEND à linha de comando da JVM.
ENV JAVA_OPTS_APPEND="-Djava.security.properties=/opt/keycloak/conf/dns.security"
# O mesmo usuário sem privilégios da imagem oficial, declarado aqui para ficar explícito.
USER 1000

# Ambiente local: usa start-dev, no compose de deploy/local.
FROM base AS local

# Produção: opções de build fixadas na imagem, para iniciar com `start --optimized`.
FROM base AS producao
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true KC_HTTP_RELATIVE_PATH=/identidade
RUN ["/opt/keycloak/bin/kc.sh", "build"]
