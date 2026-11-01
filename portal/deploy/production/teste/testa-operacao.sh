#!/bin/bash
# Cenários de falha e concorrência dos comandos de operação, no ambiente de prova. Uso: bash testa-operacao.sh
# Imprime uma linha por cenário com OK ou FALHA. Não envia nada para fora e não toca dados reais.
set -u
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROD=$DIR/..
STATE=${PROVA_DIR:-$HOME/.cache/union-portal-prova}
export PORTAL_PROD_ENV=$STATE/env PORTAL_PROD_PROJECT=${PORTAL_PROD_PROJECT:-union-portal-prova}
export PORTAL_PROD_COMPOSE_EXTRA=$DIR/compose.teste.yaml
P=$PORTAL_PROD_PROJECT
prod() { sh "$PROD/portal-prod.sh" "$@"; }
compose() { docker compose -p "$P" --env-file "$PORTAL_PROD_ENV" -f "$PROD/compose.yaml" -f "$PORTAL_PROD_COMPOSE_EXTRA" "$@"; }
ok=0; bad=0
check() { if [ "$1" = 0 ]; then ok=$((ok + 1)); echo "OK     $2"; else bad=$((bad + 1)); echo "FALHA  $2"; fi; }
api() { docker inspect --format '{{.State.Status}} {{.State.Paused}}' "$P-backend-1"; }
staging_dirs() { compose run --rm --no-deps -T --entrypoint sh ops -c 'ls -1 /staging 2>/dev/null | wc -l' 2>/dev/null | tr -d '[:space:]'; }
db() { docker exec "$P-postgres-1" psql -U postgres -d "$1" -Atc "$2"; }
snapshots() { compose run --rm --no-deps -T --entrypoint sh ops -c '/ops/restic.sh snapshots --host portal --tag portal --json' 2>/dev/null | grep -o '"short_id"' | wc -l; }

echo "== Backup: duas execuções sobrepostas"
prod backup >/tmp/op-a.log 2>&1 &
pa=$!
sleep 1.5
PORTAL_LOCK_WAIT=3 prod backup >/tmp/op-b.log 2>&1
rb=$?
wait $pa; ra=$?
check "$([ $ra -eq 0 ] && [ $rb -eq 75 ] && echo 0 || echo 1)" "segunda espera o limite e desiste (saídas $ra, $rb)"
check "$(grep -q 'Outra operação' /tmp/op-b.log && echo 0 || echo 1)" "mensagem clara para a segunda execução"
check "$([ "$(api)" = "running false" ] && echo 0 || echo 1)" "API em execução depois das duas"
check "$([ "$(staging_dirs)" = 0 ] && echo 0 || echo 1)" "nenhuma área temporária restante"

echo "== Backup com espera: a segunda roda depois da primeira"
n0=$(snapshots)
prod backup >/tmp/op-a.log 2>&1 &
pa=$!
sleep 1.5
PORTAL_LOCK_WAIT=600 prod backup >/tmp/op-b.log 2>&1
rb=$?
wait $pa; ra=$?
check "$([ $ra -eq 0 ] && [ $rb -eq 0 ] && echo 0 || echo 1)" "as duas concluem em sequência (saídas $ra, $rb)"
n=$(snapshots)
check "$([ "$n" -ge $((n0 + 2)) ] && echo 0 || echo 1)" "dois snapshots a mais ($n0 -> $n)"

echo "== Backup contra restauração e contra atualização"
prod backup >/tmp/op-a.log 2>&1 &
pa=$!
sleep 1.5
echo RESTAURAR | PORTAL_LOCK_WAIT=3 prod restaurar >/tmp/op-b.log 2>&1
rb=$?
wait $pa
check "$([ $rb -eq 75 ] && echo 0 || echo 1)" "restauração recusada enquanto o backup roda (saída $rb)"
prod backup >/tmp/op-a.log 2>&1 &
pa=$!
sleep 1.5
PORTAL_LOCK_WAIT=3 prod atualizar >/tmp/op-b.log 2>&1
rb=$?
wait $pa
check "$([ $rb -eq 75 ] && echo 0 || echo 1)" "atualização recusada enquanto o backup roda (saída $rb)"
check "$([ "$(api)" = "running false" ] && echo 0 || echo 1)" "API em execução"

echo "== Atualização chama backup sem travar a si mesma"
PORTAL_LOCK_WAIT=20 timeout 900 sh "$PROD/portal-prod.sh" atualizar >/tmp/op-a.log 2>&1; r=$?
check "$r" "atualizar concluiu com backup interno (sem deadlock)"
[ "$r" = 0 ] || { echo "--- saída de atualizar:"; tail -n 12 /tmp/op-a.log | cut -c1-160; }

echo "== Erro em cada fase"
PORTAL_BACKUP_MIN_FREE_MB=999999999 prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 3 ] && [ "$(api)" = "running false" ] && [ "$(staging_dirs)" = 0 ] && echo 0 || echo 1)" "sem espaço: saída $r, API despausada, área removida"
# Um objeto registrado some do lugar (movido para uma chave de teste) e volta depois.
compose run --rm --no-deps -T --entrypoint bash ops -c 'source /ops/s3-env.sh; alvo=$(rclone lsf -R --files-only "LOCAL:$BUCKET" | grep -v "^_teste/" | head -n 1); rclone moveto "LOCAL:$BUCKET/$alvo" "LOCAL:$BUCKET/_teste/$alvo"' >/dev/null 2>&1
prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 4 ] && grep -q 'sem objeto' /tmp/op-a.log && [ "$(api)" = "running false" ] && echo 0 || echo 1)" "reconciliação falha: saída $r, API despausada"
compose run --rm --no-deps -T --entrypoint bash ops -c 'source /ops/s3-env.sh; for k in $(rclone lsf -R --files-only "LOCAL:$BUCKET/_teste"); do rclone moveto "LOCAL:$BUCKET/_teste/$k" "LOCAL:$BUCKET/$k"; done' >/dev/null 2>&1
prod reconciliar >/tmp/op-a.log 2>&1; check "$?" "objeto de volta: reconciliação limpa"
compose stop sftp-alvo >/dev/null 2>&1
PORTAL_BACKUP_TIMEOUT_SECONDS=20 prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -ne 0 ] && [ $r -ne 4 ] && [ "$(api)" = "running false" ] && [ "$(staging_dirs)" = 0 ] && echo 0 || echo 1)" "destino inacessível: saída $r, API despausada, área removida"
compose start sftp-alvo >/dev/null 2>&1
RESTIC_PASSWORD=errada prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 12 ] && grep -q 'incorreta' /tmp/op-a.log && [ "$(staging_dirs)" = 0 ] && echo 0 || echo 1)" "senha de backup errada: saída $r, repositório não reinicializado"
n2=$(snapshots)
check "$([ "$n2" -ge "$n" ] && echo 0 || echo 1)" "snapshots anteriores preservados ($n2)"
PORTAL_BACKUP_KEEP_DAILY= prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -ne 0 ] && [ "$(staging_dirs)" = 0 ] && echo 0 || echo 1)" "retenção ausente: saída $r, área removida"

echo "== Cancelamento no meio e área abandonada"
( prod backup >/tmp/op-a.log 2>&1 & pid=$!; sleep 2.5; kill -TERM $pid; wait $pid ) 2>/dev/null
docker ps -q --filter "label=com.docker.compose.project=$P" --filter 'label=com.docker.compose.oneoff=True' --filter 'label=com.docker.compose.service=ops' | xargs -r docker stop -t 2 >/dev/null 2>&1
for i in $(seq 1 15); do [ "$(api)" = "running false" ] && break; sleep 1; done
check "$([ "$(api)" = "running false" ] && echo 0 || echo 1)" "API despausada depois do cancelamento"
compose run --rm --no-deps -T --entrypoint sh ops -c 'mkdir -p /staging/abandonada-teste/objetos && echo x > /staging/abandonada-teste/portal.dump && touch -d "2 hours ago" /staging/abandonada-teste' >/dev/null 2>&1
compose run --rm --no-deps -T --entrypoint sh ops -c 'mkdir -p /staging/recente-teste && echo x > /staging/recente-teste/portal.dump' >/dev/null 2>&1
prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 0 ] && grep -q 'Removendo área abandonada: abandonada-teste' /tmp/op-a.log && grep -q 'Área recente preservada: recente-teste' /tmp/op-a.log && echo 0 || echo 1)" "área abandonada removida; área recente preservada"
compose run --rm --no-deps -T --entrypoint sh ops -c 'rm -rf /staging/recente-teste' >/dev/null 2>&1

echo "== API pausada por outra atividade"
compose pause backend >/dev/null 2>&1
prod backup >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 70 ] && [ "$(api)" = "paused true" ] && echo 0 || echo 1)" "backup recusa e não despausa o que não pausou (saída $r)"
compose unpause backend >/dev/null 2>&1

echo "== Falha ao despausar"
# Simula: o container é removido durante a cópia, então `unpause` não tem o que despausar e o estado final não é 'running'.
( prod backup >/tmp/op-a.log 2>&1 & pid=$!; sleep 2; docker rm -f "$P-backend-1" >/dev/null 2>&1; wait $pid; echo $? > /tmp/op-rc )
r=$(cat /tmp/op-rc)
check "$([ "$r" -ne 0 ] && grep -q 'ATENÇÃO: a API continua' /tmp/op-a.log && echo 0 || echo 1)" "falha de despausa anunciada (saída $r)"
compose up -d --wait --wait-timeout 300 backend frontend proxy >/dev/null 2>&1
check "$([ "$(api)" = "running false" ] && echo 0 || echo 1)" "ambiente recuperado"

echo "== Recuperação de MFA: modos de falha"
STAFF=$(docker run --rm -v union-portal-prova-evidencias:/e alpine:3.22 sh -c 'cat /e/estado.json' 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("staff",""))')
CLIENT=$(docker run --rm -v union-portal-prova-evidencias:/e alpine:3.22 sh -c 'cat /e/estado.json' 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("clientA",""))')
# Garante que a conta da equipe tem TOTP configurado: o teste `antes` entra com ela e configura o fator, se preciso.
bash "$DIR/prova.sh" testes tests/07-mfa-removido.spec.js --grep antes --reporter=line >/dev/null 2>&1
before=$(db portal "select count(*) from audit_event where action like 'MFA_RESET%'")
prod remover-mfa "$STAFF" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 2 ] && echo 0 || echo 1)" "sem motivo: recusado (saída $r)"
prod remover-mfa "ninguem-$RANDOM@unionsolutions.tech" "atendimento 1" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 3 ] && grep -q 'não encontrada' /tmp/op-a.log && echo 0 || echo 1)" "alvo ausente: saída $r"
prod remover-mfa "$CLIENT" "atendimento 2" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 0 ] && grep -q 'removido (0' /tmp/op-a.log && echo 0 || echo 1)" "conta sem OTP: conclui com 0 removidos (saída $r)"
fake() { docker exec "$P-keycloak-1" sh -c "printf '#!/bin/sh\nif [ \"\$1\" = $2 ]; then exit $3; fi\nexec /opt/keycloak/bin/kcadm.sh \"\$@\"\n' > /tmp/$1; chmod +x /tmp/$1" 2>/dev/null; }
fake kcadm-auth-falha.sh config 1
PORTAL_MFA_KCADM=/tmp/kcadm-auth-falha.sh prod remover-mfa "$STAFF" "atendimento 3" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 2 ] && grep -q 'Autenticação administrativa falhou' /tmp/op-a.log && echo 0 || echo 1)" "falha de autenticação: saída $r"
fake kcadm-delete-falha.sh delete 1
PORTAL_MFA_KCADM=/tmp/kcadm-delete-falha.sh prod remover-mfa "$STAFF" "atendimento 4" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 4 ] && grep -q 'Remoção da credencial falhou' /tmp/op-a.log && ! grep -q 'Segundo fator removido' /tmp/op-a.log && echo 0 || echo 1)" "falha de delete: nenhum sucesso anunciado (saída $r)"
fake kcadm-delete-mentira.sh delete 0
PORTAL_MFA_KCADM=/tmp/kcadm-delete-mentira.sh prod remover-mfa "$STAFF" "atendimento 5" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 5 ] && grep -q 'Verificação final' /tmp/op-a.log && echo 0 || echo 1)" "delete sem efeito: verificação final acusa (saída $r)"
fake kcadm-logout-falha.sh create 1
PORTAL_MFA_KCADM=/tmp/kcadm-logout-falha.sh prod remover-mfa "$STAFF" "atendimento 6" >/tmp/op-a.log 2>&1; r=$?
check "$([ $r -eq 6 ] && grep -q 'Recuperação PARCIAL' /tmp/op-a.log && echo 0 || echo 1)" "logout do provedor falha: parcial anunciada (saída $r)"
# A auditoria some (tabela renomeada) e volta em seguida. O operador do banco é superusuário: revogar permissão não o afetaria.
docker exec "$P-postgres-1" psql -U postgres -d portal -c "ALTER TABLE audit_event RENAME TO audit_event_indisponivel" >/dev/null 2>&1
prod remover-mfa "$CLIENT" "atendimento 7" >/tmp/op-a.log 2>&1; r=$?
docker exec "$P-postgres-1" psql -U postgres -d portal -c "ALTER TABLE audit_event_indisponivel RENAME TO audit_event" >/dev/null 2>&1
check "$([ $r -eq 3 ] && grep -q 'Auditoria indisponível' /tmp/op-a.log && echo 0 || echo 1)" "auditoria indisponível: abortado antes de alterar (saída $r)"
after=$(db portal "select count(*) from audit_event where action like 'MFA_RESET%'")
check "$([ "$after" -gt "$before" ] && echo 0 || echo 1)" "tentativas registradas na auditoria ($before -> $after)"
leak=$(db portal "select count(*) from audit_event where action like 'MFA_RESET%' and (summary ~ 'eyJ' or summary ~ 'secret' or summary ~ 'senha')")
check "$([ "$leak" = 0 ] && echo 0 || echo 1)" "auditoria sem segredos"
echo "== Segredos fora dos argumentos de processo"
( prod remover-mfa "$CLIENT" "atendimento 8" >/tmp/op-a.log 2>&1 & sleep 1; ps -eo args | grep -E 'kcadm|portal-mfa-reset' | grep -v grep > /tmp/op-ps; wait )
secret=$(grep '^PORTAL_KEYCLOAK_ADMIN_SECRET=' "$PORTAL_PROD_ENV" | cut -d= -f2)
check "$(! grep -q -- "$secret" /tmp/op-ps /tmp/op-a.log && ! grep -q -- '--secret\|--password' /tmp/op-ps && echo 0 || echo 1)" "nenhum segredo em argumentos ou saída"
rm -f /tmp/op-a.log /tmp/op-b.log /tmp/op-ps /tmp/op-rc
echo "Resultado: $ok OK, $bad FALHA"
[ "$bad" -eq 0 ]
