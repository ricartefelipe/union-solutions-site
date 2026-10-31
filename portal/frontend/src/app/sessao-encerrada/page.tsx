import type { Metadata } from 'next';
import { PublicCard } from '@/components/public-card';

export const metadata: Metadata = { title: 'Sessão encerrada' };

export default async function SessionEnded({ searchParams }: { searchParams: Promise<{ falha?: string; provedor?: string }> }) {
  const { falha, provedor } = await searchParams;
  return (
    <PublicCard title={falha ? 'Não foi possível entrar' : 'Você saiu do portal'}>
      <p className="muted">{falha ? 'Tente entrar novamente. Se o problema continuar, fale com quem administra sua conta.' : 'Sua sessão foi encerrada.'}</p>
      {!falha && provedor && (
        <p className="muted">O serviço de login não confirmou o encerramento. Em computador compartilhado, feche todas as janelas do navegador.</p>
      )}
      <div className="public__actions">
        <a className="btn" href="/auth/login">Entrar</a>
      </div>
    </PublicCard>
  );
}
