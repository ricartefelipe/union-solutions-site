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
