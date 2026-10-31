# Evidências de teste

Execuções em 31/10/2026, em dois ambientes locais com serviços reais em containers. Nenhum e-mail real foi enviado, nada foi publicado e nenhum servidor externo foi usado.

| Ambiente | O que é | Evidências |
| --- | --- | --- |
| Desenvolvimento (`deploy/local`) | Keycloak em `start-dev`, sem MFA, HTTP | `artifacts/portal-qa/*.png`, `execucao-final.log`, `mutacoes.log`, `atualizacao-local.txt` |
| Prova de produção (`deploy/production/teste`) | **Compose, imagens e validações de produção**, com TLS de autoridade de teste, MFA, Mailpit como SMTP e destino de backup isolado | `artifacts/portal-qa/producao/`: `execucao-final.log`, `execucao-recuperacao.log`, `auditoria.txt`, `keycloak-pool.txt`, `medicoes.txt`, `capturas/`, `vulnerabilidades/` |

As pastas em `artifacts/` são locais e não versionadas. As capturas não contêm segredos; o estado dos testes (senhas e segredos TOTP sintéticos) fica fora da coleta.

## Resultados

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| API: integração com PostgreSQL real (Testcontainers) | Maven | 57 de 57 |
| Mutações: 8 controles de segurança desligados um a um | Maven | 8 de 8 detectadas |
| `01-jornada`: 10 etapas da jornada cliente/Union, a partir de banco vazio | Desenvolvimento e produção | 15 de 15 nos dois |
| `02-seguranca`: sessão, CSRF, convites, antivírus real, revogação, teclado, axe, 320 e 390 px | Desenvolvimento e produção | 18 de 18 nos dois |
| `03-operacao`: backup e restauração local, recusas de produção, demonstração | Desenvolvimento | 4 de 4 |
| `04-producao`: TLS, cookies `__Host-`, proxy fechado, redes, OIDC, MFA, recuperação, dependências indisponíveis, arquivos, auditoria | Produção | 15 de 15 |
| `05-essencial`: entrar, consultar, baixar, abrir solicitação e sair | Produção, Chromium, Firefox e WebKit | 1 de 1 em cada |
| `06-restauracao`: restauração do backup cifrado em projeto separado | Produção | 3 de 3 |
| `07-mfa-removido`: recuperação do segundo fator pelo comando de operação | Produção | 1 de 1 |
| Migrations em banco vazio | Os dois | 6 changesets, 0 erros no log da API |
| Atualização com dados persistidos | Os dois | Versão anterior → nova: dados preservados, sessões recriadas, `02-seguranca` 18 de 18 depois |
| Web: `tsc`, `check:brand`, `npm audit --omit=dev` | Scratch | Passaram, 0 vulnerabilidades |
| Site: `verify`, `check:contact`, `check:publish`, pacote em Apache 2.4 | Local | Ver `docs/FECHAMENTO.md` na raiz |
| Imagens finais com Trivy 0.70.0 | Produção | Ver `VULNERABILIDADES.md` |

Chrome do sistema conduziu as suítes de desenvolvimento. Na prova de produção, Chromium, Firefox e WebKit rodam dentro de um container na rede do proxy, confiando só na autoridade de teste: nenhum erro de TLS é ignorado.

## Jornada completa

| Etapa | Captura |
| --- | --- |
| Primeiro administrador define a senha pelo provedor e entra | `01-admin-painel.png` |
| 1. Cria organização e projeto | `02-admin-projeto.png` |
| 2 e 3. Convite capturado; cliente aceita, define a senha e entra | `03-cliente-convite.png`, `04-cliente-projetos.png` |
| 4. Documento e entrega publicados depois do antivírus | `05-admin-entrega-aguardando.png` |
| 5. Cliente baixa o documento e solicita ajuste | `06-cliente-painel-aprovacao.png`, `07-cliente-ajuste-solicitado.png` |
| 6 e 7. Nova versão sem decisão herdada; cliente aprova a versão exata | `08-cliente-aprovacao.png` |
| 8. Suporte com resposta, sem a nota interna para o cliente | `09-equipe-suporte-com-nota.png`, `10-cliente-suporte.png` |
| 9. Cliente acessa o produto contratado | `11-cliente-produtos.png` |
| 10. Outro cliente não alcança nada do primeiro | `12-outro-cliente-sem-acesso.png` |
| Produção: login com erro, auditoria, projeto, restauração | `producao/capturas/p01-*`, `p02-*`, `p03-*`, `r01-*`, `r02-*` |
| Produção: Chromium, Firefox e WebKit, desktop e 390 px | `producao/capturas/{chromium,firefox,webkit}-*.png` |

## Critérios de aceite

| Critério | Teste |
| --- | --- |
| Sem autenticação, não há acesso | `semAutenticacaoNenhumDadoPrivadoESeAcessa`, E2E "usuário sem autenticação" |
| Cliente A não lê nem altera o cliente B, mesmo por ID | `clienteANaoLeRecursosDoClienteBPorIdConhecido`, `clienteANaoAlteraRecursosDoClienteB`, E2E etapa 10 |
| Membro e equipe sem associação bloqueados | `membroSemAssociacaoNaoAcessaProjetoDaPropriaOrganizacao`, `equipeUnionSemAssociacaoNaoAcessaProjetosRestritos` |
| Cliente não concede papel interno nem muda tenant | `clienteNaoConcedePapelInternoNemAlteraTenant`, `convitesNaoAceitamOrganizacaoOuPapelVindosDoNavegador`, `tenantDoUsuarioEImutavelNoBanco` |
| Convite expirado, reutilizado, de outro destinatário ou concorrente | `conviteExpiradoERejeitado`, `conviteReutilizadoERejeitado`, `conviteDeOutroDestinatarioERejeitado`, `aceitesSimultaneosConsomemOConviteUmaUnicaVez`, E2E |
| Usuário desativado perde o acesso | `usuarioDesativadoPerdeAcessoNaRequisicaoSeguinte`, E2E com sessão aberta. Desativação só no Keycloak: E2E `04` mostra que o token vigente dura até 5 min |
| Documento privado sem link público; bucket privado | `documentoPrivadoNaoTemCaminhoPublico`, E2E do bucket e das redes |
| Arquivo pendente, rejeitado, sem verificação ou com falha não é liberado; reprocessamento | `arquivoPendenteRejeitadoOuSemVerificacaoNaoEDisponibilizado`, `falhaDoScannerNaoLiberaOArquivo`, `reprocessarArquivoJaLiberadoNaoDeixaOArquivoPreso`, E2E com EICAR, ClamAV parado e botão "Verificar novamente" |
| Nota interna não chega ao cliente | `notaInternaNaoApareceParaOCliente`, `anexoInternoNaoEAcessivelPeloCliente`, E2E etapa 8 |
| Aprovação exige permissão e versão correta; concorrência | `aprovacaoExigePermissao`, `ajusteExigeComentarioEDecisaoFicaNaVersaoExata`, `novaVersaoNaoHerdaAprovacaoAnterior`, `aprovacoesConcorrentesGeramUmaUnicaDecisao` |
| Sessão: identificador opaco, renovação, expiração, logout invalida cópia do cookie | E2E `02`: "cookie só traz um identificador opaco", "token vencido é renovado", "depois de sair, uma cópia do cookie não abre" |
| OIDC: state, nonce, PKCE, retorno restrito, sem senha direta | E2E `04` |
| MFA para a equipe, código errado, recuperação sem autobloqueio | E2E `04` e `07` |
| Banco de sessões ou provedor indisponível falha com segurança | E2E `04`: 503 sem dados, sessão preservada, novo login recusado |
| Serviços internos sem porta no host e inalcançáveis da rede pública | E2E `04` e `auditoria.txt` |
| Limites de arquivo no proxy (40 MB) e na API (25 MiB), HTML/SVG recusados, nome com travessia saneado | E2E `04` |
| Produção sem demonstração nem contas conhecidas | E2E `04`, recusas de início em `auditoria.txt` |
| Restauração comprovada: login, TOTP, histórico e arquivo idêntico | E2E `06`, em projeto separado a partir do repositório restic |
| Formulários e erros com teclado; axe | E2E `02` e `04` |

## Dependências indisponíveis e reinício do banco

| Cenário | Resultado |
| --- | --- |
| Reinício planejado (`portal-prod.sh reiniciar-banco`) | Provedor e API reiniciados junto; login em seguida OK |
| Reinício do banco sem reiniciar o provedor (sonda com 16 requisições simultâneas, `keycloak-pool.txt`) | Token: 11 falhas em 1,4 s, depois OK. Leituras: 479 OK e 1 erro 500 logo no início. Em seguida, 160 de 160. Sem a propriedade Quarkus não suportada da versão anterior |
| Logout e novo login logo após o reinício do banco | Logout confirmado pelo provedor; primeiro login OK em 1 s |
| Banco de sessões parado | 503 em páginas e BFF, sessão preservada, volta sozinha |
| Provedor parado | Token vigente segue; token vencido 503 sem apagar a sessão; novo login 502 com aviso; logout encerra a sessão do portal e avisa |
| ClamAV parado | Arquivo pendente, não liberado; verificado ao voltar |
| Backup sem espaço, sem destino ou interrompido | Falha acusada (saídas 3 e 1), API despausada nos três casos, cópia temporária removida |
| Reconciliação com objeto apagado | Acusa 1 faltando e sai com erro |

## Medições

Observações em `medicoes.txt`, com Docker Desktop (12 CPUs, 7,4 GiB para containers), sem teste de capacidade. **Não indicam quantos clientes o ambiente suporta.**

| Momento | Memória total dos serviços | CPU máxima observada |
| --- | --- | --- |
| Repouso (60 s após subir) | ~3,0 GiB, dos quais ClamAV 1,9 GiB ao carregar assinaturas, Keycloak 0,6 GiB, API 0,3 GiB | ClamAV a 100% de um núcleo ao carregar |
| Jornada completa | ~2,3 GiB sem o runner | API 95%, Keycloak 88%, web 66% de um núcleo |
| Segurança, com verificação de arquivo EICAR | ~2,3 GiB sem o runner | API 145% |

Depois do carregamento, o ClamAV estabiliza perto de 1 GiB. Disco: imagens de 90 MB (proxy) a 757 MB (Keycloak); volume de assinaturas do ClamAV 176 MB. A construção das imagens na VPS exige Maven e Next.js: reserve ao menos 4 GiB livres no momento do build. Subida completa em banco vazio: 1 min 23 s com imagens já construídas.

## Falhas encontradas e corrigidas nesta rodada

| Falha | Correção |
| --- | --- |
| Pool do Keycloak com conexões antigas após reinício do banco, corrigido antes com propriedade Quarkus não suportada | Propriedade removida. Pool pequeno com opções oficiais (`KC_DB_POOL_*`), reinício encadeado pelo Compose e repetição de chamadas no BFF. Medido em `keycloak-pool.txt` |
| Sessão era um JWE no cookie: cópia válida até expirar mesmo após logout | Sessão no servidor (`portal_sessao`), cookie com identificador opaco, logout apaga o registro |
| Primeiro administrador: e-mail enviado uma única vez na subida, antes de o provedor estar pronto | Nova tentativa a cada 30 s até o primeiro login |
| Arquivo com falha de verificação ficava preso ao ser reprocessado depois de já liberado | Liberação copia, registra e só então apaga a origem |
| Tela de TOTP do Keycloak sem rótulo no campo da conta (axe) | Rótulo acessível pelo tema |
| WebKit: pré-carregamento de links falhava na CSP e gerava erros de console | `prefetch` desligado nas telas privadas |
| Caddy, `gosu` e `npm` com CVEs nas imagens base | Ver `VULNERABILIDADES.md` |
| Backup pausava a API durante o envio ao destino | Pausa só durante a cópia local; envio depois, com prazo |

## O que não foi testado

- Certificado público por ACME, SMTP real, destino `sftp:`/`s3:` de backup e DNS: dependem de contratação.
- Leitor de tela e teste manual com tecnologia assistiva. Safari real: o WebKit do Playwright não é o Safari.
- Carga, várias instâncias e teste de invasão.
- Hostinger e LiteSpeed para o site: só Apache 2.4 local.
