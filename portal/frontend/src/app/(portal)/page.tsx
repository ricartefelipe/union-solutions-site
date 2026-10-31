import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, getMe } from '@/lib/api';
import { activityLabels, formatDate } from '@/lib/labels';
import type { Dashboard } from '@/lib/types';
import { Badge, Empty, PageTitle, Section, When } from '@/components/ui';

export const metadata: Metadata = { title: 'Painel' };

export default async function DashboardPage() {
  const [me, data] = await Promise.all([getMe(), apiGet<Dashboard>('/v1/dashboard')]);
  return (
    <>
      <PageTitle title={`Olá${me.name ? `, ${me.name.split(' ')[0]}` : ''}`} intro="O que precisa da sua atenção agora." />
      <div className="grid-2">
        <Section title="Aprovações pendentes">
          {data.pendingApprovals.length === 0 ? <Empty>Nenhuma entrega aguardando aprovação.</Empty> : (
            <ul className="list">
              {data.pendingApprovals.map((item) => (
                <li key={item.deliveryVersionId}>
                  <Link className="list__title" href={`/entregas/${item.deliveryId}`}>{item.title}, versão {item.versionNo}</Link>
                  <p className="meta">{item.projectName}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Projetos ativos" aside={<Link href="/projetos">Ver todos</Link>}>
          {data.activeProjects.length === 0 ? <Empty>Nenhum projeto em andamento no momento.</Empty> : (
            <ul className="list">
              {data.activeProjects.map((project) => (
                <li key={project.id}>
                  <Link className="list__title" href={`/projetos/${project.id}`}>{project.name}</Link>
                  <p className="meta">
                    <span>{project.milestonesDone} de {project.milestonesTotal} etapas concluídas</span>
                    {project.dueDate && <span>Previsão: {formatDate(project.dueDate)}</span>}
                    {me.canManage && <span>{project.organizationName}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Próximas entregas e etapas">
          {data.upcoming.length === 0 ? <Empty>Nenhuma data prevista registrada.</Empty> : (
            <ul className="list">
              {data.upcoming.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="list__row">
                  <Link href={item.kind === 'DELIVERY' ? `/entregas/${item.id}` : `/projetos/${item.projectId}`}>{item.title}</Link>
                  <span className="meta"><span>{item.projectName}</span><span>{formatDate(item.dueDate)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Solicitações abertas" aside={<Link href="/suporte">Ver todas</Link>}>
          {data.openTickets.length === 0 ? <Empty>Nenhuma solicitação aberta.</Empty> : (
            <ul className="list">
              {data.openTickets.map((ticket) => (
                <li key={ticket.id} className="list__row">
                  <Link href={`/suporte/${ticket.id}`}>{ticket.subject}</Link>
                  <Badge group="ticket" value={ticket.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Atividades recentes">
        {data.activity.length === 0 ? <Empty>Nenhuma atividade registrada ainda.</Empty> : (
          <ul className="list">
            {data.activity.map((item, index) => (
              <li key={index}>
                <span className="list__title">{activityLabels[item.action] ?? 'Atualização'}</span>
                {item.summary && <span>: {item.summary}</span>}
                <p className="meta">{item.projectName && <span>{item.projectName}</span>}<When value={item.createdAt} /></p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
