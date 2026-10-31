import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/lib/config';
import { completeLogin, type PendingLogin } from '@/lib/oidc';
import { cookieName, cookieOptions, createSession, deleteSession, purgeExpiredSessions, readSession, safeReturnTo, sessionCookieName, unseal } from '@/lib/session';

export async function GET(request: NextRequest) {
  const { publicUrl } = getConfig();
  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const pending = await unseal<PendingLogin>(store.get(cookieName('portal_login'))?.value);

  const fail = () => {
    const response = NextResponse.redirect(new URL('/sessao-encerrada?falha=1', publicUrl), 303);
    response.cookies.set(cookieName('portal_login'), '', cookieOptions(0));
    return response;
  };

  const code = params.get('code');
  if (!pending || !code || params.get('state') !== pending.state) return fail();

  try {
    const session = await completeLogin(code, pending);
    // Cada login recebe um identificador novo: nenhum identificador anterior continua valendo.
    const previous = await readSession(store);
    if (previous) await deleteSession(previous.id);
    await createSession(session);
    await purgeExpiredSessions();
    const response = NextResponse.redirect(new URL(safeReturnTo(pending.returnTo), publicUrl), 303);
    response.cookies.set(cookieName('portal_login'), '', cookieOptions(0));
    response.cookies.set(sessionCookieName(), session.id, cookieOptions(getConfig().sessionAbsoluteSeconds));
    return response;
  } catch {
    return fail();
  }
}
