#!/usr/bin/env node
// A identidade é compartilhada por cópia: site e portal são implantados separadamente.
// Falha se os arquivos daqui divergirem dos do site institucional.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const portal = join(here, '..');
const site = join(here, '..', '..', '..');
const pairs = [
  ['src/styles/tokens.css', 'src/styles/tokens.css'],
  ['public/brand/union-solutions-196.webp', 'public/brand/union-solutions-196.webp'],
  ['public/brand/union-solutions-392.webp', 'public/brand/union-solutions-392.webp'],
  ['public/favicon.ico', 'public/favicon.ico'],
];
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
let failed = false;
for (const [own, shared] of pairs) {
  if (hash(join(portal, own)) !== hash(join(site, shared))) {
    console.error(`Divergente do site: ${own}. Copie novamente de ${shared}.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('Identidade visual igual à do site institucional.');
