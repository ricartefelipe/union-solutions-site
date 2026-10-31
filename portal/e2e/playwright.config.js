import { defineConfig } from '@playwright/test';

// Usa o Chrome instalado na máquina. O ambiente local precisa estar em execução (portal.sh up).
export default defineConfig({
  testDir: './tests',
  // 03 opera o ambiente local. 04 e 05 exigem a configuração de produção (deploy/production/teste).
  testIgnore: process.env.E2E_PRODUCAO === 'true' ? ['**/03-*'] : ['**/04-*', '**/05-*', '**/06-*', '**/07-*'],
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: process.env.E2E_OUTPUT_DIR ?? 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    browserName: process.env.E2E_BROWSER ?? 'chromium',
    channel: process.env.E2E_BROWSER ? undefined : (process.env.E2E_BROWSER_CHANNEL ?? 'chrome'),
    viewport: { width: 1280, height: 900 },
    locale: 'pt-BR',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
