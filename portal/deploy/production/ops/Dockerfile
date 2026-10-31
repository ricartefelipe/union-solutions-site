# Ferramentas de operação: bancos, armazenamento e backup. Nenhuma porta aberta, e só roda quando chamada.
FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
RUN apk add --no-cache bash coreutils postgresql17-client rclone restic \
  && addgroup -S -g 1002 ops && adduser -S -u 1002 -G ops ops \
  && mkdir -p /staging /repositorio-local && chown ops:ops /staging /repositorio-local
COPY --chmod=0755 *.sh /ops/
USER ops
WORKDIR /ops
