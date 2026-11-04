/**
 * Catálogo de produtos. Para incluir um produto, adicione um item a `products.json`:
 * a página, o catálogo e a opção do formulário de contato são gerados a partir daqui.
 *
 * Cada afirmação precisa de evidência no repositório do produto (ver docs/FECHAMENTO.md).
 * Não inclua preço, plano, integração, disponibilidade ou homologação sem essa evidência,
 * e não anuncie o que está planejado como se estivesse disponível.
 * ArchLens e ArchLens AI são produtos distintos: não misture suas funcionalidades.
 */

import productsData from './products.json';

export type ProductSlug =
  | 'hookguard'
  | 'filenorm'
  | 'assinaflow'
  | 'archlens'
  | 'fluxe-b2b-suite'
  | 'comercialcloud'
  | 'skillforge'
  | 'cards-api';

/** Credencial pública de uma demonstração. `copy` só vale para valor sem espaços (aparece o botão Copiar). */
export interface DemoAccess {
  label: string;
  value: string;
}

/**
 * Captura de uma tela da demonstração pública, com dados fictícios e sem credenciais.
 * `id` é o nome dos arquivos em public/capturas/ (gerados por `npm run assets:shots`); a primeira é a principal.
 */
export interface ProductScreen {
  id: string;
  /** Descreve o que a tela mostra, para quem não a vê. */
  alt: string;
}

export interface FlowStep {
  title: string;
  text: string;
}

export interface Product {
  slug: ProductSlug;
  name: string;
  /** Categoria exibida no catálogo. */
  area: string;
  /** Uma frase sobre a finalidade do produto. */
  purpose: string;
  /** Telas da demonstração: a primeira aparece na home, no catálogo e no topo da página do produto. */
  screens: ProductScreen[];
  /** Uma linha sobre público ou contexto de uso. */
  context: string;
  /** Capacidades verificadas: no máximo três. */
  capabilities: string[];
  /** Selecionado para a home. A escolha é editorial, não um ranking. */
  onHome: boolean;
  /** Situações em que o produto pode fazer sentido. */
  situations: string[];
  /** Fluxo de uso, limitado às capacidades verificadas. */
  flow: FlowStep[];
  /** O limite que o comprador precisa conhecer antes de decidir. */
  goodToKnow: string;
  /** Como o produto pode ser avaliado hoje. */
  availability: string;
  /** O que vale levar para a conversa sobre demonstração. */
  conversationTopics: string[];
  /** Demonstração pública no ar, quando existir: endereço HTTPS e o que o visitante encontra lá. */
  liveDemo?: { url: string; note: string; access?: DemoAccess[]; links?: { label: string; url: string }[] };
}

/** Os dados ficam em `products.json`: o catálogo é declarativo, e cada produto tem a mesma forma por definição. */
export const products: Product[] = productsData as Product[];

export const homeProducts = products.filter((product) => product.onHome).slice(0, 3);

/** Produtos cujas telas aparecem em camadas no topo da home (atrás, na frente e ao lado), pela primeira captura. */
export const heroSlugs: ProductSlug[] = ['fluxe-b2b-suite', 'comercialcloud', 'cards-api'];

/** Produtos com demonstração pública no ar, na ordem do catálogo. */
export const demoProducts = products.filter((product) => product.liveDemo);

/** Todos os produtos têm demonstração pública: o selo por produto deixa de informar e some. */
export const allHaveDemo = demoProducts.length === products.length;

/** Endereço que leva à demonstração: a página de demonstrações, onde ficam o aviso e o acesso. */
export function productDemoUrl(slug: ProductSlug): string {
  return `/demonstracoes/#${slug}`;
}

export function productContactUrl(slug: ProductSlug): string {
  return `/contato/?interesse=produto&produto=${slug}`;
}
