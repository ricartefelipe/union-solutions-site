#!/bin/sh
# Chama o restic com as opções do destino. Para sftp: chave própria, porta e identidade fixa do servidor (sem
# aceitar servidor desconhecido). Os arquivos vêm de /run/backup-ssh, gerados por portal-prod.sh chave-backup e
# destino-backup. Para os demais destinos (S3, rest, pasta local) não há opção extra.
set -eu
case "${RESTIC_REPOSITORY:-}" in
  sftp:*)
    exec restic -o "sftp.args=-i /run/backup-ssh/chave -p ${PORTAL_BACKUP_SFTP_PORT:-22} -o UserKnownHostsFile=/run/backup-ssh/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=30 -o IdentitiesOnly=yes" "$@" ;;
  *)
    exec restic "$@" ;;
esac
