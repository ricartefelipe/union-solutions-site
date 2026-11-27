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
  | 'cards-api'
  | 'fornevia'
  | 'pactor'
  | 'servora'
  | 'recorvia';

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
export type NeedSlug = 'comercio' | 'integracoes' | 'financeiro' | 'servicos' | 'ensino' | 'java';

export interface Need {
  slug: NeedSlug;
  title: string;
  /** Uma frase sobre o que o comprador precisa resolver. */
  text: string;
}

export const needs: Need[] = [
  { slug: 'comercio', title: 'Comércio e vendas', text: 'Vender no balcão ou para outras empresas, com caixa, pedidos, preço por cliente e administração ligados.' },
  { slug: 'integracoes', title: 'Integrações', text: 'Receber eventos de outros sistemas sem operar fila, novas tentativas e reprocessamento.' },
  { slug: 'financeiro', title: 'Financeiro: arquivos, cobrança e cartões', text: 'Ler extratos e retornos bancários, cobrar assinaturas, faturar contratos recorrentes e emitir cartões por API.' },
  { slug: 'servicos', title: 'Serviços e contratos', text: 'Atender no local do cliente com orçamento, ordem de serviço e agenda, e aprovar, assinar e acompanhar contratos.' },
  { slug: 'ensino', title: 'Ensino a distância', text: 'Ministrar cursos online e acompanhar turmas, notas, presença e certificados.' },
  { slug: 'java', title: 'Modernização Java', text: 'Entender uma aplicação Java pouco documentada antes de decidir como evoluí-la.' },
];

/** Intenção comercial que o botão da ficha leva ao contato. `demo` é a intenção de testar, válida para todos. */
export type ContactObjective = 'diagnostico' | 'piloto' | 'avaliacao';

/** Como o contato é apresentado quando o visitante vem do botão comercial. */
export interface ProductContact {
  /** Assunto mostrado no formulário e recebido no e-mail. */
  subject: string;
  /** Pergunta que orienta a descrição. */
  hint: string;
}

/** Metadados da ficha do produto para busca e compartilhamento. */
export interface ProductSeo {
  /** Título da página, sem o nome da empresa, com os termos que o comprador usa para procurar. */
  title: string;
  description: string;
}

/** Evento normalizado exibido no exemplo, já formatado para leitura. */
export interface SampleEvent {
  date: string;
  direction: 'Crédito' | 'Débito';
  amount: string;
  description: string;
  /** Linha ou registro de origem no arquivo enviado. */
  source: string;
}

/** Um arquivo de entrada e a saída real que o produto gerou para ele. */
export interface SampleCase {
  title: string;
  /** O que o arquivo tem e o que vale observar na saída. */
  text: string;
  input: { label: string; href: string; preview: string[] };
  output: { label: string; href: string };
  /** Saída tabular, quando o produto devolve registros. */
  events?: SampleEvent[];
  /** Saída em pares, quando o produto devolve um achado ou um item. */
  rows?: { label: string; value: string }[];
  /** O que observar na saída, uma frase por item. */
  findings: string[];
}

/** Exemplo reproduzível: entrada fictícia, saída gerada pelo produto e como repetir na demonstração. */
export interface ProductSample {
  title: string;
  intro: string;
  /** Rótulo do botão da ficha que leva ao exemplo, como "Ver exemplo de conversão". */
  ctaLabel: string;
  cases: SampleCase[];
  /** Versão do produto e data em que a saída foi gerada. */
  provenance: string;
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
  /** Intenção que o botão comercial carrega para o contato. */
  objective: ContactObjective;
  /** O que a oferta inclui ou o que o piloto avalia, uma frase por item; aparece em "Como contratar". */
  hiring?: string[];
  /** Assunto e orientação do contato para essa intenção. */
  contact: ProductContact;
  /** O que vale levar para a conversa sobre demonstração. */
  conversationTopics: string[];
  /** Demonstração pública no ar, quando existir: endereço HTTPS e o que o visitante encontra lá. */
  liveDemo?: { url: string; note: string; access?: DemoAccess[]; links?: { label: string; url: string }[] };
  seo: ProductSeo;
  /** Exemplo com entrada e saída reais, quando o produto permite publicar um. Os arquivos ficam em public/amostras/<slug>/. */
  sample?: ProductSample;
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

/** Caminhos de entrada da home: a necessidade que o visitante reconhece e o produto que responde a ela. */
export interface HomePath {
  need: string;
  text: string;
  slug: ProductSlug;
  label: string;
}

export const homePaths: HomePath[] = [
  {
    need: 'Preciso decidir como modernizar um legado Java',
    text: 'O ArchLens analisa a aplicação no seu ambiente e organiza evidências para um roteiro de modernização revisado por arquiteto.',
    slug: 'archlens',
    label: 'Ver o ArchLens',
  },
  {
    need: 'Preciso integrar sistemas ou padronizar dados',
    text: 'O FileNorm transforma OFX, CNAB 240, CSV e PDF bancários em eventos padronizados; o HookGuard recebe e reprocessa webhooks.',
    slug: 'filenorm',
    label: 'Ver o FileNorm',
  },
];

/** Prova do topo da home: o achado, a evidência e a etapa do roteiro do exemplo do ArchLens. */
export function heroProof() {
  const archlens = products.find((product) => product.slug === 'archlens');
  const cases = archlens?.sample?.cases ?? [];
  const row = (index: number, label: string) => cases[index]?.rows?.find((item) => item.label === label)?.value ?? '';
  return {
    finding: row(0, 'Achado'),
    severity: row(0, 'Severidade'),
    evidence: row(0, 'Evidências'),
    phase: row(1, 'Fase'),
    step: row(1, 'Etapa'),
    href: '/produtos/archlens/#exemplo',
  };
}

/** Produtos com demonstração pública no ar, na ordem do catálogo. */
export const demoProducts = products.filter((product) => product.liveDemo);

/** Todos os produtos têm demonstração pública: o selo por produto deixa de informar e some. */
export const allHaveDemo = demoProducts.length === products.length;

/** Endereço que leva à demonstração: a página de demonstrações, onde ficam o aviso e o acesso. */
export function productDemoUrl(slug: ProductSlug): string {
  return `/demonstracoes/#${slug}`;
}

/** Endereço do contato com a intenção comercial do produto. Sem `objective`, usa a do catálogo. */
export function productContactUrl(slug: ProductSlug, objective?: ContactObjective | 'demo'): string {
  const chosen = objective ?? products.find((product) => product.slug === slug)?.objective;
  return `/contato/?interesse=produto&produto=${slug}${chosen ? `&objetivo=${chosen}` : ''}`;
}
