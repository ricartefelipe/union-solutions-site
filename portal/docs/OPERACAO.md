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

Defina `PORTAL_BOOTSTRAP_ADMIN_EMAIL` antes da primeira subida. Enquanto não existir nenhum administrador, a API cadastra esse e-mail e pede ao Keycloak o e-mail de definição de senha. Até o primeiro login, ela tenta de novo a cada 30 segundos enquanto o envio falhar, e registra o motivo no log. Depois disso, a variável deixa de ter efeito.

O vínculo com a conta ocorre no primeiro login, com e-mail verificado. Em produção, esse login também exige configurar o segundo fator.

## Segundo fator (MFA)

| Quem | Regra em produção |
| --- | --- |
| `UNION_ADMIN`, `UNION_STAFF` | TOTP obrigatório. Sem TOTP configurado, o login cobra a configuração e não abre sessão antes disso |
| `CLIENT_ADMIN`, `CLIENT_MEMBER` | Sem segundo fator nesta versão |

O papel `portal-mfa` é atribuído à conta pela API, ao enviar o e-mail de definição de senha. O realm usa o fluxo `portal-browser-mfa`, fixado no compose de produção. No ambiente local, o segundo fator fica desligado.

**Recuperação:** quem perdeu o dispositivo pede à administração. Confirme a identidade da pessoa por outro canal antes de rodar:

```bash
sh portal-prod.sh remover-mfa <e-mail>
```

No login seguinte, o provedor exige configurar um novo TOTP. Códigos de recuperação não estão habilitados. A conta de console do Keycloak (`KC_BOOTSTRAP_ADMIN_*`) não passa por esse fluxo e não é exposta pelo proxy, o que evita autobloqueio. Quem acessa o servidor consegue usá-la, então proteja o acesso SSH.

As páginas de conta do provedor (`/realms/*/account`) ficam fechadas no proxy, para ninguém remover o próprio TOTP.

## Rotina

**Novo cliente.** Em Clientes, crie a organização e convide a administração do cliente. Depois crie o projeto em Projetos e, em Participantes, associe as pessoas e marque quem pode aprovar.

**Convites.** Valem 7 dias (`PORTAL_INVITATION_TTL`) e uma única utilização. Um novo convite para o mesmo e-mail e organização substitui o anterior.

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

## Backup e restauração

**O banco da aplicação sozinho não recupera o portal.** Os itens abaixo precisam estar disponíveis juntos:

| Parte | Contém | Sem ela |
| --- | --- | --- |
| Banco `portal` | Projetos, decisões, suporte, auditoria | Perde-se todo o registro |
| Banco `keycloak` | Contas, hash de senhas, TOTP, chaves de assinatura, realm | Ninguém entra. Refazer as contas gera novos `sub`, que não casam com `app_user` |
| Objetos do bucket | Conteúdo dos arquivos | Registros apontam para arquivos inexistentes |
| `.env` e `RESTIC_PASSWORD` | Segredos dos serviços e chave do backup | O backup não pode ser lido, e os serviços não se autenticam. **Guarde fora da VPS** |

As sessões (`portal_sessao`) não entram no backup. Depois de restaurar, todos entram de novo.

### Produção

```bash
sh portal-prod.sh backup          # banco, identidade e objetos, cifrados pelo restic
sh portal-prod.sh backup-status   # falha se não houver backup recente
sh portal-prod.sh reconciliar     # confere banco e armazenamento
sh portal-prod.sh restaurar       # pede confirmação; aceita o ID de um snapshot
```

O `backup`:

1. Pausa a API, para banco e objetos corresponderem ao mesmo momento. O portal fica indisponível só durante esta etapa.
2. Recusa continuar sem espaço (`PORTAL_BACKUP_MIN_FREE_MB`) e falha se a reconciliação acusar objeto faltando.
3. Copia bancos e objetos para a área temporária e devolve a API ao normal, mesmo em caso de falha ou interrupção.
4. Envia ao destino, com prazo limitado (`PORTAL_BACKUP_TIMEOUT_SECONDS`), aplica a retenção (`PORTAL_BACKUP_KEEP_*`) e roda `restic check`.
5. Apaga a cópia temporária, que não é cifrada, mesmo se o envio falhar.

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
