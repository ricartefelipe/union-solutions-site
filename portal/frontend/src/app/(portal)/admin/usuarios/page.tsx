import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGet, getMe } from '@/lib/api';
import { options } from '@/lib/labels';
import type { InvitationView, Page, UserView } from '@/lib/types';
import { ApiForm } from '@/components/forms';
import { InvitationList, PeopleList } from '@/components/people';
import { PageTitle, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Equipe' };

export default async function TeamPage() {
  const me = await getMe();
  if (me.role !== 'UNION_ADMIN') redirect('/');
  const [users, invitations] = await Promise.all([apiGet<Page<UserView>>('/v1/users?scope=UNION&size=100'), apiGet<Page<InvitationView>>('/v1/invitations?size=100')]);
  const teamInvitations = invitations.items.filter((i) => !i.tenantId);
  return (
    <>
      <PageTitle title="Equipe Union" intro="Profissionais com acesso à administração do portal." />
      <div className="grid-2">
        <Section title="Convidar profissional">
          <ApiForm path="/v1/invitations" submitLabel="Enviar convite" successMessage="Convite enviado por e-mail." fields={[
            { name: 'email', label: 'E-mail', type: 'email', required: true, maxLength: 254, autoComplete: 'off' },
            { name: 'role', label: 'Papel', type: 'select', required: true, defaultValue: 'UNION_STAFF', options: options('role', ['UNION_STAFF', 'UNION_ADMIN']) },
          ]} />
        </Section>
        <Section title="Convites"><InvitationList invitations={teamInvitations} /></Section>
      </div>
      <Section title="Profissionais"><PeopleList users={users.items} selfId={me.id} /></Section>
    </>
  );
}
