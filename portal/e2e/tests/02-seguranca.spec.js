import { test } from '@playwright/test';
import { assertAccessible, assertNoHorizontalScroll, BASE, confirmAction, cookieHash, disclosure, docker, execIn, expect, inviteLink, latestMailFor, loadState, login, PROJECT, RUN, sessionSql, shot, startService, stopService, STORAGE_SERVICE } from './support.js';

// Depende da jornada (01): usa as contas criadas nela.
const state = loadState();
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

async function signedIn(browser, email, password = state.password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  return { context, page };
}

test.describe.serial('Segurança e acessibilidade', () => {
  test('o cookie só traz um identificador opaco e os tokens não chegam ao navegador', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const session = (await context.cookies()).filter((c) => c.name.includes('portal_session'));
    expect(session).toHaveLength(1);
    expect(session[0].httpOnly).toBe(true);
    expect(session[0].sameSite).toBe('Lax');
    expect(session[0].value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // No banco ficam o hash do identificador e os tokens cifrados.
    const stored = sessionSql(`SELECT tokens FROM portal_session WHERE id_hash = '${cookieHash(session[0].value)}'`);
    expect(stored.split('.')).toHaveLength(5);
    expect(sessionSql(`SELECT count(*) FROM portal_session WHERE id_hash = '${session[0].value}'`)).toBe('0');
    const visible = await page.evaluate(() => ({ cookie: document.cookie, local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), html: document.documentElement.outerHTML }));
    expect(visible.cookie).not.toContain('portal_session');
    expect(visible.local).toBe('{}');
    expect(visible.session).toBe('{}');
    expect(visible.html).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.eyJ/);
    await context.close();
  });

  test('páginas privadas não entram em cache nem em indexação e têm CSP', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const response = await page.goto('/projetos');
    const headers = response.headers();
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("script-src 'self' 'nonce-");
    expect(await page.locator('meta[name=robots]').getAttribute('content')).toContain('noindex');
    const robots = await page.request.get('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(errors, 'sem violações de CSP nem erros de console').toEqual([]);
    await context.close();
  });

  test('mutação sem token de CSRF ou de outra origem é recusada', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const body = { subject: 'CSRF', description: 'x', category: 'OTHER', priority: 'LOW' };
    const noToken = await page.request.post('/bff/v1/tickets', { data: body });
    expect(noToken.status()).toBe(403);
    const csrf = await page.locator('meta[name=csrf-token]').getAttribute('content');
    const wrongOrigin = await page.request.post('/bff/v1/tickets', { data: body, headers: { 'X-CSRF-Token': csrf, Origin: 'https://site-malicioso.example' } });
    expect(wrongOrigin.status()).toBe(403);
    const wrongToken = await page.request.post('/bff/v1/tickets', { data: body, headers: { 'X-CSRF-Token': 'token-errado' } });
    expect(wrongToken.status()).toBe(403);
    const logout = await page.request.post('/auth/logout', { form: { csrf: 'token-errado' } });
    expect(logout.status()).toBe(403);
    await context.close();
  });

  test('o BFF não alcança caminhos fora da API', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    for (const path of ['/bff/q/health', '/bff/q/metrics', '/bff/q/openapi', '/bff/v1/../q/metrics', '/bff/admin']) {
      expect((await page.request.get(path)).status(), path).toBeGreaterThanOrEqual(400);
    }
    await context.close();
  });

  test('redirecionamento de login não sai do portal', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/auth/login?returnTo=https://site-malicioso.example/');
    await page.fill('#username', state.clientA);
    await page.fill('#password', state.password);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    expect(new URL(page.url()).hostname).toBe(new URL(BASE).hostname);
    await context.close();
  });

  test('sessão com prazo vencido ou cookie adulterado exige novo login', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const cookie = (await context.cookies()).find((c) => c.name.includes('portal_session'));
    const hash = cookieHash(cookie.value);
    const [created, active, expires] = sessionSql(`SELECT created_at, last_active, expires_at FROM portal_session WHERE id_hash = '${hash}'`).split('|').map(Number);
    expect(expires - active, 'expira por inatividade').toBeLessThanOrEqual(3600);
    expect(expires - created, 'e por prazo absoluto').toBeLessThanOrEqual(12 * 3600);

    // Identificador adulterado.
    await context.clearCookies();
    await context.addCookies([{ ...cookie, value: `${cookie.value.startsWith('A') ? 'B' : 'A'}${cookie.value.slice(1)}` }]);
    await page.goto('/projetos');
    await expect(page).toHaveURL(/\/realms\/union-portal\//);
    expect((await page.request.get('/bff/v1/me')).status()).toBe(401);

    // Sessão vencida: o registro é removido.
    await context.clearCookies();
    await context.addCookies([cookie]);
    expect((await page.request.get('/bff/v1/me')).status()).toBe(200);
    sessionSql(`UPDATE portal_session SET expires_at = 1 WHERE id_hash = '${hash}'`);
    await page.goto('/projetos');
    await expect(page).toHaveURL(/\/realms\/union-portal\//);
    expect(sessionSql(`SELECT count(*) FROM portal_session WHERE id_hash = '${hash}'`)).toBe('0');
    await context.close();
  });

  test('token vencido é renovado pelo servidor, sem novo login', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const cookie = (await context.cookies()).find((c) => c.name.includes('portal_session'));
    const hash = cookieHash(cookie.value);
    const before = sessionSql(`SELECT tokens FROM portal_session WHERE id_hash = '${hash}'`);
    sessionSql(`UPDATE portal_session SET access_exp = 1 WHERE id_hash = '${hash}'`);
    await page.goto('/projetos');
    await expect(page.getByRole('heading', { level: 1, name: 'Projetos' })).toBeVisible();
    expect(Number(sessionSql(`SELECT access_exp FROM portal_session WHERE id_hash = '${hash}'`))).toBeGreaterThan(Date.now() / 1000);
    expect(sessionSql(`SELECT tokens FROM portal_session WHERE id_hash = '${hash}'`)).not.toBe(before);
    await context.close();
  });

  test('depois de sair, uma cópia do cookie não abre a sessão', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const cookie = (await context.cookies()).find((c) => c.name.includes('portal_session'));
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Você saiu do portal' })).toBeVisible();
    expect(sessionSql(`SELECT count(*) FROM portal_session WHERE id_hash = '${cookieHash(cookie.value)}'`)).toBe('0');
    const copy = await browser.newContext();
    await copy.addCookies([cookie]);
    const stolen = await copy.newPage();
    expect((await stolen.request.get('/bff/v1/me')).status()).toBe(401);
    await copy.close();
    await context.close();
  });

  test('convite de outro destinatário é recusado no navegador', async ({ browser }) => {
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    const other = `outro-${RUN}@portal.invalid`;
    await admin.page.goto(`/admin/organizacoes/${state.ids.orgA}`);
    const section = admin.page.locator('section', { has: admin.page.getByRole('heading', { name: 'Convites' }) });
    await section.getByLabel('E-mail').fill(other);
    await section.getByLabel('Papel').selectOption('CLIENT_MEMBER');
    await section.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(section.getByText('Convite enviado por e-mail.')).toBeVisible();
    await admin.context.close();

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(inviteLink(await latestMailFor(other, 'Convite')));
    await page.getByRole('link', { name: /entrar e aceitar/ }).click();
    await page.fill('#username', state.clientB);
    await page.fill('#password', state.password);
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Não foi possível aceitar o convite' })).toBeVisible();
    await shot(page, '13-convite-outro-destinatario');
    await context.close();
  });

  test('arquivo com assinatura de malware é bloqueado pelo antivírus real', async ({ browser }) => {
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto(`/projetos/${state.ids.project}`);
    const form = await disclosure(admin.page, 'Disponibilizar documento');
    await form.getByLabel('Arquivo').setInputFiles({ name: 'teste-eicar.txt', mimeType: 'text/plain', buffer: Buffer.from(EICAR) });
    await form.getByLabel('Título').fill(`EICAR ${RUN}`);
    await form.getByLabel('Categoria').selectOption('OTHER');
    await form.getByRole('button', { name: 'Enviar documento' }).click();
    await expect(form.getByText(/depois da verificação/)).toBeVisible();
    const row = admin.page.locator('li', { hasText: `EICAR ${RUN}` });
    await expect(row.getByText('Bloqueado')).toBeVisible({ timeout: 120_000 });
    await expect(row.getByRole('link')).toHaveCount(0);
    // O cliente não recebe nada sobre o arquivo bloqueado.
    const client = await signedIn(browser, state.clientA);
    expect(await (await client.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(`EICAR ${RUN}`)}`)).json()).toMatchObject({ total: 0 });
    expect(await (await client.page.request.get('/bff/v1/dashboard')).text()).not.toContain('EICAR');
    await client.context.close();
    const docs = await (await admin.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(`EICAR ${RUN}`)}`)).json();
    const doc = docs.items[0];
    const download = await admin.page.request.get(`/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`);
    expect(download.status()).toBe(409);
    await shot(admin.page, '14-antivirus-bloqueado');
    await admin.context.close();
  });

  test('com o antivírus fora do ar, o arquivo não é liberado', async ({ browser }) => {
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    stopService('clamav');
    let doc;
    try {
      await admin.page.goto(`/projetos/${state.ids.project}`);
      const form = await disclosure(admin.page, 'Disponibilizar documento');
      await form.getByLabel('Arquivo').setInputFiles({ name: 'sem-verificacao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n% limpo\n') });
      await form.getByLabel('Título').fill(`Sem verificação ${RUN}`);
      await form.getByLabel('Categoria').selectOption('OTHER');
      await form.getByRole('button', { name: 'Enviar documento' }).click();
      await expect(form.getByText(/depois da verificação/)).toBeVisible();
      await admin.page.waitForTimeout(15_000);
      const docs = await (await admin.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(`Sem verificação ${RUN}`)}`)).json();
      doc = docs.items[0];
      expect(doc.latest.file.scanStatus).toBe('PENDING');
      expect(doc.latest.file.downloadable).toBe(false);
      expect((await admin.page.request.get(`/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`)).status()).toBe(409);
    } finally {
      await startService('clamav');
    }
    await expect(async () => {
      const current = await (await admin.page.request.get(`/bff/v1/documents/${doc.id}`)).json();
      expect(current.document.latest.file.scanStatus).toBe('CLEAN');
    }).toPass({ timeout: 180_000, intervals: [5000] });
    await admin.context.close();
  });

  test('o bucket não aceita acesso anônimo e não é publicado', async () => {
    const output = execIn(STORAGE_SERVICE, 'sh', '-c', 'wget -S -O /dev/null http://127.0.0.1:8333/portal-private/ 2>&1 || true');
    expect(output).toMatch(/403|Forbidden|401/);
    const ports = docker('ps', '--filter', `label=com.docker.compose.project=${PROJECT}`, '--format', '{{.Label "com.docker.compose.service"}} {{.Ports}}');
    for (const line of ports.split('\n').filter((l) => /^(seaweedfs|armazenamento|postgres|clamav|backend) /.test(l))) {
      expect(line, 'serviço interno sem porta publicada no host').not.toMatch(/\d+\.\d+\.\d+\.\d+:\d+->/);
    }
  });

  test('usuário desativado perde o acesso, mesmo com sessão aberta', async ({ browser }) => {
    const client = await signedIn(browser, state.clientB);
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto(`/admin/organizacoes/${state.ids.orgB}`);
    const row = admin.page.locator('li', { hasText: state.clientB }).filter({ has: admin.page.getByRole('button', { name: 'Revogar acesso' }) });
    await confirmAction(admin.page, row.getByRole('button', { name: 'Revogar acesso' }));
    await expect(admin.page.locator('li', { hasText: state.clientB }).getByRole('button', { name: 'Reativar' })).toBeVisible();

    expect((await client.page.request.get('/bff/v1/me')).status()).toBe(403);
    await client.page.goto('/projetos');
    await expect(client.page.getByRole('heading', { level: 1, name: /não tem acesso ao portal/ })).toBeVisible();

    // Depois de desativada, a conta também não entra de novo pelo provedor.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await login(page, state.clientB, state.password);
    await expect(page.locator('body')).not.toContainText('Olá');
    await fresh.close();

    await admin.page.locator('li', { hasText: state.clientB }).getByRole('button', { name: 'Reativar' }).click();
    await expect(admin.page.locator('li', { hasText: state.clientB }).getByRole('button', { name: 'Revogar acesso' })).toBeVisible();
    await admin.context.close();
    await client.context.close();
  });

  test('com o provedor fora do ar, sair encerra a sessão do portal e avisa', async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, state.clientA, state.password);
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    stopService('keycloak');
    try {
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Você saiu do portal' })).toBeVisible();
      await expect(page.getByText('O serviço de login não confirmou o encerramento.')).toBeVisible();
      expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
    } finally {
      await startService('keycloak');
      await context.close();
    }
  });

  test('formulários e erros funcionam só com teclado', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    await page.goto('/suporte');
    await expect(page.getByRole('heading', { level: 1, name: 'Suporte' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#conteudo')).toBeFocused();

    // Só com Tab, do início do conteúdo até o bloco recolhido.
    const summary = page.locator('summary', { hasText: 'Abrir solicitação' });
    await expect(summary).toBeVisible();
    for (let i = 0; i < 25 && !(await summary.evaluate((el) => el === document.activeElement)); i += 1) await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    const form = page.locator('details.disclosure', { has: summary });
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Assunto')).toBeFocused();
    await page.keyboard.type(`Teclado ${RUN}`);
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Descrição')).toBeFocused();
    await page.keyboard.type('Aberta somente com o teclado.');
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Categoria')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(form.getByRole('button', { name: 'Abrir solicitação' })).toBeFocused();
    const focusRing = await form.getByRole('button', { name: 'Abrir solicitação' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(focusRing).toBe('solid');

    // Erro da API: a mensagem recebe o foco e fica disponível para leitor de tela.
    await page.route('**/bff/v1/tickets', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Erro simulado no teste.', correlationId: 'abc-123' }) }) : route.continue()));
    await page.keyboard.press('Enter');
    const alert = form.getByRole('alert');
    await expect(alert).toContainText('Erro simulado no teste.');
    await expect(alert).toContainText('abc-123');
    await expect(alert).toBeFocused();
    await shot(page, '15-erro-acessivel');
    await page.unroute('**/bff/v1/tickets');
    await page.keyboard.press('Tab');
    await context.close();
  });

  test('diálogo de confirmação abre e cancela pelo teclado', async ({ browser }) => {
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto(`/admin/organizacoes/${state.ids.orgB}`);
    const button = admin.page.locator('li', { hasText: state.clientB }).getByRole('button', { name: 'Revogar acesso' });
    await expect(button).toBeVisible();
    await button.focus();
    await admin.page.keyboard.press('Enter');
    const dialog = admin.page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    await shot(admin.page, '16-confirmacao');
    await admin.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeVisible();
    await admin.context.close();
  });

  test('acessibilidade e layout nas telas principais', async ({ browser }) => {
    const client = await signedIn(browser, state.clientA);
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    const clientPaths = ['/', '/projetos', `/projetos/${state.ids.project}`, `/entregas/${state.ids.delivery}`, '/documentos', '/suporte', `/suporte/${state.ids.ticket}`, '/produtos', '/organizacao'];
    const adminPaths = ['/', '/admin/organizacoes', `/admin/organizacoes/${state.ids.orgA}`, '/admin/usuarios', '/admin/auditoria', `/projetos/${state.ids.project}`];
    for (const [session, paths] of [[client, clientPaths], [admin, adminPaths]]) {
      for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 700 }]) {
        await session.page.setViewportSize(size);
        for (const path of paths) {
          await session.page.goto(path);
          await expect(session.page.locator('h1').first()).toBeVisible();
          await assertNoHorizontalScroll(session.page, `${path}@${size.width}`);
          if (size.width !== 320) await assertAccessible(session.page, `${path}@${size.width}`);
        }
      }
    }
    await client.page.setViewportSize({ width: 390, height: 844 });
    await client.page.goto('/');
    await expect(client.page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await expect(client.page.locator('body')).not.toContainText('EICAR');
    await shot(client.page, '17-cliente-painel-celular');
    await client.page.goto(`/entregas/${state.ids.delivery}`);
    await expect(client.page.getByRole('heading', { level: 1, name: state.delivery })).toBeVisible();
    await shot(client.page, '18-cliente-entrega-celular');
    await client.context.close();
    await admin.page.setViewportSize({ width: 1280, height: 900 });
    await admin.page.goto(`/admin/organizacoes/${state.ids.orgA}`);
    await expect(admin.page.getByRole('heading', { level: 1, name: state.orgA })).toBeVisible();
    await shot(admin.page, '19-admin-cliente');
    await admin.page.goto('/admin/auditoria');
    await expect(admin.page.getByRole('heading', { level: 1, name: 'Auditoria' })).toBeVisible();
    await shot(admin.page, '20-admin-auditoria');
    await admin.context.close();
  });

  test('páginas públicas têm acessibilidade e identidade corretas', async ({ page }) => {
    await page.goto('/sessao-encerrada');
    await assertAccessible(page, '/sessao-encerrada');
    await page.goto('/convite');
    await expect(page.getByText(/não é válido ou já expirou/)).toBeVisible();
    await assertAccessible(page, '/convite');
    await shot(page, '21-convite-invalido');
  });
});


