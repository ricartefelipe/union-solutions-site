import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, apiGetOptional, getMe, pageQuery } from '@/lib/api';
import { formatDate, label, options } from '@/lib/labels';
import type { OrganizationView, Page, ProjectSummary, TicketSummary } from '@/lib/types';
import { ApiForm } from '@/components/forms';
import { Badge, Disclosure, Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Suporte' };

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const me = await getMe();
  const status = params.situacao && options('ticket').some((o) => o.value === params.situacao) ? params.situacao : undefined;
  const open = params.abertas === '1' && !status ? 'true' : undefined;
  const orgs = me.canManage ? await apiGetOptional<Page<OrganizationView>>('/v1/organizations?size=100', { items: [], page: 0, size: 100, total: 0 }) : null;
  const organizationId = orgs?.items.some((o) => o.id === params.cliente) ? params.cliente : undefined;
  const [data, projects] = await Promise.all([
    apiGet<Page<TicketSummary>>(`/v1/tickets?${pageQuery(params, { status, open, organizationId })}`),
    apiGet<Page<ProjectSummary>>('/v1/projects?size=100'),
  ]);
  const filters = { situacao: status, abertas: open ? '1' : undefined, cliente: organizationId };

  return (
    <>
      <PageTitle title="Suporte" intro="Abra solicitações e acompanhe as respostas. Prazos aparecem apenas quando registrados para o seu contrato." />
      <Section title="Nova solicitação">
        <Disclosure summary="Abrir solicitação">
          <ApiForm path="/v1/tickets" submitLabel="Abrir solicitação" redirectTo="/suporte/{ticket.id}" fields={[
            ...(orgs ? [{ name: 'organizationId', label: 'Cliente', type: 'select' as const, required: true, options: orgs.items.map((o) => ({ value: o.id, label: o.name })) }] : []),
            { name: 'subject', label: 'Assunto', type: 'text', required: true, maxLength: 200 },
            { name: 'description', label: 'Descrição', type: 'textarea', required: true, maxLength: 8000, hint: 'Não informe senhas nem credenciais.' },
            { name: 'category', label: 'Categoria', type: 'select', required: true, options: options('ticketCategory') },
            { name: 'priority', label: 'Prioridade', type: 'select', required: true, defaultValue: 'NORMAL', options: options('priority') },
            { name: 'projectId', label: 'Projeto relacionado', type: 'select', placeholder: 'Nenhum', options: projects.items.map((p) => ({ value: p.id, label: p.name })) },
          ]} />
        </Disclosure>
      </Section>
      <Section title="Solicitações">
        <form className="form form--filters" role="search" method="get" action="/suporte">
          <div className="field">
            <label htmlFor="situacao">Situação</label>
            <select id="situacao" name="situacao" defaultValue={status ?? ''}>
              <option value="">Todas</option>
              {options('ticket').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {orgs && (
            <div className="field">
              <label htmlFor="cliente">Cliente</label>
              <select id="cliente" name="cliente" defaultValue={organizationId ?? ''}>
                <option value="">Todos</option>
                {orgs.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="field field--check">
            <input id="abertas" name="abertas" type="checkbox" value="1" defaultChecked={Boolean(open)} />
            <label htmlFor="abertas">Só as não encerradas</label>
          </div>
          <div><button className="btn btn--ghost" type="submit">Filtrar</button></div>
        </form>
        {data.items.length === 0 ? <Empty>{status || open || organizationId ? 'Nenhuma solicitação com esses filtros.' : 'Nenhuma solicitação registrada.'}</Empty> : (
          <ul className="list" style={{ marginTop: '1rem' }}>
            {data.items.map((ticket) => (
              <li key={ticket.id}>
                <div className="list__row">
                  <Link className="list__title" href={`/suporte/${ticket.id}`}>{ticket.subject}</Link>
                  <Badge group="ticket" value={ticket.status} />
                </div>
                <p className="meta">
                  {me.canManage && <span>{ticket.organizationName}</span>}
                  <span>{label('ticketCategory', ticket.category)}</span>
                  <span>Prioridade {label('priority', ticket.priority).toLowerCase()}</span>
                  {ticket.projectName && <span>{ticket.projectName}</span>}
                  <span>Aberta em {formatDate(ticket.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data} basePath="/suporte" query={filters} />
      </Section>
    </>
  );
}
