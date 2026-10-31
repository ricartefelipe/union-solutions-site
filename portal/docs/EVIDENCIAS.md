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
