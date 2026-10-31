'use client';

import { useEffect, useState } from 'react';

const ROLE_TEXT: Record<string, string> = {
  UNION_ADMIN: 'administração da Union Solutions',
  UNION_STAFF: 'equipe da Union Solutions',
  CLIENT_ADMIN: 'administração da organização',
  CLIENT_MEMBER: 'participante da organização',
};

interface Preview { organizationName: string; role: string; emailHint: string; expiresAt: string }

/** O token vem no fragmento da URL: não chega a servidores nem a logs, e é retirado da barra de endereços. */
export function InvitationFlow() {
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'sent' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const match = window.location.hash.match(/^#t=([A-Za-z0-9_-]+)$/);
    if (!match) {
      setState('invalid');
      return;
    }
    const value = match[1];
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value);
    (async () => {
      const response = await fetch('/bff/public/invitations/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) }).catch(() => null);
      if (response?.ok) {
        setPreview((await response.json()) as Preview);
        // Guardado em cookie HttpOnly: sobrevive à ida ao provedor de identidade sem ficar em URL.
        await fetch('/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) });
        setState('ready');
      } else {
        setState(response ? 'invalid' : 'error');
      }
    })();
  }, []);

  async function requestPassword() {
    if (!token || busy) return;
    setBusy(true);
    const response = await fetch('/bff/public/invitations/setup-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null);
    setBusy(false);
    setState(response?.ok ? 'sent' : 'error');
  }

  if (state === 'loading') return <p role="status" className="muted">Verificando o convite…</p>;
  if (state === 'invalid') {
    return <div className="alert alert--error" role="alert">Este convite não é válido ou já expirou. Peça um novo convite a quem enviou.</div>;
  }
  if (state === 'error') {
    return <div className="alert alert--error" role="alert">Não foi possível concluir agora. Abra o link do convite novamente em alguns minutos.</div>;
  }
  if (state === 'sent') {
    return (
      <div className="alert alert--success" role="status">
        Enviamos um e-mail para definir sua senha. Siga as instruções e, ao final, entre no portal para concluir o convite.
      </div>
    );
  }
  return (
    <>
      <p>Você recebeu um convite para o portal como <strong>{ROLE_TEXT[preview!.role] ?? 'participante'}</strong> de <strong>{preview!.organizationName}</strong>.</p>
      <p className="muted" style={{ marginTop: '.5rem' }}>O convite vale apenas para o endereço {preview!.emailHint}.</p>
      <div className="public__actions">
        <button className="btn" type="button" onClick={requestPassword} disabled={busy}>{busy ? 'Enviando…' : 'Primeiro acesso: definir minha senha'}</button>
        <a className="btn btn--ghost" href="/auth/login?returnTo=/auth/invite/complete">Já tenho senha: entrar e aceitar</a>
      </div>
    </>
  );
}
