import { createHash, randomBytes } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { Pool } from 'pg';
import { getConfig } from './config';

/**
 * Sessão guardada no servidor. O navegador recebe só um identificador opaco, em cookie HttpOnly.
 * No banco ficam o hash do identificador e os tokens cifrados: uma cópia do banco não abre sessões sem o segredo.
 * Encerrar a sessão apaga o registro, e o cookie deixa de valer na mesma hora.
 */
export interface Session {
  id: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  accessExp: number;
  csrf: string;
  createdAt: number;
  lastActive: number;
}

const COOKIE = 'portal_session';
const ID_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const SCHEMA = `CREATE TABLE IF NOT EXISTS portal_session (
  id_hash text PRIMARY KEY,
  tokens text NOT NULL,
  access_exp bigint NOT NULL,
  created_at bigint NOT NULL,
  last_active bigint NOT NULL,
  expires_at bigint NOT NULL
)`;

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

async function query(text: string, values: unknown[] = []) {
  try {
    return await db().query(text, values);
  } catch (error) {
    throw new SessionStoreUnavailable((error as Error).message);
  }
}

export async function prepareSessionStore() {
  await query(SCHEMA);
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

function expiresAt(createdAt: number, lastActive: number) {
  const { sessionAbsoluteSeconds, sessionIdleSeconds } = getConfig();
  return Math.min(createdAt + sessionAbsoluteSeconds, lastActive + sessionIdleSeconds);
}

/** Sem cookie, não consulta o banco: páginas públicas não dependem dele. Prazo vencido não devolve sessão. */
export async function readSession(cookies: CookieReader): Promise<Session | null> {
  const id = cookies.get(sessionCookieName())?.value;
  if (!id || !ID_FORMAT.test(id)) return null;
  const { rows } = await query('SELECT tokens, access_exp, created_at, last_active, expires_at FROM portal_session WHERE id_hash = $1', [hashId(id)]);
  const row = rows[0] as { tokens: string; access_exp: string; created_at: string; last_active: string; expires_at: string } | undefined;
  if (!row) return null;
  if (Number(row.expires_at) <= Math.floor(Date.now() / 1000)) {
    await query('DELETE FROM portal_session WHERE id_hash = $1', [hashId(id)]);
    return null;
  }
  const tokens = await unseal<Pick<Session, 'accessToken' | 'refreshToken' | 'idToken' | 'csrf'>>(row.tokens);
  if (!tokens) return null;
  return { id, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, idToken: tokens.idToken, csrf: tokens.csrf, accessExp: Number(row.access_exp), createdAt: Number(row.created_at), lastActive: Number(row.last_active) };
}

export async function saveSession(session: Session): Promise<void> {
  const { accessToken, refreshToken, idToken, csrf } = session;
  const tokens = await seal({ accessToken, refreshToken, idToken, csrf }, getConfig().sessionAbsoluteSeconds);
  await query(
    `INSERT INTO portal_session (id_hash, tokens, access_exp, created_at, last_active, expires_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id_hash) DO UPDATE SET tokens = $2, access_exp = $3, last_active = $5, expires_at = $6`,
    [hashId(session.id), tokens, session.accessExp, session.createdAt, session.lastActive, expiresAt(session.createdAt, session.lastActive)],
  );
}

export async function deleteSession(id: string): Promise<void> {
  await query('DELETE FROM portal_session WHERE id_hash = $1', [hashId(id)]);
}

export async function purgeExpiredSessions(): Promise<void> {
  await query('DELETE FROM portal_session WHERE expires_at <= $1', [Math.floor(Date.now() / 1000)]);
}

export function newSessionId(): string {
  return randomToken(32);
}

/** Aceita apenas caminho relativo do próprio portal. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.includes('://')) return '/';
  return value;
}
