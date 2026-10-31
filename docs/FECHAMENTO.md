# Relatório de fechamento

**Estado: não publicar ainda.** O site está concluído no que independe de dados externos, mas a publicação segue bloqueada por domínio e canal de contato (seção 6).

Data de referência: 31/10/2026. Branch: `feature/create-site`.

## 1. O que foi alterado nesta rodada

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

Saída registrada em `artifacts/qa-final/verificacoes.txt`.

| Verificação | Resultado |
| --- | --- |
| `npm run verify` | 0 erros, 0 avisos, 0 dicas; build concluído; 15 páginas e 602 referências internas corretas |
| `npm run check:contact` | 10 cenários aprovados e `dist/` sem valores de teste |
| `npm run check:publish` | **Bloqueado, como esperado** (saída 1): falta domínio, falta canal e a página de contato ainda indica ausência de canal |
| Procedimento do README em cópia limpa | `npm ci` e `verify` passaram; `.env.example` sem preencher bloqueou (6 itens); com `.env` fictício, só nessa cópia, aprovou; zip inclui `.htaccess`; 16 rotas com 200 e `/nao-existe/` com 404 |
| Chrome: contato | 138 checagens: seleção por link nas seis páginas de produto e nos três serviços, parâmetros desconhecidos, três estados, respostas 200, 204, 422, 500, `ok:false`, redirecionamento, rede, envio duplo e timeout sem reenvio. **Rede simulada: nenhum envio real** |
| Chrome: varredura | 15 rotas em 320, 390, 768, 1024 e 1440px: sem rolagem horizontal, erros de console, salto de títulos, títulos ou descrições repetidos, ou alvos abaixo de 44px nos controles principais |
| Chrome: acessibilidade | axe sem violações nos três estados, em desktop e celular (inclui contraste) |
| Primeira dobra | Botões dentro da tela em 1280×720, 1366×768, 1440×900, 768×1024 e 390×844 |
| Blocos do catálogo | Entre 363 e 364px em desktop |
| Revisão visual | Capturas finais abertas e avaliadas |

## 5. Navegadores e limitações

- **Chrome:** cobertura completa acima.
- **Firefox 157 (snap):** 9 rotas em 320, 390, 768 e 1440px, menu móvel, seleção no formulário e validação, sem erros de console. Sem os cenários de rede simulada nem axe.
- **WebKit/Safari: não testado.** O ambiente não está disponível, e nada aqui vale como validação de Safari.
- **Hostinger e `.htaccess`: não testados.** Sem servidor Apache ou LiteSpeed aqui. O `astro preview` responde 404 a `/produtos` sem barra; a hospedagem normalmente redireciona, e o README manda conferir.
- **`check:publish` valida formato:** um valor fictício bem formado passaria.
- **Testes em navegador** não fazem parte do repositório, para não adicionar dependências. Uma cópia está em `artifacts/qa-final/scripts-navegador/`.

## 6. Dependências externas que impedem a publicação

| Configuração | Dado necessário |
| --- | --- |
| `PUBLIC_SITE_URL` | Domínio definitivo com HTTPS |
| `PUBLIC_CONTACT_EMAIL`, `PUBLIC_CONTACT_WHATSAPP` ou `PUBLIC_CONTACT_FORM_ENDPOINT` | Pelo menos um canal real |

Opcionais, sem bloquear: `PUBLIC_CONTACT_PHONE`, `PUBLIC_COMPANY_ADDRESS` e `PUBLIC_COMPANY_CNPJ`.

## 7. Como preencher e validar

```bash
cp .env.example .env
# Edite .env: domínio real, ao menos um canal real, e apague as linhas que não usar.
npm run verify
npm run check:publish
```

Com `check:publish` aprovado, siga "Hostinger" e "Conferência depois de publicar" no README. Depois de qualquer mudança em `.env`, gere o build e implante de novo.

## 8. Evidências

Pasta local `artifacts/qa-final/`, não versionada (`.gitignore`):

- `home-*`, `catalogo-*`, `produto-*`, `servico-*`, `servicos-desktop`, `sobre-desktop`, `404-desktop`, `menu-movel-foco`.
- `contato-c-sem-canal-*`: configuração real atual, sem canal.
- `contato-a-SINTETICO-*` e `contato-b-SINTETICO-*`: **configuração sintética**, com endereços `.invalid` que não existem.
- `firefox-*`: renderização no Firefox.
- `verificacoes.txt` e `scripts-navegador/`.

## 9. Git

- Branch atual: `feature/create-site`, usada no lugar de criar outra feature equivalente.
- `main`, `develop` e `origin/develop` seguem em `49dd60f`: não há commits diretos a reportar.
- Nada foi commitado, enviado ou publicado. O trabalho está na árvore de trabalho: `README.md` modificado e os demais arquivos novos, sem nenhuma exclusão de arquivo rastreado.

## 10. Referências sobre a Hostinger

- [Páginas de erro](https://docs.hostinger.com/websites/error-pages)
- [Localizar e criar o .htaccess no hPanel](https://www.hostinger.com/au/tutorials/create-default-wordpress-htaccess-file)
- [LiteSpeed na Hostinger](https://www.hostinger.com/blog/?p=1201)
