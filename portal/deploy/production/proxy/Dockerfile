# Caddy compilado com Go e dependências corrigidos, sobre uma base mínima. A imagem oficial traz Go antigo e pacotes que o proxy não usa.
FROM golang:1.27-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS build
WORKDIR /src
COPY main.go go.mod go.sum ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /caddy .

FROM alpine:3.22@sha256:2e0b81d60597f449baa56dc25d355367869d2dca4cd57e866f1e2b52af3eb55f
RUN apk add --no-cache ca-certificates mailcap \
  && addgroup -S -g 1001 caddy && adduser -S -u 1001 -G caddy caddy \
  && mkdir -p /etc/caddy/conf.d /data/caddy /config/caddy && chown -R caddy:caddy /data /config
COPY --from=build /caddy /usr/local/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
USER caddy
EXPOSE 80 443 443/udp
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
