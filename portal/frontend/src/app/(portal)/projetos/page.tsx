import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, apiGetOptional, getMe, pageQuery } from '@/lib/api';
import { formatDate, label, options } from '@/lib/labels';
import type { OrganizationView, Page, ProjectSummary } from '@/lib/types';
import { ApiForm } from '@/components/forms';
import { Badge, Disclosure, Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Projetos' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const me = await getMe();
  const data = await apiGet<Page<ProjectSummary>>(`/v1/projects?${pageQuery(params, { q: params.q })}`);
  const orgs = me.canManage ? await apiGetOptional<Page<OrganizationView>>('/v1/organizations?size=100', { items: [], page: 0, size: 100, total: 0 }) : null;

  return (
    <>
      <PageTitle title="Projetos" intro={me.canManage ? 'Projetos dos clientes aos quais você tem acesso.' : 'Etapas, prazos e entregas dos seus projetos.'} />
      {orgs && (
        <Section title="Novo projeto">
          <Disclosure summary="Criar projeto">
            <ApiForm path="/v1/projects" submitLabel="Criar projeto" redirectTo="/projetos/{id}" fields={[
              { name: 'organizationId', label: 'Cliente', type: 'select', required: true, options: orgs.items.filter((o) => o.status === 'ACTIVE').map((o) => ({ value: o.id, label: o.name })) },
              { name: 'name', label: 'Nome', type: 'text', required: true, maxLength: 200 },
              { name: 'serviceLine', label: 'Frente', type: 'select', required: true, options: options('serviceLine') },
              { name: 'status', label: 'Situação', type: 'select', required: true, defaultValue: 'PLANNED', options: options('project', ['PLANNED', 'ACTIVE', 'ON_HOLD']) },
              { name: 'description', label: 'Descrição', type: 'textarea', maxLength: 4000 },
              { name: 'agreedScope', label: 'Escopo acordado', type: 'textarea', maxLength: 8000 },
              { name: 'startDate', label: 'Início', type: 'date' },
              { name: 'dueDate', label: 'Previsão de término', type: 'date' },
            ]} />
          </Disclosure>
        </Section>
      )}
      <Section title="Lista">
        <form className="form" role="search" method="get" action="/projetos">
          <div className="field">
            <label htmlFor="busca">Buscar por nome</label>
            <input id="busca" name="q" type="search" defaultValue={params.q ?? ''} maxLength={100} />
          </div>
        </form>
        {data.items.length === 0 ? <Empty>{params.q ? 'Nenhum projeto encontrado com esse nome.' : 'Nenhum projeto disponível para você.'}</Empty> : (
          <ul className="list" style={{ marginTop: '1rem' }}>
            {data.items.map((project) => (
              <li key={project.id}>
                <div className="list__row">
                  <Link className="list__title" href={`/projetos/${project.id}`}>{project.name}</Link>
                  <Badge group="project" value={project.status} />
                </div>
                <p className="meta">
                  {me.canManage && <span>{project.organizationName}</span>}
                  <span>{label('serviceLine', project.serviceLine)}</span>
                  <span>{project.milestonesDone} de {project.milestonesTotal} etapas concluídas</span>
                  {project.dueDate && <span>Previsão: {formatDate(project.dueDate)}</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data} basePath="/projetos" query={{ q: params.q }} />
      </Section>
    </>
  );
}
