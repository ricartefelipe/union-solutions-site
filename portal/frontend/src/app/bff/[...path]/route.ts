import { cookies, headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/lib/config';
import { readSession, SessionStoreUnavailable } from '@/lib/session';

const MAX_BODY_BYTES = 40 * 1024 * 1024;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-disposition', 'x-correlation-id', 'x-content-type-options'];
const PUBLIC_ENDPOINTS = new Set(['public/invitations/inspect', 'public/invitations/setup-access']);

function error(status: number, code: string, message: string) {
  return NextResponse.json({ code, message }, { status });
}

/** Mutações só com o token de CSRF da sessão e vindas da própria origem. */
function originAllowed(request: NextRequest) {
  const origin = request.headers.get('origin');
  return origin === null || origin === getConfig().publicUrl;
}

async function clientIp() {
  const { trustForwardedFor } = getConfig();
  if (!trustForwardedFor) return 'bff';
  const forwarded = (await headers()).get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'bff';
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some((segment) => segment === '..' || segment === '.' || segment.includes('\\') || segment === '')) return error(404, 'NOT_FOUND', 'Registro não encontrado.');
  const joined = path.join('/');
  const method = request.method;
  const mutating = method !== 'GET' && method !== 'HEAD';

  const publicCall = PUBLIC_ENDPOINTS.has(joined) && method === 'POST';
  if (!publicCall && path[0] !== 'v1') return error(404, 'NOT_FOUND', 'Registro não encontrado.');
  if (joined.startsWith('v1/public')) return error(404, 'NOT_FOUND', 'Registro não encontrado.');
  if (mutating && !originAllowed(request)) return error(403, 'BAD_ORIGIN', 'Origem não permitida.');

  const upstreamHeaders: Record<string, string> = {
    Accept: request.headers.get('accept') ?? 'application/json',
    'X-Correlation-Id': request.headers.get('x-correlation-id') ?? crypto.randomUUID(),
    'X-Portal-Client-Ip': await clientIp(),
  };
  const contentType = request.headers.get('content-type');
  if (contentType) upstreamHeaders['Content-Type'] = contentType;

  if (!publicCall) {
    let session;
    try {
      session = await readSession(await cookies());
    } catch (cause) {
      if (cause instanceof SessionStoreUnavailable) return error(503, 'UNAVAILABLE', 'O serviço está indisponível no momento. Tente novamente.');
      throw cause;
    }
    if (!session) return error(401, 'UNAUTHENTICATED', 'Sua sessão terminou. Entre novamente.');
    if (mutating && request.headers.get('x-csrf-token') !== session.csrf) return error(403, 'CSRF', 'Recarregue a página e tente novamente.');
    upstreamHeaders.Authorization = `Bearer ${session.accessToken}`;
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return error(413, 'TOO_LARGE', 'O envio excede o limite permitido.');

  const target = `${getConfig().apiUrl}/${publicCall ? 'v1/' : ''}${joined}${request.nextUrl.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: upstreamHeaders,
      body: mutating ? request.body : undefined,
      duplex: mutating ? 'half' : undefined,
      cache: 'no-store',
      redirect: 'error',
    } as RequestInit);
  } catch {
    return error(502, 'UPSTREAM', 'O serviço está indisponível no momento. Tente novamente.');
  }

  const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
