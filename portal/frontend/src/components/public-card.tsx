import type { ReactNode } from 'react';

export function PublicCard({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <main className="public">
      <div className="public__card">
        <div className="public__head">
          <img src="/brand/union-solutions-392.webp" alt="Union Solutions" width={168} height={49} />
        </div>
        <h1>{title}</h1>
        {children}
        <p className="public__privacy"><a href="https://unionsolutions.tech/privacidade/">Política de privacidade</a></p>
      </div>
    </main>
  );
}
