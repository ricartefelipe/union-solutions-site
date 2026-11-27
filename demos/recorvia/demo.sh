#!/bin/sh
# Demonstração do Recorvia na VPS das demonstrações.
# Uso: sh demo.sh <segredos|instalar|construir|ajustar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/recorvia, com .env criado a partir de .env.example (`segredos`). `instalar` clona o
# repositório público do produto na tag de RECORVIA_TAG; `construir` só constrói as imagens do produto na VPS, para a análise
# antes de publicar; `subir` constrói e sobe tudo; `reiniciar-dados` não compila.
set -eu
# CDPATH vazio só neste cd, para ele não imprimir o destino.
# shellcheck disable=SC1007
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: rode sh demo.sh segredos."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  # shellcheck disable=SC2015
  grep -qE '^[A-Z0-9_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

# A interface e o Keycloak só aceitam X-Forwarded-* vindo da rede do proxy das demonstrações. A faixa é lida a cada execução,
# para seguir a rede mesmo se ela for recriada. Para parar, ver estado e logs, a rede não precisa existir.
rede_do_proxy() {
  DEMOS_PROXY_SUBNET=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$(value DEMOS_NETWORK)" 2>/dev/null | awk '{print $1}')
  if [ -z "$DEMOS_PROXY_SUBNET" ]; then
    [ "${1:-}" = "exigir" ] && { echo "Rede $(value DEMOS_NETWORK) não encontrada: suba o proxy das demonstrações antes."; exit 2; }
    DEMOS_PROXY_SUBNET=127.0.0.1/32
  fi
  export DEMOS_PROXY_SUBNET
}

# O realm da tag é o do ambiente local do produto: endereços localhost no cliente, segredo conhecido, proteção contra força
# bruta e as ações que trocam senha, segundo fator ou perfil habilitadas. Com a senha pública das contas compartilhadas, um
# visitante bloquearia uma conta com tentativas erradas ou a tomaria para si com `kc_action` (troca de senha, TOTP, chave de
# acesso) até o reinício diário. Aqui o cliente recebe o endereço público e o segredo do .env, e o realm, o nome da
# demonstração, sem a proteção contra força bruta e com essas ações desligadas; o proxy também recusa `kc_action`.
# Os segredos entram pela entrada padrão, e não pela linha de comando do `docker exec`. Dentro do contêiner, a senha do admin vai
# para o kcadm pela variável KC_CLI_PASSWORD, e o segredo do cliente, por um arquivo com permissão 600, apagado no fim: nenhum
# dos dois aparece na lista de processos. Qualquer falha interrompe o script: a interface pública só sobe depois deste ajuste.
ajustar_keycloak() {
  # O script entre aspas simples é expandido dentro do contêiner.
  # shellcheck disable=SC2016
  printf '%s\n%s\n' "$(value RECORVIA_KEYCLOAK_ADMIN_PASSWORD)" "$(value RECORVIA_OIDC_CLIENT_SECRET)" \
    | $COMPOSE exec -T -e HOST="$(value DEMO_HOST)" keycloak sh -c '
set -e
umask 077
trap "rm -f /tmp/kc /tmp/cliente.json /tmp/realm.json" EXIT
IFS= read -r KC_CLI_PASSWORD
IFS= read -r SEGREDO
export KC_CLI_PASSWORD
K=/opt/keycloak/bin/kcadm.sh
i=0
until $K config credentials --config /tmp/kc --server http://127.0.0.1:8080 --realm master --user admin >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "O Keycloak não aceitou a conta administrativa em 60 s." >&2; exit 1; }; sleep 2
done
unset KC_CLI_PASSWORD
ID=$($K get clients --config /tmp/kc -r recorvia -q clientId=recorvia-web --fields id --format csv --noquotes)
[ -n "$ID" ] || { echo "Cliente recorvia-web não encontrado no realm recorvia." >&2; exit 1; }
printf "{\"secret\":\"%s\"}" "$SEGREDO" > /tmp/cliente.json
$K update clients/$ID --config /tmp/kc -r recorvia -f /tmp/cliente.json --merge
$K update clients/$ID --config /tmp/kc -r recorvia -s "redirectUris=[\"https://$HOST/auth/callback\"]" -s "webOrigins=[\"https://$HOST\"]" -s "attributes.\"post.logout.redirect.uris\"=https://$HOST/*"
# Nome com acento em JSON escapado: não depende da codificação do terminal do contêiner.
printf "%s" "{\"displayName\":\"Recorvia (demonstra\\u00e7\\u00e3o)\",\"bruteForceProtected\":false}" > /tmp/realm.json
$K update realms/recorvia --config /tmp/kc -f /tmp/realm.json
# Ações que mudam credencial ou perfil. As do Keycloak 26.8 precisam existir; as opcionais só são desligadas se existirem.
for acao in UPDATE_PASSWORD CONFIGURE_TOTP webauthn-register webauthn-register-passwordless UPDATE_PROFILE delete_credential; do
  $K update authentication/required-actions/$acao --config /tmp/kc -r recorvia -s enabled=false
done
ACOES=$($K get authentication/required-actions --config /tmp/kc -r recorvia --fields alias --format csv --noquotes)
for acao in UPDATE_EMAIL CONFIGURE_RECOVERY_AUTHN_CODES delete_account; do
  if printf "%s\n" "$ACOES" | grep -qx "$acao"; then
    $K update authentication/required-actions/$acao --config /tmp/kc -r recorvia -s enabled=false
  fi
done'
  echo "Keycloak ajustado para https://$(value DEMO_HOST)."
}

# Confere as imagens comuns (PostgreSQL e Keycloak), que vêm de demos/imagens e já estão na VPS, e constrói só as do produto.
construir_imagens() {
  docker image inspect union-demos-postgres:16 union-demos-keycloak:26.8.1 >/dev/null 2>&1 \
    || { echo "Faltam as imagens comuns union-demos-postgres:16 e union-demos-keycloak:26.8.1 (demos/imagens)."; exit 2; }
  $COMPOSE --profile seed build migrate-bootstrap paysim api worker web seed
}

# Banco, filas, simulador, Keycloak, API e worker (o bootstrap e as migrations entram pelo depends_on); depois o ajuste do
# realm, a carga de demonstração e, por último, a interface pública. Até o fim, o proxy responde que a demonstração está
# temporariamente indisponível.
subir_tudo() {
  $COMPOSE up -d --no-build --wait --wait-timeout 600 postgres redis rabbitmq mailpit paysim keycloak api worker
  ajustar_keycloak
  $COMPOSE --profile seed run --rm --no-deps seed
  $COMPOSE up -d --no-build --wait --wait-timeout 300 web
}

status() {
  $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
  # Um argumento por contêiner.
  # shellcheck disable=SC2046
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null || true
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    sed -i "s|^RECORVIA_DB_PASSWORD=GERADO\$|RECORVIA_DB_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_OWNER_PASSWORD=GERADO\$|RECORVIA_OWNER_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_APP_PASSWORD=GERADO\$|RECORVIA_APP_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_RABBIT_PASSWORD=GERADO\$|RECORVIA_RABBIT_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_REDIS_PASSWORD=GERADO\$|RECORVIA_REDIS_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_KEYCLOAK_ADMIN_PASSWORD=GERADO\$|RECORVIA_KEYCLOAK_ADMIN_PASSWORD=$(random)|" .env
    sed -i "s|^RECORVIA_OIDC_CLIENT_SECRET=GERADO\$|RECORVIA_OIDC_CLIENT_SECRET=$(random)|" .env
    # O Recorvia exige id:base64 de 32 bytes; a chave ativa é o id.
    chave_id=k$(date -u +%Y%m%d)
    sed -i "s|^RECORVIA_ENCRYPTION_KEYS=GERADO\$|RECORVIA_ENCRYPTION_KEYS=$chave_id:$(head -c 32 /dev/urandom | base64 | tr -d '\n')|" .env
    sed -i "s|^RECORVIA_ENCRYPTION_ACTIVE_KEY=GERADO\$|RECORVIA_ENCRYPTION_ACTIVE_KEY=$chave_id|" .env
    echo "Criado .env com os segredos gerados."
    ;;
  instalar)
    require_env
    tag=$(value RECORVIA_TAG); src=$(value RECORVIA_SRC)
    if [ -d "$src/.git" ]; then git -C "$src" fetch -q --tags origin; else git clone -q https://github.com/ricartefelipe/recorvia.git "$src"; fi
    git -C "$src" checkout -q "$tag" && echo "Recorvia $tag em $src ($(git -C "$src" rev-parse --short HEAD))."
    cp demo-recorvia.caddy "$PROXY/sites/demo-recorvia.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  construir)
    # Só constrói, sem subir nada: para analisar as imagens antes de publicar.
    require_env
    rede_do_proxy
    construir_imagens
    echo "Imagens do produto construídas: demo-recorvia-migrate, -paysim, -api, -worker, -web e -seed."
    ;;
  ajustar)
    require_env
    rede_do_proxy
    ajustar_keycloak
    ;;
  subir)
    require_env
    rede_do_proxy exigir
    construir_imagens
    subir_tudo
    status
    ;;
  parar)
    rede_do_proxy
    $COMPOSE down
    ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração (banco, filas, simulador e o realm do Keycloak, que vive no contêiner) e sobe de
    # novo. Agendado diariamente pelo timer demo-recorvia.timer.
    require_env
    rede_do_proxy exigir
    $COMPOSE --profile seed down -v --remove-orphans
    subir_tudo
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status)
    rede_do_proxy
    status
    ;;
  logs)
    shift
    rede_do_proxy
    $COMPOSE logs --tail=200 "$@"
    ;;
  *) echo "Uso: sh demo.sh <segredos|instalar|construir|ajustar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
