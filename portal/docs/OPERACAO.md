# Guia operacional

## Papéis

| Papel | Pode |
| --- | --- |
| `UNION_ADMIN` | Administrar clientes, usuários, projetos, auditoria e todos os registros |
| `UNION_STAFF` | Operar os projetos dos quais participa e os clientes aos quais foi associado |
| `CLIENT_ADMIN` | Ver os dados da própria organização, convidar pessoas, revogar acessos e aprovar entregas |
| `CLIENT_MEMBER` | Ver e operar os projetos aos quais foi associado. Aprova somente com autorização no projeto |

A equipe da Union não aprova entregas pelo cliente.

Os comandos `portal-prod.sh` valem para a produção, e `portal.sh`, para o ambiente local.

## Primeiro administrador

Defina `PORTAL_BOOTSTRAP_ADMIN_EMAIL` antes da primeira subida. Enquanto não existir nenhum administrador, a API cadastra esse e-mail e pede ao Keycloak o e-mail de definição de senha.

- Se o provedor ou o SMTP falhar, a API tenta de novo com espera crescente: 30 s, 1 min, 2 min, 4 min, 8 min e, daí em diante, a cada 8 min, registrando só o tipo da falha no log.
- Quando o provedor **aceita** o envio, as tentativas param. Aceite do Keycloak não é entrega: se o e-mail não chegar, confira o SMTP e a caixa de spam e use "Esqueci a senha" na tela de login, que faz o provedor enviar de novo.
- Reiniciar a API recomeça as tentativas na hora, enquanto o primeiro login não acontecer. Depois do primeiro login, a variável deixa de ter efeito.

O vínculo com a conta ocorre no primeiro login, com e-mail verificado. Em produção, esse login também exige configurar o segundo fator.

## Segundo fator (MFA)

| Quem | Regra em produção |
| --- | --- |
| `UNION_ADMIN`, `UNION_STAFF` | TOTP obrigatório. Sem TOTP configurado, o login cobra a configuração e não abre sessão antes disso |
| `CLIENT_ADMIN`, `CLIENT_MEMBER` | Sem segundo fator nesta versão |

O papel `portal-mfa` é atribuído à conta pela API, ao enviar o e-mail de definição de senha. O realm usa o fluxo `portal-browser-mfa`, fixado no compose de produção. No ambiente local, o segundo fator fica desligado.

**Recuperação:** quem perdeu o dispositivo pede à administração. Confirme a identidade da pessoa por outro canal e registre o atendimento antes de rodar:

```bash
sh portal-prod.sh remover-mfa <e-mail> "<motivo ou identificador do atendimento>"
```

O que o comando faz, nesta ordem:

1. Grava a tentativa na auditoria (`MFA_RESET_REQUESTED`), com operador, motivo e identificador de correlação. Se a auditoria estiver indisponível, **nada é alterado**.
2. No provedor, com o cliente administrativo permanente `portal-admin` (o segredo sai do ambiente do container pelo mecanismo suportado do `kcadm`, nunca por argumento de processo): exige exatamente uma conta com o e-mail, remove cada credencial TOTP conferindo o resultado, relê as credenciais e só prossegue se não restar nenhuma, e encerra as sessões da conta no Keycloak.
3. Apaga as sessões da conta no portal (`portal_sessao`, pelo `sub` do provedor). Uma renovação de token em voo não as recria.
4. Grava o desfecho na auditoria (`MFA_RESET_RESULT`) e no `syslog` do servidor (`logger -t portal-prod`), sem senhas, tokens, sementes ou códigos.

No login seguinte, o provedor exige configurar um novo TOTP: o papel `portal-mfa` não é tocado. Saídas: `2` autenticação administrativa, `3` conta ausente ou ambígua (ou auditoria indisponível), `4` remoção falhou, `5` verificação final acusou credencial restante, `6` **recuperação parcial**: o segundo fator foi removido, mas sessões do provedor ou do portal não foram encerradas; o comando diz o que faltou e deve ser repetido.

Limites de confiança: o operador registrado é quem executa no servidor (com `sudo`, o usuário original). Quem tem root ou acesso ao Docker consegue fazer o mesmo por outros caminhos, então o registro vale para quem segue o procedimento, não contra um administrador hostil. Códigos de recuperação não estão habilitados. A conta de console do Keycloak (`KC_BOOTSTRAP_ADMIN_*`) continua existindo para o realm `master`, não é exposta pelo proxy e não é usada por este comando; a credencial permanente é o segredo do cliente `portal-admin` (`PORTAL_KEYCLOAK_ADMIN_SECRET`), com escopo de gestão de usuários do realm `union-portal`. Para rotacioná-la, gere um segredo novo no provedor, atualize `.env` e reinicie API e provedor.

As páginas de conta do provedor (`/realms/*/account`) ficam fechadas no proxy, para ninguém remover o próprio TOTP.

## Rotina

**Novo cliente.** Em Clientes, crie a organização e convide a administração do cliente. Depois crie o projeto em Projetos e, em Participantes, associe as pessoas e marque quem pode aprovar.

**Convites.** Valem 7 dias (`PORTAL_INVITATION_TTL`) e uma única utilização. Um novo convite para o mesmo e-mail e organização substitui o anterior.

**Último administrador.** Desativar ou rebaixar um `UNION_ADMIN` passa por uma fila única no banco (advisory lock transacional): duas alterações ao mesmo tempo são aplicadas uma depois da outra, com a autorização de quem pede reconferida na vez dele. Nunca fica zero administradores ativos; quem perde a vez recebe `409 LAST_ADMIN` ou, se já tiver sido desativado, `403`.

**Revogar acesso.** São mecanismos diferentes, e os dois foram testados:

| Ação | Efeito |
| --- | --- |
| "Revogar acesso" no portal | Bloqueia na requisição seguinte, mesmo com sessão aberta. Também desativa a conta e encerra as sessões no Keycloak. Se o Keycloak estiver fora do ar, o portal continua bloqueando; reative e revogue de novo para repetir a ação no provedor |
| Desativar a conta só no Keycloak | O portal não é avisado. O token já emitido continua valendo até vencer, no máximo 5 minutos. Na renovação seguinte, o provedor recusa e a sessão termina. **Para efeito imediato, use a revogação do portal** |

**Entregas.** Publique, solicite aprovação e aguarde a decisão. Para alterar, publique uma nova versão, que começa sem decisão. As decisões anteriores ficam no histórico.

**Arquivamento.** Organizações, projetos, documentos e produtos são arquivados, não excluídos. A aplicação não oferece exclusão de registros com histórico.

**Produtos.** Links aceitam apenas HTTPS e os domínios de `PORTAL_PRODUCT_LINK_HOSTS`. Altere a variável e reinicie a API para autorizar um novo destino.

## Arquivos e antivírus

Todo arquivo entra em quarentena. Uma tarefa da API o envia ao ClamAV e, se estiver limpo, o libera. Formatos aceitos: PDF, PNG, JPG, DOCX, XLSX, PPTX, TXT e CSV.

| Estado | Significado | Download |
| --- | --- | --- |
| `PENDING` | Aguardando verificação | Não |
| `CLEAN` | Verificado e liberado | Sim, com autorização |
| `REJECTED` | Assinatura de malware encontrada. O objeto é apagado. Se a exclusão falhar, ele fica na quarentena e a API registra um aviso no log | Não |
| `FAILED` | Tentativas esgotadas (`PORTAL_SCAN_MAX_ATTEMPTS`, com intervalo crescente) | Não |

Com o ClamAV fora do ar, os arquivos ficam pendentes e são verificados quando ele voltar. Nos valores padrão, as tentativas se esgotam em cerca de 1h30 de indisponibilidade, e o arquivo passa a `FAILED`, sem ser liberado. Um administrador recoloca o arquivo na fila pelo botão "Verificar novamente", em Documentos ou na página do projeto.

Limites: `PORTAL_FILE_MAX_BYTES` (25 MiB) por arquivo e `PORTAL_FILE_TENANT_QUOTA_BYTES` (5 GiB) por organização.

**Como a cota é contada.** Envios da mesma organização passam um por vez (advisory lock por organização, sem travar as outras). Contam: objetos presentes de arquivos registrados, em qualquer situação de verificação, e reservas de envios em andamento. Um arquivo bloqueado pelo antivírus só deixa de contar depois que o objeto for apagado de fato (`object_present`). Se a transação de um envio for revertida depois de o objeto já estar gravado, a API apaga o objeto; se não conseguir, ele fica em `object_ledger` e a limpeza periódica (`PORTAL_LEDGER_INTERVAL`, 5 min) tenta de novo depois da idade mínima (`PORTAL_LEDGER_MIN_AGE`, 10 min), sem tocar objetos de arquivos registrados, pendentes ou em verificação. `object_ledger` com `attempts` crescendo indica que o armazenamento está recusando exclusões.

## Backup e restauração

**O banco da aplicação sozinho não recupera o portal.** Os itens abaixo precisam estar disponíveis juntos:

| Parte | Contém | Sem ela |
| --- | --- | --- |
| Banco `portal` | Projetos, decisões, suporte, auditoria | Perde-se todo o registro |
| Banco `keycloak` | Contas, hash de senhas, TOTP, chaves de assinatura, realm | Ninguém entra. Refazer as contas gera novos `sub`, que não casam com `app_user` |
| Objetos do bucket | Conteúdo dos arquivos | Registros apontam para arquivos inexistentes |
| `.env` e `RESTIC_PASSWORD` | Segredos dos serviços e chave do backup | O backup não pode ser lido, e os serviços não se autenticam. **Guarde fora da VPS** |

As sessões (`portal_sessao`) não entram no backup. Depois de restaurar, todos entram de novo.

**Exclusão mútua.** Backup, restauração e atualização passam um por vez por implantação, com `flock` em `.env.<projeto>.lock`. Uma chamada manual durante o timer espera até `PORTAL_LOCK_WAIT` segundos (600) e desiste com a saída `75`, sem pausar nem despausar nada e sem tocar na área da outra execução. `atualizar` chama `backup` com a trava já em mãos.

### Produção

```bash
sh portal-prod.sh backup          # banco, identidade e objetos, cifrados pelo restic
sh portal-prod.sh backup-status   # falha se não houver backup recente
sh portal-prod.sh reconciliar     # confere banco e armazenamento
sh portal-prod.sh restaurar       # pede confirmação; aceita o ID de um snapshot
```

O `backup`:

1. Recusa começar se a API já estiver pausada por outra atividade (saída `70`), e remove áreas temporárias abandonadas por execuções anteriores que tenham morrido sem limpar (só com a trava em mãos e com mais de uma hora).
2. Pausa a API, para banco e objetos corresponderem ao mesmo momento. O portal fica indisponível só durante a cópia local.
3. Em área temporária própria desta execução (`/staging/<data>-<pid>`): recusa continuar sem espaço (`PORTAL_BACKUP_MIN_FREE_MB`, saída `3`), falha se a reconciliação acusar objeto faltando (saída `4`), copia os dois bancos e os objetos e grava as somas. A limpeza da área é instalada antes de qualquer passo falível.
4. Despausa a API e **confere** que ela voltou (`running`, não pausada), com até cinco tentativas. Se não voltar, o comando falha com aviso explícito e o comando manual para corrigir.
5. Envia ao destino com prazo (`PORTAL_BACKUP_TIMEOUT_SECONDS`). Só inicializa o repositório quando o restic diz que ele não existe (saída 10); senha errada (12), destino inacessível, corrupção ou falta de permissão interrompem sem criar repositório novo. Aplica a retenção (`PORTAL_BACKUP_KEEP_*`) e roda `restic check`.
6. Apaga a área temporária, que não é cifrada, em sucesso, falha ou interrupção (`SIGTERM`). `SIGKILL` e queda de energia não passam por aí: a área fica e é removida no passo 1 da próxima execução.

**Consistência entre banco e objetos.** Pausar a API congela os processos dela, não "drena" o que estava em voo. Um envio interrompido no meio da gravação do objeto não tem registro no banco e o objeto incompleto não é confirmado pelo armazenamento: não entra na cópia. Uma liberação de arquivo interrompida entre copiar para `clean/` e registrar deixa o objeto antigo em `quarantine/` e o novo em `clean/`: a cópia traz os dois, e o registro aponta para o que ainda vale. A reconciliação (`reconciliar`) acusa objeto registrado sem arquivo; objeto sem registro só é relatado.

**Testes dos cenários de falha:** `bash deploy/production/teste/testa-operacao.sh` no ambiente de prova cobre backups sobrepostos, backup contra restauração e atualização, erro em cada fase, cancelamento, área abandonada, API pausada por outra atividade, falha de despausa, senha de backup errada e os modos de falha da recuperação de MFA.

**Agendamento:** instale `deploy/production/systemd/portal-backup.service` e `.timer`, ajustando `WorkingDirectory`. Uma falha aparece em `systemctl --failed` e em `journalctl -u portal-backup`. Encaminhar esse aviso para alguém, por e-mail ou monitor, depende da infraestrutura escolhida.

**Destino:** `RESTIC_REPOSITORY` aceita, entre outros, `sftp:` e `s3:`. Foi testado com um servidor REST do restic em rede isolada. O destino real ainda não existe, e por isso `sftp:` e `s3:` não foram exercitados. Até haver destino externo, `/repositorio-local` grava no próprio servidor, **mas essa cópia não protege contra a perda da VPS**.

**Restaurar em servidor novo:** copie `.env`, rode `sh portal-prod.sh restaurar` e confira login, histórico e download de um arquivo. Checksum ou upload de backup, sozinhos, não provam que ele restaura. Faça um ensaio periódico em ambiente separado.

### Ambiente local

```bash
sh portal/deploy/local/portal.sh backup             # grava em artifacts/portal-backups/<data>
sh portal/deploy/local/portal.sh restore <pasta>    # confere as somas, para os serviços e restaura
```

## Observabilidade

A porta de gestão (9000) não é publicada. Consulte de dentro da rede, por exemplo com `docker compose exec backend wget -qO- http://127.0.0.1:9000/q/health/ready`.

| Caminho | Conteúdo |
| --- | --- |
| `/q/health/live`, `/q/health/ready` | Saúde e prontidão |
| `/q/metrics` | Métricas em formato Prometheus |
| `/q/openapi` | Contrato da API |

Logs da API são JSON na saída padrão, com `correlationId` no MDC. Toda resposta traz `X-Correlation-Id`, e as telas exibem esse código nos erros. Conteúdo de documentos, tokens e links de convite não vão para os logs, e o proxy remove parâmetros de URL do registro de acesso. Cada serviço guarda até 50 MB de log (`max-size` 10 MB, 5 arquivos).

A auditoria fica em Auditoria (somente `UNION_ADMIN`) e na tabela `audit_event`. A aplicação só insere, e um gatilho recusa edição e exclusão. Quem administra o banco pode desativar o gatilho, portanto **isso não torna o registro inviolável**. Se precisar de garantia maior, exporte os eventos para um destino externo de acesso restrito.

## Reinício do banco e dependências indisponíveis

Use `sh portal-prod.sh reiniciar-banco`. O Compose reinicia também o provedor e a API (`depends_on` com `restart: true`), que voltam com conexões novas.

Em um reinício não planejado, o pool do Keycloak ainda pode ter conexões antigas. O pool é pequeno (`KC_DB_POOL_*`) e as descarta em cerca de 1 a 2 segundos, conforme `EVIDENCIAS.md`. Nessa janela, o BFF repete as chamadas ao provedor, mas uma tela de login aberta diretamente pode mostrar erro até ser recarregada. A versão anterior usava uma propriedade Quarkus crua, que o Keycloak declara não suportada. Ela foi removida.

| Indisponível | Comportamento |
| --- | --- |
| Banco de sessões | Páginas privadas e BFF respondem 503, sem dados. A sessão continua guardada e volta quando o banco voltar |
| Provedor, com token vigente | A pessoa segue trabalhando. A API valida com as chaves já obtidas |
| Provedor, com token vencido | 503, sem encerrar a sessão |
| Provedor, em novo login | O proxy mostra "temporariamente indisponível" |
| Provedor, ao sair | A sessão do portal termina na hora. A tela avisa que o provedor não confirmou o encerramento, e a sessão no provedor pode continuar ativa até expirar |
| Antivírus | Arquivos ficam pendentes e não são liberados |

## Problemas comuns

| Sintoma | O que verificar |
| --- | --- |
| Convite não chega | Credenciais SMTP e `PORTAL_MAIL_FROM`. `sh portal-prod.sh logs backend keycloak` mostra o erro |
| "Sua conta não tem acesso" depois do login | A conta existe no Keycloak, mas não aceitou convite ou foi revogada |
| Convite "não pode ser aceito" | A pessoa entrou com outro e-mail, ou o e-mail ainda não foi verificado |
| Arquivo fica "Em verificação" | Saúde do serviço `clamav` e logs da API |
| API não inicia em produção | A mensagem `Configuração inválida para produção` lista cada problema |
