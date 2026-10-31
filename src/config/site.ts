/**
 * Informações institucionais, contatos e links do site.
 * Dados que dependem do ambiente vêm de variáveis PUBLIC_* (ver .env.example).
 * Valor ausente significa "não publicar": nunca preencha com dado fictício.
 */

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isLocalhost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

/** Falha o build se a URL for inválida; só localhost pode usar HTTP. */
function optionalUrl(name: string, value: string | undefined): string | null {
  const raw = optional(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} não é uma URL válida.`);
  }
  if (url.protocol !== 'https:' && !isLocalhost(url)) {
    throw new Error(`${name} deve usar HTTPS.`);
  }
  return raw;
}

function optionalEmail(value: string | undefined): string | null {
  const raw = optional(value);
  if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new Error('PUBLIC_CONTACT_EMAIL não é um e-mail válido.');
  }
  return raw;
}

function optionalWhatsapp(value: string | undefined): string | null {
  const digits = optional(value)?.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10) {
    throw new Error('PUBLIC_CONTACT_WHATSAPP deve conter DDI, DDD e número.');
  }
  return `https://wa.me/${digits}`;
}

export const site = {
  name: 'Union Solutions',
  summary: 'Empresa de tecnologia com produtos próprios, consultoria, arquitetura de software e desenvolvimento sob medida.',
  locale: 'pt_BR',
  themeColor: '#1a1360',
  url: optionalUrl('PUBLIC_SITE_URL', import.meta.env.PUBLIC_SITE_URL),
  socialImage: '/og/union-solutions.png',
} as const;

export const founder = {
  name: 'Felipe Ricarte Magalhães',
  role: 'Fundador e responsável técnico',
  years: 18,
  bio: 'Arquiteto de software e desenvolvedor, com 18 anos de experiência em sistemas corporativos, integrações e ambientes críticos de produção.',
} as const;

export const editorial = {
  name: 'Código de Produção',
  url: 'https://codigodeproducao.com.br/',
} as const;

const phone = optional(import.meta.env.PUBLIC_CONTACT_PHONE);

export const contact = {
  email: optionalEmail(import.meta.env.PUBLIC_CONTACT_EMAIL),
  phone,
  phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
  whatsappUrl: optionalWhatsapp(import.meta.env.PUBLIC_CONTACT_WHATSAPP),
  address: optional(import.meta.env.PUBLIC_COMPANY_ADDRESS),
  cnpj: optional(import.meta.env.PUBLIC_COMPANY_CNPJ),
} as const;

export const contactForm = {
  endpoint: optionalUrl('PUBLIC_CONTACT_FORM_ENDPOINT', import.meta.env.PUBLIC_CONTACT_FORM_ENDPOINT),
} as const;

/**
 * Como a página de contato se apresenta:
 * - form: formulário operacional, com endpoint configurado;
 * - direct: sem endpoint, com e-mail ou WhatsApp reais;
 * - pending: sem canal. A publicação fica bloqueada por `npm run check:publish`.
 */
export type ContactMode = 'form' | 'direct' | 'pending';

export const contactMode: ContactMode = contactForm.endpoint
  ? 'form'
  : contact.email || contact.whatsappUrl
    ? 'direct'
    : 'pending';

export const hasDirectContact = Boolean(contact.email || contact.phone || contact.whatsappUrl);

export const nav = [
  { label: 'Produtos', href: '/produtos/' },
  { label: 'Serviços', href: '/servicos/' },
  { label: 'Sobre', href: '/sobre/' },
] as const;

export const primaryCta = {
  label: 'Conversar sobre meu projeto',
  href: '/contato/',
} as const;
