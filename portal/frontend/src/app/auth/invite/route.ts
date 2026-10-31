import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/lib/config';
import { cookieName, cookieOptions, seal } from '@/lib/session';

/** Guarda o convite em cookie HttpOnly durante o login. Assim o token não circula em URL depois do primeiro acesso. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== getConfig().publicUrl) return NextResponse.json({ code: 'BAD_ORIGIN', message: 'Origem não permitida.' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (typeof body?.token !== 'string' || body.token.length < 20 || body.token.length > 200) return NextResponse.json({ code: 'INVITATION_INVALID', message: 'Convite inválido.' }, { status: 400 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(cookieName('portal_invite'), await seal({ token: body.token }, 7200), cookieOptions(7200));
  return response;
}
