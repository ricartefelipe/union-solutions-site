import { test } from '@playwright/test';
import { actionLink, BASE, completeAccountSetup, confirmAction, disclosure, expect, inviteLink, latestMailFor, loadState, login, pdf, restartServices, RUN, saveState, shot } from './support.js';

/**
 * Jornada completa com navegador real, Keycloak real, e-mail capturado pelo Mailpit,
 * armazenamento S3 local e antivírus de verdade. Cada etapa depende da anterior.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@portal.invalid';
const PASSWORD = `Senha-E2E-${RUN}-x9`;
const ORG_A = `Cliente Alfa ${RUN}`;
const ORG_B = `Cliente Beta ${RUN}`;
const CLIENT_A = `alfa-${RUN}@portal.invalid`;
const CLIENT_B = `beta-${RUN}@portal.invalid`;
const PROJECT = `Portal de pedidos ${RUN}`;
const DELIVERY = `Especificação funcional ${RUN}`;
const TICKET = `Dúvida sobre a entrega ${RUN}`;
const INTERNAL_NOTE = `NOTA-INTERNA-${RUN}`;
const PRODUCT_URL = process.env.E2E_PRODUCT_URL ?? 'https://produto.demo.invalid/entrar';

let adminPassword;
let admin;
let clientA;
let clientB;
const ids = {};

test.describe.serial('Jornada completa do portal', () => {
  test.beforeAll(async ({ browser }) => {
    admin = await browser.newContext();
    clientA = await browser.newContext();
    clientB = await browser.newContext();
  });
  test.afterAll(async () => {
    await admin?.close();
    await clientA?.close();
    await clientB?.close();
  });

  test('usuário sem autenticação é levado ao login e não vê dados', async ({ page }) => {
    await page.goto('/projetos');
    await expect(page).toHaveURL(/\/realms\/union-portal\/protocol\/openid-connect\/auth/);
    expect(page.url()).not.toContain('token');
    const response = await page.request.get('/bff/v1/projects');
    expect(response.status()).toBe(401);
  });

  test('primeiro administrador define a senha pelo provedor e entra', async () => {
    const page = await admin.newPage();
    const state = loadState();
    if (state.adminPassword) {
      adminPassword = state.adminPassword;
    } else {
      const mail = await latestMailFor(ADMIN_EMAIL, '');
      adminPassword = PASSWORD;
      await completeAccountSetup(page, actionLink(mail), { password: adminPassword, firstName: 'Administração', lastName: 'Union' });
      saveState({ adminPassword });
    }
    await login(page, ADMIN_EMAIL, adminPassword);
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clientes' })).toBeVisible();
    await shot(page, '01-admin-painel');
    await page.close();
  });

  test('1. administrador cria organização e projeto', async () => {
    const page = await admin.newPage();
    await page.goto('/admin/organizacoes');
    await page.getByLabel('Nome').fill(ORG_A);
    await page.getByRole('button', { name: 'Criar organização' }).click();
    await expect(page.getByRole('heading', { level: 1, name: ORG_A })).toBeVisible();
    ids.orgA = page.url().split('/').pop();

    await page.goto('/projetos');
    const form = await disclosure(page, 'Criar projeto');
    await form.getByLabel('Cliente').selectOption({ label: ORG_A });
    await form.getByLabel('Nome').fill(PROJECT);
    await form.getByLabel('Frente').selectOption('DEVELOPMENT');
    await form.getByLabel('Situação').selectOption('ACTIVE');
    await form.getByLabel('Descrição').fill('Portal para acompanhamento de pedidos dos clientes da empresa.');
    await form.getByLabel('Escopo acordado').fill('Cadastro, consulta e acompanhamento de pedidos.');
    await form.getByLabel('Previsão de término').fill('2027-03-31');
    await form.getByRole('button', { name: 'Criar projeto' }).click();
    await expect(page.getByRole('heading', { level: 1, name: PROJECT })).toBeVisible();
    ids.project = page.url().split('/').pop();

    const milestone = await disclosure(page, 'Nova etapa');
    await milestone.getByLabel('Título').fill('Levantamento concluído');
    await milestone.getByLabel('Previsão').fill('2027-01-15');
    await milestone.getByRole('button', { name: 'Criar etapa' }).click();
    await expect(page.getByText('Etapa criada.')).toBeVisible();

    const update = await disclosure(page, 'Publicar atualização');
    await update.getByLabel('Texto visível ao cliente').fill('Kickoff realizado e cronograma inicial definido.');
    await update.getByRole('button', { name: 'Publicar atualização' }).click();
    await expect(page.getByText('Atualização publicada.')).toBeVisible();
    await shot(page, '02-admin-projeto');
    await page.close();
  });

  test('2. administrador convida o cliente, e o e-mail é capturado localmente', async () => {
    const page = await admin.newPage();
    await page.goto(`/admin/organizacoes/${ids.orgA}`);
    const section = page.locator('section', { has: page.getByRole('heading', { name: 'Convites' }) });
    await section.getByLabel('E-mail').fill(CLIENT_A);
    await section.getByLabel('Papel').selectOption('CLIENT_ADMIN');
    await section.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(section.getByText('Convite enviado por e-mail.')).toBeVisible();
    await expect(section.locator('.list__title', { hasText: CLIENT_A })).toBeVisible();
    await page.close();
  });

  test('3. cliente aceita o convite, define a senha e entra', async () => {
    const page = await clientA.newPage();
    const invite = await latestMailFor(CLIENT_A, 'Convite');
    ids.inviteLinkA = inviteLink(invite);
    const before = Date.now() - 2000;
    await page.goto(ids.inviteLinkA);
    await expect(page.getByRole('heading', { level: 1, name: 'Convite para o portal' })).toBeVisible();
    await expect(page.getByText(ORG_A)).toBeVisible();
    await expect(page).not.toHaveURL(/#t=/);
    await shot(page, '03-cliente-convite');

    await page.getByRole('button', { name: /definir minha senha/ }).click();
    await expect(page.getByText(/Enviamos um e-mail para definir sua senha/)).toBeVisible();

    const setup = await latestMailFor(CLIENT_A, '', { after: before, timeoutMs: 60_000 }).then(async (m) => (m.Subject.includes('Convite') ? latestSetupMail(CLIENT_A) : m));
    await completeAccountSetup(page, actionLink(setup), { password: PASSWORD, firstName: 'Ana', lastName: 'Alfa' });

    await login(page, CLIENT_A, PASSWORD, '/auth/invite/complete');
    await expect(page.getByRole('heading', { level: 1, name: 'Olá, Ana' })).toBeVisible();
    await expect(page.getByText(ORG_A).first()).toBeVisible();
    await page.goto('/projetos');
    await expect(page.getByRole('link', { name: PROJECT })).toBeVisible();
    await shot(page, '04-cliente-projetos');
    await page.close();
  });

  test('convite já usado é recusado', async () => {
    const context = await page2();
    const page = await context.newPage();
    await page.goto(ids.inviteLinkA);
    await expect(page.getByText(/não é válido ou já expirou/)).toBeVisible();
    await context.close();
  });

  test('4. equipe publica documento e entrega, depois da verificação antivírus', async () => {
    const page = await admin.newPage();
    await page.goto(`/projetos/${ids.project}`);
    const form = await disclosure(page, 'Disponibilizar documento');
    await form.getByLabel('Arquivo').setInputFiles(pdf(`Especificacao v1 ${RUN}`));
    await form.getByLabel('Título').fill(`Especificação ${RUN}`);
    await form.getByLabel('Categoria').selectOption('DESIGN');
    await form.getByLabel('Quem pode ver').selectOption('PARTICIPANTS');
    await form.getByRole('button', { name: 'Enviar documento' }).click();
    await expect(form.getByText(/depois da verificação de segurança/)).toBeVisible();

    // O antivírus real libera o arquivo: até lá, não existe link de download.
    await expect(page.getByRole('link', { name: /especificacao-v1/ })).toBeVisible({ timeout: 120_000 });

    const delivery = await disclosure(page, 'Publicar entrega');
    await delivery.getByLabel('Título').fill(DELIVERY);
    await delivery.getByLabel('Descrição desta versão').fill('Primeira versão da especificação funcional.');
    await delivery.getByLabel(`Especificação ${RUN} (v1)`).check();
    await delivery.getByRole('button', { name: 'Publicar entrega' }).click();
    await expect(page.getByRole('heading', { level: 1, name: DELIVERY })).toBeVisible();
    ids.delivery = page.url().split('/').pop();

    await confirmAction(page, page.getByRole('button', { name: 'Solicitar aprovação da versão 1' }));
    await expect(page.getByText('Aguardando a decisão do cliente.')).toBeVisible();
    await shot(page, '05-admin-entrega-aguardando');
    await page.close();
  });

  test('cliente é avisado da entrega no portal e por e-mail, sem o conteúdo', async () => {
    const page = await clientA.newPage();
    await page.goto('/');
    const bell = page.getByRole('link', { name: /^Notificações\s*\d+\s*não lida/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Notificações' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Nova entrega: ${DELIVERY}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Aprovação solicitada: ${DELIVERY} v1` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Documento disponível: Especificação ${RUN}` })).toBeVisible();
    await shot(page, '05b-cliente-notificacoes');

    // O e-mail é gravado junto com a entrega e enviado por uma tarefa: traz o título e o link, nunca a descrição.
    const mail = await latestMailFor(CLIENT_A, 'Nova entrega', { timeoutMs: 90_000 });
    expect(mail.Subject).toBe(`Portal Union Solutions: Nova entrega: ${DELIVERY}`);
    expect(mail.Text).toContain(`${BASE}/entregas/${ids.delivery}`);
    expect(mail.Text).not.toContain('Primeira versão da especificação');

    await page.getByRole('button', { name: 'Marcar todas como lidas' }).click();
    await expect(page.getByRole('button', { name: 'Marcar todas como lidas' })).toBeHidden();
    await expect(page.getByRole('link', { name: /^Notificações$/ })).toBeVisible();

    // Preferência: desligar os avisos por e-mail fica registrado e pode ser desfeito.
    await page.getByRole('button', { name: 'Desligar avisos por e-mail' }).click();
    await expect(page.getByText('Os avisos por e-mail estão desligados.')).toBeVisible();
    await page.getByRole('button', { name: 'Ligar avisos por e-mail' }).click();
    await expect(page.getByRole('button', { name: 'Desligar avisos por e-mail' })).toBeVisible();

    // Quem publicou não é avisado da própria ação.
    const staff = await admin.newPage();
    await staff.goto('/notificacoes');
    await expect(staff.getByText('Nenhuma notificação.')).toBeVisible();
    await staff.close();
    await page.close();
  });

  test('5. cliente consulta, baixa o documento e solicita ajuste', async () => {
    const page = await clientA.newPage();
    await page.goto('/');
    await expect(page.getByRole('link', { name: `${DELIVERY}, versão 1` })).toBeVisible();
    await shot(page, '06-cliente-painel-aprovacao');

    await page.goto('/documentos');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: /especificacao-v1/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.pdf');

    await page.goto(`/entregas/${ids.delivery}`);
    const section = page.locator('section', { hasText: 'Solicitar ajustes' });
    // Sem comentário o navegador não envia: o campo é obrigatório.
    await section.getByRole('button', { name: 'Solicitar ajustes' }).click();
    await expect(section.getByLabel('O que precisa mudar')).toBeFocused();
    await section.getByLabel('O que precisa mudar').fill('Faltou detalhar o fluxo de cancelamento.');
    await section.getByRole('button', { name: 'Solicitar ajustes' }).click();
    await expect(page.getByText('Faltou detalhar o fluxo de cancelamento.')).toBeVisible();
    await shot(page, '07-cliente-ajuste-solicitado');
    await page.close();

    // A decisão do cliente avisa a equipe da Union.
    const staff = await admin.newPage();
    await staff.goto('/notificacoes?filtro=nao-lidas');
    await expect(staff.getByRole('link', { name: `Ajustes solicitados: ${DELIVERY} v1` })).toBeVisible();
    await staff.close();
  });

  test('6. equipe publica nova versão, que não herda decisão', async () => {
    const page = await admin.newPage();
    await page.goto(`/entregas/${ids.delivery}`);
    const form = await disclosure(page, 'Publicar nova versão');
    await form.getByLabel('O que mudou nesta versão').fill('Fluxo de cancelamento detalhado.');
    await form.getByRole('button', { name: 'Publicar nova versão' }).click();
    await expect(page.getByRole('heading', { name: 'Versão 2' })).toBeVisible();
    await confirmAction(page, page.getByRole('button', { name: 'Solicitar aprovação da versão 2' }));
    await expect(page.getByText('Aguardando a decisão do cliente.')).toBeVisible();
    await page.close();
  });

  test('7. cliente aprova a versão exata apresentada', async () => {
    const page = await clientA.newPage();
    await page.goto(`/entregas/${ids.delivery}`);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Aprovar versão 2' }).click();
    await expect(page.getByRole('heading', { name: 'Histórico de versões' })).toBeVisible();
    const v2 = page.locator('li', { has: page.getByRole('heading', { name: 'Versão 2' }) });
    await expect(v2.getByText('Aprovada').first()).toBeVisible();
    const v1 = page.locator('li', { has: page.getByRole('heading', { name: 'Versão 1' }) });
    await expect(v1.getByText('Faltou detalhar o fluxo de cancelamento.')).toBeVisible();
    await expect(v2.getByText(/por Ana Alfa/)).toBeVisible();
    await shot(page, '08-cliente-aprovacao');
    await page.close();
  });

  test('8. cliente abre suporte e recebe resposta, sem ver a nota interna', async () => {
    const page = await clientA.newPage();
    await page.goto('/suporte');
    const form = await disclosure(page, 'Abrir solicitação');
    await form.getByLabel('Assunto').fill(TICKET);
    await form.getByLabel('Descrição').fill('Como recebemos a próxima versão?');
    await form.getByLabel('Categoria').selectOption('QUESTION');
    await form.getByRole('button', { name: 'Abrir solicitação' }).click();
    await expect(page.getByRole('heading', { level: 1, name: TICKET })).toBeVisible();
    ids.ticket = page.url().split('/').pop();

    const staff = await admin.newPage();
    await staff.goto(`/suporte/${ids.ticket}`);
    const comments = staff.locator('section', { has: staff.getByRole('heading', { name: 'Comentários' }) });
    await comments.getByLabel('Comentário', { exact: true }).fill(INTERNAL_NOTE);
    await comments.getByLabel('Nota interna').check();
    await comments.getByRole('button', { name: 'Enviar comentário' }).click();
    await expect(staff.getByText(INTERNAL_NOTE)).toBeVisible();
    await comments.getByLabel('Comentário', { exact: true }).fill('A próxima versão será publicada neste portal.');
    await comments.getByRole('button', { name: 'Enviar comentário' }).click();
    await expect(staff.getByText('A próxima versão será publicada neste portal.')).toBeVisible();
    await shot(staff, '09-equipe-suporte-com-nota');
    await staff.close();

    await page.reload();
    await expect(page.getByText('A próxima versão será publicada neste portal.')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(INTERNAL_NOTE);
    const raw = await page.request.get(`/bff/v1/tickets/${ids.ticket}`);
    expect(await raw.text()).not.toContain(INTERNAL_NOTE);
    await shot(page, '10-cliente-suporte');

    // A nota interna não gera aviso nem e-mail; a resposta pública gera um só.
    await page.goto('/notificacoes?filtro=nao-lidas');
    await expect(page.getByRole('link', { name: `Nova resposta em: ${TICKET}` })).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText(INTERNAL_NOTE);
    const notices = await page.request.get('/bff/v1/notifications?size=50');
    expect(await notices.text()).not.toContain(INTERNAL_NOTE);
    await page.close();

    const union = await admin.newPage();
    await union.goto('/notificacoes');
    await expect(union.getByRole('link', { name: `Nova solicitação: ${TICKET}` })).toBeVisible();

    // Fila de e-mails: destinatário mascarado, corpo descartado depois do envio; retenção desligada só simula.
    await union.goto('/admin/emails?situacao=SENT');
    await expect(union.getByRole('cell', { name: `Portal Union Solutions: Nova entrega: ${DELIVERY}` })).toBeVisible();
    await expect(union.locator('body')).not.toContainText(CLIENT_A);
    await shot(union, '10b-admin-fila-emails');
    await union.goto('/admin/retencao');
    await expect(union.getByRole('heading', { name: 'Desligada' })).toBeVisible();
    await expect(union.getByRole('button', { name: 'Executar agora' })).toHaveCount(0);
    await expect(union.getByRole('cell', { name: 'Solicitações encerradas', exact: true })).toBeVisible();
    await shot(union, '10c-admin-retencao-simulacao');
    await union.close();

    const forbidden = await clientA.newPage();
    for (const path of ['/admin/emails', '/admin/retencao']) {
      await forbidden.goto(path);
      await expect(forbidden).toHaveURL(`${BASE}/`);
    }
    const api = await forbidden.request.get('/bff/v1/admin/retention/simulation');
    expect(api.status()).toBe(403);
    await forbidden.close();
  });

  test('9. cliente acessa o produto contratado', async () => {
    const staff = await admin.newPage();
    await staff.goto(`/admin/organizacoes/${ids.orgA}`);
    const form = await disclosure(staff, 'Registrar produto contratado');
    await form.getByLabel('Produto', { exact: true }).fill('HookGuard');
    await form.getByLabel('Link de acesso').fill(PRODUCT_URL.replace('https://', 'http://'));
    await form.getByRole('button', { name: 'Registrar produto' }).click();
    await expect(form.getByRole('alert')).toContainText(/HTTPS/);
    await form.getByLabel('Link de acesso').fill(PRODUCT_URL);
    await form.getByLabel('Orientações de suporte').fill('Abra uma solicitação neste portal.');
    await form.getByRole('button', { name: 'Registrar produto' }).click();
    await expect(form.getByText('Produto registrado.')).toBeVisible();
    await staff.close();

    const page = await clientA.newPage();
    await clientA.route(`${new URL(PRODUCT_URL).origin}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Produto</title><h1>Produto</h1>' }));
    await page.goto('/produtos');
    await expect(page.getByText('Abra uma solicitação neste portal.')).toBeVisible();
    await shot(page, '11-cliente-produtos');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Acessar HookGuard/ }).click();
    const popup = await popupPromise;
    expect(popup.url()).toBe(PRODUCT_URL);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await page.close();
  });

  test('10. outro cliente não alcança nada do primeiro', async () => {
    const staff = await admin.newPage();
    await staff.goto('/admin/organizacoes');
    await staff.getByLabel('Nome').fill(ORG_B);
    await staff.getByRole('button', { name: 'Criar organização' }).click();
    await expect(staff.getByRole('heading', { level: 1, name: ORG_B })).toBeVisible();
    ids.orgB = staff.url().split('/').pop();
    const section = staff.locator('section', { has: staff.getByRole('heading', { name: 'Convites' }) });
    await section.getByLabel('E-mail').fill(CLIENT_B);
    await section.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(section.getByText('Convite enviado por e-mail.')).toBeVisible();
    await staff.close();

    const page = await clientB.newPage();
    const before = Date.now() - 2000;
    await page.goto(inviteLink(await latestMailFor(CLIENT_B, 'Convite')));
    await page.getByRole('button', { name: /definir minha senha/ }).click();
    await expect(page.getByText(/Enviamos um e-mail/)).toBeVisible();
    await completeAccountSetup(page, actionLink(await latestSetupMail(CLIENT_B, before)), { password: PASSWORD, firstName: 'Bia', lastName: 'Beta' });
    await login(page, CLIENT_B, PASSWORD, '/auth/invite/complete');
    await expect(page.getByRole('heading', { level: 1, name: /Olá/ })).toBeVisible();
    saveState({ clientA: CLIENT_A, clientB: CLIENT_B, password: PASSWORD, ids, orgA: ORG_A, project: PROJECT, delivery: DELIVERY, ticket: TICKET, adminEmail: ADMIN_EMAIL });

    // Pelo navegador, com IDs conhecidos.
    for (const path of [`/projetos/${ids.project}`, `/entregas/${ids.delivery}`, `/suporte/${ids.ticket}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Registro não encontrado' })).toBeVisible();
    }
    await shot(page, '12-outro-cliente-sem-acesso');

    // Pela API, com a sessão do outro cliente.
    for (const path of [`/bff/v1/projects/${ids.project}`, `/bff/v1/deliveries/${ids.delivery}`, `/bff/v1/tickets/${ids.ticket}`, `/bff/v1/organizations/${ids.orgA}`]) {
      const status = (await page.request.get(path)).status();
      expect([403, 404]).toContain(status);
    }
    const docs = await (await page.request.get('/bff/v1/documents')).json();
    expect(docs.total).toBe(0);
    const tickets = await (await page.request.get(`/bff/v1/tickets?organizationId=${ids.orgA}`)).json();
    expect(tickets.total).toBe(0);
    await page.goto('/projetos');
    await expect(page.getByText('Nenhum projeto disponível para você.')).toBeVisible();
    await page.close();
  });

  test('11. etapas editáveis, histórico de documento, filtros, histórico da solicitação, arquivamento de produto e papéis', async () => {
    // Etapa: a equipe muda a situação e o cliente vê o resultado.
    const staff = await admin.newPage();
    await staff.goto(`/projetos/${ids.project}`);
    const milestone = await disclosure(staff, 'Editar etapa: Levantamento concluído');
    await milestone.getByLabel('Situação').selectOption('IN_PROGRESS');
    await milestone.getByRole('button', { name: 'Salvar etapa' }).click();
    await expect(staff.getByText('Etapa atualizada.')).toBeVisible();
    await expect(staff.locator('li', { hasText: 'Levantamento concluído' }).locator('.badge', { hasText: 'Em andamento' })).toBeVisible();

    // Solicitação: situação alterada e responsável removido; o cliente vê o histórico, sem a nota interna.
    await staff.goto(`/suporte/${ids.ticket}`);
    const service = staff.locator('section', { has: staff.getByRole('heading', { name: 'Atendimento' }) });
    await service.getByLabel('Situação').selectOption('IN_PROGRESS');
    await service.getByRole('button', { name: 'Salvar atendimento' }).click();
    await expect(staff.getByText('Solicitação atualizada.')).toBeVisible();
    await expect(staff.getByRole('heading', { level: 1, name: TICKET })).toBeVisible();
    await shot(staff, '13-equipe-atendimento');
    await staff.close();

    const page = await clientA.newPage();
    await page.goto(`/projetos/${ids.project}`);
    await expect(page.locator('li', { hasText: 'Levantamento concluído' }).locator('.badge', { hasText: 'Em andamento' })).toBeVisible();
    await page.goto(`/suporte/${ids.ticket}`);
    const history = page.locator('section', { has: page.getByRole('heading', { name: 'Histórico' }) });
    await expect(history.getByText('Solicitação aberta')).toBeVisible();
    await expect(history.getByText('Situação: Em atendimento')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(INTERNAL_NOTE);
    await shot(page, '14-cliente-historico-solicitacao');

    // Filtros de suporte.
    await page.goto('/suporte?situacao=IN_PROGRESS');
    await expect(page.getByRole('link', { name: TICKET })).toBeVisible();
    await page.goto('/suporte?situacao=CLOSED');
    await expect(page.getByText('Nenhuma solicitação com esses filtros.')).toBeVisible();

    // Documento: histórico de versões em tela própria.
    await page.goto('/documentos');
    await page.getByRole('link', { name: `Especificação ${RUN}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: `Especificação ${RUN}` })).toBeVisible();
    await expect(page.getByText('Versão 1')).toBeVisible();
    await expect(page.getByRole('link', { name: /especificacao-v1/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gerenciar documento' })).toHaveCount(0);
    await shot(page, '15-cliente-documento-versoes');

    // Produto arquivado some para o cliente e volta ao ser reativado.
    const union = await admin.newPage();
    await union.goto(`/admin/organizacoes/${ids.orgA}`);
    const edit = await disclosure(union, 'Editar produto: HookGuard');
    await confirmAction(union, edit.getByRole('button', { name: 'Arquivar produto' }));
    await expect(union.getByRole('button', { name: 'Reativar produto' })).toBeVisible();
    await page.goto('/produtos');
    await expect(page.getByText('Nenhum produto registrado para você.')).toBeVisible();
    await union.getByRole('button', { name: 'Reativar produto' }).click();
    await expect(union.getByRole('button', { name: 'Reativar produto' })).toHaveCount(0);
    await page.goto('/produtos');
    await expect(page.getByRole('link', { name: /Acessar HookGuard/ })).toBeVisible();
    await page.close();

    // Papel: a administração rebaixa e promove a pessoa do outro cliente; a API protege o tipo de conta.
    await union.goto(`/admin/organizacoes/${ids.orgB}`);
    const person = union.locator('li', { hasText: CLIENT_B });
    await confirmAction(union, person.getByRole('button', { name: 'Tornar participante' }));
    await expect(union.locator('li', { hasText: CLIENT_B }).getByText('Participante do cliente', { exact: true })).toBeVisible();
    const other = await clientB.newPage();
    await other.goto('/organizacao');
    await expect(other).toHaveURL(`${BASE}/`);
    await other.close();
    await confirmAction(union, union.locator('li', { hasText: CLIENT_B }).getByRole('button', { name: 'Tornar administração' }));
    await expect(union.locator('li', { hasText: CLIENT_B }).getByText('Administração do cliente', { exact: true })).toBeVisible();
    const forbidden = await union.request.put(`/bff/v1/users/${encodeURIComponent((await (await union.request.get(`/bff/v1/users?organizationId=${ids.orgB}`)).json()).items[0].id)}/role`, { data: { role: 'UNION_STAFF' }, headers: { 'X-CSRF-Token': await union.evaluate(() => document.querySelector('meta[name="csrf-token"]').content), 'Content-Type': 'application/json' } });
    expect(forbidden.status()).toBe(403);
    expect((await forbidden.json()).code).toBe('FORBIDDEN');
    await shot(union, '16-admin-papeis');
    await union.close();
  });

  test('projeto, entrega e solicitação sobrevivem à reinicialização', async () => {
    await restartServices('postgres', 'backend', 'frontend');
    const page = await clientA.newPage();
    await page.goto(`/entregas/${ids.delivery}`);
    await expect(page.getByRole('heading', { level: 1, name: DELIVERY })).toBeVisible();
    await expect(page.locator('li', { has: page.getByRole('heading', { name: 'Versão 2' }) }).getByText('Aprovada').first()).toBeVisible();
    await page.goto(`/suporte/${ids.ticket}`);
    await expect(page.getByRole('heading', { level: 1, name: TICKET })).toBeVisible();
    await page.goto(`/projetos/${ids.project}`);
    await expect(page.getByRole('heading', { level: 1, name: PROJECT })).toBeVisible();
    await page.close();
  });

  test('sair encerra a sessão no portal e no provedor', async () => {
    const page = await clientB.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Você saiu do portal' })).toBeVisible();
    expect((await page.request.get('/bff/v1/me')).status()).toBe(401);
    await page.goto('/projetos');
    await expect(page.locator('#username')).toBeVisible();
    await page.close();
  });
});

async function page2() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome' });
  const context = await browser.newContext({ baseURL: BASE, locale: 'pt-BR' });
  const close = context.close.bind(context);
  context.close = async () => {
    await close();
    await browser.close();
  };
  return context;
}

/** O provedor envia o e-mail de ações separadamente do convite do portal. */
async function latestSetupMail(email, after = 0) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const list = await (await fetch(`${process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=20`)).json();
    const match = (list.messages ?? []).find((m) => !m.Subject.includes('Convite') && Date.parse(m.Created) >= after);
    if (match) return (await fetch(`${process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'}/api/v1/message/${match.ID}`)).json();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('E-mail do provedor não chegou');
}
