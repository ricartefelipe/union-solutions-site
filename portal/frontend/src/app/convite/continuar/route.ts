import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

/** Destino depois de definir a senha no provedor: entra e conclui o convite guardado. */
export async function GET() {
  return NextResponse.redirect(new URL('/auth/login?returnTo=/auth/invite/complete', getConfig().publicUrl), 303);
}
