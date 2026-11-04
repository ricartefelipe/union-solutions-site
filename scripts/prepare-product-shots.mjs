#!/usr/bin/env node
// Gera as capturas dos produtos usadas no site: AVIF e WebP em três larguras e um JPEG de reserva, em public/capturas/.
// Uso: npm run assets:shots -- <pasta>. A pasta tem um PNG de 1920 × 1080 por tela, com o nome usado em products.json
// (por exemplo, comercialcloud-pdv.png). As telas vêm das demonstrações públicas, com dados fictícios e sem credenciais.
import { mkdirSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const input = process.argv[2];
if (!input) {
  console.error('Informe a pasta com os PNG: npm run assets:shots -- <pasta>');
  process.exit(1);
}

const OUT = resolve('public/capturas');
// As larguras precisam ser as mesmas de src/components/ProductShot.astro.
const WIDTHS = [640, 1024, 1600];
const FALLBACK = 1024;
const SOURCE = { width: 1920, height: 1080 };

mkdirSync(OUT, { recursive: true });
const sources = readdirSync(input).filter((name) => name.endsWith('.png'));
if (!sources.length) {
  console.error(`Nenhum PNG em ${input}.`);
  process.exit(1);
}

for (const name of sources) {
  const path = join(input, name);
  const { width, height } = await sharp(path).metadata();
  if (width !== SOURCE.width || height !== SOURCE.height) {
    console.error(`${name}: ${width} × ${height}; esperado ${SOURCE.width} × ${SOURCE.height}.`);
    process.exit(1);
  }
  const id = basename(name, '.png');
  for (const size of WIDTHS) {
    const resized = () => sharp(path).resize({ width: size });
    await resized().avif({ quality: 50, effort: 6 }).toFile(join(OUT, `${id}-${size}.avif`));
    await resized().webp({ quality: 72, effort: 6 }).toFile(join(OUT, `${id}-${size}.webp`));
    if (size === FALLBACK) await resized().jpeg({ quality: 74, mozjpeg: true }).toFile(join(OUT, `${id}-${size}.jpg`));
  }
  console.log(`${id}: ${WIDTHS.length * 2 + 1} arquivos`);
}
