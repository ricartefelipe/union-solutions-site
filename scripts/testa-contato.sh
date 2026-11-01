#!/bin/sh
# Testa public/contato.php num Apache com PHP real, com o e-mail capturado em arquivo (nada é enviado de verdade).
# Uso: sh scripts/testa-contato.sh [pasta do build, padrão dist]
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DIST=${1:-$ROOT/dist}
[ -f "$DIST/contato.php" ] || { echo "Gere o build antes: npm run build"; exit 1; }
WORK=$(mktemp -d)
NAME=contato-php-teste-$$
PORT=${PORTA_TESTE:-18091}
trap 'docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"' EXIT INT TERM
cp -r "$DIST" "$WORK/site"
cat > "$WORK/capturar-email" <<'SH'
#!/bin/sh
# Substitui o sendmail: grava a mensagem e os argumentos, sem enviar nada.
{ echo "=== ARGS: $*"; cat; echo; } >> /tmp/emails.txt
SH
cat > "$WORK/Dockerfile" <<'DF'
FROM php:8.3-apache
RUN a2enmod rewrite headers >/dev/null && sed -i '/<Directory \/var\/www\/>/,/<\/Directory>/ s/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf
COPY --chmod=0755 capturar-email /usr/local/bin/capturar-email
RUN printf 'sendmail_path = /usr/local/bin/capturar-email\nexpose_php = Off\n' > /usr/local/etc/php/conf.d/contato.ini && touch /tmp/emails.txt && chmod 666 /tmp/emails.txt
RUN rm -rf /var/www/html/*
COPY site/ /var/www/html/
DF
docker build -q -t "$NAME" "$WORK" >/dev/null
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:80" "$NAME" >/dev/null
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
B="http://127.0.0.1:$PORT/contato.php"
H='X-Forwarded-Proto: https'
O='Origin: https://unionsolutions.tech'
ok=0; falhas=0
check() { if [ "$1" = "$2" ]; then ok=$((ok+1)); echo "OK     $3 ($1)"; else falhas=$((falhas+1)); echo "FALHA  $3 (esperado $2, obtido $1)"; fi; }
post() { curl -s -o /tmp/contato-resp.$$ -w '%{http_code}' -H "$H" -H "$O" -H 'Content-Type: application/json' "$@" "$B"; }
VALIDO='{"nome":"Ana Teste","empresa":"Empresa Teste","email":"ana@exemplo.com.br","telefone":"(11) 90000-0000","interesse":"produto","produto":"filenorm","mensagem":"Quero conhecer o produto em detalhes."}'

check "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "$B")" 405 "GET é recusado"
check "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" -H 'Origin: https://site-malicioso.example' -H 'Content-Type: application/json' -d "$VALIDO" "$B")" 403 "outra origem é recusada"
check "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" -H "$O" -d 'nome=x' "$B")" 415 "sem JSON é recusado"
check "$(post -d '{nao e json')" 400 "JSON inválido"
check "$(post -d '{"nome":"","email":"","interesse":"","mensagem":""}')" 422 "campos obrigatórios vazios"
check "$(post -d '{"nome":"A","email":"nao-e-email","interesse":"produto","produto":"filenorm","mensagem":"mensagem valida aqui"}')" 422 "e-mail inválido"
check "$(post -d '{"nome":"A","email":"a@b.co","interesse":"outro","produto":"","mensagem":"mensagem valida aqui"}')" 422 "interesse fora da lista"
check "$(post -d '{"nome":"A","email":"a@b.co","interesse":"produto","produto":"inexistente","mensagem":"mensagem valida aqui"}')" 422 "produto fora da lista"
check "$(post -d '{"nome":"A","email":"a@b.co","interesse":"consultoria","produto":"","mensagem":"curta"}')" 422 "mensagem curta"
check "$(post -d "$(python3 -c 'import json;print(json.dumps({"nome":"A","email":"a@b.co","interesse":"consultoria","produto":"","mensagem":"x"*20000}))')")" 413 "corpo acima do limite"
antes=$(docker exec "$NAME" grep -c '=== ARGS' /tmp/emails.txt || true)
check "$(post -d '{"nome":"Robo","email":"robo@exemplo.com","interesse":"parceria","produto":"","mensagem":"mensagem de robo aqui","site_web":"http://spam"}')" 200 "campo-armadilha responde sucesso"
check "$(docker exec "$NAME" grep -c '=== ARGS' /tmp/emails.txt || true)" "$antes" "armadilha não gera e-mail"
check "$(post -d "$VALIDO")" 200 "envio válido aceito"
check "$(cat /tmp/contato-resp.$$)" '{"ok":true}' "corpo de sucesso"
MAIL=$(docker exec "$NAME" cat /tmp/emails.txt)
printf '%s' "$MAIL" | grep -q 'ARGS: -fcontato@unionsolutions.tech' && c=1 || c=0; check "$c" 1 "remetente de envelope é a caixa da empresa"
printf '%s' "$MAIL" | grep -q '^To: contato@unionsolutions.tech' && c=1 || c=0; check "$c" 1 "destinatário é a caixa da empresa"
printf '%s' "$MAIL" | grep -q 'Reply-To: Ana Teste <ana@exemplo.com.br>' && c=1 || c=0; check "$c" 1 "Reply-To é quem escreveu"
printf '%s' "$MAIL" | grep -q 'Quero conhecer o produto' && c=1 || c=0; check "$c" 1 "mensagem no corpo"
printf '%s' "$MAIL" | grep -q 'Produto: filenorm' && c=1 || c=0; check "$c" 1 "produto no corpo"
check "$(post -d '{"nome":"Injeção\r\nBcc: alvo@exemplo.com","email":"a@b.co","interesse":"consultoria","produto":"","mensagem":"tentativa de injetar cabecalho"}')" 200 "nome com quebra de linha é aceito e saneado"
docker exec "$NAME" grep -q '^Bcc:' /tmp/emails.txt && c=1 || c=0; check "$c" 0 "nenhum cabeçalho injetado"
# Limite: 5 por hora por endereço. Já foram 2 envios válidos; mais 3 passam e o 6º recebe 429.
for i in 1 2 3; do post -d "$VALIDO" >/dev/null; done
check "$(post -d "$VALIDO")" 429 "sexto envio na hora é recusado"
check "$(docker exec "$NAME" sh -c 'ls /var/www/contato-limite /tmp/contato-limite 2>/dev/null | grep -c json')" 1 "limite gravado fora da raiz pública (pasta acima de public_html ou temporária)"
check "$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "http://127.0.0.1:$PORT/contato-limite/")" 404 "pasta do limite não é servida"
check "$(docker logs "$NAME" 2>&1 | grep -c 'Ana Teste\|ana@exemplo\|Quero conhecer')" 0 "conteúdo do formulário não vai para os logs do servidor"
if [ "${MANTER:-}" = 1 ]; then echo "Container $NAME mantido em http://127.0.0.1:$PORT (remova com: docker rm -f $NAME)"; trap - EXIT INT TERM; rm -rf "$WORK"; fi
rm -f /tmp/contato-resp.$$
echo "Resultado: $ok OK, $falhas FALHA"
[ "$falhas" -eq 0 ]
