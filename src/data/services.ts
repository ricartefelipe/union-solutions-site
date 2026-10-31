/** Conteúdo comercial das páginas de serviço. Não publique preços nem prazos universais aqui. */

export type ServiceSlug = 'consultoria' | 'arquitetura' | 'desenvolvimento';

export interface ScopeItem {
  title: string;
  text: string;
}

export interface Service {
  slug: ServiceSlug;
  name: string;
  /** Nome curto usado na navegação entre serviços. */
  shortName: string;
  h1: string;
  intro: string;
  summary: string;
  metaDescription: string;
  /** Situações em que vale contratar. */
  situations: string[];
  scope: ScopeItem[];
  deliverables: ScopeItem[];
  ctaLabel: string;
}

export const engagementModels: ScopeItem[] = [
  {
    title: 'Projeto com escopo definido',
    text: 'Para necessidades que podem ser delimitadas desde o início. Objetivo, entregáveis e limites ficam definidos na proposta.',
  },
  {
    title: 'Entregas por etapas',
    text: 'Para trabalhos em que cada fase ajuda a definir a seguinte. O avanço é combinado etapa a etapa.',
  },
  {
    title: 'Acompanhamento recorrente',
    text: 'Para quem precisa de apoio contínuo, com dedicação e temas combinados em contrato.',
  },
];

export const proposalSteps: ScopeItem[] = [
  { title: 'Conte o contexto', text: 'Descreva o problema ou o objetivo e o que já existe na sua empresa.' },
  { title: 'Alinhamos escopo e formato', text: 'Definimos o que faz parte do trabalho e qual modalidade faz sentido.' },
  { title: 'Você recebe a proposta', text: 'Com objetivo, entregáveis, limites, prazos e valores para decidir.' },
];

export const techIntro =
  'As escolhas dependem do contexto: sistemas existentes, equipe, requisitos e forma de operação. Estas são tecnologias com as quais podemos trabalhar.';

export const techGroups: { title: string; items: string[] }[] = [
  { title: 'Backend', items: ['Java', 'Kotlin', 'Spring Boot', 'Quarkus', 'Node.js', 'Python'] },
  { title: 'Interfaces', items: ['React', 'Next.js', 'Angular'] },
  { title: 'Dados e integração', items: ['PostgreSQL', 'Oracle', 'Redis', 'Kafka', 'RabbitMQ'] },
  { title: 'Cloud e plataforma', items: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes'] },
];

export const services: Service[] = [
  {
    slug: 'consultoria',
    name: 'Consultoria em tecnologia',
    shortName: 'Consultoria',
    h1: 'Entender o problema antes de decidir o que construir, corrigir ou trocar.',
    intro: 'Para empresas com um problema técnico sem causa clara ou uma decisão difícil pela frente: investigação e orientação sobre sistemas, integrações e processos de engenharia.',
    summary: 'Análise de problemas, orientação técnica e planos de melhoria para sistemas, integrações e processos de engenharia.',
    metaDescription:
      'Diagnóstico técnico, investigação de problemas, recomendações justificadas e plano de ação para sistemas, integrações, performance e modernização.',
    situations: [
      'O sistema está lento ou instável, e a causa não está clara.',
      'As integrações falham com frequência e são difíceis de investigar.',
      'A entrega de software ficou lenta ou arriscada.',
      'A empresa precisa modernizar, mas ainda não sabe por onde começar.',
      'A liderança quer uma segunda opinião técnica antes de decidir.',
    ],
    scope: [
      { title: 'Diagnóstico técnico', text: 'Leitura do estado atual de sistemas e processos, separando causas de sintomas.' },
      { title: 'Performance e estabilidade', text: 'O que torna a aplicação lenta ou instável, e o que fazer a respeito.' },
      { title: 'Integrações', text: 'Como os sistemas trocam informações e onde essa troca falha.' },
      { title: 'Engenharia e entrega', text: 'Como o software é construído, testado e colocado em produção.' },
      { title: 'Cloud, observabilidade e segurança', text: 'Como as aplicações são operadas e monitoradas, e onde estão expostas.' },
      { title: 'Apoio a equipes e lideranças', text: 'Orientação técnica para quem decide e para quem implementa.' },
      { title: 'Planejamento de modernização', text: 'O que mudar, em que ordem e com quais riscos.' },
    ],
    deliverables: [
      { title: 'Diagnóstico', text: 'O estado do que foi analisado e os problemas encontrados.' },
      { title: 'Investigação de problemas', text: 'Apuração da causa de falhas, lentidão ou instabilidade específicas.' },
      { title: 'Recomendações justificadas', text: 'O que fazer e por quê, em termos que permitam decidir.' },
      { title: 'Plano de ação', text: 'As ações em ordem de prioridade, considerando impacto e risco.' },
      { title: 'Acompanhamento', text: 'Apoio durante a execução do plano.' },
    ],
    ctaLabel: 'Conversar sobre consultoria',
  },
  {
    slug: 'arquitetura',
    name: 'Arquitetura de software',
    shortName: 'Arquitetura',
    h1: 'Decisões de estrutura que sustentam o sistema depois da primeira versão.',
    intro: 'Para empresas que vão iniciar um sistema ou evoluir um existente: estrutura definida considerando segurança, desempenho, operação e crescimento.',
    summary: 'Estruturação de novas soluções e evolução de sistemas considerando segurança, desempenho, operação e crescimento.',
    metaDescription:
      'Desenhos da solução, decisões arquiteturais, contratos de integração, requisitos de qualidade e roteiro de evolução para sistemas novos e existentes.',
    situations: [
      'Um novo sistema vai começar e as decisões iniciais terão efeito por muito tempo.',
      'A aplicação cresceu e sua estrutura dificulta cada nova mudança.',
      'Vários sistemas precisam conversar sem criar dependências frágeis.',
      'O produto precisa atender vários clientes na mesma plataforma.',
      'O legado precisa evoluir sem interromper a operação.',
    ],
    scope: [
      { title: 'Novos sistemas', text: 'Estrutura inicial alinhada aos objetivos do negócio e às restrições do projeto.' },
      { title: 'Evolução de aplicações existentes', text: 'Caminhos para mudar a estrutura de um sistema que já está em uso.' },
      { title: 'Integrações e processamento assíncrono', text: 'Contratos e fluxos para a troca de informações entre sistemas.' },
      { title: 'Sistemas distribuídos e multitenancy', text: 'Limites entre serviços e isolamento entre clientes.' },
      { title: 'Modernização de legado', text: 'Planejamento da transição, considerando a continuidade da operação.' },
      { title: 'Cloud, dados, identidade e operação', text: 'Onde a solução roda, como trata dados e acessos e como será operada.' },
    ],
    deliverables: [
      { title: 'Desenhos da solução', text: 'A estrutura representada em nível útil para quem decide e para quem implementa.' },
      { title: 'Decisões arquiteturais', text: 'O que foi decidido, as alternativas consideradas e os motivos.' },
      { title: 'Contratos de integração', text: 'Como cada parte da solução se comunica com as demais.' },
      { title: 'Requisitos de qualidade', text: 'As expectativas de segurança, desempenho e operação que orientam o projeto.' },
      { title: 'Roteiro de evolução', text: 'As etapas para levar a arquitetura à construção e à evolução do sistema.' },
    ],
    ctaLabel: 'Conversar sobre arquitetura',
  },
  {
    slug: 'desenvolvimento',
    name: 'Desenvolvimento sob medida',
    shortName: 'Desenvolvimento',
    h1: 'Sistemas construídos a partir dos processos e objetivos da sua empresa.',
    intro: 'Para empresas cujo processo não cabe em uma ferramenta pronta: sistemas, APIs, portais, aplicativos, integrações e automações.',
    summary: 'Sistemas, APIs, portais e aplicativos construídos de acordo com os processos e objetivos do cliente.',
    metaDescription:
      'Sistemas corporativos, portais B2B, APIs, integrações, aplicativos, automações e MVPs, com validação, documentação e implantação conforme contrato.',
    situations: [
      'A operação depende de planilhas e tarefas manuais.',
      'As ferramentas disponíveis não atendem ao processo da empresa.',
      'Clientes ou parceiros precisam de um portal próprio.',
      'Sistemas precisam trocar informações por meio de APIs.',
      'Uma ideia de produto digital precisa de uma primeira versão com escopo delimitado.',
    ],
    scope: [
      { title: 'Sistemas corporativos', text: 'Software que apoia os processos internos da empresa.' },
      { title: 'Aplicações web e portais B2B', text: 'Interfaces para equipes, clientes e parceiros de negócio.' },
      { title: 'APIs e integrações', text: 'Conexões entre os sistemas que a operação utiliza ou vai utilizar.' },
      { title: 'Aplicativos', text: 'Soluções para dispositivos móveis, quando o processo pede.' },
      { title: 'Automação', text: 'Fluxos automatizados no lugar de tarefas repetitivas.' },
      { title: 'Evolução de sistemas', text: 'Novas funcionalidades e melhorias em software que já está em uso.' },
      { title: 'Produtos digitais e MVPs', text: 'Primeiras versões com escopo delimitado, para colocar a ideia à prova.' },
    ],
    deliverables: [
      { title: 'Software construído', text: 'Sistemas, APIs, portais, aplicativos, integrações ou automações, conforme o escopo.' },
      { title: 'Validação', text: 'A verificação do que foi construído em relação ao que foi combinado.' },
      { title: 'Documentação', text: 'O registro necessário para manter e operar a solução.' },
      { title: 'Implantação', text: 'A colocação da solução em uso.' },
      { title: 'Transferência de conhecimento', text: 'O repasse para quem vai cuidar do sistema.' },
    ],
    ctaLabel: 'Conversar sobre desenvolvimento',
  },
];

export function serviceContactUrl(slug: ServiceSlug): string {
  return `/contato/?interesse=${slug}`;
}
