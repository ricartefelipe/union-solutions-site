#!/bin/bash
# Backup em etapas, cada execução com área temporária própria (/staging/<execução>).
#   preparar  copia banco da aplicação, banco de identidade e objetos para a área, com a API pausada pelo chamador
#   enviar    manda a cópia a um repositório restic cifrado, com a API já de volta e com prazo limitado
#   limpar    apaga a área desta execução (o chamador roda sempre, mesmo em falha ou interrupção)
#   abandonadas  apaga áreas de execuções antigas; o chamador só chama com a trava da implantação em mãos
# A limpeza por `trap` não cobre SIGKILL nem queda de energia: para isso existe `abandonadas`.
set -euo pipefail
source /ops/s3-env.sh

RUN_ID=${PORTAL_BACKUP_RUN:?identificador da execução}
STAGE=/staging/$RUN_ID

cleanup() { rm -rf "$STAGE"; }

preparar() {
  # Limpeza instalada antes de qualquer passo falível: pg_dump, rclone, soma.
  trap 'rc=$?; [ $rc -eq 0 ] || cleanup; exit $rc' EXIT
  trap 'exit 143' INT TERM
  MIN_FREE_MB=${PORTAL_BACKUP_MIN_FREE_MB:-2048}
  rm -rf "$STAGE"
  mkdir -p "$STAGE/objetos"
  FREE_MB=$(df -Pm /staging | awk 'NR==2 {print $4}')
  if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
    echo "Espaço insuficiente para o backup: ${FREE_MB} MB livres, mínimo ${MIN_FREE_MB} MB." >&2
    exit 3
  fi
  /ops/reconciliar.sh || exit 4
  PGPASSWORD="$PORTAL_DB_PASSWORD" pg_dump -h postgres -U portal -d portal --format=custom --file="$STAGE/portal.dump"
  PGPASSWORD="$KC_DB_PASSWORD" pg_dump -h postgres -U keycloak -d keycloak --format=custom --file="$STAGE/keycloak.dump"
  rclone sync "LOCAL:$BUCKET" "$STAGE/objetos" --transfers 4
  (cd "$STAGE" && find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
  echo "Conteúdo: $(find "$STAGE/objetos" -type f | wc -l) objetos, $(du -sm "$STAGE" | cut -f1) MB antes da cifragem."
}

enviar() {
  trap 'rc=$?; cleanup; exit $rc' EXIT
  trap 'exit 143' INT TERM
  : "${RESTIC_REPOSITORY:?defina RESTIC_REPOSITORY}"
  : "${RESTIC_PASSWORD:?defina RESTIC_PASSWORD}"
  : "${PORTAL_BACKUP_KEEP_DAILY:?defina a retenção}"
  : "${PORTAL_BACKUP_KEEP_WEEKLY:?defina a retenção}"
  : "${PORTAL_BACKUP_KEEP_MONTHLY:?defina a retenção}"
  LIMIT=${PORTAL_BACKUP_TIMEOUT_SECONDS:-14400}
  [ -f "$STAGE/SHA256SUMS" ] || { echo "Não há cópia preparada." >&2; exit 1; }
  r() { timeout "$LIMIT" restic "$@"; }
  # Só inicializa um repositório que o restic diz não existir (saída 10). Senha errada (12), indisponibilidade,
  # corrupção ou falta de permissão interrompem o backup, em vez de criar um repositório novo por engano.
  set +e
  r cat config >/dev/null 2>&1
  status=$?
  set -e
  case "$status" in
    0) ;;
    10) echo "Repositório ainda não existe: inicializando."; r init --quiet ;;
    12) echo "Senha do repositório de backup incorreta." >&2; exit 12 ;;
    *) echo "Repositório de backup inacessível (saída $status)." >&2; exit "$status" ;;
  esac
  (cd "$STAGE" && timeout "$LIMIT" restic backup --quiet --host portal --tag portal .)
  r forget --quiet --host portal --tag portal --keep-daily "$PORTAL_BACKUP_KEEP_DAILY" --keep-weekly "$PORTAL_BACKUP_KEEP_WEEKLY" --keep-monthly "$PORTAL_BACKUP_KEEP_MONTHLY" --prune
  r check --quiet
  r snapshots --host portal --tag portal --latest 1 --compact | tail -n 4
  echo "Backup concluído."
}

abandonadas() {
  # Chamado com a trava da implantação em mãos: nenhuma outra execução está em curso, então toda área restante é abandonada.
  # Margem de uma hora como proteção extra contra uma execução que tenha escapado da trava.
  found=0
  for dir in /staging/*/; do
    [ -d "$dir" ] || continue
    [ "$dir" = "$STAGE/" ] && continue
    if [ -z "$(find "$dir" -maxdepth 0 -mmin -60)" ]; then
      echo "Removendo área abandonada: $(basename "$dir")"
      rm -rf "$dir"
      found=$((found + 1))
    else
      echo "Área recente preservada: $(basename "$dir")"
    fi
  done
  echo "Áreas abandonadas removidas: $found"
}

case "${1:-}" in
  preparar) preparar ;;
  enviar) enviar ;;
  limpar) cleanup ;;
  abandonadas) abandonadas ;;
  *) echo "Uso: backup.sh <preparar|enviar|limpar|abandonadas>" >&2; exit 2 ;;
esac
