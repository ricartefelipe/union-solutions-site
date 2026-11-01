import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGet, getMe } from '@/lib/api';
import { formatDateTime, label } from '@/lib/labels';
import type { RetentionReport, RetentionRunView } from '@/lib/types';
import { ApiButton } from '@/components/forms';
import { Empty, PageTitle, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Retenção' };

export default async function RetentionPage() {
  const me = await getMe();
  if (me.role !== 'UNION_ADMIN') redirect('/');
  const [report, runs] = await Promise.all([apiGet<RetentionReport>('/v1/admin/retention/simulation'), apiGet<RetentionRunView[]>('/v1/admin/retention/runs')]);
  return (
    <>
      <PageTitle title="Retenção" intro="O que seria removido com os prazos configurados. A remoção só acontece com a política aprovada registrada na configuração." />
      <Section title={report.enabled ? `Ligada: ${report.policyReference}` : 'Desligada'} aside={
        report.enabled
          ? <ApiButton path="/v1/admin/retention/execute" label="Executar agora" tone="danger" confirm="Remover definitivamente os registros contados na simulação? Esta ação não pode ser desfeita." />
          : <span className="muted">Execução indisponível: defina PORTAL_RETENTION_ENABLED e PORTAL_RETENTION_POLICY com a política aprovada.</span>
      }>
        <p className="muted">Contagem feita agora, em {formatDateTime(report.generatedAt)}. Esta consulta não grava nada; a tarefa diária e o botão abaixo registram a simulação no histórico e na auditoria.</p>
        <div style={{ marginBottom: '1rem' }}><ApiButton path="/v1/admin/retention/simulate" tone="ghost" label="Registrar simulação" /></div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Categorias de retenção">
          <table>
            <thead><tr><th scope="col">Categoria</th><th scope="col">Prazo</th><th scope="col">Seriam removidos</th><th scope="col">Observação</th></tr></thead>
            <tbody>
              {report.categories.map((c) => (
                <tr key={c.category}>
                  <td>{label('retentionCategory', c.category)}</td>
                  <td>{c.days > 0 ? `${c.days} dias` : 'Sem prazo'}</td>
                  <td>{c.days > 0 ? c.matching : '—'}</td>
                  <td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Execuções e simulações recentes">
        {runs.length === 0 ? <Empty>Nenhuma execução registrada.</Empty> : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Histórico de retenção">
            <table>
              <thead><tr><th scope="col">Quando</th><th scope="col">Tipo</th><th scope="col">Removidos</th><th scope="col">Resumo</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateTime(r.startedAt)}</td>
                    <td>{r.mode === 'EXECUTION' ? 'Execução' : 'Simulação'}</td>
                    <td>{r.mode === 'EXECUTION' ? r.removed : '—'}</td>
                    <td>{r.summary}{r.error ? ` · erro: ${r.error}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
