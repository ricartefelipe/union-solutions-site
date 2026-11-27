#!/bin/sh
# Demonstração do Locentra na VPS das demonstrações. Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/locentra, com .env criado a partir de .env.example (`segredos`).
#
# A imagem é construída numa máquina de trabalho, a partir da tag do produto, e carregada na VPS; `subir` e
# `reiniciar-dados` não compilam:
#   git -C locentra archive v<tag> | tar -x -C /tmp/locentra-<tag> && cd /tmp/locentra-<tag>
#   docker build --target runtime -t demo-locentra-app:<tag> .
#   docker save demo-locentra-app:<tag> | gzip -1 | ssh root@<vps> 'gunzip | docker load'
# Ao trocar de tag: LOCENTRA_TAG no .env, docker/postgres/init/01-roles.sh da tag nova em postgres-init/ e `subir`,
# que aplica as migrations (ou `reiniciar-dados`, se a carga de demonstração mudou).
#
# Rode os comandos do Compose sempre por aqui: o TRUSTED_PROXIES vem da faixa da rede union-demos, lida a cada execução.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N"${1:-24}" -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: rode sh demo.sh segredos."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
  for arquivo in tls/ca.crt tls/mailpit.crt tls/mailpit.key; do
    [ -s "$arquivo" ] || { echo "Falta $arquivo: rode sh demo.sh segredos."; exit 2; }
  done
}

# IP do proxy das demonstrações na rede union-demos, para o TRUSTED_PROXIES: só ele pode informar o IP do visitante.
# Os contêineres das outras demonstrações estão na mesma rede e não entram na confiança. Se o proxy for recriado e
# mudar de IP, rode `sh demo.sh subir` aqui (o timer da madrugada também relê).
rede_do_proxy() {
  rede=$(value DEMOS_NETWORK)
  proxy=$(docker ps -q --filter label=com.docker.compose.project=demos-proxy --filter label=com.docker.compose.service=proxy | head -n 1)
  DEMOS_PROXY_IP=""
  [ -n "$proxy" ] && DEMOS_PROXY_IP=$(docker inspect -f "{{with index .NetworkSettings.Networks \"$rede\"}}{{.IPAddress}}{{end}}" "$proxy" 2>/dev/null || true)
  if [ -n "$DEMOS_PROXY_IP" ]; then
    DEMOS_PROXY_IP=$DEMOS_PROXY_IP/32
  else
    [ "${1:-}" = "exigir" ] && { echo "Proxy das demonstrações não encontrado na rede $rede: suba o proxy antes."; exit 2; }
    DEMOS_PROXY_IP=127.0.0.1/32
  fi
  export DEMOS_PROXY_IP
}

# CA própria da demonstração e certificado do Mailpit interno (nome locentra-mailpit), para o STARTTLS que o produto
# exige em produção. A chave da CA é descartada depois de assinar: ninguém emite outro certificado com ela.
gerar_tls() {
  [ -s tls/ca.crt ] && [ -s tls/mailpit.crt ] && [ -s tls/mailpit.key ] && return 0
  rm -rf tls && mkdir -p tls && chmod 755 tls
  tmp=$(mktemp -d)
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 -subj "/CN=CA da demonstração Locentra" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout "$tmp/ca.key" -out tls/ca.crt 2>/dev/null
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj "/CN=locentra-mailpit" \
    -keyout tls/mailpit.key -out "$tmp/mailpit.csr" 2>/dev/null
  printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:locentra-mailpit\n' > "$tmp/ext"
  openssl x509 -req -in "$tmp/mailpit.csr" -CA tls/ca.crt -CAkey "$tmp/ca.key" -CAcreateserial -CAserial "$tmp/ca.srl" -days 3650 \
    -extfile "$tmp/ext" -out tls/mailpit.crt 2>/dev/null
  rm -rf "$tmp"
  # O Mailpit roda como 65534 e lê a chave; a CA e o certificado são públicos (a web e o worker rodam como 10001).
  chmod 644 tls/ca.crt tls/mailpit.crt
  chown 65534:65534 tls/mailpit.key
  chmod 600 tls/mailpit.key
  echo "CA e certificado do Mailpit gerados em tls/."
}

psql_super() { $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d locentra -tAc "$1"; }

# A carga do produto não é atômica (cada organização e cada item num caso de uso próprio) e pula a organização cujo
# proprietário já existe: uma carga interrompida não se completa rodando de novo. Por isso o fim da carga é marcado no
# próprio banco (some com o down -v), e um banco com dados mas sem a marca é recusado.
ja_carregado() {
  n=$(psql_super "SELECT to_regclass('demo.carga_concluida') IS NOT NULL" 2>/dev/null || true)
  [ "$n" = "t" ]
}

tem_dados() {
  n=$(psql_super "SELECT count(*) FROM users" 2>/dev/null || true)
  [ -n "$n" ] && [ "$n" != "0" ]
}

marcar_carga() {
  psql_super "CREATE SCHEMA IF NOT EXISTS demo; CREATE TABLE IF NOT EXISTS demo.carga_concluida (em timestamptz NOT NULL DEFAULT now()); INSERT INTO demo.carga_concluida DEFAULT VALUES" >/dev/null
}

# Ajustes da demonstração sobre a carga do produto, por serem contas compartilhadas (ver contas-compartilhadas.sql).
# Idempotente: roda a cada subir e reiniciar-dados.
ajustar_carga() {
  $COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d locentra < contas-compartilhadas.sql >/dev/null
}

migrar() { $COMPOSE run --rm --no-deps migrate; }

# Banco (papéis e bancos pelo 01-roles.sh do produto), migrations com o papel owner e a carga de demonstração com o
# papel app, sob Row-Level Security.
carregar_dados() {
  $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres
  migrar
  $COMPOSE run --rm --no-deps seed
  ajustar_carga
  marcar_carga
}

status() {
  $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
  docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null || true
}

case "${1:-ajuda}" in
  segredos)
    [ "$(id -u)" = 0 ] || { echo "Rode sh demo.sh segredos como root: a chave do Mailpit precisa ser do UID 65534."; exit 2; }
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in DB_SUPERUSER_PASSWORD LOCENTRA_OWNER_PASSWORD LOCENTRA_APP_PASSWORD LOCENTRA_WORKER_PASSWORD LOCENTRA_BACKUP_PASSWORD APP_ENCRYPTION_KEY; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    sed -i "s|^APP_SECRET_KEY_BASE=GERADO\$|APP_SECRET_KEY_BASE=$(random 64)|" .env
    gerar_tls
    echo "Criado .env com os segredos gerados."
    ;;
  instalar)
    require_env
    sed "s|__DEMO_HOST__|$(value DEMO_HOST)|g" demo-locentra.caddy > "$PROXY/sites/demo-locentra.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  subir)
    require_env
    rede_do_proxy exigir
    $COMPOSE up -d --no-build --wait --wait-timeout 300 postgres
    # Comandos separados por ";", não "&&": numa lista "&&" o set -e não interrompe na falha da migration, e a web
    # subiria com a imagem nova sobre o schema antigo.
    if ja_carregado; then
      migrar
      ajustar_carga
    elif tem_dados; then
      echo "Carga de demonstração incompleta (interrompida antes do fim): rode sh demo.sh reiniciar-dados."
      exit 2
    else
      carregar_dados
    fi
    $COMPOSE up -d --no-build --wait --wait-timeout 600
    status
    ;;
  parar)
    rede_do_proxy
    $COMPOSE down
    ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração (banco, anexos e caixa do Mailpit) e sobe de novo. Agendado diariamente
    # pelo timer demo-locentra.timer (07:40 UTC, 04:40 em Brasília): a carga cria reservas relativas ao dia e um
    # bloqueio temporário de 24 horas, e o roteiro só se repete com o banco novo.
    require_env
    rede_do_proxy exigir
    $COMPOSE down -v --remove-orphans
    carregar_dados
    $COMPOSE up -d --no-build --wait --wait-timeout 600
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
  *) echo "Uso: sh demo.sh <segredos|instalar|subir|parar|reiniciar-dados|status|logs>" ;;
esac
