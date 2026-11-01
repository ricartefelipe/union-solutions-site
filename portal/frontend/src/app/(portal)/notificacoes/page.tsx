import type { Metadata } from 'next';
import Link from '@/components/link';
import { apiGet, getMe, pageQuery } from '@/lib/api';
import { activityLabels, formatDateTime } from '@/lib/labels';
import type { NotificationView, Page, PreferencesView } from '@/lib/types';
import { ApiButton } from '@/components/forms';
import { Empty, PageTitle, Pagination, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Notificações' };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await getMe();
  const params = await searchParams;
  const onlyUnread = params.filtro === 'nao-lidas';
  const [data, preferences] = await Promise.all([
    apiGet<Page<NotificationView>>(`/v1/notifications?${pageQuery(params, { unread: onlyUnread ? 'true' : undefined })}`),
    apiGet<PreferencesView>('/v1/me/preferences'),
  ]);
  const unread = data.items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageTitle title="Notificações" intro="Avisos sobre entregas, documentos, solicitações e projetos em que você participa." />
      <Section title={onlyUnread ? 'Não lidas' : 'Todas'} aside={
        <div className="actions">
          <Link className="btn btn--ghost" href={onlyUnread ? '/notificacoes' : '/notificacoes?filtro=nao-lidas'}>{onlyUnread ? 'Ver todas' : 'Só não lidas'}</Link>
          {unread > 0 && <ApiButton path="/v1/notifications/read" body={{ ids: [] }} tone="ghost" label="Marcar todas como lidas" />}
        </div>
      }>
        {data.items.length === 0 ? <Empty>Nenhuma notificação{onlyUnread ? ' pendente' : ''}.</Empty> : (
          <ul className="notice-list">
            {data.items.map((n) => (
              <li key={n.id} data-unread={n.readAt ? 'false' : 'true'}>
                <span className="notice__title">{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</span>
                <span className="meta"><span>{activityLabels[n.kind] ?? n.kind}</span><span>{formatDateTime(n.createdAt)}</span>{!n.readAt && <span>Não lida</span>}</span>
                {!n.readAt && <ApiButton path="/v1/notifications/read" body={{ ids: [n.id] }} tone="ghost" label="Marcar como lida" />}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={data} basePath="/notificacoes" query={{ filtro: params.filtro }} />
      </Section>
      <Section title="Avisos por e-mail">
        <p className="muted">
          {preferences.emailNotifications
            ? 'Você recebe um e-mail resumido a cada aviso, sem o conteúdo das mensagens ou documentos. Convites e mensagens de acesso continuam chegando mesmo com esta opção desligada.'
            : 'Os avisos por e-mail estão desligados. Você continua vendo as notificações aqui no portal.'}
        </p>
        <ApiButton path="/v1/me/preferences" method="PATCH" body={{ emailNotifications: !preferences.emailNotifications }} tone="ghost"
          label={preferences.emailNotifications ? 'Desligar avisos por e-mail' : 'Ligar avisos por e-mail'} />
      </Section>
    </>
  );
}
