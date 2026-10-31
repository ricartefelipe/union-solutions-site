#!/bin/sh
# Remove o segundo fator de uma conta no provedor e encerra as sessões dela. Executado dentro do container do Keycloak por
# portal-prod.sh, que registra a auditoria e encerra as sessões do portal. Uso: portal-mfa-reset.sh <e-mail>
#
# O segredo do cliente administrativo sai da variável de ambiente já presente no container (KC_CLI_CLIENT_SECRET é o
# mecanismo suportado pelo kcadm): nunca aparece em argumentos de processo.
#
# Saídas: 0 sucesso; 2 falha de autenticação; 3 conta ausente ou ambígua; 4 falha ao remover; 5 verificação final falhou;
# 6 sessões do provedor não encerradas (o segundo fator já foi removido). Na saída padrão, só `SUB=` e `REMOVIDOS=`.
set -eu

EMAIL=${1:?informe o e-mail}
K=${PORTAL_MFA_KCADM:-/opt/keycloak/bin/kcadm.sh}
C=$(mktemp /tmp/kcadm-XXXXXX)
CREDS=$(mktemp /tmp/kccred-XXXXXX)
trap 'rm -f "$C" "$CREDS"' EXIT INT TERM
REALM=union-portal

export KC_CLI_CLIENT_SECRET="$PORTAL_KEYCLOAK_ADMIN_SECRET"
"$K" config credentials --config "$C" --server http://localhost:8080/identidade --realm "$REALM" --client portal-admin >/dev/null 2>&1 || { echo "Autenticação administrativa falhou." >&2; exit 2; }
unset KC_CLI_CLIENT_SECRET

# Exatamente uma conta com este e-mail.
IDS=$("$K" get users --config "$C" -r "$REALM" -q "email=$EMAIL" -q exact=true --fields id --format csv --noquotes 2>/dev/null) || { echo "Consulta da conta falhou." >&2; exit 3; }
COUNT=$(printf '%s\n' "$IDS" | grep -cE '^[0-9a-f-]{36}$' || true)
[ "$COUNT" -eq 1 ] || { echo "Conta não encontrada ou ambígua ($COUNT resultados)." >&2; exit 3; }
ID=$(printf '%s\n' "$IDS" | grep -E '^[0-9a-f-]{36}$')

list_otp() {
  "$K" get "users/$ID/credentials" --config "$C" -r "$REALM" --fields id,type --format csv --noquotes 2>/dev/null | grep -E ',otp$' | cut -d, -f1
}

list_otp > "$CREDS" || { echo "Listagem de credenciais falhou." >&2; exit 4; }
REMOVED=0
while IFS= read -r credential; do
  [ -n "$credential" ] || continue
  "$K" delete "users/$ID/credentials/$credential" --config "$C" -r "$REALM" >/dev/null 2>&1 || { echo "Remoção da credencial falhou." >&2; exit 4; }
  REMOVED=$((REMOVED + 1))
done < "$CREDS"

# Só anuncia sucesso depois de reler e confirmar que não há TOTP.
REMAINING=$(list_otp | grep -c . || true)
[ "$REMAINING" -eq 0 ] || { echo "Verificação final: ainda há $REMAINING credencial(is) de segundo fator." >&2; exit 5; }

# Sessões abertas no provedor deixam de valer. O portal encerra as suas em seguida (portal-prod.sh).
"$K" create "users/$ID/logout" --config "$C" -r "$REALM" >/dev/null 2>&1 || { echo "SUB=$ID"; echo "REMOVIDOS=$REMOVED"; echo "Sessões do provedor não foram encerradas." >&2; exit 6; }

echo "SUB=$ID"
echo "REMOVIDOS=$REMOVED"
