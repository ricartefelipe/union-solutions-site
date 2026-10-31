#!/bin/bash
# Cria o bucket privado. Pode ser executado de novo sem efeito.
set -euo pipefail
source /ops/s3-env.sh

for attempt in $(seq 1 30); do
  if rclone mkdir "LOCAL:$BUCKET" 2>/dev/null && rclone lsd LOCAL: 2>/dev/null | grep -q " $BUCKET\$"; then
    echo "Armazenamento pronto."
    exit 0
  fi
  sleep 2
done
echo "Não foi possível preparar o bucket." >&2
exit 1
