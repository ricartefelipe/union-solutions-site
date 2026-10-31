import { connect } from 'node:net';
import { lookup } from 'node:dns/promises';
import { test } from '@playwright/test';
import { assertAccessible, BASE, cookieHash, disclosure, docker, execIn, expect, loadState, login, nextTotp, PROJECT, saveState, sessionSql, shot, startService, stopService, waitHealthy, wrongTotp, actionLink, completeAccountSetup, latestMailFor, restartServices, pdf, RUN } from './support.js';

// Exige a configuração de produção (deploy/production/teste) e as contas criadas na jornada (01).
const state = loadState();
const HOST = new URL(BASE).hostname;
const PG_SQL = (db, sql) => execIn('postgres', 'psql', '-U', 'postgres', '-d', db, '-Atc', sql).trim();

/** Comando no provedor, com o administrador do realm master, sem passar pelo proxy. */
function kc(script, env = {}) {
  const setup = 'K=/opt/keycloak/bin/kcadm.sh; C=/tmp/kc-teste.config; $K config credentials --config $C --server http://localhost:8080/identidade --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1;';
  const vars = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return docker('exec', ...vars, `${PROJECT}-keycloak-1`, 'sh', '-c', `${setup} ${script}`).trim();
}
const kcUserId = (email) => kc('$K get users --config $C -r union-portal -q "email=$ALVO" -q exact=true --fields id --format csv --noquotes', { ALVO: email });

async function signedIn(browser, email, password = state.password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
  return { context, page };
}
const sessionOf = async (context) => (await context.cookies()).find((c) => c.name.includes('portal_session'));

test.describe.serial('Configuração de produção', () => {
  test('HTTPS real, cookies seguros e emissor público', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const cookie = await sessionOf(context);
    expect(cookie.name).toBe('__Host-portal_session');
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' });
    const response = await page.goto('/projetos');
    const headers = response.headers();
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers.server ?? '').toBe('');
    expect(page.url().startsWith('https://')).toBe(true);
    await context.close();

    const insecure = await fetch(`http://${HOST}/projetos`, { redirect: 'manual' });
    expect(insecure.status).toBe(308);
    expect(insecure.headers.get('location')).toBe(`https://${HOST}/projetos`);

    const discovery = await (await fetch(`${BASE}/identidade/realms/union-portal/.well-known/openid-configuration`)).json();
    expect(discovery.issuer).toBe(`${BASE}/identidade/realms/union-portal`);
    expect(discovery.authorization_endpoint.startsWith(`${BASE}/identidade/`)).toBe(true);
  });

  test('o proxy não expõe console, realm administrativo, conta, saúde nem métricas', async () => {
    for (const path of ['/identidade', '/identidade/', '/identidade/admin/', '/identidade/admin/master/console/', '/identidade/realms/master/.well-known/openid-configuration', '/identidade/realms/master/protocol/openid-connect/token', '/identidade/realms/union-portal/account/', '/identidade/realms/union-portal/account/credentials', '/identidade/health/ready', '/identidade/metrics']) {
      expect((await fetch(`${BASE}${path}`, { redirect: 'manual' })).status, path).toBe(404);
    }
    for (const path of ['/q/health', '/q/metrics', '/q/openapi']) {
      expect([303, 307, 404], path).toContain((await fetch(`${BASE}${path}`, { redirect: 'manual' })).status);
    }
  });

  test('serviços internos não são alcançáveis da rede pública nem têm porta no host', async () => {
    for (const host of ['postgres', 'backend', 'keycloak', 'frontend', 'armazenamento', 'clamav']) {
      await expect(lookup(host), `${host} não deveria resolver na rede pública`).rejects.toThrow();
    }
    const reachable = await new Promise((resolve) => {
      const socket = connect({ host: HOST, port: 8080, timeout: 1500 });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    expect(reachable).toBe(false);
    const lines = docker('ps', '--filter', `label=com.docker.compose.project=${PROJECT}`, '--format', '{{.Label "com.docker.compose.service"}}|{{.Ports}}').split('\n').filter(Boolean);
    for (const line of lines) {
      const [service, ports] = line.split('|');
      if (service === 'proxy') expect(ports).toMatch(/127\.0\.0\.1:18443->443/);
      else expect(ports, service).not.toMatch(/->/);
    }
    expect(lines.length).toBeGreaterThanOrEqual(7);
  });

  test('OIDC usa state, nonce e PKCE, e rejeita retorno adulterado', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/auth/login');
    const url = new URL(page.url());
    expect(url.pathname).toBe('/identidade/realms/union-portal/protocol/openid-connect/auth');
    for (const name of ['state', 'nonce', 'code_challenge']) expect(url.searchParams.get(name), name).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(`${BASE}/auth/callback`);

    // Código forjado com state errado.
    await page.goto(`/auth/callback?code=forjado&state=${url.searchParams.get('state')}x`);
    await expect(page.getByRole('heading', { level: 1, name: 'Não foi possível entrar' })).toBeVisible();
    // State certo sem o cookie do login em andamento, como em outro navegador.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`/auth/callback?code=forjado&state=${url.searchParams.get('state')}`);
    await expect(otherPage.getByRole('heading', { level: 1, name: 'Não foi possível entrar' })).toBeVisible();
    await other.close();

    // Destino de retorno fora do portal é recusado pelo provedor.
    const foreign = new URL(url);
    foreign.searchParams.set('redirect_uri', 'https://site-malicioso.example/auth/callback');
    const answer = await page.request.get(foreign.toString(), { maxRedirects: 0 });
    expect(answer.status()).toBe(400);

    // Senha direta no endpoint de token não é aceita.
    const grant = await fetch(`${BASE}/identidade/realms/union-portal/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'portal-web', username: state.clientA, password: state.password }) });
    expect(grant.status).toBeGreaterThanOrEqual(400);
    await context.close();
  });

  test('administrador precisa de segundo fator, e código errado não entra', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/auth/login');
    await page.fill('#username', state.adminEmail);
    await page.fill('#password', state.adminPassword);
    await page.locator('#kc-login').click();
    await expect(page.locator('#otp')).toBeVisible();
    expect((await page.request.get('/bff/v1/me')).status(), 'senha sozinha não abre sessão').toBe(401);
    await assertAccessible(page, 'tela de segundo fator');
    await page.fill('#otp', wrongTotp(loadState().totp[state.adminEmail]));
    await page.locator('#kc-login').click();
    await expect(page.locator('#otp')).toBeVisible();
    await expect(page.locator('body')).toContainText(/inválid|invalid/i);
    await page.fill('#otp', await nextTotp(loadState().totp[state.adminEmail]));
    await page.locator('#kc-login').click();
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await context.close();
  });

  test('cliente entra sem segundo fator; profissional convidado é obrigado a configurá-lo', async ({ browser }) => {
    const client = await browser.newContext();
    const clientPage = await client.newPage();
    await clientPage.goto('/auth/login');
    await clientPage.fill('#username', state.clientA);
    await clientPage.fill('#password', state.password);
    await clientPage.locator('#kc-login').click();
    await expect(clientPage.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await client.close();

    const staff = `equipe-${RUN}@portal.invalid`;
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto('/admin/usuarios');
    const form = admin.page.locator('section', { has: admin.page.getByRole('heading', { name: 'Convidar profissional' }) });
    await form.getByLabel('E-mail').fill(staff);
    await form.getByLabel('Papel').selectOption('UNION_STAFF');
    await form.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(form.getByText('Convite enviado por e-mail.')).toBeVisible();
    await admin.context.close();

    const invite = (await latestMailFor(staff, 'Convite')).Text.match(/https?:\/\/\S+\/convite#t=[A-Za-z0-9_-]+/)[0];
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(invite);
    await page.getByRole('button', { name: /definir|criar|primeiro acesso|enviar/i }).first().click();
    const setup = await latestMailFor(staff, 'Atualize');
    await completeAccountSetup(page, actionLink(setup), { password: state.password, firstName: 'Pessoa', lastName: 'Equipe' });
    await page.goto('/auth/login?returnTo=/auth/invite/complete');
    await page.fill('#username', staff);
    await page.fill('#password', state.password);
    await page.locator('#kc-login').click();
    await expect(page.locator('#totpSecret'), 'sem TOTP configurado, o login cobra a configuração').toHaveCount(1);
    expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
    const secret = await page.locator('#totpSecret').inputValue();
    saveState({ totp: { ...(loadState().totp ?? {}), [staff]: secret }, staff });
    await page.fill('#totp', await nextTotp(secret));
    if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'teste');
    await page.locator('input[type=submit], button[type=submit]').first().click();
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await context.close();
  });

  test('recuperação do segundo fator: removido pela administração, é exigido de novo', async ({ browser }) => {
    const { staff, totp } = loadState();
    const id = kcUserId(staff);
    expect(id).toBeTruthy();
    const list = () => kc(`$K get users/${id}/credentials --config $C -r union-portal --fields id,type --format csv --noquotes`);
    const otp = list().split('\n').find((l) => l.endsWith(',"otp"') || l.endsWith(',otp'));
    expect(otp, 'TOTP cadastrado').toBeTruthy();
    expect(totp[staff]).toBeTruthy();
    kc(`$K delete users/${id}/credentials/${otp.split(',')[0].replaceAll('"', '')} --config $C -r union-portal`);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/auth/login');
    await page.fill('#username', staff);
    await page.fill('#password', state.password);
    await page.locator('#kc-login').click();
    await expect(page.locator('#totpSecret')).toHaveCount(1);
    expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
    const secret = await page.locator('#totpSecret').inputValue();
    expect(secret).not.toBe(totp[staff]);
    saveState({ totp: { ...loadState().totp, [staff]: secret } });
    await page.fill('#totp', await nextTotp(secret));
    if (await page.locator('#userLabel').count()) await page.fill('#userLabel', 'teste');
    await page.locator('input[type=submit], button[type=submit]').first().click();
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await context.close();
  });

  test('conta desativada só no provedor: token vigente continua até vencer, e a renovação encerra a sessão', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    const cookie = await sessionOf(context);
    const hash = cookieHash(cookie.value);
    const id = kcUserId(state.clientA);
    kc(`$K update users/${id} --config $C -r union-portal -s enabled=false`);
    try {
      // O portal não foi avisado: o token de até 5 minutos ainda vale. Este é o comportamento documentado.
      expect((await page.request.get('/bff/v1/me')).status()).toBe(200);
      // Na renovação, o provedor recusa e a sessão termina.
      sessionSql(`UPDATE portal_session SET access_exp = 1 WHERE id_hash = '${hash}'`);
      await page.goto('/projetos');
      await expect(page).toHaveURL(/\/identidade\/realms\/union-portal\//);
      expect(sessionSql(`SELECT count(*) FROM portal_session WHERE id_hash = '${hash}'`)).toBe('0');
    } finally {
      kc(`$K update users/${id} --config $C -r union-portal -s enabled=true`);
    }
    await context.close();
  });

  test('banco de sessões fora do ar: acesso recusado e a sessão volta depois', async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await signedIn(browser, state.clientA);
    stopService('postgres');
    try {
      const response = await page.goto('/projetos');
      expect(response.status()).toBe(503);
      expect(await page.locator('body').innerText()).not.toContain('Portal de pedidos');
      expect((await page.request.get('/bff/v1/me')).status()).toBe(503);
      expect((await context.cookies()).some((c) => c.name.includes('portal_session')), 'não encerra a sessão por falha temporária').toBe(true);
    } finally {
      await startService('postgres');
    }
    await expect(async () => {
      expect((await page.request.get('/bff/v1/me')).status()).toBe(200);
    }).toPass({ timeout: 60_000, intervals: [1000] });
    await context.close();
  });

  test('provedor fora do ar: sessão vigente segue, token vencido falha com segurança e novo login não abre', async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await signedIn(browser, state.clientA);
    const hash = cookieHash((await sessionOf(context)).value);
    stopService('keycloak');
    try {
      expect((await page.request.get('/bff/v1/me')).status(), 'a API valida com as chaves já obtidas').toBe(200);
      const original = sessionSql(`SELECT access_exp FROM portal_session WHERE id_hash = '${hash}'`);
      sessionSql(`UPDATE portal_session SET access_exp = 1 WHERE id_hash = '${hash}'`);
      const expired = await page.goto('/projetos');
      expect(expired.status()).toBe(503);
      expect(sessionSql(`SELECT count(*) FROM portal_session WHERE id_hash = '${hash}'`), 'a sessão não é apagada').toBe('1');
      sessionSql(`UPDATE portal_session SET access_exp = ${original} WHERE id_hash = '${hash}'`);

      const fresh = await browser.newContext();
      const login = await fresh.newPage();
      const denied = await login.goto('/auth/login');
      expect(denied.status()).toBe(502);
      expect(await login.locator('body').innerText()).toContain('temporariamente indisponível');
      await fresh.close();
    } finally {
      await startService('keycloak');
    }
    await page.goto('/projetos');
    await expect(page.getByRole('heading', { level: 1, name: 'Projetos' })).toBeVisible();
    await context.close();
  });

  test('banco reiniciado sem reiniciar o provedor: login e logout voltam a funcionar', async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await signedIn(browser, state.clientA);
    await restartServices('postgres');
    const started = Date.now();
    const statuses = [];
    // Primeiras ações depois do reinício. O BFF repete chamadas ao provedor em caso de falha temporária.
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Você saiu do portal' })).toBeVisible();
    const warned = await page.getByText('O serviço de login não confirmou o encerramento.').count();
    const attempts = [];
    let ok = false;
    for (let i = 0; i < 40 && !ok; i += 1) {
      const fresh = await browser.newContext();
      const entry = await fresh.newPage();
      try {
        const response = await entry.goto('/auth/login');
        statuses.push(response.status());
        attempts.push(`${Math.round((Date.now() - started) / 1000)}s:${response.status()}`);
        if (response.status() === 200) {
          await entry.fill('#username', state.clientA);
          await entry.fill('#password', state.password);
          await entry.locator('#kc-login').click();
          await entry.waitForLoadState('domcontentloaded');
          ok = (await entry.getByRole('heading', { level: 1, name: /Olá/ }).count()) > 0 || !entry.url().includes('/realms/');
        }
      } finally {
        await fresh.close();
      }
      if (!ok) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    console.log(`Recuperação após reiniciar o banco: logout com aviso=${warned}; tentativas de login: ${attempts.join(' ')}; total ${Math.round((Date.now() - started) / 1000)}s`);
    expect(ok).toBe(true);
    await context.close();
  });

  test('arquivos: limite no proxy e na API, formato recusado, nome malicioso saneado e arquivo com falha reprocessado', async ({ browser }) => {
    test.setTimeout(300_000);
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto(`/projetos/${state.ids.project}`);
    const csrf = await admin.page.locator('meta[name=csrf-token]').getAttribute('content');
    const send = (name, mimeType, buffer, title) => admin.page.request.post('/bff/v1/documents', {
      headers: { 'X-CSRF-Token': csrf },
      multipart: { file: { name, mimeType, buffer }, title, category: 'OTHER', visibility: 'PARTICIPANTS', projectId: state.ids.project },
    });
    // Acima do limite do proxy (40 MB): o corpo é cortado antes de chegar à aplicação.
    const tooBigProxy = await send('grande.pdf', 'application/pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(41 * 1024 * 1024)]), 'Grande').catch((error) => error);
    expect(tooBigProxy instanceof Error ? 413 : tooBigProxy.status()).toBe(413);
    // Acima do limite da API (25 MiB) e abaixo do proxy.
    const tooBigApi = await send('grande.pdf', 'application/pdf', Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(26 * 1024 * 1024)]), 'Grande');
    expect(tooBigApi.status()).toBe(413);
    for (const [name, type, body] of [['pagina.html', 'text/html', '<script>alert(1)</script>'], ['desenho.svg', 'image/svg+xml', '<svg onload="alert(1)"/>'], ['falso.pdf', 'application/pdf', 'isto nao e pdf'], ['programa.exe', 'application/octet-stream', 'MZ']]) {
      const refused = await send(name, type, Buffer.from(body), `Recusado ${RUN}`);
      expect(refused.status(), name).toBeGreaterThanOrEqual(400);
      expect(refused.status(), name).toBeLessThan(500);
    }
    const title = `Nome hostil ${RUN}`;
    const accepted = await send('../../../etc/passwd.pdf', 'application/pdf', pdf('nome hostil').buffer, title);
    expect(accepted.status()).toBeLessThan(300);
    const created = await accepted.json();
    expect(JSON.stringify(created)).not.toContain('..');

    await expect(async () => {
      const docs = await (await admin.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(title)}`)).json();
      expect(docs.items[0].latest.file.scanStatus).toBe('CLEAN');
    }).toPass({ timeout: 120_000, intervals: [3000] });
    const docs = await (await admin.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(title)}`)).json();
    const fileId = docs.items[0].latest.file.id;
    expect(docs.items[0].latest.file.name).toBe('passwd.pdf');
    const download = await admin.page.request.get(`/bff/v1/documents/${docs.items[0].id}/versions/${docs.items[0].latest.id}/download`);
    expect(download.headers()['content-disposition']).toContain('attachment');
    expect(download.headers()['cache-control']).toContain('no-store');

    // Um arquivo marcado com falha de verificação volta à fila pelo botão da administração e não fica preso.
    PG_SQL('portal', `UPDATE stored_file SET scan_status = 'FAILED', scan_detail = 'Verificação não concluída', scan_attempts = 30 WHERE id = '${fileId}'`);
    await admin.page.goto('/documentos');
    const row = admin.page.locator('li', { hasText: title });
    await row.getByRole('button', { name: 'Verificar novamente' }).click();
    await expect(row.getByRole('button', { name: 'Verificar novamente' })).toHaveCount(0);
    await expect(async () => {
      const current = await (await admin.page.request.get(`/bff/v1/documents?q=${encodeURIComponent(title)}`)).json();
      expect(current.items[0].latest.file.scanStatus).toBe('CLEAN');
    }).toPass({ timeout: 120_000, intervals: [3000] });
    await admin.context.close();
  });

  test('sem massa de demonstração e sem contas conhecidas', async ({ browser }) => {
    const inspect = docker('inspect', '--format', '{{json .Config.Env}}', `${PROJECT}-backend-1`);
    expect(inspect).toContain('QUARKUS_PROFILE=prod');
    expect(inspect).not.toContain('PORTAL_DEMO_ENABLED');
    expect(PG_SQL('portal', 'SELECT count(*) FROM organization WHERE is_demo')).toBe('0');
    expect(PG_SQL('portal', "SELECT count(*) FROM app_user WHERE email LIKE '%.demo@%'")).toBe('0');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/auth/login');
    await page.fill('#username', 'admin.demo@portal.invalid');
    await page.fill('#password', 'qualquer-senha');
    await page.locator('#kc-login').click();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('body')).toContainText(/inválid|invalid/i);
    await assertAccessible(page, 'tela de login com erro');
    await shot(page, 'p01-login-producao');
    await context.close();
  });

  test('auditoria identifica ator, organização, recurso, ação e data, sem segredos', async ({ browser }) => {
    const rows = PG_SQL('portal', "SELECT action, count(*) FROM audit_event GROUP BY action ORDER BY 1");
    expect(rows).toContain('DELIVERY_APPROVED');
    const sample = PG_SQL('portal', "SELECT row_to_json(a) FROM (SELECT * FROM audit_event ORDER BY created_at DESC LIMIT 200) a");
    expect(sample).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.|client_secret|password/i);
    const admin = await signedIn(browser, state.adminEmail, state.adminPassword);
    await admin.page.goto('/admin/auditoria');
    await expect(admin.page.getByRole('heading', { level: 1, name: 'Auditoria' })).toBeVisible();
    await shot(admin.page, 'p02-auditoria-producao');
    await admin.page.goto(`/projetos/${state.ids.project}`);
    await shot(admin.page, 'p03-admin-projeto-producao');
    await admin.context.close();
    await waitHealthy('backend');
  });

  test('disclosure mantém formulários acessíveis em produção', async ({ browser }) => {
    const { context, page } = await signedIn(browser, state.clientA);
    await page.goto('/suporte');
    await disclosure(page, 'Abrir solicitação');
    await assertAccessible(page, '/suporte em produção');
    await context.close();
  });
});
