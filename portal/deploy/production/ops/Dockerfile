# Ferramentas de operação: bancos, armazenamento e backup. Nenhuma porta aberta, e só roda quando chamada.
FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
# Correções de segurança do Alpine publicadas depois da imagem base entram em cada build.
# O índice é baixado uma vez, com nova tentativa se o espelho falhar.
RUN (apk update || (sleep 5 && apk update) || (sleep 15 && apk update)) \
  && apk upgrade \
  && apk add bash coreutils openssh-client postgresql17-client rclone restic \
  && addgroup -S -g 1002 ops && adduser -S -u 1002 -G ops ops \
  && mkdir -p /staging /repositorio-local && chown ops:ops /staging /repositorio-local \
  && rm -rf /var/cache/apk/*
COPY --chmod=0755 *.sh /ops/
USER ops
WORKDIR /ops
