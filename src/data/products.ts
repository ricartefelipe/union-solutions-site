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

/** Necessidades do comprador, na ordem do catálogo. Cada produto pertence a uma. */
export type NeedSlug = 'comercio' | 'integracoes' | 'financeiro' | 'ensino' | 'java';

export interface Need {
  slug: NeedSlug;
  title: string;
  /** Uma frase sobre o que o comprador precisa resolver. */
  text: string;
}

export const needs: Need[] = [
  { slug: 'comercio', title: 'Comércio e vendas', text: 'Vender no balcão ou para outras empresas, com caixa, pedidos e administração ligados.' },
  { slug: 'integracoes', title: 'Integrações', text: 'Receber eventos de outros sistemas sem operar fila, novas tentativas e reprocessamento.' },
  { slug: 'financeiro', title: 'Financeiro: arquivos, cobrança e cartões', text: 'Ler extratos e retornos bancários, cobrar assinaturas e emitir cartões por API.' },
  { slug: 'ensino', title: 'Ensino a distância', text: 'Ministrar cursos online e acompanhar turmas, notas, presença e certificados.' },
  { slug: 'java', title: 'Modernização Java', text: 'Entender uma aplicação Java pouco documentada antes de decidir como evoluí-la.' },
];

/** Metadados da ficha do produto para busca e compartilhamento. */
export interface ProductSeo {
  /** Título da página, sem o nome da empresa, com os termos que o comprador usa para procurar. */
  title: string;
  description: string;
}

export interface FlowStep {
  title: string;
  text: string;
}

export interface Product {
  slug: ProductSlug;
  name: string;
  /** Categoria exibida nos cartões e no topo da ficha. */
  area: string;
  /** Necessidade do comprador que agrupa o produto no catálogo. */
  need: NeedSlug;
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
  /** Como o produto pode ser avaliado hoje: aparece junto dos botões, no topo da ficha. */
  availability: string;
  /** Rótulo do botão comercial da ficha: piloto, diagnóstico, avaliação ou implantação, conforme a oferta. */
  ctaLabel: string;
  /** O que vale levar para a conversa sobre demonstração. */
  conversationTopics: string[];
  /** Demonstração pública no ar, quando existir: endereço HTTPS e o que o visitante encontra lá. */
  liveDemo?: { url: string; note: string; access?: DemoAccess[]; links?: { label: string; url: string }[] };
  seo: ProductSeo;
}

/** Os dados ficam em `products.json`: o catálogo é declarativo, e cada produto tem a mesma forma por definição. */
export const products: Product[] = productsData as Product[];

export const homeProducts = products.filter((product) => product.onHome).slice(0, 3);

/** Catálogo agrupado por necessidade, na ordem de `needs`; dentro de cada grupo, a ordem do catálogo. */
export const catalog = needs
  .map((need) => ({ need, products: products.filter((product) => product.need === need.slug) }))
  .filter((group) => group.products.length > 0);

/** Captura principal da ficha, para a imagem de compartilhamento. */
export function productSocialImage(product: Product) {
  const screen = product.screens[0];
  return { src: `/capturas/${screen.id}-1024.jpg`, width: 1024, height: 576, alt: screen.alt };
}

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
