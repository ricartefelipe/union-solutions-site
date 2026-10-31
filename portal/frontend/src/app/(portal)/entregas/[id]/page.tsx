import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/labels';
import type { DeliveryDetail, DocumentView, Page } from '@/lib/types';
import { ApiButton, ApiForm, RefreshWhilePending } from '@/components/forms';
import { Badge, Disclosure, Empty, PageTitle, Section, When } from '@/components/ui';

export const metadata: Metadata = { title: 'Entrega' };

export default async function DeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const delivery = await apiGet<DeliveryDetail>(`/v1/deliveries/${id}`);
  const current = delivery.versions.find((v) => v.versionNo === delivery.currentVersion)!;
  const documents = delivery.canManage ? await apiGet<Page<DocumentView>>(`/v1/documents?projectId=${delivery.projectId}&size=100`) : null;
  const usableDocs = documents?.items.filter((d) => d.visibility !== 'INTERNAL' && d.latest?.file.downloadable) ?? [];

  return (
    <RefreshWhilePending pending={false}>
      <PageTitle title={delivery.title} crumbs={[{ label: delivery.projectName, href: `/projetos/${delivery.projectId}` }]} intro={delivery.dueDate ? `Previsão: ${formatDate(delivery.dueDate)}` : undefined}>
        <Badge group="delivery" value={current.status} />
      </PageTitle>

      {delivery.canApprove && current.status === 'AWAITING_APPROVAL' && (
        <Section title={`Sua decisão sobre a versão ${current.versionNo}`}>
          <p className="muted">A decisão vale somente para a versão {current.versionNo}. O registro indica concordância com a entrega e não substitui contrato ou assinatura.</p>
          <div className="grid-2" style={{ marginTop: '1rem' }}>
            <div>
              <h3>Aprovar</h3>
              <ApiForm path={`/v1/deliveries/versions/${current.id}/decision`} values={{ decision: 'APPROVED' }} submitLabel={`Aprovar versão ${current.versionNo}`} successMessage="Entrega aprovada." confirm={`Confirmar a aprovação da versão ${current.versionNo}?`} fields={[
                { name: 'comment', label: 'Comentário', type: 'textarea', maxLength: 4000 },
              ]} />
            </div>
            <div>
              <h3>Solicitar ajustes</h3>
              <ApiForm path={`/v1/deliveries/versions/${current.id}/decision`} values={{ decision: 'CHANGES_REQUESTED' }} submitLabel="Solicitar ajustes" successMessage="Ajustes solicitados." fields={[
                { name: 'comment', label: 'O que precisa mudar', type: 'textarea', required: true, maxLength: 4000 },
              ]} />
            </div>
          </div>
        </Section>
      )}

      {delivery.canManage && (
        <Section title="Operação da entrega">
          {current.status === 'PUBLISHED' && (
            <ApiButton path={`/v1/deliveries/versions/${current.id}/request-approval`} label={`Solicitar aprovação da versão ${current.versionNo}`} confirm={`Enviar a versão ${current.versionNo} para aprovação do cliente?`} />
          )}
          {current.status === 'AWAITING_APPROVAL' && <p className="muted">Aguardando a decisão do cliente.</p>}
          <Disclosure summary="Publicar nova versão" open={current.status === 'CHANGES_REQUESTED'}>
            <ApiForm path={`/v1/deliveries/${id}/versions`} submitLabel="Publicar nova versão" successMessage="Nova versão publicada." fields={[
              { name: 'description', label: 'O que mudou nesta versão', type: 'textarea', required: true, maxLength: 8000 },
              { name: 'documentVersionIds', label: 'Documentos associados', type: 'checkboxes', options: usableDocs.map((d) => ({ value: d.latest!.id, label: `${d.title} (v${d.currentVersion})` })) },
            ]} />
          </Disclosure>
        </Section>
      )}

      <Section title="Histórico de versões">
        {delivery.versions.length === 0 ? <Empty>Sem versões.</Empty> : (
          <ul className="list">
            {delivery.versions.map((version) => (
              <li key={version.id}>
                <div className="list__row">
                  <h3>Versão {version.versionNo}</h3>
                  <Badge group="delivery" value={version.status} />
                </div>
                <p className="prose">{version.description}</p>
                <p className="meta"><span>Publicada por {version.publishedByName}</span><When value={version.publishedAt} /></p>
                {version.documents.length > 0 && (
                  <ul className="stack" style={{ marginTop: '.5rem' }}>
                    {version.documents.map((doc, index) => (
                      <li key={index}>
                        {doc.available && doc.downloadable
                          ? <a href={`/bff/v1/documents/${doc.documentId}/versions/${doc.documentVersionId}/download`}>{doc.title} (v{doc.versionNo})</a>
                          : <span className="muted">{doc.title}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {version.decision && (
                  <div className={`alert ${version.decision.decision === 'APPROVED' ? 'alert--success' : 'alert--notice'}`} style={{ marginTop: '.5rem' }}>
                    <p><Badge group="decision" value={version.decision.decision} /> por {version.decision.decidedByName}, em <When value={version.decision.decidedAt} /></p>
                    {version.decision.comment && <p className="prose">{version.decision.comment}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </RefreshWhilePending>
  );
}
