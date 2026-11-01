# Chave do backup por SFTP

Pasta montada no container de operação em `/run/backup-ssh`. `sh portal-prod.sh chave-backup` cria aqui `chave` e `chave.pub`
(a chave pública vai para o destino) e `sh portal-prod.sh destino-backup <servidor> <porta>` grava `known_hosts` com a
identidade do servidor. Nenhum desses arquivos é versionado.
