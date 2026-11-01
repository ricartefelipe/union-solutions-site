import type { Metadata } from 'next';
import { apiGet, getMe, pageQuery } from '@/lib/api';
import type { Page, ProductView } from '@/lib/types';
import { Badge, Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Produtos contratados' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const me = await getMe();
  const data = await apiGet<Page<ProductView>>(`/v1/products?${pageQuery(params)}`);
  return (
    <>
      <PageTitle title="Produtos contratados" intro="Acesse os produtos registrados para a sua organização. Cada produto tem login próprio, e o portal não guarda essas senhas." />
      {data.items.length === 0 ? <Section title="Produtos"><Empty>Nenhum produto registrado para você.</Empty></Section> : data.items.map((product) => (
        <Section key={product.id} title={product.productName} aside={<Badge group="product" value={product.commercialStatus} />}>
          {me.canManage && <p className="meta"><span>{product.organizationName}</span>{product.archived && <span>Arquivado</span>}</p>}
          {product.accessUrl
            ? <p style={{ marginBlock: '.5rem' }}><a className="btn" href={product.accessUrl} target="_blank" rel="noopener noreferrer">Acessar {product.productName}<span className="sr-only"> (abre em nova aba)</span></a></p>
            : <p className="muted">Link de acesso ainda não registrado.</p>}
          {product.supportNotes && (<><h3 style={{ marginTop: '1rem' }}>Orientações de suporte</h3><p className="prose">{product.supportNotes}</p></>)}
          {product.slaNote && (<><h3 style={{ marginTop: '1rem' }}>Prazo registrado</h3><p className="prose">{product.slaNote}</p></>)}
          {product.documents.length > 0 && (
            <>
              <h3 style={{ marginTop: '1rem' }}>Documentos</h3>
              <ul className="stack">
                {product.documents.map((doc) => (
                  <li key={doc.id}>
                    {doc.downloadable ? <a href={`/bff/v1/documents/${doc.id}/versions/${doc.latestVersionId}/download`}>{doc.title}</a> : <span className="muted">{doc.title} (em verificação)</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
      ))}
      <Pagination page={data} basePath="/produtos" />
    </>
  );
}
