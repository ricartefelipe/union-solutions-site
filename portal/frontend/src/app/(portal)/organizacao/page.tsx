import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiGet, getMe } from '@/lib/api';
import { options } from '@/lib/labels';
import type { InvitationView, Page, UserView } from '@/lib/types';
import { ApiForm } from '@/components/forms';
import { InvitationList, PeopleList } from '@/components/people';
import { PageTitle, Section } from '@/components/ui';

export const metadata: Metadata = { title: 'Organização' };

export default async function OrganizationPage() {
  const me = await getMe();
  if (me.role !== 'CLIENT_ADMIN') redirect('/');
  const [users, invitations] = await Promise.all([apiGet<Page<UserView>>('/v1/users?size=100'), apiGet<Page<InvitationView>>('/v1/invitations?size=100')]);
  return (
    <>
      <PageTitle title={me.organization?.name ?? 'Organização'} intro="Pessoas com acesso ao portal e convites da sua organização." />
      <div className="grid-2">
        <Section title="Convidar pessoa">
          <ApiForm path="/v1/invitations" submitLabel="Enviar convite" successMessage="Convite enviado por e-mail." fields={[
            { name: 'email', label: 'E-mail', type: 'email', required: true, maxLength: 254, autoComplete: 'off' },
            { name: 'role', label: 'Papel', type: 'select', required: true, defaultValue: 'CLIENT_MEMBER', options: options('role', ['CLIENT_MEMBER', 'CLIENT_ADMIN']) },
          ]} />
        </Section>
        <Section title="Convites"><InvitationList invitations={invitations.items} /></Section>
      </div>
      <Section title="Pessoas"><PeopleList users={users.items} selfId={me.id} /></Section>
    </>
  );
}
