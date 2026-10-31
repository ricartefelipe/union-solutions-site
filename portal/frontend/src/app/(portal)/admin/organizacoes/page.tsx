import type { Metadata } from 'next';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { apiGet, getMe, pageQuery } from '@/lib/api';
import type { OrganizationView, Page } from '@/lib/types';
import { ApiForm } from '@/components/forms';
import { Badge, Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Clientes' };

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe();
  if (!me.canManage) redirect('/');
  const data = await apiGet<Page<OrganizationView>>(`/v1/organizations?${pageQuery(await searchParams)}`);
  return (
    <>
      <PageTitle title="Clientes" intro={me.role === 'UNION_ADMIN' ? 'Organizações atendidas pela Union Solutions.' : 'Organizações às quais você está associado.'} />
      {me.role === 'UNION_ADMIN' && (
        <Section title="Nova organização">
          <ApiForm path="/v1/organizations" submitLabel="Criar organização" redirectTo="/admin/organizacoes/{id}" fields={[
            { name: 'name', label: 'Nome', type: 'text', required: true, maxLength: 160 },
            { name: 'legalName', label: 'Razão social', type: 'text', maxLength: 200 },
          ]} />
        </Section>
      )}
      <Section title="Organizações">
        {data.items.length === 0 ? <Empty>Nenhuma organização disponível.</Empty> : (
          <ul className="list">
            {data.items.map((org) => (
              <li key={org.id} className="list__row">
                <span>
                  <Link className="list__title" href={`/admin/organizacoes/${org.id}`}>{org.name}</Link>
                  <span className="meta"><span>{org.users} pessoa(s)</span><span>{org.projects} projeto(s)</span></span>
                </span>
                {org.status !== 'ACTIVE' && <Badge group="orgStatus" value={org.status} />}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data} basePath="/admin/organizacoes" />
      </Section>
    </>
  );
}
