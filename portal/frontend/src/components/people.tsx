import { label } from '@/lib/labels';
import type { InvitationView, Role, UserView } from '@/lib/types';
import { ApiButton } from './forms';
import { Badge, Empty } from './ui';

/** Troca de papel dentro do mesmo tipo de conta: a API recusa cruzar cliente e Union e protege o último administrador. */
const ROLE_SWITCH: Record<Role, { to: Role; label: string }> = {
  CLIENT_MEMBER: { to: 'CLIENT_ADMIN', label: 'Tornar administração' },
  CLIENT_ADMIN: { to: 'CLIENT_MEMBER', label: 'Tornar participante' },
  UNION_STAFF: { to: 'UNION_ADMIN', label: 'Tornar administração' },
  UNION_ADMIN: { to: 'UNION_STAFF', label: 'Tornar equipe' },
};

/** Lista de pessoas com papel e acesso, usada por clientes e pela Union. */
export function PeopleList({ users, selfId, roles = true }: { users: UserView[]; selfId: string; roles?: boolean }) {
  if (users.length === 0) return <Empty>Nenhuma pessoa com acesso ainda.</Empty>;
  return (
    <ul className="list">
      {users.map((user) => {
        const self = user.id === selfId;
        const next = ROLE_SWITCH[user.role];
        return (
          <li key={user.id} className="list__row">
            <span>
              <span className="list__title">{user.name ?? user.email}{self && <span className="muted"> (você)</span>}</span>
              <span className="meta"><span>{user.email}</span><span>{label('role', user.role)}</span></span>
            </span>
            <span className="page-title__actions">
              {user.status === 'DISABLED' && <Badge group="userStatus" value="DISABLED" />}
              {!self && user.status === 'ACTIVE' && roles && (
                <ApiButton path={`/v1/users/${user.id}/role`} method="PUT" body={{ role: next.to }} tone="ghost" label={next.label}
                  confirm={`Alterar o papel de ${user.email} para ${label('role', next.to).toLowerCase()}?`} />
              )}
              {!self && (user.status === 'ACTIVE'
                ? <ApiButton path={`/v1/users/${user.id}/disable`} label="Revogar acesso" tone="danger" confirm={`Revogar o acesso de ${user.email}? A pessoa perde o acesso imediatamente.`} />
                : <ApiButton path={`/v1/users/${user.id}/enable`} label="Reativar" tone="ghost" />)}
            </span>
          </li>
        );
      })}
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
