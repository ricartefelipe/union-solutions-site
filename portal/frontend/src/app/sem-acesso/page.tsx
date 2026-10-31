import type { Metadata } from 'next';
import { currentSession } from '@/lib/api';
import { PublicCard } from '@/components/public-card';

export const metadata: Metadata = { title: 'Sem acesso' };

export default async function NoAccess() {
  const session = await currentSession();
  return (
    <PublicCard title="Sua conta não tem acesso ao portal">
      <p className="muted">O acesso ao portal é feito por convite. Se você recebeu um convite, abra o link enviado por e-mail. Se o seu acesso foi revogado, fale com quem administra sua organização.</p>
      {session && (
        <form method="post" action="/auth/logout" className="public__actions">
          <input type="hidden" name="csrf" value={session.csrf} />
          <button className="btn btn--ghost" type="submit">Sair</button>
        </form>
      )}
    </PublicCard>
  );
}
