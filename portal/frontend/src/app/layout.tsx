import '@fontsource-variable/outfit/index.css';
import '@fontsource-variable/hanken-grotesk/index.css';
import '../styles/tokens.css';
import '../styles/tema.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

/**
 * Aplica o tema antes da primeira pintura, para não piscar: a escolha guardada no navegador ou, sem ela,
 * a preferência do sistema. Roda com o nonce da CSP; sem JavaScript, o portal fica no tema claro.
 */
const THEME_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem('tema')}catch(e){}if(t!=='dark'&&t!=='light'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t})();`;

export const metadata: Metadata = {
  title: { default: 'Portal do Cliente | Union Solutions', template: '%s | Portal Union Solutions' },
  description: 'Área privada para clientes da Union Solutions.',
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/favicon.ico' },
};

// Toda página recebe o nonce da CSP, o que exige renderização por requisição.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { themeColor: '#1a1360' };

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
