'use client';

import Link from '@/components/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul>
      {links.map((link) => {
        const current = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link href={link.href} aria-current={current ? 'page' : undefined}>{link.label}</Link>
          </li>
        );
      })}
    </ul>
  );
}
