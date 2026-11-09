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
