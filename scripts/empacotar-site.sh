#!/bin/sh
# Gera o ZIP do site para a hospedagem: conteúdo de dist/ na raiz, com .htaccess.
# Uso: sh scripts/empacotar-site.sh [pasta de saída]. O build precisa ter sido gerado com o .env de produção.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT=${1:-$ROOT/artifacts/pacotes}
cd "$ROOT"

# Sem configuração válida, não há pacote.
npm run -s check:publish

STAMP=$(date +%Y%m%d-%H%M%S)
ZIP="$OUT/site-union-solutions-$STAMP.zip"
mkdir -p "$OUT"
(cd dist && zip -q -X -r "$ZIP" .)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
unzip -q "$ZIP" -d "$WORK/extraido"

# O conteúdo extraído precisa ser idêntico a dist/, com index.html e .htaccess na raiz.
diff -r dist "$WORK/extraido"
for arquivo in index.html 404.html .htaccess robots.txt sitemap-index.xml favicon.ico; do
  [ -f "$WORK/extraido/$arquivo" ] || { echo "Falta $arquivo na raiz do pacote."; exit 1; }
done

# Nada de código-fonte, dependências, segredos, logs ou mapas.
PROIBIDOS=$(unzip -Z1 "$ZIP" | grep -E '(^|/)(\.env|node_modules|src|scripts|portal|artifacts|\.git)(/|$)|\.(map|log|ts|astro|mjs)$' || true)
if [ -n "$PROIBIDOS" ]; then
  echo "Arquivos que não deveriam estar no pacote:"
  echo "$PROIBIDOS"
  exit 1
fi

# Nem endereços locais ou valores de exemplo. O botão do portal só pode aparecer quando PUBLIC_PORTAL_URL está
# configurada no .env (check:publish já confere que o endereço gerado é o configurado).
PROIBIDO='localhost|127\.0\.0\.1|\.invalid|example\.(com|org)|SUBSTITUIR'
grep -qE '^PUBLIC_PORTAL_URL=https://' .env 2>/dev/null || PROIBIDO="$PROIBIDO|data-client-portal"
if grep -rlE "$PROIBIDO" "$WORK/extraido" --include='*.html' --include='*.xml' --include='*.txt' --include='.htaccess' --include='*.js'; then
  echo "O pacote contém valores que não são de produção."
  exit 1
fi

(cd "$OUT" && sha256sum "$(basename "$ZIP")" > "$(basename "$ZIP").sha256")
unzip -Z1 "$ZIP" | LC_ALL=C sort > "$ZIP.inventario.txt"

echo "Pacote:     $ZIP"
echo "Arquivos:   $(grep -cv '/$' "$ZIP.inventario.txt")"
echo "SHA-256:    $(cut -d' ' -f1 "$ZIP.sha256")"
echo "Inventário: $ZIP.inventario.txt"
