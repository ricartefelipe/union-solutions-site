#!/bin/bash
# Backup em duas etapas. `preparar` copia banco da aplicação, banco de identidade e objetos para a área temporária, com a API pausada.
# `enviar` manda a cópia a um repositório restic cifrado, com a API já de volta e com prazo limitado.
set -euo pipefail
source /ops/s3-env.sh

STAGE=/staging/atual

preparar() {
  MIN_FREE_MB=${PORTAL_BACKUP_MIN_FREE_MB:-2048}
  rm -rf "$STAGE"
  mkdir -p "$STAGE/objetos"
  FREE_MB=$(df -Pm /staging | awk 'NR==2 {print $4}')
  if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
    echo "Espaço insuficiente para o backup: ${FREE_MB} MB livres, mínimo ${MIN_FREE_MB} MB." >&2
    rm -rf "$STAGE"
    exit 3
  fi
  if ! /ops/reconciliar.sh; then
    rm -rf "$STAGE"
    exit 4
  fi
  PGPASSWORD="$PORTAL_DB_PASSWORD" pg_dump -h postgres -U portal -d portal --format=custom --file="$STAGE/portal.dump"
  PGPASSWORD="$KC_DB_PASSWORD" pg_dump -h postgres -U keycloak -d keycloak --format=custom --file="$STAGE/keycloak.dump"
  rclone sync "LOCAL:$BUCKET" "$STAGE/objetos" --transfers 4
  (cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
  echo "Conteúdo: $(find "$STAGE/objetos" -type f | wc -l) objetos, $(du -sm "$STAGE" | cut -f1) MB antes da cifragem."
}

enviar() {
  : "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY}"
  : "${RESTIC_PASSWORD:?defina RESTIC_PASSWORD}"
  : "${PORTAL_BACKUP_KEEP_DAILY:?defina a retenção}"
  : "${PORTAL_BACKUP_KEEP_WEEKLY:?defina a retenção}"
  : "${PORTAL_BACKUP_KEEP_MONTHLY:?defina a retenção}"
  LIMIT=${PORTAL_BACKUP_TIMEOUT_SECONDS:-14400}
  # A cópia sem cifragem nunca fica para trás, mesmo com falha.
  trap 'rm -rf "$STAGE"' EXIT
  [ -f "$STAGE/SHA256SUMS" ] || { echo "Não há cópia preparada." >&2; exit 1; }
  r() { timeout "$LIMIT" restic "$@"; }
  r snapshots --quiet >/dev/null 2>&1 || r init --quiet
  (cd "$STAGE" && timeout "$LIMIT" restic backup --quiet --host portal --tag portal .)
  r forget --quiet --host portal --tag portal --keep-daily "$PORTAL_BACKUP_KEEP_DAILY" --keep-weekly "$PORTAL_BACKUP_KEEP_WEEKLY" --keep-monthly "$PORTAL_BACKUP_KEEP_MONTHLY" --prune
  r check --quiet
  r snapshots --host portal --tag portal --latest 1 --compact | tail -n 4
  echo "Backup concluído."
}

case "${1:-}" in
  preparar) preparar ;;
  enviar) enviar ;;
  *) echo "Uso: backup.sh <preparar|enviar>" >&2; exit 2 ;;
esac
