#!/bin/sh
# Aplica sites novos ou alterados no proxy das demonstrações sem reiniciar o container: valida a configuração e só então
# recarrega pela administração local (socket Unix). Se a validação falhar, a configuração em execução não muda.
# Uso: sh recarregar.sh (em /opt/union-solutions/demos/proxy, com .env preenchido).
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
COMPOSE="docker compose --env-file .env -f compose.yaml"
CONFIG="--config /etc/caddy/Caddyfile --adapter caddyfile"

if ! $COMPOSE exec -T proxy caddy validate $CONFIG >/dev/null 2>validar.err; then
  echo "Configuração inválida: nada foi recarregado. Detalhes:"
  grep -iE "error|erro" validar.err | tail -5
  rm -f validar.err
  exit 1
fi
rm -f validar.err
$COMPOSE exec -T proxy caddy reload $CONFIG --address unix//tmp/caddy-admin.sock
echo "Proxy recarregado sem reinício em $(date -u +%FT%TZ)."
