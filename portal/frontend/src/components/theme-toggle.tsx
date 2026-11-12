'use client';

import { useEffect, useState } from 'react';

const KEY = 'tema';
type Theme = 'light' | 'dark';

/** Lê a preferência guardada; sem armazenamento, vale só nesta página. */
function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Botão de tema claro/escuro. O layout raiz já aplicou o tema antes da primeira pintura; aqui só se
 * reflete o estado e se guarda a escolha no navegador, sem cookie e sem envio a ninguém.
 */
export function ThemeToggle({ className = '' }: Readonly<{ className?: string }>) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = (event: MediaQueryListEvent) => {
      if (stored()) return;
      const next: Theme = event.matches ? 'dark' : 'light';
      root.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* sem armazenamento: vale só nesta página */
    }
  };

  return (
    <button className={`theme-toggle ${className}`.trim()} type="button" aria-pressed={theme === 'dark'} onClick={toggle}>
      <svg className="theme-toggle__sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
      <svg className="theme-toggle__moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
      </svg>
      <span className="sr-only">Tema escuro</span>
    </button>
  );
}
