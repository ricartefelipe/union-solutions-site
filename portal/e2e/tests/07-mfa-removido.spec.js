import { test } from '@playwright/test';
import { expect, loadState, login, nextTotp, saveState } from './support.js';

// Em volta de `portal-prod.sh remover-mfa`: `antes` abre uma sessão da pessoa; `depois` prova que ela deixou de valer
// e que o próximo login exige um novo TOTP.
const state = loadState();

test('antes: sessão aberta da pessoa que vai ter o segundo fator removido', async ({ context, page }) => {
  await login(page, state.staff, state.password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name.includes('portal_session'));
  const kc = (await context.cookies()).filter((c) => /KEYCLOAK|AUTH_SESSION/i.test(c.name));
  saveState({ mfaSessao: { cookie, kc } });
});

test('depois: sessão anterior inválida no portal e no provedor; novo login exige configurar TOTP', async ({ browser }) => {
  const { cookie, kc } = loadState().mfaSessao;
  const old = await browser.newContext();
  await old.addCookies([cookie, ...kc]);
  const page = await old.newPage();
  expect((await page.request.get('/bff/v1/me')).status(), 'sessão do portal encerrada').toBe(401);
  // Com o cookie do provedor, uma nova autorização não passa sem credenciais: cai no formulário de login ou na configuração.
  await page.goto('/projetos');
  await expect(page.locator('#username, #totpSecret, #otp').first()).toBeVisible();
  expect(await page.locator('h1', { hasText: /Olá/ }).count()).toBe(0);
  await old.close();

  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto('/auth/login');
  await fresh.fill('#username', state.staff);
  await fresh.fill('#password', state.password);
  await fresh.locator('#kc-login').click();
  await expect(fresh.locator('#totpSecret')).toHaveCount(1);
  expect((await fresh.request.get('/bff/v1/me')).status()).toBe(401);
  const secret = await fresh.locator('#totpSecret').inputValue();
  expect(secret).not.toBe(state.totp[state.staff]);
  saveState({ totp: { ...state.totp, [state.staff]: secret } });
  await fresh.fill('#totp', await nextTotp(secret));
  if (await fresh.locator('#userLabel').count()) await fresh.fill('#userLabel', 'teste');
  await fresh.locator('input[type=submit], button[type=submit]').first().click();
  await expect(fresh.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  await context.close();
});
