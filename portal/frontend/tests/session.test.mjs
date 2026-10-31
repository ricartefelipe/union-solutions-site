// Regressões de sessão contra PostgreSQL real, com barreiras determinísticas: cada cenário é uma sequência de awaits, sem sleeps.
// Uso: sh tests/run-session-tests.sh (sobe um PostgreSQL descartável e compila src/lib).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const lib = await import(process.env.SESSION_LIB ?? '../.test-build/lib/session.js');
const { closeSessionStore, createSession, deleteSession, deleteSessionsOfSubject, newSessionId, prepareSessionStore, rawQuery, readSession, replaceTokens, SessionStoreUnavailable, sessionCookieName, touchSession } = lib;

const cookies = (id) => ({ get: (name) => (name === sessionCookieName() ? { value: id } : undefined) });
const now = () => Math.floor(Date.now() / 1000);

function fresh(overrides = {}) {
  const t = now();
  return { id: newSessionId(), subject: 'sub-' + Math.random().toString(36).slice(2), accessToken: 'a1', refreshToken: 'r1', idToken: 'i1', accessExp: t + 300, csrf: 'c', createdAt: t, lastActive: t, version: 0, ...overrides };
}

before(async () => { await prepareSessionStore(); });
after(async () => { await closeSessionStore(); });

test('toque depois do logout não recria a sessão', async () => {
  const s = fresh();
  await createSession(s);
  const a = await readSession(cookies(s.id));            // A lê
  await deleteSession(s.id);                              // B encerra
  assert.equal(await readSession(cookies(s.id)), null);   // B confirma
  assert.equal(await touchSession(a, now() + 120), false); // A tenta registrar atividade
  assert.equal(await readSession(cookies(s.id)), null, 'sessão continua ausente');
});

test('renovação em voo depois do logout não recria a sessão', async () => {
  const s = fresh();
  await createSession(s);
  const a = await readSession(cookies(s.id));
  await deleteSession(s.id);
  const renewed = { ...a, accessToken: 'a2', refreshToken: 'r2', accessExp: now() + 300, lastActive: now() };
  assert.equal(await replaceTokens(renewed), 'missing');
  assert.equal(await readSession(cookies(s.id)), null);
});

test('duas renovações concorrentes: a segunda não sobrescreve a mais nova', async () => {
  const s = fresh();
  await createSession(s);
  const a = await readSession(cookies(s.id));
  const b = await readSession(cookies(s.id));
  assert.equal(await replaceTokens({ ...a, accessToken: 'a-primeira', refreshToken: 'r-primeira', lastActive: now() }), 'updated');
  assert.equal(await replaceTokens({ ...b, accessToken: 'a-segunda', refreshToken: 'r-segunda', lastActive: now() }), 'conflict');
  const current = await readSession(cookies(s.id));
  assert.equal(current.accessToken, 'a-primeira');
  assert.equal(current.version, 1);
  // Quem perdeu relê e segue com a versão vigente.
  assert.equal(await replaceTokens({ ...current, accessToken: 'a-terceira', lastActive: now() }), 'updated');
});

test('renovação não reativa sessão vencida', async () => {
  const s = fresh({ createdAt: now() - 100000, lastActive: now() - 100000 });
  await createSession(s);
  assert.equal(await replaceTokens({ ...s, accessToken: 'x', lastActive: now() }), 'missing');
  assert.equal(await touchSession(s, now()), false);
  assert.equal(await readSession(cookies(s.id)), null);
});

test('atividade não regride', async () => {
  const s = fresh();
  await createSession(s);
  assert.equal(await touchSession(s, s.lastActive + 500), true);
  assert.equal(await touchSession(s, s.lastActive + 100), true);
  const current = await readSession(cookies(s.id));
  assert.equal(current.lastActive, s.lastActive + 500);
});

test('cookie copiado não volta depois do cenário concorrente; novo login recebe outra sessão', async () => {
  const s = fresh();
  await createSession(s);
  const a = await readSession(cookies(s.id));
  await deleteSession(s.id);
  assert.equal(await replaceTokens({ ...a, accessToken: 'z', lastActive: now() }), 'missing');
  assert.equal(await touchSession(a, now()), false);
  assert.equal(await readSession(cookies(s.id)), null, 'cópia do cookie não abre');
  const n = fresh({ subject: s.subject });
  await createSession(n);
  assert.notEqual(n.id, s.id);
  const current = await readSession(cookies(n.id));
  assert.equal(current.subject, s.subject);
  assert.equal(await readSession(cookies(s.id)), null);
});

test('criar com o mesmo identificador é erro, não atualização', async () => {
  const s = fresh();
  await createSession(s);
  await assert.rejects(createSession({ ...s, accessToken: 'outro' }));
  assert.equal((await readSession(cookies(s.id))).accessToken, 'a1');
});

test('encerrar por conta do provedor apaga todas as sessões dela, inclusive a renovação em voo', async () => {
  const subject = 'sub-conta-' + Math.random().toString(36).slice(2);
  const s1 = fresh({ subject });
  const s2 = fresh({ subject });
  await createSession(s1);
  await createSession(s2);
  const inFlight = await readSession(cookies(s1.id));
  assert.equal(await deleteSessionsOfSubject(subject), 2);
  assert.equal(await replaceTokens({ ...inFlight, accessToken: 'n', lastActive: now() }), 'missing');
  assert.equal(await readSession(cookies(s1.id)), null);
  assert.equal(await readSession(cookies(s2.id)), null);
});

// ---------- Transição: sessões de versões anteriores, sem vínculo com a conta do provedor ----------

const sha = async (id) => (await import('node:crypto')).createHash('sha256').update(id).digest('hex');

/** Linha como a versão anterior gravava: sem `subject` e sem `version`. */
async function legacyRow(id, subject = null) {
  const t = now();
  await rawQuery(
    `INSERT INTO portal_session (id_hash, tokens, access_exp, created_at, last_active, expires_at, subject, version)
     SELECT $1, tokens, $2::bigint, $3::bigint, $3::bigint, $4::bigint, $5, 0 FROM portal_session WHERE subject IS NOT NULL LIMIT 1`,
    [await sha(id), t + 300, t, t + 3600, subject],
  );
}

test('transição: a sessão legada sem vínculo é encerrada, mesmo ainda válida', async () => {
  const seed = fresh();
  await createSession(seed); // fornece tokens cifrados válidos para a linha legada
  const legacy = newSessionId();
  await legacyRow(legacy);
  // Antes da transição a linha existe e não venceu.
  assert.equal((await rawQuery('SELECT count(*) FROM portal_session WHERE id_hash = $1 AND expires_at > $2::bigint', [await sha(legacy), now()])).rows[0].count, '1');
  await prepareSessionStore();
  assert.equal((await rawQuery('SELECT count(*) FROM portal_session WHERE id_hash = $1', [await sha(legacy)])).rows[0].count, '0', 'apagada na transição');
  assert.equal(await readSession(cookies(legacy)), null, 'uso depois da transição exige login');
  assert.ok(await readSession(cookies(seed.id)), 'sessão com vínculo preservada');
});

test('transição: recuperação de MFA antes da primeira renovação não deixa sessão legada utilizável', async () => {
  const seed = fresh();
  await createSession(seed);
  const legacy = newSessionId();
  await legacyRow(legacy);
  // A recuperação só alcança sessões com vínculo; a legada precisa ter deixado de valer por outro caminho.
  await deleteSessionsOfSubject(seed.subject);
  assert.equal(await readSession(cookies(legacy)), null, 'linha sem vínculo é recusada e apagada na leitura');
  assert.equal((await rawQuery('SELECT count(*) FROM portal_session WHERE id_hash = $1', [await sha(legacy)])).rows[0].count, '0');
});

test('transição: renovação iniciada antes e concluída depois não reativa a sessão legada', async () => {
  const seed = fresh();
  await createSession(seed);
  const legacy = newSessionId();
  await legacyRow(legacy);
  // Objeto de sessão carregado pela versão anterior (sem sub), com a renovação em voo.
  const inFlight = { ...seed, id: legacy, subject: '', version: 0, accessToken: 'renovado', lastActive: now() };
  await prepareSessionStore(); // transição acontece no meio
  assert.equal(await replaceTokens(inFlight), 'missing');
  assert.equal(await touchSession(inFlight, now()), false);
  assert.equal(await readSession(cookies(legacy)), null);
  // Nem mesmo uma renovação que tente gravar o vínculo recria a sessão.
  assert.equal(await replaceTokens({ ...inFlight, subject: seed.subject }), 'missing');
});

test('transição: idempotente em reinícios e inicializações concorrentes; sessões com vínculo preservadas', async () => {
  const a = fresh();
  const b = fresh();
  await createSession(a);
  await createSession(b);
  const legacy = newSessionId();
  await legacyRow(legacy);
  await Promise.all([prepareSessionStore(), prepareSessionStore(), prepareSessionStore()]);
  await prepareSessionStore();
  assert.ok(await readSession(cookies(a.id)));
  assert.ok(await readSession(cookies(b.id)));
  assert.equal(await readSession(cookies(legacy)), null);
  assert.equal(await touchSession(a, now() + 10), true, 'sessão preservada continua operando');
});

test('criar sessão sem vínculo é erro', async () => {
  await assert.rejects(createSession(fresh({ subject: '' })));
});

test('falha do banco é SessionStoreUnavailable, não ausência de sessão, e a sessão sobrevive', async () => {
  const { execSync } = await import('node:child_process');
  const container = process.env.SESSION_TEST_CONTAINER;
  const s = fresh();
  await createSession(s);
  execSync(`docker stop -t 1 ${container}`, { stdio: 'ignore' });
  try {
    await assert.rejects(readSession(cookies(s.id)), (e) => e instanceof SessionStoreUnavailable);
    await assert.rejects(touchSession(s, now()), (e) => e instanceof SessionStoreUnavailable);
    await assert.rejects(replaceTokens({ ...s, accessToken: 'n' }), (e) => e instanceof SessionStoreUnavailable);
  } finally {
    execSync(`docker start ${container}`, { stdio: 'ignore' });
    for (let i = 0; i < 60; i += 1) {
      try { execSync(`docker exec ${container} pg_isready -U postgres -d sessao`, { stdio: 'ignore' }); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
    }
  }
  const back = await readSession(cookies(s.id));
  assert.equal(back?.accessToken, 'a1', 'erro transitório não encerrou a sessão');
});
