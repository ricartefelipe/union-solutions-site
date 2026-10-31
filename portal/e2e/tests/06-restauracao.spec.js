import { createHash } from 'node:crypto';
import { test } from '@playwright/test';
import { BASE, expect, loadState, login, RUN, saveState, shot } from './support.js';

// Etapas separadas pelo backup: `antes` registra a referência, `depois-do-backup` cria o que precisa sumir e `restaurado` confere o ambiente novo.
const state = loadState();
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function signedIn(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  return { context, page };
}

async function fileFingerprint(page) {
  const docs = await (await page.request.get(`/bff/v1/documents?projectId=${state.ids.project}&q=${encodeURIComponent('Especificação')}`)).json();
  const doc = docs.items[0];
  const response = await page.request.get(`/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`);
  expect(response.status()).toBe(200);
  return { docId: doc.id, versionId: doc.latest.id, hash: sha(await response.body()) };
}

test('antes do backup: registra a referência', async ({ browser }) => {
  const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
  saveState({ referencia: await fileFingerprint(admin.page), referenciaBase: BASE });
  await admin.context.close();
});

test('depois do backup: cria um registro que não está nele', async ({ browser }) => {
  const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
  const name = `Depois do backup ${RUN}`;
  await admin.page.goto('/admin/organizacoes');
  await admin.page.getByLabel('Nome').fill(name);
  await admin.page.getByRole('button', { name: 'Criar organização' }).click();
  await expect(admin.page.getByRole('heading', { level: 1, name })).toBeVisible();
  saveState({ depoisDoBackup: name });
  await admin.context.close();
});

test('restaurado: login, segundo fator, histórico e arquivo idêntico', async ({ browser }) => {
  // O administrador entra com a mesma senha e o mesmo TOTP: a identidade veio do backup.
  const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
  await admin.page.goto('/admin/organizacoes');
  await expect(admin.page.getByRole('link', { name: state.orgA })).toBeVisible();
  await expect(admin.page.getByRole('link', { name: state.depoisDoBackup })).toHaveCount(0);
  const after = await fileFingerprint(admin.page);
  expect(after).toEqual(state.referencia);
  await admin.page.goto('/admin/auditoria');
  await expect(admin.page.getByRole('heading', { level: 1, name: 'Auditoria' })).toBeVisible();
  await shot(admin.page, 'r01-auditoria-restaurada');
  await admin.context.close();

  const client = await signedIn(browser, state.clientA, state.password);
  await client.page.goto(`/entregas/${state.ids.delivery}`);
  await expect(client.page.locator('li', { has: client.page.getByRole('heading', { name: 'Versão 2' }) }).getByText('Aprovada').first()).toBeVisible();
  await expect(client.page.locator('li', { has: client.page.getByRole('heading', { name: 'Versão 1' }) }).getByText('Ajustes solicitados').first()).toBeVisible();
  await shot(client.page, 'r02-entrega-restaurada');
  await client.page.goto(`/suporte/${state.ids.ticket}`);
  await expect(client.page.getByRole('heading', { level: 1, name: state.ticket })).toBeVisible();
  await expect(client.page.locator('body')).not.toContainText('NOTA-INTERNA');
  await client.context.close();
});
