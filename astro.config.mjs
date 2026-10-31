import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '');
const siteUrl = env.PUBLIC_SITE_URL?.trim() || undefined;

// Sem domínio configurado, o build não publica sitemap nem canonical.
export default defineConfig({
  output: 'static',
  site: siteUrl,
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  integrations: siteUrl ? [sitemap()] : [],
});
