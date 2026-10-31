import type { Metadata } from 'next';
import { apiGet, apiGetOptional } from '@/lib/api';
import { formatDateTime, label, options } from '@/lib/labels';
import type { Page, TicketDetail, UserView } from '@/lib/types';
import { ApiForm, RefreshWhilePending } from '@/components/forms';
import { Badge, Disclosure, Empty, FileLink, PageTitle, Section, When } from '@/components/ui';

export const metadata: Metadata = { title: 'Solicitação' };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await apiGet<TicketDetail>(`/v1/tickets/${id}`);
  const { ticket } = detail;
  const team = detail.canManage ? await apiGetOptional<Page<UserView>>('/v1/users?scope=UNION&size=100', { items: [], page: 0, size: 100, total: 0 }) : null;
  const closed = ticket.status === 'CLOSED';
  const pending = detail.attachments.some((a) => a.file.scanStatus === 'PENDING');

  return (
    <RefreshWhilePending pending={pending}>
      <PageTitle title={ticket.subject} crumbs={[{ label: 'Suporte', href: '/suporte' }]}>
        <Badge group="ticket" value={ticket.status} />
      </PageTitle>
      <div className="grid-2">
        <Section title="Solicitação">
          <p className="prose">{detail.description}</p>
          <dl className="kv" style={{ marginTop: '1rem' }}>
            {detail.canManage && <><dt>Cliente</dt><dd>{ticket.organizationName}</dd></>}
            <dt>Categoria</dt><dd>{label('ticketCategory', ticket.category)}</dd>
            <dt>Prioridade</dt><dd>{label('priority', ticket.priority)}</dd>
            {ticket.projectName && <><dt>Projeto</dt><dd>{ticket.projectName}</dd></>}
            <dt>Aberta por</dt><dd>{detail.openedByName}</dd>
            <dt>Abertura</dt><dd>{formatDateTime(ticket.createdAt)}</dd>
            {detail.assigneeName && <><dt>Responsável</dt><dd>{detail.assigneeName}</dd></>}
            {ticket.slaDueAt && <><dt>Prazo registrado</dt><dd>{formatDateTime(ticket.slaDueAt)}</dd></>}
          </dl>
        </Section>
        <Section title="Anexos">
          {detail.attachments.length === 0 ? <Empty>Nenhum anexo.</Empty> : (
            <ul className="list">
              {detail.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <FileLink file={attachment.file} href={`/bff/v1/tickets/${id}/attachments/${attachment.id}/download`} />
                  {attachment.internal && <span className="meta">Somente equipe Union</span>}
                </li>
              ))}
            </ul>
          )}
          {!closed && (
            <Disclosure summary="Adicionar anexo">
              <ApiForm path={`/v1/tickets/${id}/attachments`} submitLabel="Enviar anexo" successMessage="Anexo recebido. Ele fica disponível depois da verificação de segurança." fields={[
                { name: 'file', label: 'Arquivo', type: 'file', required: true, hint: 'PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT ou CSV. Não envie credenciais.' },
                ...(detail.canManage ? [{ name: 'internal', label: 'Somente equipe Union', type: 'checkbox' as const }] : []),
              ]} />
            </Disclosure>
          )}
        </Section>
      </div>

      <Section title="Comentários">
        {detail.comments.length === 0 ? <Empty>Nenhum comentário ainda.</Empty> : (
          <ul className="stack">
            {detail.comments.map((comment) => (
              <li key={comment.id} className={`comment ${comment.internal ? 'comment--internal' : ''}`}>
                <div className="comment__head">
                  <strong>{comment.authorName}</strong>
                  {comment.fromUnion && <span>Union Solutions</span>}
                  {comment.internal && <span>Nota interna</span>}
                  <When value={comment.createdAt} />
                </div>
                <p className="prose">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        {!closed ? (
          <div style={{ marginTop: '1rem' }}>
            <ApiForm path={`/v1/tickets/${id}/comments`} submitLabel="Enviar comentário" successMessage="Comentário enviado." fields={[
              { name: 'body', label: 'Comentário', type: 'textarea', required: true, maxLength: 8000 },
              ...(detail.canManage ? [{ name: 'internal', label: 'Nota interna, não visível ao cliente', type: 'checkbox' as const }] : []),
            ]} />
          </div>
        ) : <p className="muted">Esta solicitação está encerrada.</p>}
      </Section>

      {detail.canManage && !closed && (
        <Section title="Atendimento">
          <ApiForm path={`/v1/tickets/${id}`} method="PATCH" values={{ version: detail.version }} submitLabel="Salvar atendimento" successMessage="Solicitação atualizada." fields={[
            { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: ticket.status, options: options('ticket') },
            { name: 'priority', label: 'Prioridade', type: 'select', required: true, defaultValue: ticket.priority, options: options('priority') },
            { name: 'assigneeId', label: 'Responsável', type: 'select', placeholder: 'Sem alteração', defaultValue: detail.assigneeId ?? '', options: (team?.items ?? []).filter((u) => u.status === 'ACTIVE').map((u) => ({ value: u.id, label: u.name ?? u.email })) },
            { name: 'slaDueAt', label: 'Prazo registrado em contrato', type: 'datetime-local', hint: 'Preencha somente se houver prazo acordado para este contrato. O portal não calcula SLA.' },
          ]} />
        </Section>
      )}
    </RefreshWhilePending>
  );
}
