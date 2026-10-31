#!/bin/sh
# Testes do armazenamento de sessões com PostgreSQL real e descartável. Uso: sh tests/run-session-tests.sh [caminho de session.js já compilado]
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$DIR"
NAME=portal-session-test-$$
# Porta fixa durante a execução: o teste de falha para e reinicia o banco, e a porta precisa continuar a mesma.
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=sessao -p "127.0.0.1:$PORT:5432" postgres:17-alpine >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT INT TERM
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -d sessao >/dev/null 2>&1 && break; sleep 0.5; done
rm -rf .test-build
node node_modules/typescript/bin/tsc --outDir .test-build --rootDir src --module nodenext --moduleResolution nodenext --target es2022 --noEmit false --skipLibCheck --declaration false --incremental false src/lib/session.ts src/lib/config.ts
for f in .test-build/lib/*.js; do sed -i "s#from './config'#from './config.js'#" "$f"; done
export PORTAL_ENV=development PORTAL_PUBLIC_URL=http://localhost:3100 PORTAL_API_URL=http://api PORTAL_OIDC_ISSUER=http://localhost:8180/realms/x PORTAL_OIDC_CLIENT_ID=c PORTAL_OIDC_CLIENT_SECRET=s PORTAL_SESSION_SECRET=0123456789abcdef0123456789abcdef PORTAL_SESSION_IDLE_SECONDS=3600 PORTAL_SESSION_ABSOLUTE_SECONDS=43200
export PORTAL_SESSION_DB_URL="postgres://postgres:teste@127.0.0.1:$PORT/sessao"
export SESSION_TEST_CONTAINER=$NAME
export SESSION_LIB=${1:-}
[ -n "$SESSION_LIB" ] || unset SESSION_LIB
node --test tests/session.test.mjs
