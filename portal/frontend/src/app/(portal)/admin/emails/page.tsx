import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { apiGet, getMe, pageQuery } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { OutboxView, Page } from '@/lib/types';
import { ApiButton } from '@/components/forms';
import { Badge, Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Fila de e-mails' };

const FILTERS = [['', 'Todos'], ['PENDING', 'Na fila'], ['SENT', 'Enviados'], ['FAILED', 'Desistiram']];

export default async function OutboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (me.role !== 'UNION_ADMIN') redirect('/');
  const params = await searchParams;
  const status = params.situacao && ['PENDING', 'SENT', 'FAILED'].includes(params.situacao) ? params.situacao : undefined;
  const data = await apiGet<Page<OutboxView>>(`/v1/admin/emails?${pageQuery(params, { status })}`);
  return (
    <>
      <PageTitle title="Fila de e-mails" intro="Avisos e convites são gravados junto com o fato que os gera e enviados por uma tarefa, com novas tentativas. O corpo some depois do envio." />
      <Section title="Mensagens" aside={
        <nav aria-label="Filtro por situação"><ul className="chips">
          {FILTERS.map(([value, text]) => <li key={value}><Link href={value ? `/admin/emails?situacao=${value}` : '/admin/emails'} aria-current={(status ?? '') === value ? 'page' : undefined}>{text}</Link></li>)}
        </ul></nav>
      }>
        {data.items.length === 0 ? <Empty>Nenhum e-mail nesta situação.</Empty> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Fila de e-mails">
            <table>
              <thead><tr><th scope="col">Criado</th><th scope="col">Destinatário</th><th scope="col">Assunto</th><th scope="col">Situação</th><th scope="col">Tentativas</th><th scope="col">Detalhe</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.createdAt)}</td>
                    <td>{e.recipient}</td>
                    <td>{e.subject}</td>
                    <td><Badge group="email" value={e.status} /></td>
                    <td>{e.attempts}</td>
                    <td>{e.status === 'SENT' ? `Enviado em ${formatDateTime(e.sentAt!)}` : e.status === 'PENDING' && e.nextAttemptAt ? `Próxima tentativa ${formatDateTime(e.nextAttemptAt)}` : ''}{e.lastError ? ` · ${e.lastError}` : ''}</td>
                    <td>{e.status === 'FAILED' && <ApiButton path={`/v1/admin/emails/${e.id}/retry`} tone="ghost" label="Voltar à fila" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data} basePath="/admin/emails" query={{ situacao: status }} />
      </Section>
    </>
  );
}
