# Análise de vulnerabilidades

Resumo versionado da análise das imagens finais e das dependências. O relatório completo (JSON por imagem, `ferramenta.txt`, `imagens.txt`, `resumo.txt`) fica em `artifacts/portal-qa/producao/vulnerabilidades/`, pasta local não versionada.

**Decisão pendente.** Os achados altos abaixo não têm atualização suportada disponível na data. Cada um traz uma recomendação individual; **nenhum aceite foi registrado**, e a decisão cabe a Felipe. Até ela existir, a abertura do portal a clientes fica **bloqueada operacionalmente** por este documento (ver "Bloqueio operacional").

**Critério de reavaliação:** repetir a análise antes de cada implantação e sempre que uma imagem base mudar, ou a cada 30 dias enquanto o portal estiver no ar. Um item volta a exigir ação quando o projeto publicar versão corrigida, ou quando surgir caminho de exploração a partir de dados do cliente.

| Ferramenta | Versão | Base de dados | Escopo |
| --- | --- | --- | --- |
| Trivy | 0.70.0 (`aquasec/trivy@sha256:be1190af…`) | Vulnerabilidades 2026-10-31 18:53 UTC; Java 2026-10-31 01:06 UTC | Pacotes do sistema, binários Go, JARs e `node_modules` das imagens finais |
| npm audit | npm 11 (Node 24) | Registro npm em 31/10/2026 | Dependências de produção do web |

Uma execução que falhe é falha explícita (`execucao.txt` registra a saída por imagem); não vale como "zero achados".

## Imagens analisadas

Imagens construídas pela configuração de produção no ambiente de prova, em 31/10/2026 (ID local em `imagens.txt`; a base de cada uma está fixada por digest nos Dockerfiles e no compose).

| Imagem | Base (digest fixado) | Crítica | Alta | Média | Baixa |
| --- | --- | --- | --- | --- | --- |
| API (`backend`) | `eclipse-temurin:21-jre-alpine@sha256:82cf3d9c…` | 0 | 0 | 1 | 0 |
| Web (`frontend`) | `node:24-alpine@sha256:8a32c8cf…` | 0 | 0 | 0 | 0 |
| Proxy (`proxy`) | `alpine:3.22@sha256:2e0b81d6…`, Caddy 2.11.7 compilado com `golang:1.27-alpine@sha256:d200d2dd…` | 0 | 1 | 3 | 0 |
| Operações (`ops`) | `alpine:3.22@sha256:2e0b81d6…` | 0 | 0 | 0 | 0 |
| PostgreSQL (`postgres`) | `postgres:17-alpine@sha256:266d3c25…` | 0 | 0 | 0 | 0 |
| Keycloak (`keycloak`) | `quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e…` | 0 | 4 | 38 | 28 |
| SeaweedFS | `chrislusf/seaweedfs:4.51@sha256:f7a49e3f…` | 0 | 1 | 0 | 0 |
| ClamAV | `clamav/clamav:1.5@sha256:bda39705…` | 0 | 0 | 0 | 0 |

`npm audit --omit=dev` no web: 0 vulnerabilidades.

## Atualizações suportadas disponíveis em 31/10/2026

| Componente | Em uso | Mais recente publicada | Situação |
| --- | --- | --- | --- |
| Keycloak | 26.8.1 (quay, tag `26.8.1-2`, mesmo digest) | 26.8.1 (13/10/2026) | Nenhuma versão mais nova |
| SeaweedFS | 4.51 | 4.51 (25/10/2026) | Nenhuma versão mais nova |
| Caddy | 2.11.7 | 2.11.7 (03/10/2026) | Em dia |
| Go (proxy) | 1.27.3 | 1.27.3 | Em dia |

Por isso nenhuma atualização suportada foi aplicada nesta rodada além das já feitas (Caddy recompilado, `gosu` e `npm` removidos).

## Corrigido anteriormente

| Achado | Correção |
| --- | --- |
| Proxy: `brotli` crítica, `curl` alta, Go e `golang.org/x/net` antigos na imagem `caddy:2.11-alpine` | Caddy 2.11.7 compilado na própria imagem com Go 1.27.3 e dependências fixadas (`go.mod`/`go.sum`), sobre Alpine 3.22 sem `curl` nem `brotli` |
| PostgreSQL: 61 achados no binário `gosu` | Removido da imagem; o container inicia como `postgres` e nunca o executava |
| Web: `undici` e `brace-expansion` do `npm` embutido no Node | `npm`, `npx` e `corepack` removidos da imagem final |

## Ocorrências altas, uma a uma

### 1. CVE-2026-116587 em `github.com/go-jose/go-jose/v3` 3.0.5, imagem do proxy

| Item | Registro |
| --- | --- |
| Imagem e digest | `union-portal-prova-proxy` (ID em `imagens.txt`); base `alpine:3.22@sha256:2e0b81d6…` |
| Componente | `go-jose/v3` 3.0.5, dependência indireta do binário `/usr/local/bin/caddy` |
| Versão corrigida | **Nenhuma na linha v3** (GHSA-mgcc-cww5-fp2q lista correção só em v4 4.1.6, que o proxy também traz, já corrigida) |
| Condições para exploração | A aplicação precisa analisar uma JWS ou JWK fornecida pelo atacante (`jose.ParseSigned` com JWK embutida no cabeçalho), o que chega a `rsaPrivateKey()` e consome CPU de forma cúbica. Impacto: negação de serviço |
| Presença e alcance aqui | Está no binário: `go version -m` lista o módulo. `go mod why`: entra por `caddytls → smallstep/certificates/authority/provisioner → go.step.sm/crypto/jose`, o emissor interno de certificados. A configuração não usa `tls internal`, servidor ACME nem autenticação JWT; nenhuma rota do Caddyfile analisa JWS ou JWK do cliente. O build mínimo (só `caddyhttp`, `caddytls`, `reverseproxy`, `headers`, `requestbody`, `logging`) ainda liga o módulo, porque `caddytls` o importa |
| Mitigações e limites | Ausência de caminho de código na configuração atual. Limite: a avaliação vale enquanto o Caddyfile não habilitar `tls internal`, `acme_server` ou módulos de autenticação; qualquer mudança nele exige reavaliar |
| Atualização suportada | Nenhuma: nem Caddy nem smallstep publicaram versão sem `go-jose/v3` |
| Recomendação | **Submeter a aceite explícito**, com a condição acima registrada em `IMPLANTACAO.md` (revisar a cada mudança no Caddyfile). Reavaliar quando o advisory ganhar correção v3 ou o Caddy trocar a dependência |

### 2. CVE-2026-116587 em `github.com/go-jose/go-jose/v4` 4.1.5, imagem do SeaweedFS

| Item | Registro |
| --- | --- |
| Imagem e digest | `chrislusf/seaweedfs:4.51@sha256:f7a49e3f3972ebed5be2ed4befa4a0c68eb7bdddba6e692d42729ceb545134b8` |
| Componente | `go-jose/v4` 4.1.5 no binário `/usr/bin/weed` |
| Versão corrigida | **A dependência tem correção (4.1.6)**; **a imagem oficial 4.51 ainda não a incorporou**, e não há versão mais nova em 31/10/2026 |
| Condições para exploração | Mesmas do item 1: analisar JWS/JWK fornecida pelo atacante. No SeaweedFS, o go-jose atende à autenticação por JWT entre componentes e ao modo de JWT do S3, que não está habilitado aqui (autenticação do S3 por chave e assinatura, `s3.config`) |
| Presença e alcance aqui | Presente no binário. O serviço não tem porta publicada e fica nas redes internas `dados`; quem fala com ele são a API (chave limitada ao bucket) e as operações. Dados do cliente chegam como corpo de objeto, nunca como JWS. A rede interna reduz quem alcança o serviço, mas **não prova** que não exista caminho a partir de dados do cliente; a prova aqui é a ausência de análise de JWT na configuração usada |
| Mitigações e limites | Não há como aplicar a correção sem recompilar o SeaweedFS (não suportado). Limite: um atacante com acesso à rede interna poderia tentar o DoS |
| Atualização suportada | Nenhuma publicada. Reavaliar a cada versão do SeaweedFS |
| Recomendação | **Submeter a aceite explícito** até sair imagem com go-jose ≥ 4.1.6; ou **mitigar antes da publicação** trocando o armazenamento por um serviço S3 externo (decisão de custo, fora desta rodada) |

### 3. CVE-2026-102554 em `com.google.guava:guava` 33.6.0, imagem do Keycloak

| Item | Registro |
| --- | --- |
| Imagem e digest | `quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332` |
| Componente | Guava 33.6.0-jre, embutida pelo Keycloak |
| Versão corrigida | **A dependência tem correção (33.7.2, GHSA-xxph-c9ww-hj94)**; **o Keycloak 26.8.1 ainda não a incorporou**, e não há versão mais nova. Substituir o JAR não é suportado e não foi feito |
| Condições para exploração | O atacante precisa fazer o processo desserializar bytes dele com `ObjectInputStream.readObject()` (classes `CompactHashMap`, `CompactHashSet`, `MapMakerInternalMap`). Impacto: esgotamento de memória. CVSS 5.9 (o scanner classifica como alta) |
| Presença e alcance aqui | Presente no JAR. O Keycloak não desserializa objetos Java de requisições HTTP; a desserialização Java existente é a do cache distribuído entre nós (Infinispan), que aqui não existe: instância única, sem porta de cluster publicada (`KC_CACHE` padrão `ispn` local). Dados do cliente chegam como formulários, JSON e tokens |
| Mitigações e limites | Nenhuma configurável. Limite: a avaliação vale enquanto o Keycloak for instância única |
| Atualização suportada | Nenhuma; reavaliar a cada versão do Keycloak |
| Recomendação | **Submeter a aceite explícito**. Reavaliar na próxima versão do Keycloak |

### 4 e 5. CVE-2026-119373 e CVE-2026-119586 em `sqlite-libs` 3.34.1-11.el9_8, imagem do Keycloak

| Item | Registro |
| --- | --- |
| Imagem e digest | Keycloak, como acima (base UBI 9) |
| Componente | Pacote `sqlite-libs` da distribuição |
| Versão corrigida | Red Hat marca `affected`, sem correção publicada para o pacote. A biblioteca SQLite tem correção a partir de 3.54.0 (119373), mas a distribuição ainda não a entregou |
| Condições para exploração | 119373: tabela FTS5 com `detail=none` preenchida pelo atacante; 119586: execução do comando `.recover` do shell `sqlite3` sobre arquivo do atacante. Ambas exigem que algum processo use SQLite sobre dados do atacante |
| Presença e alcance aqui | O pacote está na imagem; **nenhum processo o usa**: o Keycloak usa PostgreSQL via JDBC e não carrega a biblioteca (não há `libsqlite3` entre as bibliotecas mapeadas pelo processo Java, e o shell `sqlite3` não existe na imagem) |
| Mitigações e limites | Não há código que chegue à biblioteca. Limite: a presença do arquivo na imagem continua acusada pelo scanner |
| Atualização suportada | Nenhuma até a Red Hat atualizar a base e o Keycloak publicar imagem nova |
| Recomendação | **Submeter a aceite explícito**; sai sozinho com a próxima base |

### 6. CVE-2026-91403 em `java-21-openjdk-headless` 21.0.13, imagem do Keycloak

| Item | Registro |
| --- | --- |
| Imagem e digest | Keycloak, como acima |
| Componente | OpenJDK 21 da distribuição |
| Versão corrigida | Red Hat marca `will_not_fix` para o pacote. O conteúdo é a desconfiança de uma CA intermediária (eMudhra) no armazém de confiança do JDK |
| Condições para exploração | Um servidor ao qual o Keycloak se conecte por TLS apresentar um certificado emitido por essa cadeia; afeta só conexões de saída |
| Presença e alcance aqui | Presente. O Keycloak só abre conexões TLS de saída para o SMTP configurado, cujo certificado será de um provedor conhecido; o banco é interno sem TLS |
| Mitigações e limites | Ao contratar o SMTP, conferir a cadeia do certificado. Limite: depende de configuração ainda não feita |
| Atualização suportada | Nenhuma (`will_not_fix`) |
| Recomendação | **Submeter a aceite explícito**, com a conferência do certificado do SMTP registrada em `IMPLANTACAO.md` |

### Médias e baixas

- API: `opentelemetry-api` (CVE-2026-118259), transitiva do Quarkus 3.40.1, corrigida em versão mais nova da biblioteca ainda não incorporada pelo Quarkus. A API não recebe cabeçalhos `tracestate` do cliente: só o BFF a alcança e não os repassa. Recomendação: aceitar até a próxima versão do Quarkus.
- Keycloak: 38 médias e 28 baixas em pacotes da base UBI 9, sem correção publicada.
- Proxy: 3 médias em dependências Go indiretas, sem correção publicada.

## Bloqueio operacional

Enquanto não houver decisão registrada por Felipe sobre os itens 1 a 6 (aceitar, mitigar antes ou bloquear), **o portal não deve ser aberto a clientes**. `docs/PUBLICACAO.md` lista essa decisão entre as pendências. A preparação técnica está concluída; a decisão não é da implementação.

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
