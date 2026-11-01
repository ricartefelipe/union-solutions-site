# Privacidade: inventário e campos a preencher

**Este documento não é uma política de privacidade e não afirma conformidade com a LGPD.** Ele registra o que o portal trata e o que a empresa precisa decidir, com orientação jurídica, antes de abrir o portal a clientes.

As afirmações sobre o site institucional não valem aqui: **o site não usa cookies, e o portal usa**.

## Inventário

| Dado | Finalidade | Onde fica | Quem acessa |
| --- | --- | --- | --- |
| Nome, e-mail, papel, organização | Identificar a pessoa e autorizar o acesso | `app_user`, Keycloak | Union, administrador do próprio cliente |
| Hash da senha, TOTP | Autenticação. O portal nunca recebe a senha | Keycloak | Só o provedor |
| Convites: e-mail, papel, validade, hash do token | Dar acesso | `invitation` | Union, administrador do próprio cliente |
| Projetos, etapas, atualizações | Prestação do serviço | Banco `portal` | Participantes autorizados |
| Documentos e anexos, que podem conter dados de terceiros | Prestação do serviço | Armazenamento S3 na VPS | Participantes autorizados |
| Decisões de aprovação, com autor e data | Registro da decisão sobre uma versão | Banco `portal` | Participantes autorizados |
| Solicitações, comentários e notas internas | Atendimento. Notas internas só para a Union | Banco `portal` | Participantes. Notas: só Union |
| Eventos de auditoria: ator, organização, recurso, ação, data | Rastreabilidade | `audit_event` | Administração da Union |
| Sessão: identificador em hash, tokens cifrados, datas | Manter o login | Banco `portal_sessao` | Só o BFF |
| Registros técnicos: IP, caminho sem parâmetros, status | Operação e segurança | Saída dos containers, até 50 MB por serviço | Quem administra o servidor |
| E-mails: convites, definição e recuperação de senha | Dar acesso | Provedor de SMTP (a contratar) | Provedor de SMTP |
| Avisos: título, link, data e leitura; preferência de e-mail | Informar a pessoa sobre atividade nos seus projetos | `notification`, `app_user.email_notifications` | A própria pessoa |
| Fila de e-mails: destinatário, assunto, situação, erro; corpo só até o envio | Entrega durável dos avisos e convites | `email_outbox` | Administração da Union (destinatário mascarado) |
| Simulações e execuções de retenção: contagens por categoria | Aplicar a política de retenção | `retention_run` | Administração da Union |
| Backups: cópia cifrada de tudo acima, exceto sessões | Recuperação | Destino externo (a definir) | Quem tem a chave do backup |

## Cookies do portal

Todos são técnicos, HttpOnly e, em produção, Secure com prefixo `__Host-`. Não há analytics, pixels nem publicidade, e por isso nenhum banner foi adicionado.

| Cookie | Finalidade | Duração |
| --- | --- | --- |
| `__Host-portal_session` | Identificador opaco da sessão | Até 12 h. Expira antes após 1 h sem uso |
| `__Host-portal_login` | Login em andamento: state, nonce e PKCE, cifrados | 10 min |
| `__Host-portal_invite` | Convite em andamento, cifrado | 2 h |
| `KEYCLOAK_*`, `AUTH_SESSION_*` | Sessão no provedor de identidade | Até 12 h |

## Operadores a informar

| Operador | Situação |
| --- | --- |
| Provedor da VPS | A contratar |
| Provedor de SMTP | A definir |
| Destino externo de backup | A definir |
| Hostinger (site institucional, não o portal) | Contratado |

## Campos a preencher

Nenhum destes dados foi inventado. Eles precisam existir antes de o portal ser aberto a clientes:

| Campo | Valor |
| --- | --- |
| Razão social do controlador | A DEFINIR |
| CNPJ | A DEFINIR |
| Endereço | A DEFINIR |
| Canal para o titular | A DEFINIR. `contato@unionsolutions.tech` existe, mas a designação é decisão da empresa |
| Encarregado (DPO), se aplicável | A DEFINIR |
| Papéis de controlador e operador perante cada cliente | A DEFINIR |
| Bases legais por finalidade | A DEFINIR |
| Prazo de retenção: contas desativadas | A DEFINIR |
| Prazo de retenção: documentos e anexos | A DEFINIR |
| Prazo de retenção: solicitações e comentários | A DEFINIR |
| Prazo de retenção: auditoria | A DEFINIR |
| Prazo de retenção: registros técnicos | Hoje limitado por tamanho, não por data |
| Prazo de retenção: backups | `PORTAL_BACKUP_KEEP_*` |
| Procedimento de atendimento a titulares | A DEFINIR |
| Texto final da política e endereço de publicação | A DEFINIR |

## O que o software ainda não faz

- Não apaga dados automaticamente enquanto a retenção estiver desligada (estado inicial). Com a política aprovada e configurada, remove só as categorias de `OPERACAO.md`, "Retenção". Contas e auditoria não são removidas pela aplicação.
- Não exporta os dados de um titular por uma tela própria.
- Não publica política de privacidade: o texto e o endereço dependem dos campos acima.
- A cifragem em repouso dos volumes depende do disco da VPS. O backup é cifrado pelo restic.
