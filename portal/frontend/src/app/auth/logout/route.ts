import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/lib/config';
import { endSessionUrl, revokeAtProvider } from '@/lib/oidc';
import { cookieOptions, deleteSession, readSession, sessionCookieName } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { publicUrl } = getConfig();
  const session = await readSession(await cookies());
  const form = await request.formData().catch(() => null);
  const origin = request.headers.get('origin');
  if (!session) return NextResponse.redirect(new URL('/sessao-encerrada', publicUrl), 303);
  if ((origin !== null && origin !== publicUrl) || form?.get('csrf') !== session.csrf) {
    return NextResponse.json({ code: 'CSRF', message: 'Recarregue a página e tente novamente.' }, { status: 403 });
  }
  // Revogação confirmada: nada mais a fazer. Recusada: o navegador passa pelo logout público. Provedor fora do ar: a sessão do portal
  // termina do mesmo modo e a tela avisa que o provedor não confirmou.
  await deleteSession(session.id);
  const outcome = await revokeAtProvider(session);
  const target = outcome === 'rejected' ? endSessionUrl(session.idToken) : new URL(outcome === 'revoked' ? '/sessao-encerrada' : '/sessao-encerrada?provedor=indisponivel', publicUrl);
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(sessionCookieName(), '', cookieOptions(0));
  return response;
}
