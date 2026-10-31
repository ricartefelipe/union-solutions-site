# Implantação do portal

**Nada foi publicado.** A VPS ainda não foi contratada. Os comandos de `portal-prod.sh` abaixo foram executados no ambiente de prova, com as imagens e o compose de produção. As etapas marcadas como "na VPS" dependem do servidor real e não foram executadas.

## Topologia inicial

Uma única VPS Linux com Docker Compose. A hospedagem do site institucional continua independente.

```text
Internet ── 80/443 ── proxy (Caddy, TLS)
                        ├── /                                  web e BFF (Next.js)
                        ├── /identidade/realms/union-portal/   provedor de identidade (Keycloak)
                        └── /identidade/resources/
                                   │
   Redes internas, sem porta no host: API (Quarkus) · PostgreSQL · armazenamento S3 (SeaweedFS) · antivírus (ClamAV)
```

| Item | Decisão | Motivo |
| --- | --- | --- |
| Endereço | Só `clientes.unionsolutions.tech`, com o provedor em `/identidade` | Um registro DNS e um certificado. Um segundo host não é necessário |
| Banco | Uma instância PostgreSQL com três bancos e três usuários sem privilégios administrativos | `portal`, `keycloak` e `portal_sessao`, criados por `db-init` |
| Armazenamento | SeaweedFS 4.51 no próprio Compose, com volume persistente | Licença Apache 2.0, já usado nos testes, sem custo adicional. A API usa uma credencial limitada ao bucket |
| Backup | restic, com destino configurável e cifragem própria | Pode sair da VPS para SFTP ou S3 sem alterar scripts |
| Segredos | Arquivo `.env` com permissão 600 | **Não é um cofre cifrado:** quem administra o Docker no servidor consegue ler as variáveis dos containers |

**Isto é disponibilidade inicial, não alta disponibilidade.** A VPS é ponto único de falha: se ela cair, o portal fica fora até voltar ou até a restauração em outro servidor. Não há réplica de banco nem de arquivos. Por isso o backup precisa sair da VPS.

Serviços externos equivalentes, como banco gerenciado ou S3 contratado, podem substituir os internos no futuro, mas não são necessários nem estão implementados como modo alternativo.

## O que falta para implantar

| Dependência | Variável ou local |
| --- | --- |
| VPS e acesso | Fora do repositório. Referência de capacidade em `EVIDENCIAS.md` |
| DNS | Registro `A` (e `AAAA`, se houver IPv6) de `clientes.unionsolutions.tech` para o IP da VPS. **Não altere MX, SPF, DKIM nem DMARC** |
| SMTP real | `PORTAL_SMTP_HOST`, `PORTAL_SMTP_PORT`, `PORTAL_SMTP_USER`, `PORTAL_SMTP_PASSWORD`. O remetente já é `PORTAL_MAIL_FROM=contato@unionsolutions.tech` |
| Primeiro administrador | `PORTAL_BOOTSTRAP_ADMIN_EMAIL` |
| Links de produtos | `PORTAL_PRODUCT_LINK_HOSTS` |
| Backup externo | `RESTIC_REPOSITORY`, `PORTAL_BACKUP_S3_ACCESS_KEY` e `PORTAL_BACKUP_S3_SECRET_KEY` (se o destino for S3) |
| Retenção de backup | `PORTAL_BACKUP_KEEP_DAILY`, `PORTAL_BACKUP_KEEP_WEEKLY`, `PORTAL_BACKUP_KEEP_MONTHLY` |
| Privacidade | Campos de `PRIVACIDADE.md`. Pendência para abrir o portal a clientes |

## Procedimento

### 1. Preparar a VPS (na VPS)

1. Instale o Docker Engine e o plugin Compose pela documentação oficial do Docker para a distribuição escolhida.
2. Libere no firewall do provedor somente 22, 80 e 443. **Regras de `ufw` ou `iptables` no host podem não bloquear portas publicadas pelo Docker.** Por isso o compose publica só o proxy, e o teste `serviços internos não são alcançáveis` confere isso.
3. Coloque o repositório em `/opt/union-solutions`. As imagens são construídas na própria VPS, e a compilação Maven e Next.js precisa de memória. Veja a medição em `EVIDENCIAS.md`.

### 2. Configurar

```bash
cd /opt/union-solutions/portal/deploy/production
sh portal-prod.sh segredos     # cria .env com permissão 600 e segredos internos gerados
# Preencha em .env tudo que estiver marcado com SUBSTITUIR.
sh portal-prod.sh verificar    # recusa pendências, valores de exemplo e permissão aberta, sem imprimir segredos
```

Guarde `.env` em local seguro fora da VPS. `RESTIC_PASSWORD` é a chave do backup: sem ela, o backup não pode ser lido.

Valores públicos e segredos:

| Tipo | Variáveis | Quando vale |
| --- | --- | --- |
| Público | `PORTAL_HOST`, `PORTAL_PUBLIC_URL`, `PORTAL_MAIL_FROM`, `PORTAL_ACME_EMAIL` | Execução |
| Segredo | Senhas de banco e SMTP, `KC_BOOTSTRAP_ADMIN_PASSWORD`, `PORTAL_WEB_CLIENT_SECRET`, `PORTAL_KEYCLOAK_ADMIN_SECRET`, `PORTAL_SESSION_SECRET`, `PORTAL_S3_*`, `RESTIC_PASSWORD` | Execução. Nenhum entra em imagem |
| Fixado na imagem | Caminho `/identidade`, banco e saúde do Keycloak (`kc.sh build`), Caddyfile | Build |

Para diagnosticar, use `sh portal-prod.sh status` e `logs`. **Não rode `docker compose config` sem `-q`:** ele imprime os segredos.

### 3. Subir (na VPS, depois de o DNS apontar)

```bash
sh portal-prod.sh subir
```

O comando constrói as imagens, prepara bancos e bucket, aplica as migrations e aguarda todos os serviços. O Caddy obtém o certificado por ACME quando a porta 80 ou 443 estiver acessível pelo domínio. **No ambiente de prova, o certificado vem de uma autoridade de teste: a emissão pública não foi exercitada.**

### 4. Primeiro administrador (na VPS)

1. O e-mail de definição de senha chega em `PORTAL_BOOTSTRAP_ADMIN_EMAIL`. Se o SMTP falhar, a API tenta de novo a cada 30 segundos e registra o motivo no log.
2. Defina a senha e entre. O provedor exige configurar o aplicativo autenticador no primeiro login.
3. **Sem autobloqueio:** se o dispositivo for perdido, `sh portal-prod.sh remover-mfa <e-mail>` retira o segundo fator, e ele é exigido de novo no login seguinte. O comando usa o administrador do realm `master`, que não passa pelo proxy e não depende do fluxo do portal.

### 5. Conferir depois de implantar (na VPS)

```bash
curl -sI http://clientes.unionsolutions.tech/ | head -3           # redireciona para HTTPS
curl -sI https://clientes.unionsolutions.tech/sessao-encerrada | grep -iE 'strict-transport|content-security'
curl -s -o /dev/null -w '%{http_code}\n' https://clientes.unionsolutions.tech/identidade/admin/   # 404
sh portal-prod.sh status                                          # só o proxy mostra portas
```

Depois, a partir de um computador externo:

- teste as portas 5432, 8080, 8333, 9000 e 3310 no IP da VPS: precisam estar fechadas;
- envie um convite real para um destino autorizado e confira entrega, SPF, DKIM e DMARC do remetente;
- percorra login com MFA, upload, download, EICAR bloqueado e logout;
- rode `sh portal-prod.sh backup`, confira o destino externo e faça uma restauração de ensaio em ambiente separado.

### 6. Ativar o botão no site

Só depois de o portal estar operacional e validado. A publicação do site não depende disso. Veja `docs/PUBLICACAO.md`, na raiz do repositório.

## Atualização

```bash
sh portal-prod.sh atualizar   # faz backup, constrói as imagens, prepara bancos e sobe a nova versão
```

Backup, restauração e atualização não rodam ao mesmo tempo: uma segunda chamada espera até `PORTAL_LOCK_WAIT` segundos e desiste com a saída `75`.

**Atualização para a versão com as correções da revisão** (sessões no servidor com versão e `sub`, cota com reserva, administrador remanescente, recuperação de MFA auditada):

1. `sh portal-prod.sh atualizar`. A API aplica o changeset `007-cota-e-objetos` (coluna `object_present` em `stored_file`, tabela `object_ledger`); arquivos bloqueados existentes passam a `object_present = false`, como a versão anterior os tratava. O web acrescenta `subject` e `version` em `portal_session` na subida, sem apagar sessões.
2. Sessões abertas antes da atualização continuam valendo, mas sem `sub` até a próxima renovação de token (no máximo 5 min). `remover-mfa` só encerra sessões do portal que já tenham `sub`; repita o comando depois desse intervalo, se precisar.
3. Confira `sh portal-prod.sh status` e, se houver `object_ledger` com `attempts` alto nos dias seguintes, o armazenamento está recusando exclusões.

- As migrations só avançam. **Não há rollback automático.** Se algo falhar, volte à versão anterior do código e restaure o backup feito antes da atualização.
- A versão do código e o esquema do banco precisam corresponder: imagem anterior não é garantida com esquema novo.
- Bases de imagem estão fixadas por digest, `package-lock.json` e `go.sum` fixam dependências, e `pom.xml` fixa versões. Para atualizar uma base, troque o digest, rode a prova e a análise de vulnerabilidades.
- O realm só é importado na primeira subida. Mudanças em `realm-union-portal.json` depois disso precisam ser aplicadas no provedor.

## Testar a configuração de produção sem servidor

```bash
bash portal/deploy/production/teste/prova.sh iniciar
bash portal/deploy/production/teste/prova.sh testes tests/01-jornada.spec.js tests/02-seguranca.spec.js tests/04-producao.spec.js
bash portal/deploy/production/teste/prova.sh auditar
bash portal/deploy/production/teste/prova.sh destruir
```

O ambiente de prova usa projeto, volumes e portas próprios e não altera nada no computador. O arquivo `teste/compose.teste.yaml` acrescenta só uma autoridade de certificação de teste, o Mailpit como SMTP e um destino local de backup. Não existe opção que desligue validações de produção, autenticação, TLS, autorização ou antivírus.
