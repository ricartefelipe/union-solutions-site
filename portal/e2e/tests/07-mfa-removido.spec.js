import { test } from '@playwright/test';
import { expect, loadState, nextTotp, saveState } from './support.js';

// Roda depois de `portal-prod.sh remover-mfa`: a senha sozinha não entra, e um novo TOTP é exigido.
const state = loadState();

test('depois de remover-mfa, o login exige configurar um novo segundo fator', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('#username', state.staff);
  await page.fill('#password', state.password);
  await page.locator('#kc-login').click();
  await expect(page.locator('#totpSecret')).toHaveCount(1);
  expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
  const secret = await page.locator('#totpSecret').inputValue();
  expect(secret).not.toBe(state.totp[state.staff]);
  saveState({ totp: { ...state.totp, [state.staff]: secret } });
  await page.fill('#totp', await nextTotp(secret));
  if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'teste');
  await page.locator('input[type=submit], button[type=submit]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
});
