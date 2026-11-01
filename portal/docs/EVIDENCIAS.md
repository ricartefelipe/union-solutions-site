# Evidências de teste

Execuções em 31/10/2026, em dois ambientes locais com serviços reais em containers. Nenhum e-mail real foi enviado, nada foi publicado e nenhum servidor externo foi usado. Esta versão inclui as correções da revisão de código (R1 a R8).

| Ambiente | O que é | Evidências |
| --- | --- | --- |
| Desenvolvimento (`deploy/local`) | Keycloak em `start-dev`, sem MFA, HTTP | `artifacts/portal-qa/*.png`, `execucao-local-correcoes.txt`, `atualizacao-local-correcoes.txt` |
| Prova de produção (`deploy/production/teste`) | **Compose, imagens e validações de produção**, com TLS de autoridade de teste, MFA, Mailpit como SMTP e destino de backup isolado | `artifacts/portal-qa/producao/`: `execucao-correcoes.log`, `operacao.txt`, `auditoria.txt`, `capturas/`, `vulnerabilidades/` |
| Testes de unidade e integração | API com PostgreSQL real (Testcontainers); armazenamento de sessões com PostgreSQL real descartável | `artifacts/portal-qa/api-correcoes.log`, `api-regressao-na-develop.log`, `sessoes-nova.log`, `sessoes-anterior.log` |

As pastas em `artifacts/` são locais e não versionadas. As capturas não contêm segredos; o estado dos testes (senhas e segredos TOTP sintéticos) fica fora da coleta.

## Resultados

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| API: integração com PostgreSQL real, incluindo os 13 testes de concorrência e recuperação (11 da primeira rodada e 2 sobre registros bloqueados anteriores à atualização) | Maven | 70 de 70 |
| Sessões: 14 cenários com barreiras determinísticas (toque e renovação após logout, renovações concorrentes, sessão vencida, cookie copiado, novo login, encerramento por conta, falha do banco, e 5 da transição de sessões legadas) | Node + PostgreSQL | 14 de 14 na implementação atual; **os 5 da transição falham no commit anterior (`b1ee50b`)**; os 9 primeiros falhavam na `develop` |
| Regressão na `develop` (`eb97ce0`): testes novos que compilam contra o código antigo | Maven | **4 de 6 falham no código antigo**: cota ultrapassada em paralelo (4 cabem onde só 3 deveriam), `500` em desativação concorrente de administradores, objeto não apagado após reversão |
| Transição de sessões legadas na atualização local (`b1ee50b` → atual, com uma linha sem vínculo inserida como a versão anterior gravaria) | Desenvolvimento | Linha legada encerrada; 4 sessões com vínculo preservadas; `02-seguranca` 19 de 19 em seguida |
| Changeset 008 na atualização local | Desenvolvimento | Bloqueado existente voltou a contar; limpeza periódica confirmou a exclusão e liberou o espaço |
| `01-jornada`, a partir de banco vazio | Desenvolvimento e produção | 15 de 15 nos dois |
| `02-seguranca`, com o teste novo de logout concorrente com renovação em voo | Desenvolvimento e produção | 19 de 19 nos dois |
| `03-operacao` | Desenvolvimento | 4 de 4 |
| `04-producao` | Produção | 15 de 15 |
| `05-essencial` em Chromium, Firefox e WebKit | Produção | 1 de 1 em cada |
| `07-mfa-removido`: sessão aberta antes da recuperação fica inválida no portal e no provedor; login seguinte exige novo TOTP | Produção | 2 de 2 |
| `06-restauracao`: backup cifrado restaurado em projeto separado, com login, TOTP, histórico e arquivo byte a byte | Produção | 3 de 3 |
| Cenários de operação (`testa-operacao.sh`): backups sobrepostos, backup contra restauração e atualização, atualização com backup interno, erro em cada fase, cancelamento, área abandonada, API pausada por outra atividade, falha de despausa, modos de falha da recuperação de MFA, segredos fora de `argv` | Produção | 33 de 33 |
| Migrations em banco vazio | Os dois | 7 changesets, 0 erros no log da API |
| Atualização sobre dados persistidos (6 → 7 changesets; `portal_session` ganha `subject` e `version`) | Desenvolvimento | Dados preservados; arquivos bloqueados existentes marcados sem objeto |
| Imagens finais com Trivy 0.70.0 (base de 31/10/2026) | Produção | 0 críticas; 6 altas avaliadas uma a uma em `VULNERABILIDADES.md` |
| Web: `tsc`, `check:brand`, `npm audit --omit=dev` | Scratch | Passaram, 0 vulnerabilidades |

## Backup por sftp e implantação real (01/11/2026, terceira rodada)

O destino de backup passou a ser sftp, com chave própria e identidade fixa do servidor, e o ensaio de produção trocou o servidor REST do restic por um servidor SFTP de teste com a mesma configuração da implantação real. Evidências em `artifacts/portal-qa/backup-sftp/`.

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| `01-jornada` (17) e `04-producao` (15) em volumes vazios, com o destino sftp | Produção | 17 de 17; 04 com 14 de 15 na primeira rodada (o teste "provedor fora do ar" falhou no login logo após a derrubada do banco de sessões, como já visto sob carga). Rodada limpa em seguida: `01` 17 de 17, `04` 15 de 15, `02` 19 de 19 |
| `backup` para `sftp:backup@sftp-alvo:/backups/portal`: repositório criado pelo restic no destino, `backup-status` dentro do limite | Produção | OK, 1 snapshot inicial |
| `testa-operacao.sh`: 33 cenários, inclusive destino sftp inacessível, senha errada e backups sobrepostos | Produção | 33 de 33 |
| `auditar`: portas, usuários, TLS com a autoridade de teste, recusas de configuração, registros sem dados sensíveis, permissões | Produção | sem erro |
| `06-restauracao` em projeto separado a partir do primeiro snapshot do repositório sftp: login com TOTP, organização, arquivo byte a byte idêntico, registro criado depois do backup ausente | Produção | 3 de 3 |
| Backup real por sftp: `atualizar` para 1.2.1, `chave-backup`, `destino-backup 147.93.38.49 65002`, `verificar`, `backup` e `backup-status`; repositório cifrado criado em `/home/u415482304/backup-portal` na hospedagem, 1 snapshot | VPS | OK |
| Implantação real: VPS KVM 2 (Campinas), Ubuntu 24.04, Docker oficial, `ufw` 22/80/443, `v1.2.0`, `verificar`, `subir`, 9 changesets, certificado Let's Encrypt, HTTP → HTTPS, console do Keycloak bloqueado, portas internas fechadas de fora, autenticação SMTP conferida sem envio, e-mail do primeiro administrador aceito, timer de backup e primeiro backup | VPS | OK |

Lições desta rodada, já corrigidas: `docker compose run` consome a entrada padrão, então a verificação de chave dentro do container precisa de `</dev/null` para não engolir a confirmação da restauração; o ensaio precisa restaurar pelo identificador do snapshot quando outros backups acontecem depois do registro de referência; duas sequências do ensaio não podem rodar ao mesmo tempo no mesmo projeto.

## Revisão completa de interface e funcionalidades (01/11/2026, segunda rodada)

Depois da rodada de notificações, a entrega foi confrontada com o escopo inteiro: revisão visual do site e do portal, lacunas funcionais do portal, CI e pacote do site. Evidências em `artifacts/portal-qa/revisao-final/` (capturas por largura e navegador, relatórios de axe e rolagem, registros das suítes).

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| Capturas de todas as telas do site (16) e do portal (35 entre públicas, cliente e administração) em 320, 390, 768, 1024 e 1440 px, com axe (WCAG 2.1 AA, exceto 320 px), rolagem horizontal e console; inspeção visual das capturas | Chromium | 255 capturas; sem rolagem horizontal, sem violação do axe e sem erro de console, exceto o `400` esperado ao inspecionar um convite inválido |
| As mesmas telas em 390 e 1440 px | Firefox local; WebKit na imagem oficial do Playwright, já que faltam bibliotecas do sistema nesta máquina | 102 de 102 em cada um, sem problemas |
| API, suíte completa, com a consulta de retenção sem efeito e o registro explícito, histórico da solicitação e remoção do responsável | Maven, PostgreSQL real | 80 de 80 |
| `01-jornada` com o passo 11 novo: edição de etapa, histórico de situação da solicitação sem a nota interna, filtros de suporte, página do documento com versões, produto arquivado some e volta, troca de papel com recusa de cliente → Union pela API (`403 FORBIDDEN`) | Desenvolvimento, de banco vazio | 17 de 17 |
| `02-seguranca`, com `/projetos?situacao=`, `/suporte?abertas=1` e `/documentos/{id}` na verificação de acessibilidade e rolagem | Desenvolvimento | 19 de 19 |
| `03-operacao` | Desenvolvimento | 4 de 4 |
| Atualização sobre dados persistidos: `develop` (`bb21af1`, 8 changesets) com a jornada completa, depois o código atual sobre os mesmos volumes | Desenvolvimento | Jornada na `develop` 15 de 15; 8 changesets antes, 9 depois; 1 projeto, 1 solicitação, 1 documento e 3 contas preservados; 0 erros na API ao subir; preferência de e-mail ligada para as 3 contas existentes; `02-seguranca` com o código novo sobre esses dados 19 de 19 |
| Prova da configuração de produção, de volumes vazios | Produção | 52 de 52 (`01` 17, `02` 19, `04` 15, `05` 1); `auditar` completo, inclusive TLS verificado com a autoridade de teste; `backup` com reconciliação 3 de 3 e 1 snapshot |
| Site: `verify` (15 páginas, 600 referências), `check:contact` (12 modos), `check:publish`, pacote `site-union-solutions-20261101-150354.zip` (44 arquivos, SHA-256 `e70eb377…`) | Scratch | Passaram |
| Web: `tsc`, `check:brand` | Scratch | Passaram |

Correções de interface encontradas na inspeção visual: selo esticado nas linhas com botão (convites), "Sair" quebrando linha no celular, tela Retenção gravando uma simulação a cada visita, botão de contato do site sem marcação de página atual, formulário de contato sem a frase de assunto ao chegar por produto ou serviço. Lacunas funcionais fechadas: troca de papel, edição de etapas, filtros de projetos, suporte e auditoria, página de documento com versões e edição, documentos e arquivamento de produto, histórico e responsável da solicitação, paginação de produtos, pessoas e equipe, aviso de listas truncadas.

## Notificações, fila de e-mails, retenção e CI (01/11/2026)

Execução em 01/11/2026, ambiente de desenvolvimento recriado a partir de volumes vazios e testes de unidade e integração. Evidências locais em `artifacts/portal-qa/notificacoes/`.

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| API, suíte completa com os 10 testes novos: destinatários por lado do projeto e por organização, decisão avisa a Union, nota interna sem aviso nem e-mail, solicitação aberta avisa a equipe, preferência desliga só o e-mail, fila com falha, espera crescente, desistência e reenvio, convite pela fila com corpo descartado, reserva concorrente sem envio duplo, retenção desligada simula e recusa executar, simulação conta e execução remove com os objetos | Maven, PostgreSQL real | 80 de 80 |
| Sessões | Node + PostgreSQL | 14 de 14 |
| `01-jornada`, de banco vazio, com os passos novos: aviso no portal e e-mail no Mailpit só com título e link, marcar lidas, preferência, quem agiu não é avisado, decisão avisa a Union, nota interna sem aviso, fila de e-mails com destinatário mascarado, retenção desligada sem botão de execução, cliente recusado nas telas e na API de administração | Desenvolvimento | 16 de 16 |
| `02-seguranca`, com `/notificacoes`, `/admin/emails` e `/admin/retencao` na verificação de acessibilidade e de rolagem horizontal em 1280, 390 e 320 px | Desenvolvimento | 19 de 19 |
| `03-operacao` | Desenvolvimento | 4 de 4 |
| Web: `tsc`, `check:brand` | Scratch | Passaram |
| Compose de produção com o modelo de `.env` (`config -q`), sintaxe dos scripts de operação | Local | Passaram |
| Migrations em banco vazio | Desenvolvimento | 9 changesets, 0 erros no log da API |
| Prova da configuração de produção, a partir de volumes vazios: `01-jornada` (16), `02-seguranca` (19), `04-producao` (15) e `05-essencial` (1), com TLS, MFA, Mailpit como SMTP e `auditar` e `backup` em seguida | Produção | 51 de 51. `auditar`: portas, usuários, recusas de configuração, registros sem dados sensíveis e permissões conferidos; a etapa de TLS do `auditar` não rodou porque o container auxiliar não conseguiu baixar o `curl` (espelho do Alpine indisponível no momento), e o TLS com a autoridade de teste foi verificado pelo `04-producao`. `backup`: reconciliação 3 de 3 e 1 snapshot |
| Changeset 009 na prova de produção | Produção | Aplicado em banco vazio, sem erro |

Correções encontradas pelos testes de navegador nesta rodada: o nome acessível do link de notificações não continha o texto visível (regra `label-content-name-mismatch`), e o cabeçalho de coluna visualmente oculto da fila de e-mails ficava fora da área de rolagem da tabela e causava rolagem horizontal no celular. As duas foram corrigidas e os testes passaram em seguida. Na prova de produção, o navegador do runner calcula o nome acessível do link de notificações com espaçamento diferente do Chrome local; o nome passou a ser formado pelo texto visível mais um sufixo oculto, e o teste aceita qualquer espaçamento. Uma rodada da prova executada ao mesmo tempo que a suíte local falhou num teste anterior a esta rodada (login logo depois de o banco de sessões ser derrubado, com o provedor ainda se recuperando); repetida sozinha, passou inteira.

## Correções da revisão, com o teste que as cobre

| ID | Correção | Teste |
| --- | --- | --- |
| R1 | Criação e atualização de sessão separadas; `UPDATE` condicional por existência, prazo e versão; `sub` na sessão | `frontend/tests/session.test.mjs` (9), E2E `02` "logout concorrente", `04` |
| R2/R3 | `remover-mfa` com helper no provedor: falha em cada passo, exatamente uma conta, verificação final, logout no provedor, sessões do portal apagadas por `sub`, auditoria antes e depois, operador e motivo, segredo fora de `argv` | `testa-operacao.sh` (10 cenários), E2E `07` |
| R4/R5 | `flock` por implantação; área temporária por execução; limpeza instalada antes dos passos falíveis; despausa verificada; `restic init` só com saída 10; áreas abandonadas | `testa-operacao.sh` (20 cenários) |
| R6 | Advisory lock transacional no conjunto de administradores, com releitura do alvo e de quem pede | `ConcurrencyAndRecoveryTest` (4) |
| R7 | Lock por organização, reserva em `object_ledger`, compensação após reversão, limpeza com idade mínima, `object_present` só falso após exclusão confirmada; changeset 008 corrige a presunção do 007 | `ConcurrencyAndRecoveryTest` (8): inclui registros anteriores com objeto presente, ausente, exclusão recusada, armazenamento indisponível, limpeza repetida e envio concorrente perto da cota |
| R1 (transição) | Sessões sem `sub` encerradas na atualização e recusadas em leitura, toque e renovação; criar sem `sub` é erro | `session.test.mjs` (5 da transição), atualização local |
| R8 | Avaliação individual das altas com caminho de exploração; resumo versionado; decisão residual explícita | `VULNERABILIDADES.md` |
| Bootstrap | Comportamento preservado: para após o aceite; espera crescente em falha | `ConcurrencyAndRecoveryTest.bootstrapTentaDeNovoEmFalhaEParaDepoisDoAceite` |

## Dependências indisponíveis e reinício do banco

| Cenário | Resultado |
| --- | --- |
| Reinício planejado (`portal-prod.sh reiniciar-banco`) | Provedor e API reiniciados junto; login em seguida OK |
| Banco de sessões parado | 503 em páginas e BFF, sessão preservada, volta sozinha |
| Provedor parado | Token vigente segue; token vencido 503 sem apagar a sessão; novo login 502 com aviso; logout encerra a sessão do portal e avisa |
| ClamAV parado | Arquivo pendente, não liberado; verificado ao voltar |
| Backup sem espaço, sem destino, com senha errada, sem retenção, cancelado | Falha acusada com saída própria (3, 124, 12, 1, 143); API despausada e conferida; área temporária removida |
| API já pausada por outra atividade | Backup recusa (70) sem despausar |
| Container da API removido durante a cópia | Falha de despausa anunciada, saída não zero |

## O que não foi testado

- Certificado público por ACME, SMTP real, destino `sftp:`/`s3:` de backup e DNS: dependem de contratação.
- Leitor de tela e teste manual com tecnologia assistiva. Safari real: o WebKit do Playwright não é o Safari.
- Carga, várias instâncias e teste de invasão.
- Hostinger e LiteSpeed para o site: só Apache 2.4 local.
