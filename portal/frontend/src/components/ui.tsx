import type { ReactNode } from 'react';
import Link from '@/components/link';
import { formatDateTime, formatSize, label } from '@/lib/labels';
import type { FileView, Page } from '@/lib/types';

const TONES: Record<string, string> = {
  ACTIVE: 'info', IN_PROGRESS: 'info', AWAITING_APPROVAL: 'warn', PENDING: 'warn', WAITING_CLIENT: 'warn', IMPLEMENTING: 'info', OPEN: 'warn',
  DONE: 'ok', COMPLETED: 'ok', APPROVED: 'ok', CLEAN: 'ok', RESOLVED: 'ok', ACCEPTED: 'ok', PUBLISHED: 'info',
  REJECTED: 'bad', FAILED: 'bad', CHANGES_REQUESTED: 'bad', SUSPENDED: 'bad', DISABLED: 'bad', URGENT: 'bad', HIGH: 'warn',
};

export function Badge({ group, value }: { group: Parameters<typeof label>[0]; value: string }) {
  return <span className={`badge badge--${TONES[value] ?? 'neutral'}`}>{label(group, value)}</span>;
}

export function PageTitle({ title, intro, children, crumbs }: { title: string; intro?: string; children?: ReactNode; crumbs?: { label: string; href: string }[] }) {
  return (
    <header className="page-title">
      {crumbs && (
        <nav className="crumbs" aria-label="Você está em">
          {crumbs.map((c) => <span key={c.href}><Link href={c.href}>{c.label}</Link> / </span>)}
        </nav>
      )}
      <div className="page-title__row">
        <div>
          <h1>{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {children && <div className="page-title__actions">{children}</div>}
      </div>
    </header>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section__head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Bloco recolhível para formulários. Funciona por teclado, sem JavaScript próprio. */
export function Disclosure({ summary, children, open }: { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclosure" open={open}>
      <summary>{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

export function FileLink({ file, href }: { file: FileView; href: string }) {
  return (
    <span className="file">
      {file.downloadable ? <a href={href}>{file.name}</a> : <span>{file.name}</span>}
      <span className="muted"> ({formatSize(file.sizeBytes)})</span>{' '}
      {!file.downloadable && <Badge group="scan" value={file.scanStatus} />}
    </span>
  );
}

export function Pagination({ page, basePath, query = {} }: { page: Page<unknown>; basePath: string; query?: Record<string, string | undefined> }) {
  const pages = Math.ceil(page.total / page.size);
  if (pages <= 1) return null;
  const link = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set('pagina', String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="pagination" aria-label="Paginação">
      {page.page > 0 && <Link href={link(page.page - 1)}>Anterior</Link>}
      <span>Página {page.page + 1} de {pages}</span>
      {page.page + 1 < pages && <Link href={link(page.page + 1)}>Próxima</Link>}
    </nav>
  );
}

export function When({ value }: { value: string }) {
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}
