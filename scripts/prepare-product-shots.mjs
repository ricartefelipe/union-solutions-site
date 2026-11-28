#!/usr/bin/env node
// Gera as capturas dos produtos usadas no site, em public/capturas/: AVIF e WebP em até quatro larguras, um JPEG de
// reserva e, nas telas com `focus` em products.json, o mesmo conjunto para o recorte ampliado (<id>-foco-<largura>).
// Uso: npm run assets:shots. Lê artifacts/capturas/, fora do Git, com um PNG de 1920 × 1080 ou 2560 × 1440 por tela e
// o nome usado em products.json (por exemplo, comercialcloud-pdv.png). As telas vêm das demonstrações públicas, com
// dados fictícios e sem credenciais.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const input = resolve('artifacts/capturas');
if (!existsSync(input)) {
  console.error('Salve os PNG em artifacts/capturas/ e rode de novo.');
  process.exit(1);
}

const OUT = resolve('public/capturas');
// Larguras da tela inteira. A de 2400 só sai de capturas em 2560 × 1440, para não ampliar uma de 1920.
const WIDTHS = [640, 1024, 1600, 2400];
// Larguras do recorte de foco: nunca acima do tamanho real do recorte na captura.
const FOCUS_WIDTHS = [640, 1024, 1600];
const FALLBACK = 1024;
// Capturas de uma janela de 1280 × 720, com densidade 1,5 (1920 × 1080) ou 2 (2560 × 1440).
const SOURCES = [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }];
const VIEWPORT = 1280;

const focusById = new Map(
  JSON.parse(readFileSync('src/data/products.json', 'utf8'))
    .flatMap((product) => product.screens)
    .filter((screen) => screen.focus)
    .map((screen) => [screen.id, screen.focus]),
);

mkdirSync(OUT, { recursive: true });
const sources = readdirSync(input).filter((name) => name.endsWith('.png'));
if (!sources.length) {
  console.error(`Nenhum PNG em ${input}.`);
  process.exit(1);
}

const write = async (image, name, size, fallback) => {
  await image().avif({ quality: 50, effort: 6 }).toFile(join(OUT, `${name}-${size}.avif`));
  await image().webp({ quality: 72, effort: 6 }).toFile(join(OUT, `${name}-${size}.webp`));
  if (fallback) await image().jpeg({ quality: 74, mozjpeg: true }).toFile(join(OUT, `${name}-${size}.jpg`));
};

for (const name of sources) {
  const path = join(input, name);
  const { width, height } = await sharp(path).metadata();
  if (!SOURCES.some((source) => source.width === width && source.height === height)) {
    console.error(`${name}: ${width} × ${height}; esperado ${SOURCES.map((source) => `${source.width} × ${source.height}`).join(' ou ')}.`);
    process.exit(1);
  }
  const id = basename(name, '.png');
  let files = 0;
  for (const size of WIDTHS.filter((size) => size <= width)) {
    await write(() => sharp(path).resize({ width: size }), id, size, size === FALLBACK);
    files += size === FALLBACK ? 3 : 2;
  }

  const focus = focusById.get(id);
  if (focus) {
    const scale = width / VIEWPORT;
    const area = {
      left: Math.round(focus.x * scale),
      top: Math.round(focus.y * scale),
      width: Math.round(focus.width * scale),
      height: Math.round(((focus.width * 9) / 16) * scale),
    };
    if (area.left < 0 || area.top < 0 || area.left + area.width > width || area.top + area.height > height) {
      console.error(`${id}: o foco sai da tela (${JSON.stringify(focus)}).`);
      process.exit(1);
    }
    // Até 1600 px; se o recorte for menor que isso, a maior versão é a do próprio tamanho dele, sem ampliar.
    const sizes = FOCUS_WIDTHS.filter((size) => size <= area.width);
    if (area.width < FOCUS_WIDTHS.at(-1) && !sizes.includes(area.width)) sizes.push(area.width);
    if (!sizes.includes(FALLBACK)) {
      console.error(`${id}: o foco tem ${area.width} px na captura; precisa de pelo menos ${FALLBACK}.`);
      process.exit(1);
    }
    for (const size of sizes) {
      await write(() => sharp(path).extract(area).resize({ width: size }), `${id}-foco`, size, size === FALLBACK);
      files += size === FALLBACK ? 3 : 2;
    }
  }
  console.log(`${id}: ${files} arquivos`);
}
