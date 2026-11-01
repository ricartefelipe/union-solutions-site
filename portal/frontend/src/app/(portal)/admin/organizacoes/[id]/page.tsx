import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { apiGet, apiGetOptional, getMe } from '@/lib/api';
import { label, options } from '@/lib/labels';
import type { DocumentView, InvitationView, OrganizationView, Page, ProductView, ProjectSummary, StaffView, UserView } from '@/lib/types';
import { ApiButton, ApiForm } from '@/components/forms';
import { InvitationList, PeopleList } from '@/components/people';
import { Badge, Disclosure, Empty, PageTitle, Section, Truncated } from '@/components/ui';

export const metadata: Metadata = { title: 'Cliente' };

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me.canManage) redirect('/');
  const isAdmin = me.role === 'UNION_ADMIN';
  const org = await apiGet<OrganizationView>(`/v1/organizations/${id}`);
  const emptyPage = { items: [], page: 0, size: 100, total: 0 };
  const [users, invitations, projects, products, documents, staff, team] = await Promise.all([
    apiGetOptional<Page<UserView>>(`/v1/users?organizationId=${id}&size=100`, emptyPage),
    isAdmin ? apiGet<Page<InvitationView>>(`/v1/invitations?organizationId=${id}&size=100`) : Promise.resolve(emptyPage as Page<InvitationView>),
    apiGet<Page<ProjectSummary>>(`/v1/projects?organizationId=${id}&size=100`),
    apiGet<Page<ProductView>>(`/v1/products?organizationId=${id}&size=100`),
    apiGet<Page<DocumentView>>(`/v1/documents?organizationId=${id}&size=100`),
    isAdmin ? apiGet<StaffView[]>(`/v1/organizations/${id}/staff`) : Promise.resolve([] as StaffView[]),
    isAdmin ? apiGet<Page<UserView>>('/v1/users?scope=UNION&size=100') : Promise.resolve(emptyPage as Page<UserView>),
  ]);
  const assignedIds = new Set(staff.map((s) => s.userId));
  const availableStaff = team.items.filter((u) => u.role === 'UNION_STAFF' && u.status === 'ACTIVE' && !assignedIds.has(u.id));
  const productDocs = documents.items.filter((d) => d.visibility !== 'INTERNAL' && d.status === 'ACTIVE');

  return (
    <>
      <PageTitle title={org.name} crumbs={[{ label: 'Clientes', href: '/admin/organizacoes' }]} intro={org.legalName ?? undefined}>
        {org.status !== 'ACTIVE' && <Badge group="orgStatus" value={org.status} />}
      </PageTitle>

      {isAdmin && (
        <Section title="Dados da organização">
          <Disclosure summary="Editar organização">
            <ApiForm path={`/v1/organizations/${id}`} method="PATCH" values={{ version: org.version }} submitLabel="Salvar organização" successMessage="Organização atualizada." fields={[
              { name: 'name', label: 'Nome', type: 'text', required: true, maxLength: 160, defaultValue: org.name },
              { name: 'legalName', label: 'Razão social', type: 'text', maxLength: 200, defaultValue: org.legalName ?? '' },
              { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: org.status, options: options('orgStatus'), hint: 'Organizações com histórico são arquivadas, não excluídas.' },
            ]} />
          </Disclosure>
        </Section>
      )}

      <div className="grid-2">
        <Section title="Pessoas do cliente">
          {isAdmin ? <PeopleList users={users.items} selfId={me.id} /> : users.items.length === 0 ? <Empty>Nenhuma pessoa com acesso.</Empty> : (
            <ul className="list">{users.items.map((u) => <li key={u.id}>{u.name ?? u.email} <span className="meta">{label('role', u.role)}</span></li>)}</ul>
          )}
          <Truncated page={users} hint="" />
        </Section>
        {isAdmin && (
          <Section title="Convites">
            <ApiForm path="/v1/invitations" values={{ organizationId: id }} submitLabel="Enviar convite" successMessage="Convite enviado por e-mail." fields={[
              { name: 'email', label: 'E-mail', type: 'email', required: true, maxLength: 254, autoComplete: 'off' },
              { name: 'role', label: 'Papel', type: 'select', required: true, defaultValue: 'CLIENT_ADMIN', options: options('role', ['CLIENT_ADMIN', 'CLIENT_MEMBER']) },
            ]} />
            <div style={{ marginTop: '1rem' }}><InvitationList invitations={invitations.items} /><Truncated page={invitations} hint="" /></div>
          </Section>
        )}
      </div>

      {isAdmin && (
        <Section title="Equipe Union associada">
          {staff.length === 0 ? <Empty>Nenhum profissional associado a este cliente.</Empty> : (
            <ul className="list">
              {staff.map((s) => (
                <li key={s.userId} className="list__row">
                  <span>{s.name ?? s.email}</span>
                  <ApiButton path={`/v1/organizations/${id}/staff/${s.userId}`} method="DELETE" tone="ghost" label="Remover" confirm={`Remover ${s.email} deste cliente?`} />
                </li>
              ))}
            </ul>
          )}
          {availableStaff.length > 0 && (
            <ul className="list" style={{ marginTop: '.75rem' }}>
              {availableStaff.map((u) => (
                <li key={u.id} className="list__row">
                  <span>{u.name ?? u.email}</span>
                  <ApiButton path={`/v1/organizations/${id}/staff/${u.id}`} method="PUT" tone="ghost" label="Associar" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <Section title="Projetos" aside={<Link href="/projetos">Novo projeto</Link>}>
        {projects.items.length === 0 ? <Empty>Nenhum projeto disponível para você neste cliente.</Empty> : (
          <ul className="list">
            {projects.items.map((p) => (
              <li key={p.id} className="list__row"><Link href={`/projetos/${p.id}`}>{p.name}</Link><Badge group="project" value={p.status} /></li>
            ))}
          </ul>
        )}
        <Truncated page={projects} hint={`Veja todos em Projetos, filtrando por ${org.name}.`} />
      </Section>

      <Section title="Produtos contratados">
        <Truncated page={products} hint="" />
        {products.items.length === 0 ? <Empty>Nenhum produto registrado.</Empty> : (
          <ul className="list">
            {products.items.map((p) => (
              <li key={p.id}>
                <div className="list__row">
                  <span className="list__title">{p.productName}</span>
                  <span className="page-title__actions">{p.archived && <Badge group="docStatus" value="ARCHIVED" />}<Badge group="product" value={p.commercialStatus} /></span>
                </div>
                {p.accessUrl && <p className="meta"><span>{p.accessUrl}</span></p>}
                {p.documents.length > 0 && <p className="meta"><span>Documentos: {p.documents.map((d) => d.title).join(', ')}</span></p>}
                {p.archived ? (
                  <ApiButton path={`/v1/products/${p.id}`} method="PATCH" tone="ghost" body={{ archived: false, version: p.version }} label="Reativar produto" />
                ) : (
                  <Disclosure summary={`Editar produto: ${p.productName}`}>
                    <ApiForm path={`/v1/products/${p.id}`} method="PATCH" values={{ version: p.version }} submitLabel="Salvar produto" successMessage="Produto atualizado." fields={[
                      { name: 'productName', label: 'Produto', type: 'text', required: true, maxLength: 160, defaultValue: p.productName },
                      { name: 'commercialStatus', label: 'Situação comercial', type: 'select', required: true, defaultValue: p.commercialStatus, options: options('product') },
                      { name: 'accessUrl', label: 'Link de acesso', type: 'url', maxLength: 500, defaultValue: p.accessUrl ?? '' },
                      { name: 'supportNotes', label: 'Orientações de suporte', type: 'textarea', maxLength: 4000, defaultValue: p.supportNotes ?? '' },
                      { name: 'slaNote', label: 'Prazo registrado em contrato', type: 'text', maxLength: 500, defaultValue: p.slaNote ?? '' },
                      { name: 'documentIds', label: 'Documentos pertinentes', type: 'checkboxes', hint: 'Desmarcar todos remove os vínculos.', options: productDocs.map((d) => ({ value: d.id, label: d.title, checked: p.documents.some((pd) => pd.id === d.id) })) },
                    ]} />
                    <div style={{ marginTop: '1rem' }}>
                      <ApiButton path={`/v1/products/${p.id}`} method="PATCH" tone="ghost" body={{ archived: true, version: p.version }} label="Arquivar produto" confirm={`Arquivar ${p.productName}? O cliente deixa de vê-lo; o registro e o histórico são mantidos.`} />
                    </div>
                  </Disclosure>
                )}
              </li>
            ))}
          </ul>
        )}
        <Disclosure summary="Registrar produto contratado">
          <ApiForm path="/v1/products" values={{ organizationId: id }} submitLabel="Registrar produto" successMessage="Produto registrado." fields={[
            { name: 'productName', label: 'Produto', type: 'text', required: true, maxLength: 160 },
            { name: 'commercialStatus', label: 'Situação comercial', type: 'select', required: true, defaultValue: 'ACTIVE', options: options('product') },
            { name: 'accessUrl', label: 'Link de acesso', type: 'url', maxLength: 500, hint: 'Somente HTTPS e destinos autorizados na configuração do portal. Nunca inclua senhas.' },
            { name: 'supportNotes', label: 'Orientações de suporte', type: 'textarea', maxLength: 4000 },
            { name: 'slaNote', label: 'Prazo registrado em contrato', type: 'text', maxLength: 500, hint: 'Preencha somente se houver prazo acordado.' },
            { name: 'documentIds', label: 'Documentos pertinentes', type: 'checkboxes', options: productDocs.map((d) => ({ value: d.id, label: d.title })) },
          ]} />
        </Disclosure>
      </Section>
    </>
  );
}
