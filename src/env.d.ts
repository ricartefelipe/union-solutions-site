/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_CONTACT_FORM_ENDPOINT?: string;
  readonly PUBLIC_CONTACT_EMAIL?: string;
  readonly PUBLIC_CONTACT_PHONE?: string;
  readonly PUBLIC_CONTACT_WHATSAPP?: string;
  readonly PUBLIC_COMPANY_ADDRESS?: string;
  readonly PUBLIC_COMPANY_CNPJ?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
