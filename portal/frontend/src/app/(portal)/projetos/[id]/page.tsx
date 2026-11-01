import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, apiGetOptional, getMe } from '@/lib/api';
import { formatDate, label, options } from '@/lib/labels';
import type { DeliverySummary, DocumentView, Page, ProjectDetail, UserView } from '@/lib/types';
import { ApiButton, ApiForm, RefreshWhilePending } from '@/components/forms';
import { Badge, Disclosure, Empty, FileLink, PageTitle, Section, Truncated, When } from '@/components/ui';

export const metadata: Metadata = { title: 'Projeto' };

const EMPTY_USERS: Page<UserView> = { items: [], page: 0, size: 100, total: 0 };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const project = await apiGet<ProjectDetail>(`/v1/projects/${id}`);
  const [deliveries, documents] = await Promise.all([
    apiGet<Page<DeliverySummary>>(`/v1/projects/${id}/deliveries?size=100`),
    apiGet<Page<DocumentView>>(`/v1/documents?projectId=${id}&size=100`),
  ]);
  const canAssign = project.canManage || me.role === 'CLIENT_ADMIN';
  const clientUsers = canAssign ? await apiGetOptional<Page<UserView>>(`/v1/users?organizationId=${project.tenantId}&size=100`, EMPTY_USERS) : EMPTY_USERS;
  const unionUsers = me.role === 'UNION_ADMIN' ? await apiGetOptional<Page<UserView>>('/v1/users?scope=UNION&size=100', EMPTY_USERS) : EMPTY_USERS;
  const memberIds = new Set(project.members.map((m) => m.userId));
  const candidates = [...clientUsers.items, ...unionUsers.items.filter((u) => u.role === 'UNION_STAFF')].filter((u) => u.status === 'ACTIVE' && !memberIds.has(u.id));
  const done = project.milestones.filter((m) => m.status === 'DONE').length;
  const usableDocs = documents.items.filter((d) => d.visibility !== 'INTERNAL' && d.latest?.file.downloadable);
  const pending = documents.items.some((d) => d.latest?.file.scanStatus === 'PENDING');

  return (
    <RefreshWhilePending pending={pending}>
      <PageTitle title={project.name} crumbs={[{ label: 'Projetos', href: '/projetos' }]} intro={project.description ?? undefined}>
        <Badge group="project" value={project.status} />
      </PageTitle>

      <div className="grid-2">
        <Section title="Resumo">
          <dl className="kv">
            {project.canManage && <><dt>Cliente</dt><dd>{project.organizationName}</dd></>}
            <dt>Frente</dt><dd>{label('serviceLine', project.serviceLine)}</dd>
            <dt>Início</dt><dd>{formatDate(project.startDate)}</dd>
            <dt>Previsão</dt><dd>{formatDate(project.dueDate)}</dd>
            <dt>Etapas</dt><dd>{project.milestones.length === 0 ? 'Nenhuma registrada' : `${done} de ${project.milestones.length} concluídas`}</dd>
          </dl>
          {project.agreedScope && (<><h3 style={{ marginTop: '1rem' }}>Escopo acordado</h3><p className="prose">{project.agreedScope}</p></>)}
          {project.canManage && (
            <Disclosure summary="Editar projeto">
              <ApiForm path={`/v1/projects/${id}`} method="PATCH" values={{ version: project.version }} submitLabel="Salvar projeto" successMessage="Projeto atualizado." fields={[
                { name: 'name', label: 'Nome', type: 'text', required: true, maxLength: 200, defaultValue: project.name },
                { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: project.status, options: options('project') },
                { name: 'description', label: 'Descrição', type: 'textarea', maxLength: 4000, defaultValue: project.description ?? '' },
                { name: 'agreedScope', label: 'Escopo acordado', type: 'textarea', maxLength: 8000, defaultValue: project.agreedScope ?? '' },
                { name: 'startDate', label: 'Início', type: 'date', defaultValue: project.startDate ?? '' },
                { name: 'dueDate', label: 'Previsão de término', type: 'date', defaultValue: project.dueDate ?? '' },
              ]} />
            </Disclosure>
          )}
        </Section>

        <Section title="Responsáveis e participantes">
          {project.members.length === 0 ? <Empty>Nenhum participante associado.</Empty> : (
            <ul className="list">
              {project.members.map((member) => (
                <li key={member.userId} className="list__row">
                  <span>
                    <span className="list__title">{member.name ?? member.email}</span>
                    <span className="meta">
                      <span>{label('role', member.role)}</span>
                      {member.responsibility && <span>{member.responsibility}</span>}
                      {member.canApprove && <span>Pode aprovar entregas</span>}
                    </span>
                  </span>
                  {canAssign && <ApiButton path={`/v1/projects/${id}/members/${member.userId}`} method="DELETE" label="Remover" tone="ghost" confirm={`Remover ${member.name ?? member.email} deste projeto?`} />}
                </li>
              ))}
            </ul>
          )}
          {canAssign && (
            <Disclosure summary="Associar pessoa">
              <AssignForm projectId={id} candidates={candidates} />
            </Disclosure>
          )}
        </Section>
      </div>

      <Section title="Etapas e marcos">
        {project.milestones.length === 0 ? <Empty>Nenhuma etapa registrada ainda.</Empty> : (
          <ol className="list">
            {project.milestones.map((milestone) => (
              <li key={milestone.id}>
                <div className="list__row">
                  <span className="list__title">{milestone.title}</span>
                  <Badge group="milestone" value={milestone.status} />
                </div>
                {milestone.description && <p className="muted">{milestone.description}</p>}
                <p className="meta"><span>Previsão: {formatDate(milestone.dueDate)}</span></p>
                {project.canManage && (
                  <div className="page-title__actions">
                    {milestone.status !== 'DONE' && (
                      <ApiButton path={`/v1/projects/${id}/milestones/${milestone.id}`} method="PUT" tone="ghost" label="Marcar como concluída" body={{ title: milestone.title, description: milestone.description, dueDate: milestone.dueDate, status: 'DONE', version: milestone.version }} />
                    )}
                  </div>
                )}
                {project.canManage && (
                  <Disclosure summary={`Editar etapa: ${milestone.title}`}>
                    <ApiForm path={`/v1/projects/${id}/milestones/${milestone.id}`} method="PUT" values={{ version: milestone.version }} submitLabel="Salvar etapa" successMessage="Etapa atualizada." fields={[
                      { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 200, defaultValue: milestone.title },
                      { name: 'description', label: 'Descrição', type: 'textarea', maxLength: 2000, defaultValue: milestone.description ?? '' },
                      { name: 'dueDate', label: 'Previsão', type: 'date', defaultValue: milestone.dueDate ?? '' },
                      { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: milestone.status, options: options('milestone') },
                    ]} />
                  </Disclosure>
                )}
              </li>
            ))}
          </ol>
        )}
        {project.canManage && (
          <Disclosure summary="Nova etapa">
            <ApiForm path={`/v1/projects/${id}/milestones`} submitLabel="Criar etapa" successMessage="Etapa criada." fields={[
              { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 200 },
              { name: 'description', label: 'Descrição', type: 'textarea', maxLength: 2000 },
              { name: 'dueDate', label: 'Previsão', type: 'date' },
              { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: 'PENDING', options: options('milestone') },
            ]} />
          </Disclosure>
        )}
      </Section>

      <Section title="Entregas">
        {deliveries.items.length === 0 ? <Empty>Nenhuma entrega publicada ainda.</Empty> : (
          <ul className="list">
            {deliveries.items.map((delivery) => (
              <li key={delivery.id} className="list__row">
                <span>
                  <Link className="list__title" href={`/entregas/${delivery.id}`}>{delivery.title}</Link>
                  <span className="meta"><span>Versão {delivery.currentVersion}</span>{delivery.dueDate && <span>Previsão: {formatDate(delivery.dueDate)}</span>}</span>
                </span>
                <Badge group="delivery" value={delivery.currentStatus} />
              </li>
            ))}
          </ul>
        )}
        <Truncated page={deliveries} hint="As entregas mais antigas ficam acessíveis pelo painel e pelas notificações." />
        {project.canManage && (
          <Disclosure summary="Publicar entrega">
            <ApiForm path={`/v1/projects/${id}/deliveries`} submitLabel="Publicar entrega" redirectTo="/entregas/{id}" fields={[
              { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 200 },
              { name: 'description', label: 'Descrição desta versão', type: 'textarea', required: true, maxLength: 8000 },
              { name: 'dueDate', label: 'Previsão', type: 'date' },
              { name: 'documentVersionIds', label: 'Documentos associados', type: 'checkboxes', hint: 'Somente documentos já verificados e visíveis ao cliente.', options: usableDocs.map((d) => ({ value: d.latest!.id, label: `${d.title} (v${d.currentVersion})` })) },
            ]} />
          </Disclosure>
        )}
      </Section>

      <Section title="Documentos do projeto">
        {documents.items.length === 0 ? <Empty>Nenhum documento disponível neste projeto.</Empty> : (
          <ul className="list">
            {documents.items.map((doc) => (
              <li key={doc.id}>
                <div className="list__row">
                  <Link className="list__title" href={`/documentos/${doc.id}`}>{doc.title}</Link>
                  <span className="meta"><span>{label('category', doc.category)}</span><span>Versão {doc.currentVersion}</span>{project.canManage && <span>{label('visibility', doc.visibility)}</span>}</span>
                </div>
                {doc.latest && <FileLink file={doc.latest.file} href={`/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`} />}
                {me.role === 'UNION_ADMIN' && doc.latest?.file.scanStatus === 'FAILED' && <ApiButton path={`/v1/files/${doc.latest.file.id}/rescan`} tone="ghost" label="Verificar novamente" />}
              </li>
            ))}
          </ul>
        )}
        <Truncated page={documents} hint="Use a tela Documentos para buscar os demais." />
        {project.canManage && (
          <Disclosure summary="Disponibilizar documento">
            <ApiForm path="/v1/documents" values={{ projectId: id }} submitLabel="Enviar documento" successMessage="Documento recebido. Ele fica disponível depois da verificação de segurança." fields={DOCUMENT_FIELDS} />
          </Disclosure>
        )}
      </Section>

      <Section title="Histórico de atualizações">
        {project.updates.length === 0 ? <Empty>Nenhuma atualização publicada ainda.</Empty> : (
          <ul className="list">
            {project.updates.map((update) => (
              <li key={update.id}>
                <p className="prose">{update.body}</p>
                <p className="meta"><span>{update.authorName}</span><When value={update.createdAt} /></p>
              </li>
            ))}
          </ul>
        )}
        {project.canManage && (
          <Disclosure summary="Publicar atualização">
            <ApiForm path={`/v1/projects/${id}/updates`} submitLabel="Publicar atualização" successMessage="Atualização publicada." fields={[{ name: 'body', label: 'Texto visível ao cliente', type: 'textarea', required: true, maxLength: 4000 }]} />
          </Disclosure>
        )}
      </Section>
    </RefreshWhilePending>
  );
}

const DOCUMENT_FIELDS = [
  { name: 'file', label: 'Arquivo', type: 'file' as const, required: true, hint: 'PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT ou CSV.' },
  { name: 'title', label: 'Título', type: 'text' as const, required: true, maxLength: 200 },
  { name: 'category', label: 'Categoria', type: 'select' as const, required: true, options: options('category') },
  { name: 'visibility', label: 'Quem pode ver', type: 'select' as const, required: true, defaultValue: 'PARTICIPANTS', options: options('visibility') },
];

function AssignForm({ projectId, candidates }: { projectId: string; candidates: UserView[] }) {
  if (candidates.length === 0) return <Empty>Não há outras pessoas para associar.</Empty>;
  return (
    <ul className="list">
      {candidates.map((user) => (
        <li key={user.id}>
          <p className="list__title">{user.name ?? user.email}</p>
          <p className="meta"><span>{label('role', user.role)}</span></p>
          <ApiForm path={`/v1/projects/${projectId}/members/${user.id}`} method="PUT" submitLabel="Associar ao projeto" successMessage="Pessoa associada." fields={[
            { name: 'responsibility', label: 'Responsabilidade', type: 'text', maxLength: 120 },
            ...(user.role.startsWith('CLIENT') ? [{ name: 'canApprove', label: 'Pode aprovar entregas', type: 'checkbox' as const }] : []),
          ]} />
        </li>
      ))}
    </ul>
  );
}
