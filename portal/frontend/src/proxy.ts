import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/lib/config';
import { ProviderUnavailable, refreshSession } from '@/lib/oidc';
import { cookieOptions, deleteSession, readSession, saveSession, sessionCookieName, SessionStoreUnavailable, type Session } from '@/lib/session';

const PUBLIC_PREFIXES = ['/auth/', '/convite', '/sessao-encerrada', '/bff/public/', '/robots.txt', '/healthz'];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix));
}

function contentSecurityPolicy(nonce: string) {
  const { issuer, production } = getConfig();
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${new URL(issuer).origin}`,
    "frame-ancestors 'none'",
  ];
  if (production) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

function unavailable(pathname: string) {
  const headers = { 'Cache-Control': 'no-store', 'Retry-After': '30' };
  if (pathname.startsWith('/bff/')) return NextResponse.json({ code: 'UNAVAILABLE', message: 'O serviço está indisponível no momento. Tente novamente.' }, { status: 503, headers });
  return new NextResponse('O portal está temporariamente indisponível. Tente novamente em instantes.', { status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const config = getConfig();
  const nonce = randomBytes(16).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const correlationId = crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-correlation-id', correlationId);

  const now = Math.floor(Date.now() / 1000);
  let session: Session | null = null;
  const hadCookie = request.cookies.has(sessionCookieName());

  // Sem o armazenamento de sessões ou sem provedor para renovar um token vencido, o acesso é recusado e a sessão continua guardada.
  try {
    session = await readSession(request.cookies);
    if (session) {
      if (session.accessExp - now < 30) {
        try {
          session = await refreshSession(session);
          await saveSession(session);
        } catch (cause) {
          if (cause instanceof SessionStoreUnavailable) throw cause;
          if (!(cause instanceof ProviderUnavailable)) {
            // Conta desativada ou sessão encerrada no provedor: exige novo login.
            await deleteSession(session.id);
            session = null;
          } else if (session.accessExp <= now) {
            return unavailable(pathname);
          }
        }
      } else if (now - session.lastActive > 60) {
        session = { ...session, lastActive: now };
        await saveSession(session);
      }
    }
  } catch (cause) {
    if (cause instanceof SessionStoreUnavailable) {
      if (isPublic(pathname) && !hadCookie) session = null;
      else return unavailable(pathname);
    } else {
      throw cause;
    }
  }

  let response: NextResponse;
  if (!session && !isPublic(pathname) && !pathname.startsWith('/bff/')) {
    const login = new URL('/auth/login', config.publicUrl);
    login.searchParams.set('returnTo', `${pathname}${search}`);
    response = NextResponse.redirect(login, 303);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (hadCookie && !session) response.cookies.set(sessionCookieName(), '', cookieOptions(0));

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Correlation-Id', correlationId);
  if (config.production) response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|brand/|favicon|healthz).*)'],
};
