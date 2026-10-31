import { test as base } from '@playwright/test';
import { assertAccessible, assertNoHorizontalScroll, BASE, expect, loadState, login, shot } from './support.js';

// Fluxo essencial em cada navegador, contra a configuração de produção. O Firefox usa um perfil em que só a autoridade de teste foi acrescentada.
const state = loadState();
const browserName = process.env.E2E_BROWSER ?? 'chromium';

const test = base.extend({
  context: async ({ playwright, viewport }, use) => {
    if (browserName === 'firefox') {
      const context = await playwright.firefox.launchPersistentContext('/evidencias/perfil-firefox', { baseURL: BASE, viewport, locale: 'pt-BR' });
      await use(context);
      await context.close();
    } else {
      const browser = await playwright[browserName].launch(browserName === 'chromium' ? { channel: 'chromium' } : {});
      const context = await browser.newContext({ baseURL: BASE, viewport, locale: 'pt-BR' });
      await use(context);
      await browser.close();
    }
  },
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },
});

test.use({ viewport: { width: 1280, height: 900 } });

test(`${browserName}: entrar, consultar, baixar, abrir solicitação e sair`, async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await login(page, state.clientA, state.password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  await shot(page, `${browserName}-painel`);
  const cookie = (await context.cookies()).find((c) => c.name.includes('portal_session'));
  expect(cookie).toMatchObject({ name: '__Host-portal_session', secure: true, httpOnly: true });
  expect(await page.evaluate(() => document.cookie)).not.toContain('portal_session');

  await page.goto(`/projetos/${state.ids.project}`);
  await expect(page.getByRole('heading', { level: 1, name: state.project })).toBeVisible();
  await page.goto(`/entregas/${state.ids.delivery}`);
  await expect(page.getByRole('heading', { level: 1, name: state.delivery })).toBeVisible();

  const docs = await (await page.request.get('/bff/v1/documents?q=Especifica%C3%A7%C3%A3o')).json();
  const download = await page.request.get(`/bff/v1/documents/${docs.items[0].id}/versions/${docs.items[0].latest.id}/download`);
  expect(download.status()).toBe(200);
  expect((await download.body()).toString()).toContain('%PDF');

  // Formulário hidratado com a CSP de produção: abre, valida no navegador e envia.
  await page.goto('/suporte');
  const summary = page.locator('summary', { hasText: 'Abrir solicitação' });
  await summary.click();
  const form = page.locator('details.disclosure', { has: summary });
  await form.getByRole('button', { name: 'Abrir solicitação' }).click();
  await expect(form.getByLabel('Assunto')).toBeFocused();
  const subject = `${browserName} ${Date.now()}`;
  await form.getByLabel('Assunto').fill(subject);
  await form.getByLabel('Descrição').fill('Aberta no teste do navegador.');
  await form.getByLabel('Categoria').selectOption({ index: 1 });
  await form.getByRole('button', { name: 'Abrir solicitação' }).click();
  await expect(page.getByRole('heading', { level: 1, name: subject })).toBeVisible();

  if (browserName === 'chromium') await assertAccessible(page, 'solicitação');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  await assertNoHorizontalScroll(page, 'painel em 390');
  await shot(page, `${browserName}-celular`);

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Você saiu do portal' })).toBeVisible();
  expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
  expect(errors).toEqual([]);
});
