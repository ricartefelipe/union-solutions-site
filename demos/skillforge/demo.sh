#!/bin/sh
# Demonstração do Skillforge na VPS das demonstrações. Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>
# Roda em /opt/union-solutions/demos/skillforge, com .env preenchido a partir de .env.example. As imagens são construídas em outra
# máquina (`construir`) e carregadas na VPS; `subir` e `reiniciar-dados` não compilam.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DIR"
PROXY=$DIR/../proxy
COMPOSE="docker compose --env-file .env -f compose.yaml"
value() { nome_campo=$1; grep "^$nome_campo=" .env | head -n 1 | cut -d= -f2-; }
random() { od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; }

require_env() {
  [ -f .env ] || { echo "Falta .env: copie .env.example, preencha e use permissão 600."; exit 2; }
  [ "$(stat -c '%a' .env)" = "600" ] || { echo "Permissão de .env deve ser 600."; exit 2; }
  grep -qE '^[A-Z_]+=(SUBSTITUIR|GERADO)$' .env && { echo "Preencha os valores SUBSTITUIR/GERADO de .env."; exit 2; } || true
}

fixar() {
  repo=$1; versao=$2; dest=$(value SKILLFORGE_SRC)/$repo
  if [ -d "$dest/.git" ]; then git -C "$dest" fetch -q --tags origin; else git clone -q "https://github.com/ricartefelipe/$repo.git" "$dest"; fi
  git -C "$dest" checkout -q "$versao" && echo "$repo $(git -C "$dest" rev-parse --short HEAD)."
}

baixar() {
  fixar skillforge "$(value SKILLFORGE_TAG)"
}
# O produto cria as contas sem senha e com endereço local; o script dele faz o mesmo em desenvolvimento. As senhas são públicas e
# só dão acesso a dados fictícios, apagados todo dia.
# Qualquer falha aqui interrompe o script: antes, o último comando (`rm`) escondia o erro e a demonstração ficava sem login até
# o reinício seguinte.
ajustar_contas() {
  host=$(value DEMO_HOST)
  cat "$(value SKILLFORGE_SRC)/skillforge/keycloak/user-profile.json" | $COMPOSE exec -T -e SENHA="$(value SKILLFORGE_KEYCLOAK_ADMIN_PASSWORD)" -e HOST="$host" keycloak sh -c '
set -e
K=/opt/keycloak/bin/kcadm.sh
cat > /tmp/perfil.json
i=0
until $K config credentials --config /tmp/kc --server http://127.0.0.1:8080 --realm master --user admin --password "$SENHA" >/dev/null 2>&1; do
  i=$((i + 1)); [ $i -lt 30 ] || { echo "O Keycloak não aceitou a conta administrativa em 60 s." >&2; exit 1; }; sleep 2
done
$K update users/profile --config /tmp/kc -r skillforge -f /tmp/perfil.json
ID=$($K get clients --config /tmp/kc -r skillforge -q clientId=skillforge --fields id --format csv --noquotes)
$K update clients/$ID --config /tmp/kc -r skillforge -s "redirectUris=[\"https://$HOST/callback\"]" -s "webOrigins=[\"https://$HOST\"]" -s "attributes.\"post.logout.redirect.uris\"=https://$HOST/"
for conta in aluno docente administracao; do $K set-password --config /tmp/kc -r skillforge --username $conta --new-password union-demo; done
rm -f /tmp/kc /tmp/perfil.json'
}

# A interface pública só sobe depois das contas ajustadas. Antes, ela atendia enquanto o cliente do realm ainda tinha o endereço
# local do produto: quem chegasse nesse intervalo via o erro "Invalid parameter: redirect_uri" do Keycloak, ou tinha a senha
# recusada. Agora, até o fim, o proxy responde que a demonstração está temporariamente indisponível.
subir_tudo() {
  $COMPOSE up -d --no-build --wait --wait-timeout 600 postgres keycloak api
  ajustar_contas
  $COMPOSE up -d --no-build --wait --wait-timeout 300 web
}

case "${1:-ajuda}" in
  segredos)
    [ -f .env ] || { cp .env.example .env && chmod 600 .env; }
    for campo in SKILLFORGE_DB_PASSWORD SKILLFORGE_KEYCLOAK_ADMIN_PASSWORD; do
      sed -i "s|^$campo=GERADO\$|$campo=$(random)|" .env
    done
    echo "Criado .env com os segredos gerados."
    ;;
  baixar)
    require_env
    baixar
    ;;
  instalar)
    require_env
    baixar
    cp demo-skillforge.caddy "$PROXY/sites/demo-skillforge.caddy"
    echo "Site instalado no proxy das demonstrações. Recarregue o proxy, sem derrubar as outras demonstrações: sh $PROXY/recarregar.sh"
    ;;
  ajustar)
    require_env
    ajustar_contas
    ;;
  construir)
    require_env
    $COMPOSE build
    ;;
  subir)
    require_env
    subir_tudo
    $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'
    ;;
  parar) $COMPOSE down ;;
  reiniciar-dados)
    # Descarta todos os dados da demonstração e sobe de novo. Agendado diariamente pelo timer demo-skillforge.timer.
    require_env
    $COMPOSE down -v
    subir_tudo
    echo "Dados da demonstração reiniciados em $(date -u +%FT%TZ)."
    ;;
  status) $COMPOSE ps --format 'table {{.Service}}\t{{.Status}}'; docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' $($COMPOSE ps -q) 2>/dev/null ;;
  logs) shift; $COMPOSE logs --tail=200 "$@" ;;
  *) echo "Uso: sh demo.sh <segredos|baixar|instalar|construir|subir|parar|reiniciar-dados|status|logs>" ;;
esac
