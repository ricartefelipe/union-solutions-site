#!/usr/bin/env node
// Verificação de publicação: confere a configuração real e os arquivos gerados.
// Bloqueia enquanto faltarem dados, houver valores de exemplo ou o build não corresponder.
// Rode depois de `npm run build`. Opção: --dist <pasta> (padrão: dist).
// A validação é de formato: confirmar que domínio e canais são reais continua sendo do responsável.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const distArg = process.argv.indexOf('--dist');
const DIST = resolve(distArg > -1 ? process.argv[distArg + 1] : 'dist');

// Mesma precedência do build: o ambiente vence o arquivo .env.
const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in env)) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}
const read = (name) => env[name]?.trim() ?? '';

// Valor previsto em .env.example: precisa ser substituído ou apagado.
const EXAMPLE_VALUE = /SUBSTITUIR/i;
// Hosts que nunca são endereços definitivos: locais, reservados para exemplos ou túneis de teste.
const PLACEHOLDER_HOST =
  /(^|\.)(localhost|local|test|example|invalid)$|^(example|exemplo)\.|(^|\.)(example|exemplo|seudominio|nomedaempresa)\.(com|net|org)(\.br)?$|(^|\.)(ngrok(-free)?\.(io|app|dev)|trycloudflare\.com|loca\.lt|webhook\.site|requestbin\.(com|net))$/i;
const IP_HOST = /^(\d{1,3}\.){3}\d{1,3}$|^\[.*\]$/;

function urlProblem(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return 'não é uma URL válida';
  }
  if (url.protocol !== 'https:') return 'precisa usar HTTPS';
  if (IP_HOST.test(url.hostname) || PLACEHOLDER_HOST.test(url.hostname)) {
    return `aponta para "${url.hostname}", que é um endereço local, de exemplo ou temporário`;
  }
  return null;
}

function whatsappProblem(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return 'deve conter DDI, DDD e número';
  if (/^55(0|\d0)/.test(digits) || /^(\d)\1+$/.test(digits) || digits.includes('123456789')) return 'não parece um número real';
  return null;
}

const blockers = [];

const siteUrl = read('PUBLIC_SITE_URL');
const endpoint = read('PUBLIC_CONTACT_FORM_ENDPOINT');
const email = read('PUBLIC_CONTACT_EMAIL');
const whatsapp = read('PUBLIC_CONTACT_WHATSAPP');

const exampleLeft = Object.keys(env).filter((name) => name.startsWith('PUBLIC_') && EXAMPLE_VALUE.test(env[name]));
for (const name of exampleLeft) blockers.push(`${name}: ainda tem o valor de exemplo. Preencha com o dado real ou apague a linha.`);
const untouched = (name) => exampleLeft.includes(name);

if (!siteUrl) {
  blockers.push('PUBLIC_SITE_URL: defina o domínio definitivo com HTTPS.');
} else if (!untouched('PUBLIC_SITE_URL')) {
  const problem = urlProblem(siteUrl);
  if (problem) blockers.push(`PUBLIC_SITE_URL ${problem}.`);
}

if (!endpoint && !email && !whatsapp) {
  blockers.push('Canal de contato: defina ao menos um entre PUBLIC_CONTACT_FORM_ENDPOINT, PUBLIC_CONTACT_EMAIL e PUBLIC_CONTACT_WHATSAPP.');
}
if (endpoint && !untouched('PUBLIC_CONTACT_FORM_ENDPOINT')) {
  const problem = urlProblem(endpoint);
  if (problem) blockers.push(`PUBLIC_CONTACT_FORM_ENDPOINT ${problem}.`);
}
if (email && !untouched('PUBLIC_CONTACT_EMAIL')) {
  const domain = email.split('@')[1] ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || PLACEHOLDER_HOST.test(domain)) {
    blockers.push('PUBLIC_CONTACT_EMAIL não é um e-mail real válido.');
  }
}
const portalUrl = read('PUBLIC_PORTAL_URL');
if (portalUrl && !untouched('PUBLIC_PORTAL_URL')) {
  const problem = urlProblem(portalUrl);
  if (problem) blockers.push(`PUBLIC_PORTAL_URL ${problem}.`);
}
if (whatsapp && !untouched('PUBLIC_CONTACT_WHATSAPP')) {
  const problem = whatsappProblem(whatsapp);
  if (problem) blockers.push(`PUBLIC_CONTACT_WHATSAPP ${problem}.`);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// Os arquivos gerados precisam corresponder à configuração e não podem ter restos de configuração.
const rebuild = 'Gere o build novamente com a configuração atual.';
const distName = relative(process.cwd(), DIST) || 'dist';

if (!existsSync(join(DIST, 'contato/index.html'))) {
  blockers.push(`${distName}/: build não encontrado. Rode "npm run build".`);
} else {
  const all = files(DIST);
  const label = (path) => relative(DIST, path);

  const exposed = all.filter((path) => /^\.env/.test(basename(path)) || /\.map$/.test(path) || /^(artifacts|docs|scripts|src)\//.test(label(path)));
  for (const path of exposed) blockers.push(`${distName}/: arquivo interno exposto: ${label(path)}.`);

  const text = all.filter((path) => /\.(html|js|css|xml|txt|json|webmanifest)$/.test(path)).map((path) => ({ path, content: readFileSync(path, 'utf8') }));
  const leftovers = [
    [/\bPUBLIC_[A-Z_]+\b/, 'nome de variável de configuração'],
    [/SUBSTITUIR/i, 'valor de exemplo'],
    [/https?:\/\/(localhost|127\.0\.0\.1)\b/, 'endereço local'],
    [/[\w-]\.(invalid|example|test)\b(?!\.)/i, 'domínio reservado para testes'],
    [/\bexample\.(com|org|net)\b/i, 'domínio de exemplo'],
  ];
  for (const [pattern, name] of leftovers) {
    const hit = text.find((file) => pattern.test(file.content));
    if (hit) blockers.push(`${distName}/: ${name} em ${label(hit.path)}.`);
  }

  // O script do aviso é gerado em todos os modos; o que importa é o aviso estar na página.
  const contactPage = readFileSync(join(DIST, 'contato/index.html'), 'utf8');
  if (contactPage.includes('data-config-pending')) blockers.push(`${distName}/: a página de contato ainda mostra que não há canal disponível. ${rebuild}`);
  const builtEndpoint = contactPage.match(/data-endpoint="([^"]*)"/)?.[1] ?? '';
  if (builtEndpoint !== endpoint) blockers.push(`${distName}/: o formulário não corresponde a PUBLIC_CONTACT_FORM_ENDPOINT. ${rebuild}`);
  if (!endpoint && email && !contactPage.includes(`data-email="${email}"`)) blockers.push(`${distName}/: o e-mail não corresponde a PUBLIC_CONTACT_EMAIL. ${rebuild}`);
  if (!endpoint && whatsapp && !contactPage.includes(`data-whatsapp="https://wa.me/${whatsapp.replace(/\D/g, '')}"`)) {
    blockers.push(`${distName}/: o WhatsApp não corresponde a PUBLIC_CONTACT_WHATSAPP. ${rebuild}`);
  }

  const homePage = readFileSync(join(DIST, 'index.html'), 'utf8');
  const builtPortal = homePage.match(/href="([^"]*)" data-client-portal/)?.[1] ?? '';
  if (builtPortal !== portalUrl) blockers.push(`${distName}/: o botão "Área do cliente" não corresponde a PUBLIC_PORTAL_URL. ${rebuild}`);

  if (siteUrl && !urlProblem(siteUrl)) {
    const origin = new URL(siteUrl).origin;
    const pages = text.filter((file) => file.path.endsWith('.html'));
    for (const page of pages) {
      const name = label(page.path);
      const canonical = page.content.match(/rel="canonical" href="([^"]*)"/)?.[1];
      if (name === '404.html') {
        if (canonical) blockers.push(`${distName}/: a página 404 não deve ter canonical.`);
        continue;
      }
      if (!canonical?.startsWith(`${origin}/`)) blockers.push(`${distName}/: canonical ausente ou de outro domínio em ${name}. ${rebuild}`);
      const socialImage = page.content.match(/property="og:image" content="([^"]*)"/)?.[1];
      if (!socialImage?.startsWith(`${origin}/`)) blockers.push(`${distName}/: og:image ausente ou de outro domínio em ${name}. ${rebuild}`);
    }
    if (!existsSync(join(DIST, 'og/union-solutions.png'))) blockers.push(`${distName}/: imagem social não encontrada.`);

    const sitemapFile = join(DIST, 'sitemap-0.xml');
    if (!existsSync(sitemapFile)) {
      blockers.push(`${distName}/: sitemap não encontrado. ${rebuild}`);
    } else {
      const urls = Array.from(readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]*)<\/loc>/g), (match) => match[1]);
      if (!urls.length || urls.some((url) => !url.startsWith(`${origin}/`))) blockers.push(`${distName}/: o sitemap tem URLs de outro domínio. ${rebuild}`);
    }
    const robots = existsSync(join(DIST, 'robots.txt')) ? readFileSync(join(DIST, 'robots.txt'), 'utf8') : '';
    if (!robots.includes(`Sitemap: ${origin}/sitemap-index.xml`)) blockers.push(`${distName}/: o robots.txt não aponta para o sitemap do domínio. ${rebuild}`);
  }
}

if (blockers.length) {
  console.error(`Publicação bloqueada (${blockers.length}):`);
  for (const blocker of blockers) console.error(`- ${blocker}`);
  process.exit(1);
}

const mode = endpoint ? 'formulário' : 'contato direto';
console.log(`Configuração e build válidos. Modo de contato: ${mode}. Confirme que domínio e canais são reais antes de publicar.`);
console.log('Atenção: não há política de privacidade publicada. Veja "Privacidade" no README antes de abrir o site ao público.');
if (endpoint) {
  console.log('Atenção: no modo formulário, revise o aviso em src/components/ContactForm.astro com o serviço de recebimento escolhido.');
}
