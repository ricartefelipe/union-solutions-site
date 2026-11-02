#!/usr/bin/env node
// Verifica se links e recursos internos do build apontam para arquivos existentes
// e se cada página tem exatamente um H1. Rode depois de `npm run build`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const DIST = resolve('dist');

if (!existsSync(DIST)) {
  console.error('dist/ não encontrado. Rode "npm run build" antes.');
  process.exit(1);
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

function resolves(pathname) {
  const clean = decodeURIComponent(pathname);
  const target = join(DIST, clean);
  if (clean.endsWith('/')) return existsSync(join(target, 'index.html'));
  return existsSync(target);
}

const pages = htmlFiles(DIST);
const problems = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const name = relative(DIST, page);

  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1Count !== 1) problems.push(`${name}: ${h1Count} elementos H1`);

  const ids = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));
  const references = [
    ...Array.from(html.matchAll(/\s(?:href|src)="([^"]+)"/g), (match) => match[1]),
    ...Array.from(html.matchAll(/\ssrcset="([^"]+)"/g), (match) =>
      match[1].split(',').map((entry) => entry.trim().split(/\s+/)[0]),
    ).flat(),
  ];

  for (const reference of references) {
    if (reference.startsWith('#')) {
      checked += 1;
      if (reference.length > 1 && !ids.has(reference.slice(1))) problems.push(`${name}: âncora ${reference} inexistente`);
      continue;
    }
    if (!reference.startsWith('/') || reference.startsWith('//')) continue;
    checked += 1;
    const { pathname } = new URL(reference, 'https://site.local');
    if (!resolves(pathname)) problems.push(`${name}: ${reference} não encontrado`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problema(s) encontrado(s).`);
  process.exit(1);
}

console.log(`${pages.length} páginas e ${checked} referências internas verificadas, sem problemas.`);
