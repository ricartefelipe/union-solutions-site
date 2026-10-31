#!/bin/bash
# Compara os arquivos registrados no banco com os objetos do armazenamento. Falta de objeto é erro.
# Objetos sem registro só são relatados: podem vir de um envio que falhou.
set -euo pipefail
source /ops/s3-env.sh

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PGPASSWORD="$PORTAL_DB_PASSWORD" psql -h postgres -U portal -d portal -Atc \
  "SELECT object_key FROM stored_file WHERE scan_status IN ('CLEAN', 'PENDING') ORDER BY 1" | LC_ALL=C sort -u > "$WORK/registrados"
rclone lsf -R --files-only "LOCAL:$BUCKET" | LC_ALL=C sort -u > "$WORK/objetos"

MISSING=$(LC_ALL=C comm -23 "$WORK/registrados" "$WORK/objetos" | wc -l)
EXTRA=$(LC_ALL=C comm -13 "$WORK/registrados" "$WORK/objetos" | wc -l)
echo "Reconciliação: $(wc -l < "$WORK/registrados") registrados, $(wc -l < "$WORK/objetos") objetos, $MISSING faltando, $EXTRA sem registro."
if [ "$MISSING" -gt 0 ]; then
  echo "Há arquivos registrados sem objeto no armazenamento." >&2
  exit 1
fi
