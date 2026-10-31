/**
 * Adaptador de envio do formulário de contato.
 * Para trocar de serviço, implemente `ContactAdapter` e ajuste `createContactAdapter`.
 * Regra: nunca registre o conteúdo do formulário em logs nem o guarde no navegador.
 * O envio nunca é repetido automaticamente: após um timeout, o processamento anterior
 * pode ter ocorrido, e a decisão de tentar de novo é de quem preencheu.
 */

export interface ContactSubmission {
  nome: string;
  empresa: string;
  email: string;
  telefone: string;
  interesse: string;
  produto: string;
  mensagem: string;
}

export type ContactFailure = 'timeout' | 'network' | 'rejected';

export type ContactResult = { ok: true } | { ok: false; reason: ContactFailure };

export interface ContactAdapter {
  send(submission: ContactSubmission): Promise<ContactResult>;
}

const TIMEOUT_MS = 15000;

/** Um corpo JSON com `ok: false` conta como recusa, mesmo com status 2xx. */
async function refusedInBody(response: Response): Promise<boolean> {
  try {
    const body: unknown = JSON.parse(await response.text());
    return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === false;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

/**
 * POST JSON. Sucesso significa que o endpoint aceitou a solicitação: resposta 2xx sem
 * redirecionamento e sem `ok: false` no corpo. Isso não garante a entrega de um e-mail.
 */
export function createContactAdapter(endpoint: string): ContactAdapter {
  return {
    async send(submission) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(submission),
          redirect: 'error',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok || (await refusedInBody(response))) return { ok: false, reason: 'rejected' };
        return { ok: true };
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
        return { ok: false, reason: timedOut ? 'timeout' : 'network' };
      }
    },
  };
}
