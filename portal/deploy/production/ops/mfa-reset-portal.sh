#!/bin/bash
# Lado do portal na recuperação de MFA: auditoria e encerramento das sessões do portal. Chamado por portal-prod.sh.
# Uso: mfa-reset-portal.sh <fase> <e-mail> <operador> <correlação> <motivo> [sub] [otp removidos] [resultado]
#   fase registrar   grava a tentativa na auditoria antes de qualquer alteração (falha aqui aborta a recuperação)
#   fase encerrar    apaga as sessões do portal da conta (sub) e devolve a quantidade
#   fase concluir    grava o desfecho na auditoria
# Nada aqui recebe ou imprime tokens, senhas ou sementes.
set -euo pipefail

PHASE=${1:?fase}; EMAIL=${2:?e-mail}; OPERATOR=${3:?operador}; CORRELATION=${4:?correlação}; REASON=${5:?motivo}
SUB=${6:-}; REMOVED=${7:-0}; RESULT=${8:-}

export PGHOST=postgres PGUSER=postgres PGPASSWORD="$POSTGRES_PASSWORD"

# Variáveis do psql só são interpoladas em entrada por script (heredoc), não em `-c`.
audit() {
  local action=$1 summary=$2
  psql -v ON_ERROR_STOP=1 -q -d portal -v email="$EMAIL" -v action="$action" -v summary="$summary" -v corr="$CORRELATION" <<'SQL'
INSERT INTO audit_event (id, tenant_id, project_id, actor_id, action, resource_type, resource_id, summary, visible_to_client, correlation_id, created_at)
SELECT gen_random_uuid(), u.tenant_id, NULL, NULL, :'action', 'user', u.id, left(:'summary', 240), false, :'corr', now()
FROM app_user u WHERE lower(u.email) = lower(:'email');
-- Conta ausente no portal também fica registrada, sem recurso.
INSERT INTO audit_event (id, action, resource_type, summary, visible_to_client, correlation_id, created_at)
SELECT gen_random_uuid(), :'action', 'user', left(:'summary', 240), false, :'corr', now()
WHERE NOT EXISTS (SELECT 1 FROM app_user u WHERE lower(u.email) = lower(:'email'));
SQL
}

case "$PHASE" in
  registrar)
    audit MFA_RESET_REQUESTED "operador=$OPERATOR; motivo=$REASON; conta=$EMAIL"
    ;;
  encerrar)
    [ -n "$SUB" ] || { echo "sub ausente" >&2; exit 1; }
    psql -Atq -v ON_ERROR_STOP=1 -d portal_sessao -v sub="$SUB" <<'SQL'
WITH d AS (DELETE FROM portal_session WHERE subject = :'sub' RETURNING 1) SELECT count(*) FROM d;
SQL
    ;;
  concluir)
    audit MFA_RESET_RESULT "operador=$OPERATOR; resultado=$RESULT; otp removidos=$REMOVED; conta=$EMAIL"
    ;;
  *) echo "fase desconhecida" >&2; exit 2 ;;
esac
