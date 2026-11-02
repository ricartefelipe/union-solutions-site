'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

export type Field =
  | { name: string; label: string; type: 'text' | 'email' | 'date' | 'url' | 'datetime-local'; required?: boolean; maxLength?: number; hint?: string; defaultValue?: string; autoComplete?: string }
  | { name: string; label: string; type: 'textarea'; required?: boolean; maxLength?: number; hint?: string; defaultValue?: string; rows?: number }
  | { name: string; label: string; type: 'select'; required?: boolean; hint?: string; defaultValue?: string; options: { value: string; label: string }[]; placeholder?: string }
  | { name: string; label: string; type: 'checkbox'; hint?: string; defaultChecked?: boolean }
  | { name: string; label: string; type: 'checkboxes'; hint?: string; options: { value: string; label: string; checked?: boolean }[] }
  | { name: string; label: string; type: 'file'; required?: boolean; hint?: string; accept?: string };

interface ApiFailure {
  message: string;
  correlationId?: string;
  details: { field: string; message: string }[];
}

function csrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function readFailure(response: Response): Promise<ApiFailure> {
  const body = (await response.json().catch(() => ({}))) as { message?: string; correlationId?: string; details?: { field: string; message: string }[] };
  return { message: body.message ?? 'Não foi possível concluir a operação. Tente novamente.', correlationId: body.correlationId, details: body.details ?? [] };
}

export async function send(path: string, method: string, body?: BodyInit, contentType?: string) {
  const headers: Record<string, string> = { 'X-CSRF-Token': csrfToken() };
  if (contentType) headers['Content-Type'] = contentType;
  return fetch(`/bff${path}`, { method, headers, body });
}

function ErrorMessage({ failure, innerRef }: { failure: ApiFailure; innerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={innerRef} className="alert alert--error" role="alert" tabIndex={-1}>
      <p>{failure.message}</p>
      {failure.details.length > 0 && <ul>{failure.details.map((d) => <li key={d.field}>{d.field}: {d.message}</li>)}</ul>}
      {failure.correlationId && <p className="alert__code">Código para o suporte: {failure.correlationId}</p>}
    </div>
  );
}

function fillTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{([\w.]+)\}/g, (_, path: string) => String(path.split('.').reduce<unknown>((current, key) => (current as Record<string, unknown>)?.[key], values) ?? ''));
}

/** Formulário ligado à API. Valores fixos entram por `values`; campos vazios não são enviados. */
export function ApiForm({ path, method = 'POST', fields, values = {}, submitLabel, successMessage, confirm, redirectTo, className }: {
  path: string;
  method?: string;
  fields: Field[];
  values?: Record<string, unknown>;
  submitLabel: string;
  successMessage?: string;
  confirm?: string;
  /** Destino após o sucesso. Trechos como {id} ou {ticket.id} são preenchidos com a resposta da API. */
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const hasFile = fields.some((f) => f.type === 'file');

  useEffect(() => {
    if (failure) errorRef.current?.focus();
  }, [failure]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setFailure(null);
    setSuccess(null);
    const data = new FormData(form);
    let response: Response;
    try {
      if (hasFile) {
        const multipart = new FormData();
        for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined) multipart.set(key, String(value));
        for (const [key, value] of data.entries()) if (value !== '' && !(value instanceof File && value.size === 0)) multipart.set(key, value);
        response = await send(path, method, multipart);
      } else {
        const body: Record<string, unknown> = { ...values };
        for (const field of fields) {
          if (field.type === 'checkbox') body[field.name] = data.get(field.name) === 'on';
          else if (field.type === 'checkboxes') body[field.name] = data.getAll(field.name);
          else {
            const value = String(data.get(field.name) ?? '').trim();
            if (value !== '') body[field.name] = field.type === 'datetime-local' ? new Date(value).toISOString() : value;
          }
        }
        response = await send(path, method, JSON.stringify(body), 'application/json');
      }
    } catch {
      setBusy(false);
      setFailure({ message: 'Não foi possível conectar ao portal. Verifique sua conexão e tente novamente.', details: [] });
      return;
    }
    setBusy(false);
    if (!response.ok) {
      setFailure(await readFailure(response));
      return;
    }
    const result = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as Record<string, unknown>);
    if (redirectTo) {
      router.push(fillTemplate(redirectTo, result));
      router.refresh();
      return;
    }
    form.reset();
    setSuccess(successMessage ?? 'Registro salvo.');
    router.refresh();
  }

  return (
    <form className={`form ${className ?? ''}`} onSubmit={submit} aria-busy={busy}>
      {failure && <ErrorMessage failure={failure} innerRef={errorRef} />}
      {success && <div className="alert alert--success" role="status">{success}</div>}
      {fields.map((field) => {
        const id = `${formId}-${field.name}`;
        const hintId = `${id}-hint`;
        const hint = field.hint ? <p className="field__hint" id={hintId}>{field.hint}</p> : null;
        const describedBy = field.hint ? hintId : undefined;
        if (field.type === 'checkbox') {
          return (
            <div className="field field--check" key={field.name}>
              <input id={id} name={field.name} type="checkbox" defaultChecked={field.defaultChecked} aria-describedby={describedBy} />
              <label htmlFor={id}>{field.label}</label>
              {hint}
            </div>
          );
        }
        if (field.type === 'checkboxes') {
          return (
            <fieldset className="field field--group" key={field.name} aria-describedby={describedBy}>
              <legend>{field.label}</legend>
              {hint}
              {field.options.length === 0 && <p className="field__hint">Nenhuma opção disponível.</p>}
              {field.options.map((option, index) => (
                <div className="field--check" key={option.value}>
                  <input id={`${id}-${index}`} name={field.name} type="checkbox" value={option.value} defaultChecked={option.checked} />
                  <label htmlFor={`${id}-${index}`}>{option.label}</label>
                </div>
              ))}
            </fieldset>
          );
        }
        const required = 'required' in field && field.required;
        return (
          <div className="field" key={field.name}>
            <label htmlFor={id}>{field.label}{!required && <span className="field__optional"> (opcional)</span>}</label>
            {field.type === 'textarea' ? (
              <textarea id={id} name={field.name} required={required} maxLength={field.maxLength} rows={field.rows ?? 4} defaultValue={field.defaultValue} aria-describedby={describedBy} />
            ) : field.type === 'select' ? (
              <select id={id} name={field.name} required={required} defaultValue={field.defaultValue ?? ''} aria-describedby={describedBy}>
                <option value="">{field.placeholder ?? 'Selecione'}</option>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.type === 'file' ? (
              <input id={id} name={field.name} type="file" required={required} accept={field.accept} aria-describedby={describedBy} />
            ) : (
              <input id={id} name={field.name} type={field.type} required={required} maxLength={field.maxLength} defaultValue={field.defaultValue} autoComplete={field.autoComplete} aria-describedby={describedBy} />
            )}
            {hint}
          </div>
        );
      })}
      <div className="form__actions">
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Enviando…' : submitLabel}</button>
      </div>
    </form>
  );
}

/** Ação de um clique. Ações sensíveis pedem confirmação em diálogo acessível por teclado. */
export function ApiButton({ path, method = 'POST', body, label, confirm, tone = 'primary', redirectTo }: {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  label: string;
  confirm?: string;
  tone?: 'primary' | 'ghost' | 'danger';
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (failure) errorRef.current?.focus();
  }, [failure]);

  async function run() {
    setBusy(true);
    setFailure(null);
    try {
      const response = await send(path, method, body ? JSON.stringify(body) : undefined, body ? 'application/json' : undefined);
      if (!response.ok) setFailure(await readFailure(response));
      else if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch {
      setFailure({ message: 'Não foi possível conectar ao portal. Tente novamente.', details: [] });
    }
    setBusy(false);
  }

  return (
    <span className="action">
      <button className={`btn ${tone === 'ghost' ? 'btn--ghost' : tone === 'danger' ? 'btn--danger' : ''}`} type="button" disabled={busy} onClick={() => (confirm ? dialogRef.current?.showModal() : run())}>
        {busy ? 'Enviando…' : label}
      </button>
      {confirm && (
        <dialog ref={dialogRef} className="dialog" aria-label="Confirmação">
          <p>{confirm}</p>
          <form method="dialog" className="dialog__actions">
            <button className="btn btn--ghost" type="submit" value="cancel">Cancelar</button>
            <button className={`btn ${tone === 'danger' ? 'btn--danger' : ''}`} type="submit" value="ok" onClick={() => run()}>Confirmar</button>
          </form>
        </dialog>
      )}
      {failure && <ErrorMessage failure={failure} innerRef={errorRef} />}
    </span>
  );
}

/** Atualiza a página enquanto houver arquivo em verificação. */
export function RefreshWhilePending({ pending, children }: { pending: boolean; children?: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [pending, router]);
  return <>{children}</>;
}
