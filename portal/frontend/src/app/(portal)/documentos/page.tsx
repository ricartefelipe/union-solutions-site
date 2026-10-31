import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, apiGetOptional, getMe, pageQuery } from '@/lib/api';
import { formatDate, label, options } from '@/lib/labels';
import type { DocumentView, OrganizationView, Page } from '@/lib/types';
import { ApiButton, ApiForm, RefreshWhilePending } from '@/components/forms';
import { Disclosure, Empty, FileLink, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Documentos' };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const me = await getMe();
  const category = params.categoria && Object.keys(options('category').reduce((a, o) => ({ ...a, [o.value]: 1 }), {})).includes(params.categoria) ? params.categoria : undefined;
  const data = await apiGet<Page<DocumentView>>(`/v1/documents?${pageQuery(params, { q: params.q, category })}`);
  const orgs = me.canManage ? await apiGetOptional<Page<OrganizationView>>('/v1/organizations?size=100', { items: [], page: 0, size: 100, total: 0 }) : null;
  const pending = data.items.some((d) => d.latest?.file.scanStatus === 'PENDING');

  return (
    <RefreshWhilePending pending={pending}>
      <PageTitle title="Documentos" intro="Propostas, contratos, desenhos e outros arquivos disponibilizados para você. Um arquivo aqui é uma cópia disponibilizada e não indica assinatura ou aceite." />
      {orgs && (
        <Section title="Documento sem projeto">
          <Disclosure summary="Disponibilizar para um cliente">
            <ApiForm path="/v1/documents" submitLabel="Enviar documento" successMessage="Documento recebido. Ele fica disponível depois da verificação de segurança." fields={[
              { name: 'organizationId', label: 'Cliente', type: 'select', required: true, options: orgs.items.map((o) => ({ value: o.id, label: o.name })) },
              { name: 'file', label: 'Arquivo', type: 'file', required: true, hint: 'PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT ou CSV.' },
              { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 200 },
              { name: 'category', label: 'Categoria', type: 'select', required: true, options: options('category') },
              { name: 'visibility', label: 'Quem pode ver', type: 'select', required: true, defaultValue: 'CLIENT_ADMINS', options: options('visibility') },
            ]} />
          </Disclosure>
        </Section>
      )}
      <Section title="Arquivos">
        <form className="form" role="search" method="get" action="/documentos">
          <div className="field">
            <label htmlFor="busca">Buscar por título</label>
            <input id="busca" name="q" type="search" defaultValue={params.q ?? ''} maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="categoria">Categoria</label>
            <select id="categoria" name="categoria" defaultValue={category ?? ''}>
              <option value="">Todas</option>
              {options('category').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><button className="btn btn--ghost" type="submit">Filtrar</button></div>
        </form>
        {data.items.length === 0 ? <Empty>Nenhum documento disponível.</Empty> : (
          <ul className="list" style={{ marginTop: '1rem' }}>
            {data.items.map((doc) => (
              <li key={doc.id}>
                <div className="list__row">
                  <span className="list__title">{doc.title}</span>
                  <span className="meta">
                    <span>{label('category', doc.category)}</span>
                    <span>Versão {doc.currentVersion}</span>
                    {me.canManage && <span>{label('visibility', doc.visibility)}</span>}
                    {doc.status === 'ARCHIVED' && <span>Arquivado</span>}
                  </span>
                </div>
                {doc.latest && <FileLink file={doc.latest.file} href={`/bff/v1/documents/${doc.id}/versions/${doc.latest.id}/download`} />}
                {me.role === 'UNION_ADMIN' && doc.latest?.file.scanStatus === 'FAILED' && <ApiButton path={`/v1/files/${doc.latest.file.id}/rescan`} tone="ghost" label="Verificar novamente" />}
                <p className="meta">
                  <span>Por {doc.latest?.authorName ?? doc.authorName}</span>
                  <span>{formatDate(doc.latest?.createdAt ?? doc.createdAt)}</span>
                  {doc.projectId && <Link href={`/projetos/${doc.projectId}`}>{doc.projectName}</Link>}
                </p>
                {me.canManage && doc.status === 'ACTIVE' && (
                  <Disclosure summary="Nova versão ou arquivamento">
                    <ApiForm path={`/v1/documents/${doc.id}/versions`} submitLabel="Enviar nova versão" successMessage="Nova versão recebida." fields={[
                      { name: 'file', label: 'Arquivo', type: 'file', required: true },
                      { name: 'note', label: 'Observação', type: 'text', maxLength: 500 },
                    ]} />
                    <div style={{ marginTop: '1rem' }}>
                      <ApiButton path={`/v1/documents/${doc.id}`} method="PATCH" tone="ghost" body={{ status: 'ARCHIVED', version: doc.version }} label="Arquivar documento" confirm="Arquivar este documento? Ele deixa de aparecer para o cliente, e o histórico é mantido." />
                    </div>
                  </Disclosure>
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data} basePath="/documentos" query={{ q: params.q, categoria: category }} />
      </Section>
    </RefreshWhilePending>
  );
}
