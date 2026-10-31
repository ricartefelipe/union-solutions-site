import Link from '@/components/link';

export default function NotFound() {
  return (
    <div className="section">
      <h1>Registro não encontrado</h1>
      <p className="muted" style={{ marginBlock: '.5rem 1rem' }}>O registro não existe ou não está disponível para a sua conta.</p>
      <Link className="btn" href="/">Voltar ao painel</Link>
    </div>
  );
}
