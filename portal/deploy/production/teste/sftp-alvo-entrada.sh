#!/bin/sh
# Chaves do servidor persistem no volume de dados: o projeto de restauração sobe outro container com a mesma identidade.
set -eu
mkdir -p /backups/.hostkeys /home/backup/.ssh
if [ ! -f /backups/.hostkeys/ssh_host_ed25519_key ]; then
  ssh-keygen -q -t ed25519 -N "" -f /backups/.hostkeys/ssh_host_ed25519_key
fi
cp /backups/.hostkeys/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key
cp /backups/.hostkeys/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ed25519_key.pub
chmod 600 /etc/ssh/ssh_host_ed25519_key
printf 'HostKey /etc/ssh/ssh_host_ed25519_key\n' >> /etc/ssh/sshd_config
cp /run/backup-ssh/chave.pub /home/backup/.ssh/authorized_keys
chown -R backup:backup /home/backup/.ssh /backups && chmod 700 /home/backup/.ssh && chmod 600 /home/backup/.ssh/authorized_keys
# Identidade do servidor para o container de operação, no formato que o ssh procura (porta 22: só o nome).
printf 'sftp-alvo %s\n' "$(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)" > /run/backup-ssh/known_hosts
chmod 644 /run/backup-ssh/known_hosts
exec /usr/sbin/sshd -D -e
