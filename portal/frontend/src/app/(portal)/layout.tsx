import type { ReactNode } from 'react';
import Link from '@/components/link';
import { redirect } from 'next/navigation';
import { apiGetOptional, currentSession, getMe } from '@/lib/api';
import type { UnreadCount } from '@/lib/types';
import { label } from '@/lib/labels';
import { NavLinks } from '@/components/nav';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect('/auth/login');
  const me = await getMe();
  const { unread } = await apiGetOptional<UnreadCount>('/v1/notifications/unread-count', { unread: 0 });

  const links = [
    { href: '/', label: 'Painel' },
    { href: '/projetos', label: 'Projetos' },
    { href: '/documentos', label: 'Documentos' },
    { href: '/suporte', label: 'Suporte' },
    { href: '/produtos', label: 'Produtos' },
  ];
  if (me.role === 'CLIENT_ADMIN') links.push({ href: '/organizacao', label: 'Organização' });
  if (me.canManage) links.push({ href: '/admin/organizacoes', label: 'Clientes' });
  if (me.role === 'UNION_ADMIN') {
    links.push({ href: '/admin/usuarios', label: 'Equipe' });
    links.push({ href: '/admin/auditoria', label: 'Auditoria' });
    links.push({ href: '/admin/emails', label: 'E-mails' });
    links.push({ href: '/admin/retencao', label: 'Retenção' });
  }

  return (
    <>
      <meta name="csrf-token" content={session.csrf} />
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="topbar">
        <div className="topbar__inner">
          <Link className="topbar__logo" href="/" aria-label="Union Solutions: painel do portal">
            <img src="/brand/union-solutions-392.webp" alt="Union Solutions" width={196} height={58} />
          </Link>
          <div className="topbar__user">
            <span className="topbar__who">
              {me.name ?? me.email} · {me.organization?.name ?? label('role', me.role)}
            </span>
            <Link className="topbar__bell" href="/notificacoes">
              Notificações{unread > 0 && <> <span className="topbar__count">{unread > 99 ? '99+' : unread}</span><span className="sr-only"> não lida{unread > 1 ? 's' : ''}</span></>}
            </Link>
            <form method="post" action="/auth/logout">
              <input type="hidden" name="csrf" value={session.csrf} />
              <button className="linklike" type="submit">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Principal">
        <div className="nav__inner"><NavLinks links={links} /></div>
      </nav>
      {me.demo && <div className="demo-banner" role="note">Ambiente de demonstração: os dados exibidos são fictícios.</div>}
      <main id="conteudo" tabIndex={-1}>
        <div className="main-wrap">{children}</div>
      </main>
    </>
  );
}
