import { PublicCard } from '@/components/public-card';

export default function NotFound() {
  return (
    <PublicCard title="Página não encontrada">
      <p className="muted">O endereço pode ter mudado ou estar incorreto.</p>
      <div className="public__actions">
        <a className="btn" href="/">Ir para o portal</a>
      </div>
    </PublicCard>
  );
}
