#!/bin/sh
# Garante o escopo kc-admin-api entre os escopos padrão do cliente portal-admin. Desde o Keycloak 26.8.2, a API de
# administração só aceita token com a audiência que esse escopo acrescenta. Um realm importado com o JSON atual já o
# tem; um realm criado antes da 26.8.2 não, e o portal perderia o convite de contas, o e-mail de definição de senha e a
# recuperação do segundo fator. Idempotente: não muda nada se o escopo já estiver lá.
#
# Executado dentro do container do Keycloak por portal-prod.sh atualizar, com o administrador do realm master
# (KC_BOOTSTRAP_ADMIN_*, já presente no container). A senha sai da variável de ambiente (KC_CLI_PASSWORD é o mecanismo
# suportado pelo kcadm): nunca aparece em argumentos de processo.
#
# Saídas: 0 já presente ou aplicado; 2 falha de autenticação; 3 escopo ou cliente ausente; 4 falha ao aplicar.
# Na saída padrão, só `ESCOPO=ja-presente` ou `ESCOPO=aplicado`.
set -eu

K=${PORTAL_KCADM:-/opt/keycloak/bin/kcadm.sh}
C=$(mktemp /tmp/kcadm-XXXXXX)
trap 'rm -f "$C"' EXIT INT TERM
REALM=union-portal
SERVER=http://localhost:8080${KC_HTTP_RELATIVE_PATH:-}

export KC_CLI_PASSWORD="${KC_BOOTSTRAP_ADMIN_PASSWORD:?}"
"$K" config credentials --config "$C" --server "$SERVER" --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:?}" >/dev/null 2>&1 \
  || { echo "Autenticação no realm master falhou." >&2; exit 2; }
unset KC_CLI_PASSWORD

SCOPE=$("$K" get client-scopes --config "$C" -r "$REALM" --fields id,name --format csv --noquotes 2>/dev/null | grep ',kc-admin-api$' | cut -d, -f1)
CLIENT=$("$K" get clients --config "$C" -r "$REALM" -q clientId=portal-admin --fields id --format csv --noquotes 2>/dev/null | head -n 1)
[ -n "$SCOPE" ] && [ -n "$CLIENT" ] || { echo "Escopo kc-admin-api ou cliente portal-admin ausente." >&2; exit 3; }

presente() {
  "$K" get "clients/$CLIENT/default-client-scopes" --config "$C" -r "$REALM" --fields name --format csv --noquotes 2>/dev/null | grep -qx kc-admin-api
}

if presente; then echo "ESCOPO=ja-presente"; exit 0; fi
"$K" update "clients/$CLIENT/default-client-scopes/$SCOPE" --config "$C" -r "$REALM" >/dev/null 2>&1 \
  || { echo "Falha ao atribuir o escopo kc-admin-api." >&2; exit 4; }
presente || { echo "Verificação final: o escopo kc-admin-api não ficou atribuído." >&2; exit 4; }
echo "ESCOPO=aplicado"
