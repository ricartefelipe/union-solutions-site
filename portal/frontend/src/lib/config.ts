/** Configuração do BFF. Só executa no servidor: nada aqui chega ao navegador. */

export interface PortalConfig {
  production: boolean;
  publicUrl: string;
  apiUrl: string;
  issuer: string;
  oidcInternalUrl: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  sessionDbUrl: string;
  secureCookies: boolean;
  sessionAbsoluteSeconds: number;
  sessionIdleSeconds: number;
  trustForwardedFor: boolean;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value.replace(/\/+$/, '');
}

const LOCAL_HOST = /\/\/(localhost|127\.0\.0\.1|keycloak|host\.docker\.internal)(:|\/|$)/i;
const FICTITIOUS_HOST = /\/\/[^/]*(\.invalid|\.example|\.test|\.local|example\.(com|org|net))(:|\/|$)/i;
const PLACEHOLDER = /SUBSTITUIR|changeme|change-me|exemplo/i;

let cached: PortalConfig | null = null;

export function getConfig(): PortalConfig {
  if (cached) return cached;
  // Sem declaração explícita de desenvolvimento, valem as regras de produção.
  const production = process.env.PORTAL_ENV !== 'development';
  const config: PortalConfig = {
    production,
    publicUrl: required('PORTAL_PUBLIC_URL'),
    apiUrl: required('PORTAL_API_URL'),
    issuer: required('PORTAL_OIDC_ISSUER'),
    oidcInternalUrl: process.env.PORTAL_OIDC_INTERNAL_URL?.trim().replace(/\/+$/, '') || required('PORTAL_OIDC_ISSUER'),
    clientId: required('PORTAL_OIDC_CLIENT_ID'),
    clientSecret: required('PORTAL_OIDC_CLIENT_SECRET'),
    sessionSecret: required('PORTAL_SESSION_SECRET'),
    sessionDbUrl: required('PORTAL_SESSION_DB_URL'),
    secureCookies: required('PORTAL_PUBLIC_URL').startsWith('https://'),
    sessionAbsoluteSeconds: Number(process.env.PORTAL_SESSION_ABSOLUTE_SECONDS ?? 12 * 3600),
    sessionIdleSeconds: Number(process.env.PORTAL_SESSION_IDLE_SECONDS ?? 3600),
    trustForwardedFor: process.env.PORTAL_TRUST_FORWARDED_FOR === 'true',
  };
  if (config.sessionSecret.length < 32) throw new Error('PORTAL_SESSION_SECRET precisa ter ao menos 32 caracteres.');
  if (production) {
    for (const [name, value] of [['PORTAL_PUBLIC_URL', config.publicUrl], ['PORTAL_OIDC_ISSUER', config.issuer]] as const) {
      if (!value.startsWith('https://') || LOCAL_HOST.test(value) || FICTITIOUS_HOST.test(value)) throw new Error(`${name} precisa ser uma URL pública com HTTPS em produção.`);
    }
    for (const [name, value] of [['PORTAL_OIDC_CLIENT_SECRET', config.clientSecret], ['PORTAL_SESSION_SECRET', config.sessionSecret], ['PORTAL_SESSION_DB_URL', config.sessionDbUrl]] as const) {
      if (PLACEHOLDER.test(value)) throw new Error(`${name} ainda tem um valor de exemplo.`);
    }
  }
  cached = config;
  return config;
}
