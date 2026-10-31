import { label } from '@/lib/labels';
import type { InvitationView, UserView } from '@/lib/types';
import { ApiButton } from './forms';
import { Badge, Empty } from './ui';

/** Lista de pessoas com revogação de acesso, usada por clientes e pela Union. */
export function PeopleList({ users, selfId }: { users: UserView[]; selfId: string }) {
  if (users.length === 0) return <Empty>Nenhuma pessoa com acesso ainda.</Empty>;
  return (
    <ul className="list">
      {users.map((user) => (
        <li key={user.id} className="list__row">
          <span>
            <span className="list__title">{user.name ?? user.email}</span>
            <span className="meta"><span>{user.email}</span><span>{label('role', user.role)}</span></span>
          </span>
          <span className="page-title__actions">
            {user.status === 'DISABLED' && <Badge group="userStatus" value="DISABLED" />}
            {user.id !== selfId && (user.status === 'ACTIVE'
              ? <ApiButton path={`/v1/users/${user.id}/disable`} label="Revogar acesso" tone="danger" confirm={`Revogar o acesso de ${user.email}? A pessoa perde o acesso imediatamente.`} />
              : <ApiButton path={`/v1/users/${user.id}/enable`} label="Reativar" tone="ghost" />)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InvitationList({ invitations }: { invitations: InvitationView[] }) {
  if (invitations.length === 0) return <Empty>Nenhum convite enviado.</Empty>;
  return (
    <ul className="list">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="list__row">
          <span>
            <span className="list__title">{invitation.email}</span>
            <span className="meta"><span>{label('role', invitation.role)}</span>{invitation.organizationName && <span>{invitation.organizationName}</span>}</span>
          </span>
          <span className="page-title__actions">
            <Badge group="invitation" value={invitation.state} />
            {invitation.state === 'PENDING' && <ApiButton path={`/v1/invitations/${invitation.id}`} method="DELETE" label="Revogar convite" tone="ghost" confirm={`Revogar o convite de ${invitation.email}?`} />}
          </span>
        </li>
      ))}
    </ul>
  );
}
