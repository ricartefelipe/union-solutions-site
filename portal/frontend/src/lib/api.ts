import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getConfig } from './config';
import { readSession, type Session } from './session';
import type { Me } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public correlationId?: string) {
    super(message);
  }
}

export const currentSession = cache(async (): Promise<Session | null> => readSession(await cookies()));

/** Leitura no servidor, com o token da sessão. 401 volta ao login; a autorização é sempre da API. */
export async function apiGet<T>(path: string): Promise<T> {
  const session = await currentSession();
  if (!session) redirect('/auth/login');
  const correlationId = (await headers()).get('x-correlation-id') ?? crypto.randomUUID();
  const response = await fetch(`${getConfig().apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json', 'X-Correlation-Id': correlationId },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string; correlationId?: string };
  if (response.status === 401) redirect('/auth/login');
  if (response.status === 403 && body.code === 'NO_ACCESS') redirect('/sem-acesso');
  if (response.status === 404) notFound();
  throw new ApiError(response.status, body.code ?? 'ERROR', body.message ?? 'Não foi possível carregar os dados.', body.correlationId);
}

/** Para dados complementares: sem permissão, a tela segue sem eles. */
export async function apiGetOptional<T>(path: string, fallback: T): Promise<T> {
  const session = await currentSession();
  if (!session) return fallback;
  const response = await fetch(`${getConfig().apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  return response.ok ? ((await response.json()) as T) : fallback;
}

export const getMe = cache(async (): Promise<Me> => apiGet<Me>('/v1/me'));

export function pageQuery(searchParams: Record<string, string | string[] | undefined>, extra: Record<string, string | undefined> = {}) {
  const page = Number(searchParams.pagina ?? 0);
  const params = new URLSearchParams({ page: String(Number.isFinite(page) && page > 0 ? Math.floor(page) : 0) });
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}
