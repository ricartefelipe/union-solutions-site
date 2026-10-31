# Análise de vulnerabilidades

Resumo versionado da análise das imagens finais e das dependências. O relatório completo (JSON por imagem, `ferramenta.txt`, `imagens.txt` com os IDs exatos) fica em `artifacts/portal-qa/producao/vulnerabilidades/`, pasta local não versionada; este arquivo traz o suficiente para conferir cada aceite.

**Responsável pela decisão residual:** Felipe. Este documento propõe; não aprova.

**Critério de reavaliação:** repetir a análise antes de cada implantação e sempre que uma das imagens base mudar, ou a cada 30 dias enquanto o portal estiver no ar. Um item aceito volta a bloquear quando o projeto publicar correção para a versão em uso, ou quando surgir caminho de exploração a partir de dados do cliente.

| Ferramenta | Versão | Base de dados | Escopo |
| --- | --- | --- | --- |
| Trivy | 0.70.0 (`aquasec/trivy@sha256:be1190af…`) | Ver `ferramenta.txt` da execução (data de atualização da base) | Pacotes do sistema, binários Go, JARs e `node_modules` das imagens finais |
| npm audit | npm 11 (Node 24) | Registro npm na data da execução | Dependências de produção do web |

Uma execução que falhe é falha explícita (`execucao.txt` registra a saída de cada imagem); não vale como "zero achados".

## Resultado por imagem

Preenchido a partir de `artifacts/portal-qa/producao/vulnerabilidades/resumo.txt`, gerado pela última execução (ver `EVIDENCIAS.md`).

| Imagem | Crítica | Alta | Média | Baixa |
| --- | --- | --- | --- | --- |
| API (`backend`) | 0 | 0 | 1 | 0 |
| Web (`frontend`) | 0 | 0 | 0 | 0 |
| Proxy (`proxy`) | 0 | 1 | 3 | 0 |
| Operações (`ops`) | 0 | 0 | 0 | 0 |
| PostgreSQL (`postgres`) | 0 | 0 | 0 | 0 |
| Keycloak (`keycloak`) | 0 | 4 | 38 | 28 |
| SeaweedFS `4.51` | 0 | 1 | 0 | 0 |
| ClamAV `1.5` | 0 | 0 | 0 | 0 |

`npm audit --omit=dev` no web: 0 vulnerabilidades.

## Corrigido

| Achado | Correção |
| --- | --- |
| Proxy: `brotli` crítica, `curl` alta, Go e `golang.org/x/net` antigos na imagem `caddy:2.11-alpine` | Caddy 2.11.7 compilado na própria imagem com Go 1.27.3, dependências fixadas em `go.mod`/`go.sum`, sobre Alpine 3.22 sem `curl` nem `brotli` |
| PostgreSQL: 61 achados no binário `gosu` | Removido da imagem; o container já inicia como `postgres` e nunca o executava |
| Web: `undici` e `brace-expansion` do `npm` embutido no Node | `npm`, `npx` e `corepack` removidos da imagem final |

## Achados altos sem correção na versão em uso: avaliação individual

Cada linha separa **patch da biblioteca**, **patch do pacote da distribuição** e **imagem oficial já atualizada**, e descreve o caminho que uma exploração exigiria.

### CVE-2026-116587, go-jose (GHSA-mgcc-cww5-fp2q)

Aviso oficial: DoS por CPU ao analisar uma JWK com parâmetros RSA forjados, em `rsaPrivateKey()`; alcançável por quem faz a aplicação analisar JWS/JWK de origem não confiável (`jose.ParseSigned` com JWK embutida no cabeçalho). Biblioteca: v4 corrigida em 4.1.6; **v3 sem correção publicada**.

| Onde | Versão em uso | Caminho até o código vulnerável | Exposição |
| --- | --- | --- | --- |
| Proxy (Caddy) | v4 4.1.6 (corrigida) e v3 3.0.5 (indireta) | `go mod why`: v3 entra por `caddytls → smallstep/certificates/authority/provisioner → go.step.sm/crypto/jose`, isto é, o emissor interno de certificados (`tls internal` / ACME server). Não há como retirar o módulo sem abrir mão de `caddytls` (tentado: o binário mínimo ainda o liga) | A configuração não usa emissor interno, servidor ACME nem autenticação JWT no proxy. Nenhuma rota do Caddyfile analisa JWS ou JWK vindos do cliente. O ACME de produção usa v4, corrigida |
| SeaweedFS 4.51 | v4 4.1.5 | Imagem oficial mais recente em 31/10/2026 ainda com a versão vulnerável; uso do go-jose fica no suporte a JWT do S3/filer | O serviço fica em rede interna sem porta publicada. Só a API e as operações falam com ele, com credenciais; o cliente do portal nunca envia dados diretamente ao armazenamento. Dados do cliente chegam como corpo de objeto, não como JWS |

**Proposta:** aceitar, com reavaliação quando sair imagem do SeaweedFS com go-jose ≥ 4.1.6 ou patch da v3. Não há mitigação além da topologia; o risco residual é negação de serviço do armazenamento a partir de quem já tiver acesso à rede interna.

### CVE-2026-102554, Guava 33.6.0 (GHSA-xxph-c9ww-hj94)

Aviso oficial: DoS por alocação sem limite ao **desserializar objetos Java** (`ObjectInputStream.readObject`) das classes `CompactHashMap`, `CompactHashSet` e `MapMakerInternalMap`; CVSS 5.9 (o scanner classifica como alta). Corrigido na biblioteca em **33.7.2**. O Keycloak 26.8.1 é a versão mais recente em 31/10/2026 e embute 33.6.0; **não há imagem oficial corrigida**, e substituir o JAR manualmente não é suportado.

Caminho: o atacante precisa fazer o Keycloak desserializar bytes dele com `ObjectInputStream`. O Keycloak não desserializa objetos Java de requisições HTTP; a serialização Java que existe é a do cache Infinispan entre nós do cluster, que aqui não é usado (instância única, sem porta de cluster publicada). Dados do cliente chegam como formulários e JSON.

**Proposta:** aceitar até a próxima versão do Keycloak que atualize o Guava; verificar a cada versão.

### CVE-2026-119373 e CVE-2026-119586, `sqlite-libs` (base UBI 9 do Keycloak)

Pacote da distribuição marcado `affected` pela Red Hat, sem correção publicada. O Keycloak não usa SQLite (o banco é PostgreSQL); a biblioteca está na imagem base e nenhum processo a carrega. **Proposta:** aceitar; sai sozinho quando a base for atualizada.

### CVE-2026-91403, OpenJDK (base UBI 9 do Keycloak)

Desconfiança de uma CA intermediária, marcada `will_not_fix` pela Red Hat. Afeta só conexões TLS de saída a servidores que usem essa cadeia; o Keycloak só sai para o SMTP configurado. **Proposta:** aceitar.

### Médias e baixas

- API: `opentelemetry-api` (CVE-2026-118259), transitiva do Quarkus 3.40.1; corrigida em versão mais nova da biblioteca, ainda não incorporada pelo Quarkus. A API não recebe cabeçalhos `tracestate` do cliente: só o BFF a alcança, e ele não os repassa.
- Keycloak: 38 médias e 28 baixas em pacotes da base UBI 9, sem correção publicada na data.
- Proxy: 3 médias em dependências Go indiretas, sem correção publicada.

## O que bloqueia abrir o portal a clientes

Pelo critério combinado (alta ou crítica, aplicável, sem mitigação adequada), **nenhum dos itens acima bloqueia** na topologia usada, desde que a análise seja repetida antes da implantação com a base do dia e nenhum item novo apareça. A decisão de aceitar os itens listados é de Felipe.

## Não coberto

- Teste de invasão e análise estática do código próprio.
- `pom.xml` foi analisado indiretamente, pelos JARs dentro da imagem da API. Não houve análise com ferramenta Maven própria.
- O runner de testes (`mcr.microsoft.com/playwright`) não vai para produção e não foi analisado.

## Como repetir

```bash
bash portal/deploy/production/teste/prova.sh iniciar          # constrói as imagens finais
bash portal/deploy/production/teste/prova.sh vulnerabilidades  # Trivy em cada imagem, com resumo e IDs
cd portal/frontend && npm audit --omit=dev
```
