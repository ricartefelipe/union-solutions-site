import type { Metadata } from 'next';
import { PublicCard } from '@/components/public-card';

export const metadata: Metadata = { title: 'Convite não aceito' };

export default function InvitationNotAccepted() {
  return (
    <PublicCard title="Não foi possível aceitar o convite">
      <p className="muted">O convite pode ter expirado, já ter sido usado ou pertencer a outro endereço de e-mail. Entre com a conta do endereço convidado ou peça um novo convite.</p>
      <div className="public__actions">
        <a className="btn btn--ghost" href="/auth/login">Entrar com outra conta</a>
      </div>
    </PublicCard>
  );
}
