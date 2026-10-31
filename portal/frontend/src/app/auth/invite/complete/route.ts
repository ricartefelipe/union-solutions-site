import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';
import { cookieName, cookieOptions, readSession, unseal } from '@/lib/session';

/** Depois do login, conclui o convite guardado. Destinatário e organização são conferidos pela API. */
export async function GET() {
  const { publicUrl, apiUrl } = getConfig();
  const store = await cookies();
  const session = await readSession(store);
  if (!session) return NextResponse.redirect(new URL('/auth/login?returnTo=/auth/invite/complete', publicUrl), 303);

  const invite = await unseal<{ token: string }>(store.get(cookieName('portal_invite'))?.value);
  if (!invite) return NextResponse.redirect(new URL('/', publicUrl), 303);

  let accepted = false;
  try {
    const response = await fetch(`${apiUrl}/v1/invitations/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: invite.token }),
      cache: 'no-store',
    });
    accepted = response.ok;
  } catch {
    accepted = false;
  }
  const target = accepted ? '/' : '/convite/nao-aceito';
  const response = NextResponse.redirect(new URL(target, publicUrl), 303);
  response.cookies.set(cookieName('portal_invite'), '', cookieOptions(0));
  return response;
}
