/** Recusa iniciar com configuração inválida ou sem o armazenamento de sessões, em vez de falhar na primeira requisição. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getConfig } = await import('./lib/config');
    const { prepareSessionStore } = await import('./lib/session');
    try {
      getConfig();
      await prepareSessionStore();
    } catch (error) {
      console.error(`Configuração inválida: ${(error as Error).message}`);
      process.exit(1);
    }
  }
}
