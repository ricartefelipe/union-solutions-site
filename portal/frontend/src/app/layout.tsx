import '@fontsource-variable/outfit/index.css';
import '@fontsource-variable/hanken-grotesk/index.css';
import '../styles/tokens.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Portal do Cliente | Union Solutions', template: '%s | Portal Union Solutions' },
  description: 'Área privada para clientes da Union Solutions.',
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: '/favicon.ico' },
};

// Toda página recebe o nonce da CSP, o que exige renderização por requisição.
export const dynamic = 'force-dynamic';

export const viewport: Viewport = { themeColor: '#1a1360' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
