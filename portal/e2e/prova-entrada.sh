#!/bin/sh
# Confia na autoridade de teste só neste container. Sem isso os navegadores recusam o certificado: nenhum erro de TLS é ignorado.
set -eu
trust() {
  [ -f "$1/cert9.db" ] || certutil -d "sql:$1" -N --empty-password </dev/null
  certutil -d "sql:$1" -A -t "C,," -n prova-portal -i /pki/ca.crt </dev/null
}
mkdir -p "$HOME/.pki/nssdb" /evidencias/perfil-firefox
trust "$HOME/.pki/nssdb"
trust /evidencias/perfil-firefox
cp /pki/ca.crt /usr/local/share/ca-certificates/prova-portal.crt
update-ca-certificates >/dev/null 2>&1 || true
exec node node_modules/@playwright/test/cli.js test "$@"
