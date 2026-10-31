// Regressões de sessão contra PostgreSQL real, com barreiras determinísticas: cada cenário é uma sequência de awaits, sem sleeps.
// Uso: sh tests/run-session-tests.sh (sobe um PostgreSQL descartável e compila src/lib).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

const lib = await import(process.env.SESSION_LIB ?? '../.test-build/lib/session.js');
const { closeSessionStore, createSession, deleteSession, deleteSessionsOfSubject, newSessionId, prepareSessionStore, readSession, replaceTokens, SessionStoreUnavailable, sessionCookieName, touchSession } = lib;

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
