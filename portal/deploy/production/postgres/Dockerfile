FROM postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b
# O container inicia sem root, então o gosu nunca roda. Ele sai da imagem porque foi compilado com um Go antigo.
RUN rm -f /usr/local/bin/gosu
