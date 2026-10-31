import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { COMPOSE_DIR, compose, expect, loadState, login, RUN, shot } from './support.js';

// Depende da jornada (01). Altera o ambiente local: restaura backup e reinicia serviços.
const state = loadState();
const BACKUP_ROOT = process.env.E2E_BACKUP_DIR ?? join(process.cwd(), 'backups-teste');

function portal(...args) {
  return execFileSync('sh', ['portal.sh', ...args], { cwd: COMPOSE_DIR, encoding: 'utf8', timeout: 480_000, env: { ...process.env, PORTAL_BACKUP_DIR: BACKUP_ROOT } });
}

function envValue(name) {
  return readFileSync(join(COMPOSE_DIR, '.env'), 'utf8').split('\n').find((l) => l.startsWith(`${name}=`))?.split('=')[1];
}

async function signedIn(browser, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  return { context, page };
}

/** Sobe a API num container descartável e devolve o que aconteceu. Ela precisa recusar a inicialização. */
function runBackend(extraEnv) {
  const env = Object.entries(extraEnv).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return spawnSync('docker', ['compose', '--env-file', '.env', '-f', 'compose.yaml', 'run', '--rm', '-T', '--no-deps', ...env, 'backend'], { cwd: COMPOSE_DIR, encoding: 'utf8', timeout: 120_000 });
}

test.describe.serial('Operação local', () => {
  test('backup completo restaura banco, identidade e arquivos', async ({ browser }) => {
    test.setTimeout(600_000);
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);

    // Situação de referência: um documento real, baixado antes do backup.
    const docs = await (await admin.page.request.get(`/bff/v1/documents?projectId=${state.ids.project}&q=${encodeURIComponent('Especificação')}`)).json();
    const doc = docs.items[0];
    const downloadUrl = `/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`;
    const before = await (await admin.page.request.get(downloadUrl)).body();
    expect(before.toString()).toContain('%PDF');
    await admin.context.close();

    const output = portal('backup');
    const folder = output.match(/Backup em (.+)/)[1].trim();

    // Depois do backup, um registro novo: precisa sumir na restauração.
    const later = await signedIn(browser, state.adminEmail, state.adminPassword);
    const name = `Depois do backup ${RUN}`;
    await later.page.goto('/admin/organizacoes');
    await later.page.getByLabel('Nome').fill(name);
    await later.page.getByRole('button', { name: 'Criar organização' }).click();
    await expect(later.page.getByRole('heading', { level: 1, name })).toBeVisible();
    await later.context.close();

    portal('restore', folder);

    const restored = await signedIn(browser, state.adminEmail, state.adminPassword);
    await restored.page.goto('/admin/organizacoes');
    await expect(restored.page.getByRole('link', { name: state.orgA })).toBeVisible();
    await expect(restored.page.getByRole('link', { name })).toHaveCount(0);
    const after = await (await restored.page.request.get(downloadUrl)).body();
    expect(after.equals(before), 'arquivo restaurado é idêntico').toBe(true);
    await restored.context.close();

    // Identidade restaurada: o cliente entra com a mesma senha e encontra a entrega aprovada.
    const client = await signedIn(browser, state.clientA, state.password);
    await client.page.goto(`/entregas/${state.ids.delivery}`);
    await expect(client.page.locator('li', { has: client.page.getByRole('heading', { name: 'Versão 2' }) }).getByText('Aprovada').first()).toBeVisible();
    await shot(client.page, '22-depois-da-restauracao');
    await client.context.close();
  });

  test('API recusa iniciar em produção com serviços e dados de desenvolvimento', async () => {
    test.setTimeout(240_000);
    const demo = runBackend({ QUARKUS_PROFILE: 'prod', PORTAL_DEMO_ENABLED: 'true' });
    expect(demo.status, demo.stdout.slice(-400)).not.toBe(0);
    const log = demo.stdout + demo.stderr;
    expect(log).toContain('Configuração inválida para produção');
    expect(log).toContain('portal.demo.enabled');
    expect(log).toContain('quarkus.mailer.host precisa apontar para um SMTP real');
    expect(log).toContain('portal.public-url precisa ser uma URL pública com HTTPS');
    expect(log).not.toContain(envValue('PORTAL_DB_PASSWORD'));
  });

  test('web recusa iniciar em produção com endereço local', () => {
    const result = spawnSync('docker', ['compose', '--env-file', '.env', '-f', 'compose.yaml', 'run', '--rm', '-T', '--no-deps', '-e', 'PORTAL_ENV=production', 'frontend'], { cwd: COMPOSE_DIR, encoding: 'utf8', timeout: 60_000 });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('precisa ser uma URL pública com HTTPS em produção');
  });

  test('massa de demonstração é opcional, identificada e não aparece por padrão', async ({ browser }) => {
    test.setTimeout(420_000);
    const without = await signedIn(browser, state.adminEmail, state.adminPassword);
    await expect(without.page.getByText('Ambiente de demonstração')).toHaveCount(0);
    await without.page.goto('/admin/organizacoes');
    await expect(without.page.getByRole('link', { name: /Demonstração/ })).toHaveCount(0);
    await without.context.close();

    const up = (demo) => execFileSync('docker', ['compose', '--env-file', '.env', '-f', 'compose.yaml', 'up', '-d', '--wait', '--wait-timeout', '180', 'backend'], { cwd: COMPOSE_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORTAL_DEMO_ENABLED: String(demo) } });
    try {
      up(true);
      const demo = await signedIn(browser, 'cliente.demo@portal.invalid', envValue('PORTAL_DEMO_PASSWORD'));
      await expect(demo.page.getByText('Ambiente de demonstração: os dados exibidos são fictícios.')).toBeVisible();
      await demo.page.goto('/projetos');
      await expect(demo.page.getByRole('link', { name: '[Demonstração] Projeto exemplo' })).toBeVisible();
      await shot(demo.page, '23-demonstracao');
      await demo.context.close();
    } finally {
      up(false);
    }
    compose('ps');
  });
});
