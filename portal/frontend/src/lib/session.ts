import { createHash, randomBytes } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { Pool } from 'pg';
import { getConfig } from './config';

/**
 * Sessão guardada no servidor. O navegador recebe só um identificador opaco, em cookie HttpOnly.
 * No banco ficam o hash do identificador, o `sub` do provedor e os tokens cifrados: uma cópia do banco não abre sessões sem o segredo.
 *
 * Criar e atualizar são operações distintas. Atualizações são condicionais: só alcançam uma sessão que ainda existe e não venceu,
 * e a troca de tokens exige a versão lida. Uma sessão encerrada nunca renasce a partir de um objeto carregado antes do logout.
 */
export interface Session {
  id: string;
  subject: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessExp: number;
  csrf: string;
  createdAt: number;
  lastActive: number;
  version: number;
}

/** Resultado de uma atualização condicional. `missing` vale para sessão encerrada, vencida ou inexistente. */
export type UpdateOutcome = 'updated' | 'conflict' | 'missing';

const COOKIE = 'portal_session';
const ID_FORMAT = /^[A-Za-z0-9_-]{43}$/;

/** Esquema do armazenamento de sessões, aplicado em ordem e sem efeito quando já presente. Passos novos entram no fim. */
const SCHEMA_STEPS = [
  `CREATE TABLE IF NOT EXISTS portal_session (
    id_hash text PRIMARY KEY,
    tokens text NOT NULL,
    access_exp bigint NOT NULL,
    created_at bigint NOT NULL,
    last_active bigint NOT NULL,
    expires_at bigint NOT NULL
  )`,
  'ALTER TABLE portal_session ADD COLUMN IF NOT EXISTS subject text',
  'ALTER TABLE portal_session ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0',
  'CREATE INDEX IF NOT EXISTS portal_session_subject_idx ON portal_session (subject)',
];

/** O armazenamento de sessões falhou. Quem chama precisa recusar o acesso, sem encerrar a sessão da pessoa. */
export class SessionStoreUnavailable extends Error {}

let pool: Pool | null = null;

function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: getConfig().sessionDbUrl, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000 });
    // Conexão ociosa perdida: a próxima consulta abre outra ou falha como SessionStoreUnavailable.
    pool.on('error', () => undefined);
  }
  return pool;
}

/** Só para testes: fecha as conexões abertas. */
export async function closeSessionStore() {
  await pool?.end();
  pool = null;
}

async function query(text: string, values: unknown[] = []) {
  try {
    return await db().query(text, values);
  } catch (error) {
    throw new SessionStoreUnavailable((error as Error).message);
  }
}

export async function prepareSessionStore() {
  for (const step of SCHEMA_STEPS) await query(step);
}

function prefix(): string {
  return getConfig().secureCookies ? '__Host-' : '';
}

export function cookieName(name: string): string {
  return `${prefix()}${name}`;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: getConfig().secureCookies, sameSite: 'lax' as const, path: '/', maxAge };
}

function key(): Uint8Array {
  return new Uint8Array(createHash('sha256').update(getConfig().sessionSecret).digest());
}

function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function seal(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime(`${ttlSeconds}s`).encrypt(key());
}

export async function unseal<T>(value: string | undefined): Promise<T | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, key());
    return payload as unknown as T;
  } catch {
    return null;
  }
}

type CookieReader = { get(name: string): { value: string } | undefined };

export const sessionCookieName = () => cookieName(COOKIE);

const now = () => Math.floor(Date.now() / 1000);

type Row = { tokens: string; subject: string | null; access_exp: string; created_at: string; last_active: string; expires_at: string; version: string };

async function toSession(id: string, row: Row): Promise<Session | null> {
  const tokens = await unseal<Pick<Session, 'accessToken' | 'refreshToken' | 'idToken' | 'csrf'>>(row.tokens);
  if (!tokens) return null;
  return {
    id,
    subject: row.subject ?? '',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    idToken: tokens.idToken,
    csrf: tokens.csrf,
    accessExp: Number(row.access_exp),
    createdAt: Number(row.created_at),
    lastActive: Number(row.last_active),
    version: Number(row.version),
  };
}

/** Sem cookie, não consulta o banco: páginas públicas não dependem dele. Prazo vencido não devolve sessão. */
export async function readSession(cookies: CookieReader): Promise<Session | null> {
  const id = cookies.get(sessionCookieName())?.value;
  if (!id || !ID_FORMAT.test(id)) return null;
  const { rows } = await query('SELECT tokens, subject, access_exp, created_at, last_active, expires_at, version FROM portal_session WHERE id_hash = $1', [hashId(id)]);
  const row = rows[0] as Row | undefined;
  if (!row) return null;
  if (Number(row.expires_at) <= now()) {
    await query('DELETE FROM portal_session WHERE id_hash = $1 AND expires_at <= $2::bigint', [hashId(id), now()]);
    return null;
  }
  return toSession(id, row);
}

function sealTokens(session: Session) {
  const { accessToken, refreshToken, idToken, csrf } = session;
  return seal({ accessToken, refreshToken, idToken, csrf }, getConfig().sessionAbsoluteSeconds);
}

/** Só no login. Um identificador novo nunca colide; se colidir, é erro, não atualização. */
export async function createSession(session: Session): Promise<void> {
  const { sessionAbsoluteSeconds, sessionIdleSeconds } = getConfig();
  const tokens = await sealTokens(session);
  await query(
    `INSERT INTO portal_session (id_hash, tokens, subject, access_exp, created_at, last_active, expires_at, version)
     VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6::bigint, LEAST($5::bigint + $7::bigint, $6::bigint + $8::bigint), 0)`,
    [hashId(session.id), tokens, session.subject, session.accessExp, session.createdAt, session.lastActive, sessionAbsoluteSeconds, sessionIdleSeconds],
  );
}

/**
 * Registra atividade. Só atinge uma sessão que existe e não venceu, e nunca faz `last_active` voltar no tempo.
 * `false` significa que a sessão não existe mais: o chamador trata como encerrada.
 */
export async function touchSession(session: Session, at: number): Promise<boolean> {
  const { sessionAbsoluteSeconds, sessionIdleSeconds } = getConfig();
  const result = await query(
    `UPDATE portal_session
       SET last_active = GREATEST(last_active, $2::bigint),
           expires_at = LEAST(created_at + $3::bigint, GREATEST(last_active, $2::bigint) + $4::bigint)
     WHERE id_hash = $1 AND expires_at > $5::bigint`,
    [hashId(session.id), at, sessionAbsoluteSeconds, sessionIdleSeconds, now()],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Troca os tokens depois de uma renovação. Exige a versão que foi lida: se outra requisição renovou antes, devolve `conflict`
 * e o chamador relê a sessão em vez de sobrescrever tokens mais novos. Sessão encerrada ou vencida devolve `missing`.
 */
export async function replaceTokens(session: Session): Promise<UpdateOutcome> {
  const { sessionAbsoluteSeconds, sessionIdleSeconds } = getConfig();
  const tokens = await sealTokens(session);
  const result = await query(
    `UPDATE portal_session
       SET tokens = $2, access_exp = $3::bigint, subject = COALESCE(NULLIF($4::text, ''), subject),
           last_active = GREATEST(last_active, $5::bigint),
           expires_at = LEAST(created_at + $6::bigint, GREATEST(last_active, $5::bigint) + $7::bigint),
           version = version + 1
     WHERE id_hash = $1 AND version = $8::bigint AND expires_at > $9::bigint`,
    [hashId(session.id), tokens, session.accessExp, session.subject, session.lastActive, sessionAbsoluteSeconds, sessionIdleSeconds, session.version, now()],
  );
  if ((result.rowCount ?? 0) > 0) return 'updated';
  const { rows } = await query('SELECT 1 FROM portal_session WHERE id_hash = $1 AND expires_at > $2::bigint', [hashId(session.id), now()]);
  return rows.length > 0 ? 'conflict' : 'missing';
}

export async function deleteSession(id: string): Promise<void> {
  await query('DELETE FROM portal_session WHERE id_hash = $1', [hashId(id)]);
}

/** Encerra todas as sessões de uma conta do provedor. Usado na recuperação de MFA e na revogação. */
export async function deleteSessionsOfSubject(subject: string): Promise<number> {
  const result = await query('DELETE FROM portal_session WHERE subject = $1', [subject]);
  return result.rowCount ?? 0;
}

export async function purgeExpiredSessions(): Promise<void> {
  await query('DELETE FROM portal_session WHERE expires_at <= $1::bigint', [now()]);
}

export function newSessionId(): string {
  return randomToken(32);
}

/** Aceita apenas caminho relativo do próprio portal. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.includes('://')) return '/';
  return value;
}
