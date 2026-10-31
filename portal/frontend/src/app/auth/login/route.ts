import { NextResponse, type NextRequest } from 'next/server';
import { authorizationUrl, newPendingLogin } from '@/lib/oidc';
import { cookieName, cookieOptions, safeReturnTo, seal } from '@/lib/session';

export async function GET(request: NextRequest) {
  const pending = newPendingLogin(safeReturnTo(request.nextUrl.searchParams.get('returnTo')));
  const response = NextResponse.redirect(authorizationUrl(pending), 303);
  response.cookies.set(cookieName('portal_login'), await seal({ ...pending }, 600), cookieOptions(600));
  return response;
}
