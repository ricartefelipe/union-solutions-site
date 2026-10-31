# Relatório de fechamento

**Estado: pacote pronto para publicar, com domínio e e-mail reais.** Falta confirmar o tipo de site no hPanel (seção 6). O procedimento está em [`PUBLICACAO.md`](PUBLICACAO.md). Nada foi publicado.

Data de referência: 31/10/2026. Branch: `feature/portal-cliente-union-solutions`. O portal é uma aplicação separada, em `portal/`, e não bloqueia o site.

## 1. O que foi alterado na rodada do site

- **Produtos:** textos reescritos a partir das evidências da seção 2, com campos próprios para limite (`goodToKnow`) e disponibilidade (`availability`), exibidos uma vez em cada página.
- **Esquemas gráficos:** rótulos alinhados ao texto. FileNorm passou a mostrar os quatro formatos, AssinaFlow usa "provedor" no singular e a Fluxe mostra loja, operações e administração.
- **Home:** a seleção editorial agora é HookGuard, FileNorm e ComercialCloud. O AssinaFlow saiu por estar disponível apenas para demonstração e piloto com dados de teste.
- **Serviços:** a abertura de cada página diz para quem é o serviço.
- **404:** título e texto diretos.
- **Contato, estado C:** aviso curto, assunto preservado, sem instrução técnica e sem o bloco "O que acontece depois", que sugeria um atendimento inexistente.
- **Contato, estado B:** aviso de que a conversa segue as regras do aplicativo e de que o site não recebe nem guarda a mensagem.
- **`check:publish`:** rejeita valores de `.env.example`, confere canonical e `og:image` em cada página, sitemap, `robots.txt` e correspondência do contato, e procura restos de teste e arquivos internos em `dist/`.
- **`check:contact`:** cada build sintético vai para uma pasta isolada, apagada ao final. O `dist/` do projeto não é tocado.
- **Publicação:** `.env.example` com placeholders identificados e `public/.htaccess` para Apache e LiteSpeed (página 404, HTTPS e cabeçalhos básicos).
- **Limpeza:** comentário interno removido do HTML público, JSON-LD com escape de `<`, telefone centralizado na configuração e referência à ferramenta que gerou as imagens removida do README.
- **README:** seção da Hostinger, modos de contato, privacidade e procedimento conferido.

## 2. Afirmações de produto

**Evidência:** leitura de README, documentos comerciais e de fechamento e estrutura do código de cada repositório, sem alterá-los. **Os produtos não foram executados nesta rodada**: nada abaixo é um teste funcional próprio. Textos comerciais anteriores do site não contaram como prova.

| Produto | Commit lido | Verificado e publicado | Corrigido ou removido | Depende de implantação ou ainda não comprovado |
| --- | --- | --- | --- | --- |
| HookGuard | `c8ebbd2` | Gravação antes do aceite, novas tentativas, fila de eventos esgotados, reprocessamento com motivo, painel de tentativas | Publicado o limite de entrega "pelo menos uma vez": o destino precisa tratar repetições | Stripe e GitHub OAuth sem homologação (não citados). Sem licença definida |
| FileNorm | `27b5ca3` | OFX, CNAB 240 de retorno de cobrança, CSV bancário, PDF com texto, eventos padronizados, motivo por linha, conferência por saldo em CSV e PDF | "CNAB" genérico trocado pelo escopo real; incluído PDF com texto | SaaS self-service é NO-GO. Piloto em instalação dedicada é GO. Sem conciliação, ERP e OCR (publicado como limite) |
| AssinaFlow | `977f8a8` | Ciclo, renovação, novas tentativas, suspensão, cancelamento até o fim do ciclo, não guarda dados de cartão, não é instituição de pagamento | "Provedores" no plural e "pagamento processado" removidos; público ajustado para equipes técnicas | **Cobrança real bloqueada.** Stripe só em sandbox, sem homologação externa (publicado como limite) |
| ArchLens | `e7e5ec9` | Análise estática local de Java, sem enviar o código-fonte, achados com evidências e revisão humana, roteiro e relatório | "Aplicações" em geral trocado por Java legado. Nada do ArchLens AI, que é outro produto | MVP demonstrável, não pronto para produção. Heurísticas (publicado como limite). Licença não definida |
| Fluxe B2B Suite | `906195a` | Loja, portal de operações e console de administração, conforme README e páginas das aplicações | Texto genérico trocado pelas três aplicações reais | Depende de três serviços próprios. Uso em produção e provedores de pagamento não comprovados nesta leitura (publicado como limite) |
| ComercialCloud | `d810033` | PDV, retaguarda, baixa de estoque na venda, perfis de acesso, conforme README, recursos da API e nota de verificação da versão 1.4.1 | Texto genérico trocado pelas capacidades reais | **Emissão fiscal sem homologação**, com sandbox por padrão (publicado como limite). Gateway sem validação real (não citado) |

Nos esquemas gráficos, os rótulos usam apenas termos do texto da página. São fluxos conceituais, não telas, e não há captura de produto publicada.

### Dúvidas materiais que permanecem

1. **Licenças:** HookGuard não tem arquivo de licença, e a do ArchLens não foi escolhida. O site oferece demonstração, não licença, mas isso precisa estar definido antes de uma proposta.
2. **Demonstrações:** o site promete demonstração dos seis produtos. Confirme que há ambiente pronto para cada um.
3. **Fluxe em produção:** os documentos de go-live são checklists; não encontrei confirmação de operação real. O texto foi mantido em "disponível para demonstração".

## 3. Inventário de dados e serviços

| Item | Comportamento real |
| --- | --- |
| Cookies, `localStorage`, `sessionStorage` | Não usados (verificado no build e em navegador) |
| Analytics, pixels, publicidade | Nenhum |
| Requisições a terceiros | Nenhuma ao carregar as páginas (verificado). Fontes e imagens são locais |
| Link externo fixo | `codigodeproducao.com.br`, somente ao clicar |
| Formulário (estado A) | POST ao endpoint configurado, só por ação do visitante. Sem logs nem armazenamento no navegador |
| WhatsApp (estado B) | Abre `wa.me` com o assunto no texto. Sem dados pessoais na URL, com `noreferrer`. A conversa segue as regras do aplicativo |
| E-mail (estado B) | Abre o aplicativo do visitante com assunto e corpo codificados |
| Parâmetros de URL | Só `interesse` e `produto`, validados por lista conhecida e escritos com `textContent` |
| HTML dinâmico | Apenas o JSON-LD do layout, com dados de configuração e escape de `<` |
| Segredos no frontend | Nenhum. Variáveis `PUBLIC_` são públicas por definição |
| Hospedagem | Pode registrar acessos em logs próprios |

Não foi adicionado banner de cookies, pois o site não usa cookies. **Não há política de privacidade publicada**: ela depende de identificação do controlador, canal para o titular e serviço de recebimento. `check:publish` lembra disso quando aprova. A decisão sobre publicar sem a política deve passar por quem cuida da conformidade jurídica da empresa.

## 4. Comandos e resultados

Resultados com a configuração real (`PUBLIC_SITE_URL=https://unionsolutions.tech` e `PUBLIC_CONTACT_EMAIL=contato@unionsolutions.tech`), em `artifacts/qa-final/pacote-apache.txt`:

| Verificação | Resultado |
| --- | --- |
| `npm run verify` | 15 páginas e 600 referências internas corretas |
| `npm run check:contact` | Cenários aprovados e `dist/` sem valores de teste |
| `npm run check:publish` | **Aprovado.** Modo de contato direto. Avisa que não há política de privacidade publicada |
| `sh scripts/empacotar-site.sh` | 44 arquivos. Conteúdo extraído idêntico a `dist/`, sem `.env`, fontes, dependências, mapas ou endereços locais |
| Apache 2.4 com o `.htaccess` do pacote | HTTP redireciona para HTTPS, 14 rotas com 200, `/nao-existe/` com 404 e página do site, `/produtos` redireciona para `/produtos/`, listagem de pasta recusada, cabeçalhos de segurança presentes |
| Chrome sobre o pacote extraído | 14 rotas em 320, 390, 768 e 1280 px: sem rolagem horizontal, erros de console ou requisições externas. Canonical e `og:image` corretos, nenhum botão do portal, axe sem violações em 390 e 1280 |
| Contato | `mailto:` real, assunto por produto, parâmetro hostil ignorado, sem formulário |

Rodadas anteriores do site cobriram, com a mesma versão do código: formulário e WhatsApp com configuração sintética (138 checagens), Firefox 157 em 9 rotas e primeira dobra.

## 5. Navegadores e limitações

- **Chrome:** cobertura completa acima.
- **Firefox 157:** 9 rotas em 320, 390, 768 e 1440 px, menu móvel e validação, em rodada anterior. O pacote final não foi repetido no Firefox: o `.htaccess` exige HTTPS, e esse navegador não permite simular o proxy.
- **WebKit/Safari:** não testado no site.
- **Hostinger:** não testada. O `.htaccess` passou em Apache 2.4, mas a Hostinger pode usar LiteSpeed. Confira depois de publicar.
- **`check:publish` valida formato:** os valores atuais foram confirmados por Felipe, e a validação não comprova entrega de e-mail.

## 6. O que falta para publicar

| Item | Efeito |
| --- | --- |
| Confirmar no hPanel se o site atual foi criado no AI Builder ou é um site de arquivos | Define como enviar o pacote. Veja `PUBLICACAO.md` |
| Política de privacidade e identificação jurídica | Decisão da empresa. Não impede o pacote: o site não usa cookies nem formulário |
| Confirmações da seção 2 | Licenças e demonstrações, decisão da empresa |

Domínio e caixa postal não são pendências.

## 7. Evidências

Pasta local `artifacts/qa-final/`, não versionada: capturas das rodadas do site, `pacote-apache.txt` e `pacote-*.png`. Pacote em `artifacts/pacotes/`.

## 8. Referências sobre a Hostinger

- [Páginas de erro](https://docs.hostinger.com/websites/error-pages)
- [Localizar e criar o .htaccess no hPanel](https://www.hostinger.com/au/tutorials/create-default-wordpress-htaccess-file)
- [LiteSpeed na Hostinger](https://www.hostinger.com/blog/?p=1201)
