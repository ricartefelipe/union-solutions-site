# Keycloak das demonstrações. O Keycloak 26.8.1 embute a Guava 33.6.0-jre (CVE-2026-102554, alta, corrigida na
# 33.7.2) e ainda não há versão dele com a correção. Aqui só esse JAR muda: o novo vem do Maven Central, conferido
# pelo SHA-256, e o nome dele é acertado nos índices do Quarkus; `kc.sh build` refaz o índice e falha se algo não bater.
# Quando o Keycloak publicar versão com a Guava corrigida, o `rm` falha: volte para a imagem oficial.
# quay.io/keycloak/keycloak:26.8.1, fixada pelo digest.
FROM quay.io/keycloak/keycloak@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332
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
    /opt/keycloak/bin/kc.sh build; \
    if LC_ALL=C grep -rqa '33\.6\.0-jre' .; then echo 'Guava 33.6.0 ainda referenciada' >&2; exit 1; fi
# O mesmo usuário sem privilégios da imagem oficial, declarado aqui para ficar explícito.
USER 1000
