# Evoluções depois da validação comercial

Duas evoluções do site ficam documentadas aqui, com hipótese, custo e condição de entrada, e não entram antes de o primeiro ciclo comercial ser avaliado. A implementação atual termina na oferta por intenção (contato com objetivo por produto), na prova antes da demonstração (exemplos reproduzíveis do ArchLens e do FileNorm) e na primeira dobra orientada ao diagnóstico Java.

## Como o primeiro ciclo é validado

- **ArchLens** é tratado como diagnóstico pago de escopo fechado; **FileNorm** como piloto dedicado. Os outros produtos seguem com demonstração e avaliação sob proposta.
- Os pedidos chegam separados por produto e intenção: o assunto do e-mail traz `produto (slug, objetivo)`, e o corpo traz `Objetivo`. A origem do visitante não é capturada no site, por decisão de privacidade; se for necessária, entra como valor fechado (`home`, `produto`, `servicos`, `linkedin`, `parceiro`) com mudança no endpoint, documentada antes.
- O acompanhamento é em registro interno da empresa, fora do site: contato qualificado, conversa, proposta e contratação, com horas reais, custos diretos e margem de contribuição por pedido.
- Hipótese inicial de prospecção: a amostra pública do ArchLens, dirigida a lideranças de engenharia com legado Java. O ciclo é avaliado antes de promover novos produtos ou acrescentar infraestrutura de marketing.

## 1. Demonstração guiada de três passos

**Hipótese.** Um visitante que vê uma tarefa completa, com arquivos fictícios públicos e saídas já verificadas, entende o resultado e encontra o próximo passo sem entrar no ambiente compartilhado. Hoje o exemplo reproduzível mostra entrada e saída; a demonstração guiada acrescentaria o passo do meio, a ação, com o visitante clicando e vendo o resultado aparecer.

**Forma.** Três passos na própria ficha, sem cadastro: escolher um arquivo fictício, enviar e ver a saída. A saída não é gerada ao vivo: vem dos resultados verificados publicados em `public/amostras/`, o que mantém o site estático e sem dependência das demonstrações.

**Custo.** Um componente com estado local por produto, os resultados já existentes e um roteiro por produto nos dados do catálogo. Estimativa: de dois a três dias para FileNorm e ArchLens, sem infraestrutura nova.

**Condição de entrada.** Pelo menos cinco conversas comerciais originadas das fichas, e um teste moderado com visitantes que confirme se a pessoa consegue explicar o resultado e achar o próximo passo. Sem essa validação, o exemplo reproduzível atual é suficiente.

## 2. Estimativa de esforço de importação no FileNorm

**Hipótese.** Equipes que importam arquivos bancários à mão conseguem estimar quanto tempo gastam com isso, e ver o número ajuda a decidir pelo piloto.

**Forma.** Na ficha do FileNorm, dois campos editáveis, arquivos por mês e minutos por arquivo, e o cálculo local no navegador, sem enviar nada. O resultado é identificado como estimativa do cenário informado, sem promessa de economia, e não é guardado.

**Custo.** Um bloco de formulário com cálculo em JavaScript, sem dependências. Estimativa: um dia, incluindo acessibilidade e os dois temas.

**Condição de entrada.** Pelo menos três pedidos de piloto do FileNorm em que o esforço manual tenha sido o motivo citado. Sem isso, o número tende a ser decorativo.

## O que precisa de aprovação antes de ir ao ar

Preços, prazos, SLAs, capacidade de suporte, número de módulos ou reuniões do diagnóstico, logotipos de clientes, depoimentos e métricas só entram no site com dados confirmados e autorizados pela empresa. Até lá, as fichas dizem "sob proposta" e o contato leva à conversa.
