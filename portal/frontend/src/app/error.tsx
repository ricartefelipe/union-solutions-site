'use client';

/** Erro ao montar a estrutura do portal, como a falha ao identificar o usuário. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="public">
      <div className="public__card" role="alert">
        <h1>Não foi possível abrir o portal</h1>
        <p className="muted">Tente novamente em instantes. Se o problema continuar, fale com o seu contato na Union Solutions.</p>
        {error.digest && <p className="meta" style={{ marginTop: '.5rem' }}>Código para o suporte: {error.digest}</p>}
        <div className="public__actions">
          <button className="btn" type="button" onClick={reset}>Tentar novamente</button>
        </div>
      </div>
    </main>
  );
}
