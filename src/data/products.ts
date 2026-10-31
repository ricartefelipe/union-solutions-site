/**
 * Catálogo de produtos. Para incluir um produto, adicione um item a `products`:
 * a página, o catálogo e a opção do formulário de contato são gerados a partir daqui.
 *
 * Cada afirmação precisa de evidência no repositório do produto (ver docs/FECHAMENTO.md).
 * Não inclua preço, plano, integração, disponibilidade ou homologação sem essa evidência,
 * e não anuncie o que está planejado como se estivesse disponível.
 * ArchLens e ArchLens AI são produtos distintos: não misture suas funcionalidades.
 */

export type ProductSlug =
  | 'hookguard'
  | 'filenorm'
  | 'assinaflow'
  | 'archlens'
  | 'fluxe-b2b-suite'
  | 'comercialcloud';

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
}

export const products: Product[] = [
  {
    slug: 'hookguard',
    name: 'HookGuard',
    area: 'Integrações por webhook',
    purpose: 'Recebe webhooks, entrega ao seu sistema com novas tentativas em caso de falha e permite reprocessar o que não chegou, com cada tentativa registrada.',
    context: 'Para equipes que recebem webhooks e não querem operar fila e novas tentativas.',
    capabilities: [
      'Recepção com gravação do evento antes da resposta ao provedor',
      'Novas tentativas automáticas e registro de cada tentativa',
      'Reprocessamento manual pelo painel, com motivo registrado',
    ],
    onHome: true,
    situations: [
      'Um processo do negócio depende de eventos de um provedor de pagamento, loja ou ERP.',
      'Quando o sistema de destino fica fora do ar, a equipe não sabe o que se perdeu.',
      'Investigar e processar de novo uma entrega com falha é um trabalho manual.',
    ],
    flow: [
      { title: 'Recepção', text: 'O provedor envia o webhook para a URL do projeto, e o evento é gravado antes da resposta.' },
      { title: 'Entrega', text: 'O HookGuard entrega ao seu sistema e tenta de novo em falhas temporárias. Esgotadas as tentativas, o evento fica separado para análise.' },
      { title: 'Reprocessamento', text: 'No painel, a equipe consulta as tentativas e reprocessa o evento quando necessário.' },
    ],
    goodToKnow: 'Um evento pode chegar mais de uma vez ao destino, por isso o seu sistema precisa tratar repetições. O HookGuard não promete entrega exatamente uma vez.',
    availability: 'Disponível para demonstração. O piloto e a forma de implantação, gerenciada ou no seu ambiente, são definidos na proposta.',
    conversationTopics: [
      'Quais provedores enviam eventos e qual sistema os recebe',
      'Como as falhas de entrega são tratadas hoje',
      'Quem acompanha as entregas na sua operação',
    ],
  },
  {
    slug: 'filenorm',
    name: 'FileNorm',
    area: 'Arquivos financeiros',
    purpose: 'Normaliza arquivos OFX, CNAB 240 de retorno, CSV bancário e PDF com texto em eventos padronizados, indicando o que não pôde ser convertido.',
    context: 'Para empresas e software houses que recebem extratos em formatos diferentes.',
    capabilities: [
      'OFX, CNAB 240 de retorno de cobrança, CSV bancário e PDF com texto',
      'Eventos padronizados e motivo de cada linha não convertida',
      'Conferência por saldo em CSV e PDF que trazem saldos',
    ],
    onHome: true,
    situations: [
      'Cada banco entrega os dados em um formato, e alguém reescreve o tratamento ou digita lançamentos.',
      'Erros de valor, data ou duplicidade só aparecem quando os dados já seguiram adiante.',
      'Um sistema próprio precisa receber dados de extratos sem manter um leitor para cada formato.',
    ],
    flow: [
      { title: 'Envio', text: 'O arquivo é enviado pela API e processado em segundo plano.' },
      { title: 'Normalização', text: 'Os registros viram eventos padronizados: crédito ou débito, valor, moeda, data e contraparte.' },
      { title: 'Conferência', text: 'As linhas rejeitadas são listadas com o motivo e, quando o arquivo traz saldos, o resultado é conferido contra eles.' },
    ],
    goodToKnow: 'O FileNorm não faz conciliação nem integração pronta com ERP, e não lê PDF escaneado. Os formatos da sua operação são confirmados com arquivos reais.',
    availability: 'Disponível para demonstração e piloto com arquivos da sua operação, em instalação dedicada.',
    conversationTopics: [
      'Quais bancos e formatos de arquivo sua operação utiliza',
      'Para onde os dados normalizados precisam seguir',
      'Como esse tratamento é feito hoje',
    ],
  },
  {
    slug: 'assinaflow',
    name: 'AssinaFlow',
    area: 'Assinaturas e cobrança',
    purpose: 'Controla o ciclo de assinaturas recorrentes, da contratação ao cancelamento, e aciona o provedor de pagamento para a cobrança.',
    context: 'Para equipes técnicas que buscam uma base em Java e Spring para assinaturas.',
    capabilities: [
      'Renovação, novas tentativas e suspensão de assinaturas',
      'Cancelamento com acesso até o fim do ciclo pago',
      'Integração com Stripe em ambiente de teste',
    ],
    onHome: false,
    situations: [
      'A empresa vai oferecer assinaturas e não quer construir a gestão de ciclos do zero.',
      'A equipe precisa avaliar como tratar renovação, falha de cobrança e cancelamento.',
      'O sistema próprio precisa separar o controle da assinatura do processamento do pagamento.',
    ],
    flow: [
      { title: 'Assinatura', text: 'O cliente contrata um plano, e o AssinaFlow controla o ciclo.' },
      { title: 'Renovação', text: 'Se a cobrança falhar, há novas tentativas. Persistindo a falha, a assinatura é suspensa.' },
      { title: 'Pagamento', text: 'O cadastro do meio de pagamento e a cobrança ficam com o provedor. O AssinaFlow não guarda dados de cartão nem é instituição de pagamento.' },
    ],
    goodToKnow: 'Hoje a cobrança funciona com simulador e com Stripe em ambiente de teste. A cobrança real ainda não está liberada.',
    availability: 'Disponível para demonstração e piloto com dados de teste.',
    conversationTopics: [
      'Como suas assinaturas e cobranças funcionam ou devem funcionar',
      'Qual provedor de pagamento sua empresa utiliza ou pretende utilizar',
      'Quais regras do seu negócio os ciclos precisam respeitar',
    ],
  },
  {
    slug: 'archlens',
    name: 'ArchLens',
    area: 'Diagnóstico de arquitetura',
    purpose: 'Apoia o diagnóstico de aplicações Java legadas: analisa o projeto no seu ambiente, organiza evidências e ajuda a montar um roteiro de modernização.',
    context: 'Para equipes responsáveis por evoluir sistemas Java pouco documentados.',
    capabilities: [
      'Análise estática local, sem enviar o código-fonte para fora',
      'Achados com evidências e revisão de um arquiteto',
      'Roteiro de modernização e relatório',
    ],
    onHome: false,
    situations: [
      'Uma aplicação Java precisa evoluir e pouca gente ainda conhece o sistema.',
      'O código-fonte não pode sair do ambiente da empresa para ser analisado.',
      'A liderança precisa discutir a modernização com base em evidências.',
    ],
    flow: [
      { title: 'Análise', text: 'Uma ferramenta de linha de comando analisa o projeto no seu ambiente e gera um arquivo de metadados, sem o código-fonte.' },
      { title: 'Evidências', text: 'Com esse arquivo e um questionário, o ArchLens gera achados com evidências, revisados por um arquiteto.' },
      { title: 'Roteiro', text: 'Os achados revisados dão origem ao roteiro de modernização e ao relatório.' },
    ],
    goodToKnow: 'A análise usa regras e heurísticas, por isso os resultados passam por revisão humana. O ArchLens apoia um diagnóstico assistido e não substitui o trabalho de arquitetura.',
    availability: 'Disponível para demonstração e como apoio a um diagnóstico assistido.',
    conversationTopics: [
      'Quais aplicações Java precisam ser analisadas',
      'Que decisão de arquitetura ou evolução está em pauta',
      'Quem participa dessa decisão na sua empresa',
    ],
  },
  {
    slug: 'fluxe-b2b-suite',
    name: 'Fluxe B2B Suite',
    area: 'Operações B2B',
    purpose: 'Reúne loja, portal de operações e console de administração em uma suíte para empresas que vendem a outras empresas, com dados separados por cliente.',
    context: 'Para operações B2B que precisam conectar pedidos, inventário e administração.',
    capabilities: [
      'Loja com catálogo, carrinho e criação de pedidos',
      'Operações: pedidos, ajustes de inventário, pagamentos e lançamentos',
      'Administração: clientes, políticas de acesso e auditoria',
    ],
    onHome: false,
    situations: [
      'Loja, operação e administração funcionam desconectadas e geram retrabalho.',
      'Mais de uma empresa ou unidade precisa operar na mesma plataforma, com dados separados.',
      'A empresa avalia uma suíte no lugar de várias ferramentas isoladas.',
    ],
    flow: [
      { title: 'Loja', text: 'O cliente consulta o catálogo e cria o pedido.' },
      { title: 'Operações', text: 'A equipe acompanha pedidos, inventário, pagamentos e lançamentos no portal.' },
      { title: 'Administração', text: 'Os administradores cuidam de clientes, políticas de acesso e auditoria.' },
    ],
    goodToKnow: 'A suíte depende de serviços próprios de identidade, pedidos e pagamentos. O uso em produção e a integração com provedores dependem da implantação e da configuração.',
    availability: 'Disponível para demonstração. A implantação é avaliada para o seu ambiente.',
    conversationTopics: [
      'Como sua operação B2B está organizada',
      'Quais partes da suíte fazem sentido para o seu caso',
      'Quais sistemas já existem e precisam ser considerados',
    ],
  },
  {
    slug: 'comercialcloud',
    name: 'ComercialCloud',
    area: 'Operações comerciais',
    purpose: 'Sistema web de frente de caixa (PDV) e retaguarda para pequenos e médios comércios, com dados separados por cliente.',
    context: 'Para comércios com venda no balcão que precisam ligar o caixa à gestão do dia a dia.',
    capabilities: [
      'PDV: busca de produtos, carrinho, pagamentos e comprovante',
      'Retaguarda: produtos, estoque, clientes, vendas, caixa e financeiro',
      'Perfis de acesso para administração, gerência e caixa',
    ],
    onHome: true,
    situations: [
      'Frente de caixa e retaguarda estão desconectadas e exigem repasses manuais.',
      'O estoque não acompanha as vendas sem conferência.',
      'A empresa está revendo o sistema usado na rotina comercial.',
    ],
    flow: [
      { title: 'Venda', text: 'O operador abre o caixa e registra a venda no PDV, com formas de pagamento e comprovante.' },
      { title: 'Estoque', text: 'Ao finalizar a venda, o estoque é baixado.' },
      { title: 'Retaguarda', text: 'A equipe acompanha vendas, caixa e financeiro na retaguarda.' },
    ],
    goodToKnow: 'A emissão de documento fiscal ainda não está homologada e não faz parte desta oferta. As exigências do seu segmento são avaliadas na conversa.',
    availability: 'Disponível para demonstração e avaliação de piloto.',
    conversationTopics: [
      'Como funciona a rotina do seu caixa e da sua retaguarda',
      'Quais regras e exigências do seu segmento precisam ser consideradas',
      'Quais sistemas e processos existentes precisam ser levados em conta',
    ],
  },
];

export const homeProducts = products.filter((product) => product.onHome).slice(0, 3);

export function productContactUrl(slug: ProductSlug): string {
  return `/contato/?interesse=produto&produto=${slug}`;
}
