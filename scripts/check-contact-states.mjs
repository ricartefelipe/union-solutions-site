#!/usr/bin/env node
// Gera o site em cada modo de contato, confere o HTML e a resposta do check:publish.
// Os valores abaixo existem só neste teste. Cada build vai para uma pasta isolada,
// apagada ao final, e o dist/ do projeto não é tocado.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ASTRO = 'node_modules/astro/bin/astro.mjs';
const OUT = '.astro/check-contact-dist';
const TEST_SITE = 'https://verificacao-do-site.com.br';
const TEST_ENDPOINT = 'https://recebimento-de-teste.com.br/contato';
const TEST_EMAIL = 'contato@verificacao-do-site.com.br';
const TEST_WHATSAPP = '999700000001';
const TEST_PORTAL = 'https://portal.verificacao-do-site.com.br';
const TEST_VALUES = ['verificacao-do-site', 'recebimento-de-teste', TEST_WHATSAPP];

const EMPTY = {
  PUBLIC_SITE_URL: '',
  PUBLIC_CONTACT_FORM_ENDPOINT: '',
  PUBLIC_CONTACT_EMAIL: '',
  PUBLIC_CONTACT_WHATSAPP: '',
  PUBLIC_CONTACT_PHONE: '',
  PUBLIC_PORTAL_URL: '',
  PUBLIC_COMPANY_ADDRESS: '',
  PUBLIC_COMPANY_CNPJ: '',
};

const has = (html, text) => html.includes(text);
const hasForm = (html) => has(html, '<form');

const cases = [
  {
    name: 'A: endpoint configurado',
    env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_FORM_ENDPOINT: TEST_ENDPOINT },
    publishes: true,
    expect: (html) => hasForm(html) && has(html, 'Enviar mensagem') && has(html, 'Usaremos as informações fornecidas') && !has(html, 'data-direct-contact') && !has(html, 'data-config-pending'),
  },
  {
    name: 'B: somente e-mail',
    env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_EMAIL: TEST_EMAIL },
    publishes: true,
    expect: (html) => !hasForm(html) && has(html, 'data-direct-contact') && has(html, `href="mailto:${TEST_EMAIL}?subject=`) && !has(html, 'data-channel="whatsapp"') && !has(html, 'data-client-portal'),
  },
  {
    name: 'B: somente WhatsApp',
    env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_WHATSAPP: TEST_WHATSAPP },
    publishes: true,
    expect: (html) => !hasForm(html) && has(html, `https://wa.me/${TEST_WHATSAPP}?text=`) && !has(html, 'data-channel="email"'),
  },
  {
    name: 'C: nenhum canal, com domínio',
    env: { PUBLIC_SITE_URL: TEST_SITE },
    publishes: false,
    expect: (html) => !hasForm(html) && has(html, 'data-config-pending') && !has(html, 'data-direct-contact') && !has(html, 'README') && !/PUBLIC_[A-Z]/.test(html),
  },
  {
    name: 'Portal configurado: botão Área do cliente',
    env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_EMAIL: TEST_EMAIL, PUBLIC_PORTAL_URL: TEST_PORTAL },
    publishes: true,
    expect: (html) => has(html, `href="${TEST_PORTAL}" data-client-portal`) && has(html, 'Área do cliente'),
  },
  { name: 'Bloqueio: portal em domínio local', env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_EMAIL: TEST_EMAIL, PUBLIC_PORTAL_URL: 'http://localhost:3100' }, publishes: false },
  { name: 'Bloqueio: sem domínio', env: { PUBLIC_CONTACT_EMAIL: TEST_EMAIL }, publishes: false },
  { name: 'Bloqueio: domínio de exemplo', env: { PUBLIC_SITE_URL: 'https://www.example.com', PUBLIC_CONTACT_EMAIL: TEST_EMAIL }, publishes: false },
  { name: 'Bloqueio: domínio local', env: { PUBLIC_SITE_URL: 'http://localhost:4321', PUBLIC_CONTACT_EMAIL: TEST_EMAIL }, publishes: false },
  {
    name: 'Bloqueio: valores do .env.example sem preencher',
    env: {
      PUBLIC_SITE_URL: 'https://SUBSTITUIR-DOMINIO.invalid',
      PUBLIC_CONTACT_FORM_ENDPOINT: 'https://SUBSTITUIR-ENDPOINT.invalid/contato',
      PUBLIC_CONTACT_EMAIL: 'SUBSTITUIR@SUBSTITUIR-DOMINIO.invalid',
      PUBLIC_CONTACT_WHATSAPP: 'SUBSTITUIR_DDI_DDD_NUMERO',
    },
    publishes: false,
  },
  { name: 'Bloqueio: WhatsApp fictício', env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_WHATSAPP: '5500000000000' }, publishes: false },
  { name: 'Bloqueio: e-mail de exemplo', env: { PUBLIC_SITE_URL: TEST_SITE, PUBLIC_CONTACT_EMAIL: 'contato@example.com' }, publishes: false },
];

function run(args, env) {
  return spawnSync(process.execPath, args, { env: { ...process.env, ...env }, encoding: 'utf8' });
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

let failures = 0;
try {
  for (const testCase of cases) {
    const env = { ...EMPTY, ...testCase.env };
    rmSync(OUT, { recursive: true, force: true });
    const build = run([ASTRO, 'build', '--outDir', OUT], env);
    if (build.status !== 0) throw new Error(`Build falhou em "${testCase.name}":\n${build.stdout}\n${build.stderr}`);
    const html = readFileSync(join(OUT, 'contato/index.html'), 'utf8');
    const rendered = testCase.expect ? testCase.expect(html) : true;
    const publish = run(['scripts/check-publish.mjs', '--dist', OUT], env);
    const passed = rendered && (publish.status === 0) === testCase.publishes;
    console.log(`${passed ? 'ok   ' : 'FALHA'} ${testCase.name} (check:publish ${publish.status === 0 ? 'aprovou' : 'bloqueou'})`);
    if (!passed) {
      failures += 1;
      console.log(publish.stdout + publish.stderr);
    }
  }
} finally {
  rmSync(OUT, { recursive: true, force: true });
}

if (existsSync('dist')) {
  const textFiles = files('dist').filter((path) => /\.(html|js|css|txt|xml)$/.test(path));
  const leaked = textFiles.filter((path) => TEST_VALUES.some((value) => readFileSync(path, 'utf8').includes(value)));
  if (leaked.length) {
    console.error(`FALHA valores de teste em: ${leaked.join(', ')}`);
    failures += 1;
  } else {
    console.log('ok    dist/ do projeto sem valores de teste');
  }
}

process.exit(failures ? 1 : 0);
