import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, getMe } from '@/lib/api';
import { label, options } from '@/lib/labels';
import type { DocumentDetail } from '@/lib/types';
import { ApiButton, ApiForm, RefreshWhilePending } from '@/components/forms';
import { Badge, Disclosure, Empty, FileLink, PageTitle, Section, When } from '@/components/ui';

export const metadata: Metadata = { title: 'Documento' };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const { document: doc, versions } = await apiGet<DocumentDetail>(`/v1/documents/${id}`);
  const pending = versions.some((v) => v.file.scanStatus === 'PENDING');
  const archived = doc.status === 'ARCHIVED';
  const crumbs = [{ label: 'Documentos', href: '/documentos' }, ...(doc.projectId ? [{ label: doc.projectName ?? 'Projeto', href: `/projetos/${doc.projectId}` }] : [])];

  return (
    <RefreshWhilePending pending={pending}>
      <PageTitle title={doc.title} crumbs={crumbs} intro={`${label('category', doc.category)} · disponibilizado por ${doc.authorName}`}>
        {archived ? <Badge group="docStatus" value="ARCHIVED" /> : doc.latest && <Badge group="scan" value={doc.latest.file.scanStatus} />}
      </PageTitle>

      <Section title="Versões">
        {versions.length === 0 ? <Empty>Nenhuma versão disponível.</Empty> : (
          <ol className="list">
            {versions.map((version) => (
              <li key={version.id}>
                <div className="list__row">
                  <span className="list__title">Versão {version.versionNo}{version.id === doc.latest?.id && <span className="muted"> (atual)</span>}</span>
                  <When value={version.createdAt} />
                </div>
                <FileLink file={version.file} href={`/bff/v1/documents/${doc.id}/versions/${version.id}/download`} />
                <p className="meta"><span>Por {version.authorName}</span>{version.note && <span>{version.note}</span>}</p>
                {me.role === 'UNION_ADMIN' && version.file.scanStatus === 'FAILED' && <ApiButton path={`/v1/files/${version.file.id}/rescan`} tone="ghost" label="Verificar novamente" />}
              </li>
            ))}
          </ol>
        )}
        <p className="muted" style={{ marginTop: '.75rem' }}>Um arquivo aqui é uma cópia disponibilizada e não indica assinatura ou aceite. Versões anteriores continuam disponíveis para consulta.</p>
      </Section>

      {me.canManage && (
        <Section title="Gerenciar documento">
          <dl className="kv">
            <dt>Cliente</dt><dd>{doc.projectName ? <Link href={`/projetos/${doc.projectId}`}>{doc.projectName}</Link> : 'Sem projeto'}</dd>
            <dt>Quem pode ver</dt><dd>{label('visibility', doc.visibility)}</dd>
            <dt>Situação</dt><dd>{archived ? 'Arquivado: não aparece para o cliente' : 'Ativo'}</dd>
          </dl>
          {!archived ? (
            <>
              <Disclosure summary="Editar título, categoria ou visibilidade">
                <ApiForm path={`/v1/documents/${doc.id}`} method="PATCH" values={{ version: doc.version }} submitLabel="Salvar documento" successMessage="Documento atualizado." fields={[
                  { name: 'title', label: 'Título', type: 'text', required: true, maxLength: 200, defaultValue: doc.title },
                  { name: 'category', label: 'Categoria', type: 'select', required: true, defaultValue: doc.category, options: options('category') },
                  { name: 'visibility', label: 'Quem pode ver', type: 'select', required: true, defaultValue: doc.visibility, options: options('visibility'), hint: 'Ampliar a visibilidade avisa o cliente apenas em novas versões.' },
                ]} />
              </Disclosure>
              <Disclosure summary="Enviar nova versão">
                <ApiForm path={`/v1/documents/${doc.id}/versions`} submitLabel="Enviar nova versão" successMessage="Nova versão recebida. Ela fica disponível depois da verificação de segurança." fields={[
                  { name: 'file', label: 'Arquivo', type: 'file', required: true, hint: 'PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT ou CSV.' },
                  { name: 'note', label: 'Observação', type: 'text', maxLength: 500 },
                ]} />
              </Disclosure>
              <div style={{ marginTop: '1rem' }}>
                <ApiButton path={`/v1/documents/${doc.id}`} method="PATCH" tone="ghost" body={{ status: 'ARCHIVED', version: doc.version }} label="Arquivar documento" confirm="Arquivar este documento? Ele deixa de aparecer para o cliente, e o histórico é mantido." />
              </div>
            </>
          ) : <p className="muted">Documentos arquivados não recebem novas versões.</p>}
        </Section>
      )}
    </RefreshWhilePending>
  );
}
