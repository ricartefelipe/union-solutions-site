import { createHash } from 'node:crypto';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import { getConfig } from './config';
import type { Session } from './session';
import { newSessionId, randomToken } from './session';

/**
 * Authorization Code com PKCE. O navegador só vê o endereço público do provedor. As chamadas com segredo
 * saem do servidor, pelo endereço interno.
 */

export interface PendingLogin {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
}

function endpoints() {
  const { issuer, oidcInternalUrl } = getConfig();
  return {
    authorize: `${issuer}/protocol/openid-connect/auth`,
    endSession: `${issuer}/protocol/openid-connect/logout`,
    token: `${oidcInternalUrl}/protocol/openid-connect/token`,
    logout: `${oidcInternalUrl}/protocol/openid-connect/logout`,
    jwks: `${oidcInternalUrl}/protocol/openid-connect/certs`,
  };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keySet() {
  jwks ??= createRemoteJWKSet(new URL(endpoints().jwks));
  return jwks;
}

export function newPendingLogin(returnTo: string): PendingLogin {
  return { state: randomToken(), nonce: randomToken(), verifier: randomToken(48), returnTo };
}

export function authorizationUrl(pending: PendingLogin): string {
  const { publicUrl, clientId } = getConfig();
  const url = new URL(endpoints().authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${publicUrl}/auth/callback`);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', pending.state);
  url.searchParams.set('nonce', pending.nonce);
  url.searchParams.set('code_challenge', createHash('sha256').update(pending.verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/** O provedor não respondeu ou falhou. Não indica que a sessão ou a conta seja inválida. */
export class ProviderUnavailable extends Error {}

const RETRY_DELAYS_MS = [300, 1000];

/** Depois de reiniciar o banco, o provedor pode falhar por instantes. Repete só em falha do servidor ou da rede. */
async function callProvider(url: string, params: Record<string, string>, timeoutMs: number): Promise<Response> {
  const { clientId, clientSecret } = getConfig();
  let attempt = 0;
  for (;;) {
    let unavailable: string;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
      if (response.status < 500) return response;
      unavailable = `Provedor respondeu ${response.status}`;
    } catch (error) {
      unavailable = (error as Error).name;
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw new ProviderUnavailable(unavailable);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    attempt += 1;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await callProvider(endpoints().token, params, 10000);
  if (!response.ok) throw new Error(`Provedor recusou o token: ${response.status}`);
  return (await response.json()) as TokenResponse;
}

function buildSession(tokens: TokenResponse, previous?: Session): Session {
  const now = Math.floor(Date.now() / 1000);
  const subject = tokens.id_token ? (decodeJwt(tokens.id_token).sub ?? '') : '';
  return {
    id: previous?.id ?? newSessionId(),
    subject: subject || previous?.subject || '',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token ?? previous?.idToken ?? '',
    accessExp: decodeJwt(tokens.access_token).exp ?? now,
    csrf: previous?.csrf ?? randomToken(),
    createdAt: previous?.createdAt ?? now,
    lastActive: now,
    version: previous?.version ?? 0,
  };
}

export async function completeLogin(code: string, pending: PendingLogin): Promise<Session> {
  const { publicUrl, issuer, clientId } = getConfig();
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: `${publicUrl}/auth/callback`, code_verifier: pending.verifier });
  if (!tokens.id_token) throw new Error('Provedor não retornou id_token.');
  const { payload } = await jwtVerify(tokens.id_token, keySet(), { issuer, audience: clientId });
  if (payload.nonce !== pending.nonce) throw new Error('Nonce inválido.');
  return buildSession(tokens);
}

export async function refreshSession(session: Session): Promise<Session> {
  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refreshToken });
  return buildSession(tokens, session);
}

/** `unavailable` indica provedor fora do ar: o logout público também falharia e mostraria um erro ao usuário. */
export type ProviderLogout = 'revoked' | 'rejected' | 'unavailable';

/** Encerra a sessão no provedor pelo servidor. Só `revoked` é confirmação de encerramento. */
export async function revokeAtProvider(session: Session): Promise<ProviderLogout> {
  try {
    const response = await callProvider(endpoints().logout, { refresh_token: session.refreshToken }, 5000);
    return response.ok ? 'revoked' : 'rejected';
  } catch {
    return 'unavailable';
  }
}

export function endSessionUrl(idToken: string | undefined): string {
  const { publicUrl, clientId } = getConfig();
  const url = new URL(endpoints().endSession);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('post_logout_redirect_uri', `${publicUrl}/sessao-encerrada`);
  if (idToken) url.searchParams.set('id_token_hint', idToken);
  return url.toString();
}
