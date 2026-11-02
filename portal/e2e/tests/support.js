import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
export const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
export const SHOTS = process.env.E2E_SHOTS_DIR ?? 'evidencias';
export const COMPOSE_DIR = process.env.E2E_COMPOSE_DIR ?? '../deploy/local';
export const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);
const STATE_FILE = process.env.E2E_STATE_FILE ?? join(SHOTS, 'e2e-state.json');

export function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
}

export function saveState(update) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify({ ...loadState(), ...update }, null, 2));
}

// ---------- Serviços do ambiente em teste ----------

export const PROJECT = process.env.E2E_COMPOSE_PROJECT ?? 'union-portal';
export const STORAGE_SERVICE = process.env.E2E_STORAGE_SERVICE ?? 'seaweedfs';
const PG_SUPERUSER = process.env.E2E_PG_SUPERUSER ?? 'portal';
const container = (service) => `${PROJECT}-${service}-1`;

// Caminho absoluto do docker, sem depender do PATH: runner da prova (/usr/local/bin) ou máquina de desenvolvimento.
const DOCKER_BIN = process.env.E2E_DOCKER_BIN ?? ['/usr/local/bin/docker', '/usr/bin/docker'].find((p) => existsSync(p)) ?? '/usr/bin/docker';

export function docker(...args) {
  return execFileSync(DOCKER_BIN, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180_000 });
}

export async function waitHealthy(service, timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = docker('inspect', '--format', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}', container(service)).trim();
    if (status === 'running healthy' || status === 'running') return;
    if (Date.now() > deadline) throw new Error(`${service} não ficou saudável: ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export const stopService = (service) => docker('stop', container(service));

export async function startService(service) {
  docker('start', container(service));
  await waitHealthy(service);
}

/** Reinicia na ordem dada, aguardando cada serviço. */
export async function restartServices(...services) {
  for (const service of services) {
    docker('restart', container(service));
    await waitHealthy(service);
  }
}

export const execIn = (service, ...args) => docker('exec', container(service), ...args);

export const sessionSql = (sql) => execIn('postgres', 'psql', '-U', PG_SUPERUSER, '-d', 'portal_sessao', '-Atc', sql).trim();

export const cookieHash = (value) => createHash('sha256').update(value).digest('hex');

export function compose(...args) {
  return execFileSync(DOCKER_BIN, ['compose', '--env-file', '.env', '-f', 'compose.yaml', ...args], { cwd: COMPOSE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
}

export async function shot(page, name, options = {}) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true, ...options });
}

// ---------- E-mail de desenvolvimento ----------

export async function latestMailFor(email, subjectPart, { after = 0, timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=20`)).json();
    const match = (list.messages ?? []).find((m) => (!subjectPart || m.Subject.includes(subjectPart)) && Date.parse(m.Created) >= after);
    if (match) return (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`E-mail para ${email} (${subjectPart}) não chegou`);
}

export function inviteLink(mail) {
  const match = mail.Text.match(/https?:\/\/\S+\/convite#t=[A-Za-z0-9_-]+/);
  if (!match) throw new Error('Link de convite ausente');
  return match[0];
}

export function actionLink(mail) {
  const match = (mail.Text ?? '').match(/https?:\/\/\S+\/login-actions\/action-token\S+/) ?? (mail.HTML ?? '').match(/https?:\/\/[^"\s]+\/login-actions\/action-token[^"\s]+/);
  if (!match) throw new Error('Link de definição de senha ausente');
  return match[0].replace(/&amp;/g, '&');
}

// ---------- Identidade ----------

/** Percorre as telas do provedor: define a senha, completa o perfil e volta ao portal. */
// ---------- Segundo fator: só nos testes. O segredo vive no arquivo de estado do teste e nunca entra em capturas ou registros. ----------

const MFA = process.env.E2E_MFA === 'true';
function hotp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** O provedor não aceita o mesmo código duas vezes e tolera um passo à frente. O último passo usado fica no estado, porque as suítes rodam em processos separados. */
export async function nextTotp(secret) {
  for (;;) {
    const now = Math.floor(Date.now() / 30_000);
    const used = loadState().totpSteps ?? {};
    const key = createHash('sha256').update(secret).digest('hex');
    const last = used[key] ?? -1;
    for (const step of [now, now + 1]) {
      if (step > last) {
        saveState({ totpSteps: { ...used, [key]: step } });
        return hotp(secret, step);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

export const wrongTotp = (secret) => String((Number(hotp(secret, Math.floor(Date.now() / 30_000))) + 7) % 1_000_000).padStart(6, '0');

/** Trata as telas de segundo fator do provedor, se aparecerem, até voltar ao portal. */
export async function completeMfa(page, email) {
  if (!MFA) return;
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    await page.waitForLoadState('domcontentloaded');
    if (!page.url().includes('/realms/')) return;
    if (await page.locator('#totpSecret').count()) {
      const secret = await page.locator('#totpSecret').inputValue();
      saveState({ totp: { ...(loadState().totp ?? {}), [email]: secret } });
      await page.fill('#totp', await nextTotp(secret));
      if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'teste');
      await page.locator('input[type=submit], button[type=submit]').first().click();
    } else if (await page.locator('#otp').count()) {
      await page.fill('#otp', await nextTotp(loadState().totp[email]));
      await page.locator('#kc-login').click();
    } else if (await page.locator('#kc-error-message, #input-error, .kc-feedback-text').count()) {
      return;
    }
    await page.waitForTimeout(400);
  }
}

export async function completeAccountSetup(page, link, { password, firstName, lastName }) {
  await page.goto(link);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await page.waitForLoadState('domcontentloaded');
    if (await page.locator('#password-new').count()) {
      await page.fill('#password-new', password);
      await page.fill('#password-confirm', password);
      await page.locator('input[type=submit], button[type=submit]').first().click();
    } else if (await page.locator('#firstName').count()) {
      await page.fill('#firstName', firstName);
      await page.fill('#lastName', lastName);
      await page.locator('input[type=submit], button[type=submit]').first().click();
    } else if (await page.locator('a[href*="login-actions/action-token"]').count()) {
      await page.locator('a[href*="login-actions/action-token"]').first().click();
    } else if (await page.locator('#kc-info-message a').count()) {
      await page.locator('#kc-info-message a').first().click();
      return;
    } else if (await page.locator('#kc-info-message').count() || !page.url().includes('/realms/')) {
      return;
    } else {
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Fluxo de definição de senha não terminou');
}

export async function login(page, email, password, target = '/') {
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(target)}`);
  await page.fill('#username', email);
  await page.fill('#password', password);
  await page.locator('#kc-login').click();
  await completeMfa(page, email);
}

/** Formulários secundários ficam recolhidos em blocos identificados pelo resumo. */
export async function disclosure(page, summary) {
  const block = page.locator('details.disclosure', { has: page.locator('summary', { hasText: summary }) }).first();
  if (!(await block.evaluate((el) => el.open))) await block.locator('summary').click();
  return block;
}

export function pdf(text) {
  return { name: `${text.replace(/\W+/g, '-').toLowerCase()}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`) };
}

export async function acceptNativeConfirm(page) {
  page.once('dialog', (dialog) => dialog.accept());
}

/** Clica no botão e confirma no diálogo da própria página. */
export async function confirmAction(page, button) {
  await button.click();
  await page.locator('dialog[open] button[value=ok]').click();
}

export async function assertAccessible(page, label) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(summary, `violações de acessibilidade em ${label}`).toEqual([]);
}

export async function assertNoHorizontalScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, `rolagem horizontal em ${label}`).toBe(false);
}

export { expect };
