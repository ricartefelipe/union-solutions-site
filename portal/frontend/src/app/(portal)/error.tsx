'use client';

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="section" role="alert">
      <h1>Não foi possível carregar esta página</h1>
      <p className="muted" style={{ marginBlock: '.5rem 1rem' }}>Tente novamente em instantes. Se o problema continuar, abra uma solicitação de suporte.</p>
      {error.digest && <p className="meta">Código para o suporte: {error.digest}</p>}
      <button className="btn" type="button" onClick={reset} style={{ marginTop: '1rem' }}>Tentar novamente</button>
    </div>
  );
}
