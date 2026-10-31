import { readPreselection, type Preselection } from './contact-preselection';

export interface ContactMessage {
  /** Descrição do assunto, usada no e-mail e na frase de contexto da página. */
  subject: string;
  opening: string;
}

const interestMessages: Record<string, ContactMessage> = {
  produto: { subject: 'Produtos da Union Solutions', opening: 'Olá! Gostaria de conhecer os produtos da Union Solutions.' },
  consultoria: { subject: 'Consultoria em tecnologia', opening: 'Olá! Gostaria de conversar sobre consultoria em tecnologia.' },
  arquitetura: { subject: 'Arquitetura de software', opening: 'Olá! Gostaria de conversar sobre arquitetura de software.' },
  desenvolvimento: { subject: 'Desenvolvimento sob medida', opening: 'Olá! Gostaria de conversar sobre desenvolvimento sob medida.' },
  parceria: { subject: 'Parceria', opening: 'Olá! Gostaria de conversar sobre uma parceria.' },
};

export const defaultMessage: ContactMessage = {
  subject: 'Contato pelo site da Union Solutions',
  opening: 'Olá! Gostaria de conversar sobre um projeto.',
};

export function buildContactMessage(selection: Preselection, productName?: string): ContactMessage {
  if (productName) {
    return {
      subject: `Demonstração do ${productName}`,
      opening: `Olá! Gostaria de solicitar uma demonstração do ${productName}.`,
    };
  }
  return interestMessages[selection.interest] ?? defaultMessage;
}

/** Lê o assunto vindo do link, por parâmetros validados. Sem assunto válido, retorna null. */
export function readContactContext(
  search: string,
  interestValues: string[],
  productNames: Record<string, string>,
): ContactMessage | null {
  const selection = readPreselection(search, interestValues, Object.keys(productNames));
  return selection.interest ? buildContactMessage(selection, productNames[selection.product]) : null;
}

export function mailtoUrl(email: string, message: ContactMessage): string {
  const body = `${message.opening}\n\nEmpresa:\nNecessidade:\n`;
  return `mailto:${email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(body)}`;
}

export function whatsappUrl(baseUrl: string, message: ContactMessage): string {
  return `${baseUrl}?text=${encodeURIComponent(message.opening)}`;
}
