import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGet, getMe, pageQuery } from '@/lib/api';
import { formatDateTime } from '@/lib/labels';
import type { AuditView, Page } from '@/lib/types';
import { Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Auditoria' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (me.role !== 'UNION_ADMIN') redirect('/');
  const params = await searchParams;
  const data = await apiGet<Page<AuditView>>(`/v1/audit?${pageQuery(params, { action: params.acao })}`);
  return (
    <>
      <PageTitle title="Auditoria" intro="Registro de ações relevantes. O portal só acrescenta eventos e não oferece edição nem exclusão." />
      <Section title="Eventos">
        <form className="form" role="search" method="get" action="/admin/auditoria">
          <div className="field">
            <label htmlFor="acao">Filtrar por código da ação</label>
            <input id="acao" name="acao" type="text" defaultValue={params.acao ?? ''} maxLength={60} />
          </div>
          <div><button className="btn btn--ghost" type="submit">Filtrar</button></div>
        </form>
        {data.items.length === 0 ? <Empty>Nenhum evento encontrado.</Empty> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Eventos de auditoria" style={{ marginTop: '1rem' }}>
            <table>
              <thead><tr><th scope="col">Data</th><th scope="col">Ação</th><th scope="col">Quem</th><th scope="col">Cliente</th><th scope="col">Recurso</th><th scope="col">Resumo</th></tr></thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.createdAt)}</td>
                    <td>{event.action}</td>
                    <td>{event.actorEmail ?? 'Sistema'}</td>
                    <td>{event.organizationName ?? ''}</td>
                    <td>{event.resourceType}</td>
                    <td>{event.summary ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={data} basePath="/admin/auditoria" query={{ acao: params.acao }} />
      </Section>
    </>
  );
}
