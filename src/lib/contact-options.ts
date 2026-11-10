import { products } from '../data/products';

export const interests = [
  { value: 'produto', label: 'Produto' },
  { value: 'consultoria', label: 'Consultoria' },
  { value: 'arquitetura', label: 'Arquitetura' },
  { value: 'desenvolvimento', label: 'Desenvolvimento' },
  { value: 'parceria', label: 'Parceria' },
] as const;

export const productOptions = [
  ...products.map((product) => ({ value: product.slug as string, label: product.name })),
  { value: 'ainda-nao-sei', label: 'Ainda não sei qual produto' },
];

/** Intenção de testar, válida para qualquer produto; as comerciais vêm do catálogo. */
export const demoObjective = 'demo';

/** O que cada produto aceita como intenção no contato, e como apresenta a comercial. */
export interface ProductContactEntry {
  name: string;
  objective: string;
  subject: string;
  hint: string;
}

export const productContactCatalog: Record<string, ProductContactEntry> = Object.fromEntries(
  products.map((product) => [
    product.slug,
    { name: product.name, objective: product.objective, subject: product.contact.subject, hint: product.contact.hint },
  ]),
);

/** Intenções válidas por produto: a comercial do catálogo e a demonstração. */
export const objectivesByProduct: Record<string, string[]> = Object.fromEntries(
  products.map((product) => [product.slug, [product.objective, demoObjective]]),
);

/** Orientação do campo de mensagem conforme o interesse. `{produto}` é trocado pelo nome do produto escolhido. */
export const messageGuidance: Record<(typeof interests)[number]['value'], { label: string; hint: string }> = {
  produto: {
    label: 'Descreva o seu cenário',
    hint: 'Conte como {produto} entraria na sua operação: volumes, sistemas envolvidos e o que precisa funcionar primeiro.',
  },
  consultoria: {
    label: 'Descreva o problema ou a decisão',
    hint: 'Conte o que está acontecendo, o que já foi tentado e o que já existe na sua empresa.',
  },
  arquitetura: {
    label: 'Descreva o sistema',
    hint: 'Conte o que o sistema precisa fazer, o que já existe e o que limita as escolhas: equipe, prazos, tecnologias e operação.',
  },
  desenvolvimento: {
    label: 'Descreva o processo',
    hint: 'Conte qual processo o software deve apoiar, como ele é feito hoje e quais sistemas precisam conversar com ele.',
  },
  parceria: {
    label: 'Descreva a parceria',
    hint: 'Conte o que a sua empresa faz e que tipo de parceria tem em mente.',
  },
};
