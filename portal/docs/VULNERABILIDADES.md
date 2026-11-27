# Análise de vulnerabilidades

Resumo versionado da análise das imagens finais e das dependências. O relatório completo (JSON por imagem, `ferramenta.txt`, `imagens.txt`, `resumo.txt`) fica em `artifacts/portal-qa/producao/vulnerabilidades/`, pasta local não versionada.

**Decisão registrada em 01/11/2026.** Felipe aceitou explicitamente os seis achados altos abaixo (itens 1 a 6), nas condições anotadas em cada um e com reavaliação obrigatória até **01/12/2026**. O aceite vale para a configuração descrita: instância única do Keycloak, SeaweedFS só em rede interna e sem JWT, Caddyfile sem `tls internal`, ACME interno ou autenticação JWT, SMTP com certificado de provedor conhecido. Qualquer mudança nessas condições, nova versão de imagem com correção ou o vencimento do prazo reabre a decisão. O arquivo `.trivyignore.yaml` na raiz do repositório reproduz o aceite para a análise de imagens da CI, CVE a CVE, com a mesma validade; vencida, a análise volta a reprovar sozinha. Os achados abaixo não têm atualização suportada disponível na data; cada um traz a avaliação individual. Até ela existir, a abertura do portal a clientes fica **bloqueada operacionalmente** por este documento (ver "Bloqueio operacional").

**Reavaliação de 01/11/2026** (base de vulnerabilidades do próprio dia, imagens da configuração de produção reconstruídas com a versão 1.2.1, relatório em `artifacts/portal-qa/producao/vulnerabilidades-2026-11-01/`): os mesmos seis achados altos, nenhum crítico, nenhuma atualização suportada nova. Keycloak 26.8.1 continua sendo a última versão publicada; SeaweedFS 4.51 idem; `go-jose/v3` continua sem correção (a linha v4 está em 4.1.7). Evidência adicional para o item 6: o armazém de confiança do JDK da imagem do Keycloak não contém nenhum certificado da eMudhra (`keytool -list -cacerts`, 0 ocorrências), portanto a desconfiança que o pacote corrigido traria já é o estado efetivo. A imagem do Keycloak é `ubi9-micro`, sem gerenciador de pacotes: o `sqlite-libs` dos itens 4 e 5 não pode ser removido pela imagem derivada, e nenhum processo o carrega.

**Reavaliação de 02/11/2026** (Trivy 0.70.0, altos e críticos, imagens reconstruídas). O item 2 saiu com a imagem SeaweedFS 4.52, fixada por digest. Continuam aceitos os itens 1, 3, 4, 5 e 6, no mesmo prazo de **01/12/2026**, que não foi prorrogado. Keycloak 26.8.1 segue como última versão publicada, sem imagem corrigida. Foi medido em ambiente de teste que a Guava 33.7.2 no lugar da 33.6.0 elimina o item 3 sem impedir o `kc.sh build`, mas ela não foi aplicada: trocar um JAR dentro da imagem não tem suporte do Keycloak, e o achado não tem caminho de exploração nesta configuração.

**Reavaliação de 03/11/2026** (Trivy 0.70.0, base do dia). Nenhum dos itens aceitos ganhou correção: o Keycloak 26.8.1 já está no digest mais recente (`26.8.1-2`, de 31/10/2026) e não há versão mais nova; a Guava 33.7.2 existe, mas nenhuma versão do Keycloak a inclui; `sqlite-libs` e OpenJDK seguem sem pacote corrigido na UBI 9; `go-jose/v3` segue em 3.0.5, a última da linha v3. PostgreSQL do portal (sem `gosu`), ClamAV 1.5 e SeaweedFS 4.52: sem achados altos ou críticos.

**Correção de 04/11/2026, proxy** (Trivy 0.70.0, base do dia). O item 1 saiu: o proxy passa a usar a correção que o próprio projeto go-jose publicou no ramo v3, ainda sem tag (ver item 1). Continuam aceitos os itens 3, 4, 5 e 6, no prazo de **01/12/2026**.

**Correção de 04/11/2026, Keycloak** (Trivy 0.70.0, base do dia). O item 3 saiu da imagem do Keycloak: `deploy/keycloak/Dockerfile` troca a Guava 33.6.0-jre embutida pela 33.7.2-jre, a versão corrigida, porque o Keycloak 26.8.1 continua sendo a última versão publicada (digest `26.8.1-2`) e nenhuma versão dele traz a correção. A troca não tem suporte do fabricante; a avaliação de compatibilidade e o ensaio estão no item 3. A exceção do CVE-2026-102554 saiu de `.trivyignore.yaml`, e a análise da CI volta a reprovar se ele reaparecer. O portal em produção recebe a troca na próxima implantação. Com as duas correções do dia, continuam aceitos só os itens 4, 5 e 6, no mesmo prazo de **01/12/2026**.

**Correção de 09/11/2026, proxy** (análise de imagens da CI, base do dia). Achado novo e alto no binário do Caddy, CVE-2026-78661 em `golang.org/x/net` 0.60.0 (negação de serviço em `x/net/html`), com correção na 0.62.0. O `go.mod` do proxy passa a fixar `golang.org/x/net` 0.62.0, e os demais módulos `golang.org/x` sobem junto para as versões que ela exige (`crypto` 0.58.0, `sync` 0.24.0, `sys` 0.49.0, `term` 0.47.0, `text` 0.43.0). Caddy 2.11.7 e Go 1.27 inalterados; compilação conferida com a mesma imagem Go do Dockerfile. Continuam aceitos os itens 4, 5 e 6, no prazo de **01/12/2026**.

**Reavaliação de 09/11/2026, Keycloak** (Trivy 0.70.0, base do dia, altos e críticos, imagens oficiais `26.8.1-2` e `26.8.2-1` comparadas lado a lado). O Keycloak 26.8.2 foi publicado em 05/11/2026 (`26.8.2-1` em 09/11/2026) e **não corrige nenhum dos itens aceitos**: `sqlite-libs` 3.34.1-11.el9_8 segue sem pacote corrigido na UBI 9 (itens 4 e 5, agora com mais duas CVEs sem correção no mesmo pacote, CVE-2026-119374 e CVE-2026-119379, com a mesma avaliação: nenhum processo da imagem carrega a biblioteca), `java-21-openjdk-headless` 21.0.13 segue `will_not_fix` (item 6) e a imagem oficial continua com a Guava 33.6.0, que `deploy/keycloak/Dockerfile` já troca pela 33.7.2 (item 3). Adotar o 26.8.2 é uma atualização funcional, não de segurança. A troca de base para `26.8.2-1` foi tentada em 09/11/2026 e revertida no mesmo dia: com ela, a jornada em navegador da CI deixou de receber o e-mail de definição de senha do primeiro administrador ("E-mail para admin@portal.invalid não chegou"), e as demais jornadas falharam em cascata. O log dos serviços mostra a API repetindo "E-mail do primeiro administrador ainda não enviado (IllegalStateException)": a chamada à API de administração do Keycloak (criar o usuário ou disparar o e-mail de definição de senha, em `KeycloakIdentityProvider`) devolveu um status diferente do esperado, e o Keycloak só registrou avisos de depreciação (`full-scope-allowed` do cliente `portal-admin`). A causa exata ainda não foi apurada; a base segue em `26.8.1-2` até a investigação, com o ambiente local em `deploy/local`, sem efeito nos achados aceitos. Continuam aceitos os itens 4, 5 e 6, no prazo de **01/12/2026**; a decisão de renovar ou não o aceite nessa data é de Felipe.

**Correção de 27/11/2026, Keycloak** (análise de imagens da CI no PR da release 1.16.0, Trivy 0.70.0, base do dia). Cinco achados novos no `java-21-openjdk-headless` 21.0.13 da imagem 26.8.1, com correção publicada: CVE-2026-114938 (crítica, execução remota de código) e CVE-2026-114939 a CVE-2026-114942 (altas). Não há build novo da 26.8.1; a `26.8.2-3` (19/11/2026) traz o OpenJDK 21.0.13.1.2, que os corrige, e passou a ser a base, fixada por digest. A Guava embutida continua 33.6.0 e segue trocada pela 33.7.2 (item 3). A causa da regressão de 09/11 foi apurada: desde a 26.8.2, a API de administração só aceita token com a audiência do escopo `kc-admin-api` ("Expected audience not available in the token"), e o cliente `portal-admin` não o tinha. O realm passa a atribuí-lo ao `portal-admin`, junto dos seis escopos padrão que ele já recebia; um realm criado antes da 26.8.2 o recebe de `deploy/keycloak/portal-escopo-admin.sh`, chamado por `portal-prod.sh atualizar` (idempotente). Conferido localmente com a imagem de produção e PostgreSQL: instalação nova e atualização de um banco da 26.8.1 listam, criam a conta e enviam o e-mail de definição de senha; sem o passo, a API responde 401; o reset do segundo fator também funciona.

**Critério de reavaliação:** repetir a análise antes de cada implantação e sempre que uma imagem base mudar, ou a cada 30 dias enquanto o portal estiver no ar. Um item volta a exigir ação quando o projeto publicar versão corrigida, ou quando surgir caminho de exploração a partir de dados do cliente.

| Ferramenta | Versão | Base de dados | Escopo |
| --- | --- | --- | --- |
| Trivy | 0.70.0 (`aquasec/trivy@sha256:be1190af…`) | Vulnerabilidades 2026-10-31 18:53 UTC; Java 2026-10-31 01:06 UTC | Pacotes do sistema, binários Go, JARs e `node_modules` das imagens finais |
| npm audit | npm 11 (Node 24) | Registro npm em 31/10/2026 | Dependências de produção do web |

Uma execução que falhe é falha explícita (`execucao.txt` registra a saída por imagem); não vale como "zero achados".

## Imagens analisadas

Posição de 31/10/2026; o SeaweedFS mudou depois, como registra a reavaliação de 02/11/2026. Imagens construídas pela configuração de produção no ambiente de prova, em 31/10/2026 (ID local em `imagens.txt`; a base de cada uma está fixada por digest nos Dockerfiles e no compose).

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
| Keycloak | 26.8.1 (quay, tag `26.8.1-2`, mesmo digest) | 26.8.2 (05/11/2026) | 26.8.2 sem diferença nos achados; a troca de base foi revertida em 09/11/2026 porque a jornada local deixou de receber o e-mail do primeiro administrador (ver reavaliação de 09/11) |
| SeaweedFS | 4.51 | 4.51 (25/10/2026) | Nenhuma versão mais nova |
| Caddy | 2.11.7 | 2.11.7 (03/10/2026) | Em dia |
| Go (proxy) | 1.27.3 | 1.27.3 | Em dia |

Por isso nenhuma atualização suportada foi aplicada naquela rodada além das já feitas (Caddy recompilado, `gosu` e `npm` removidos). Em 02/11/2026 o SeaweedFS 4.52 estava publicado e foi adotado.

## Corrigido anteriormente

| Achado | Correção |
| --- | --- |
| Proxy: `brotli` crítica, `curl` alta, Go e `golang.org/x/net` antigos na imagem `caddy:2.11-alpine` | Caddy 2.11.7 compilado na própria imagem com Go 1.27.3 e dependências fixadas (`go.mod`/`go.sum`), sobre Alpine 3.22 sem `curl` nem `brotli` |
| PostgreSQL: 61 achados no binário `gosu` | Removido da imagem; o container inicia como `postgres` e nunca o executava |
| Web: `undici` e `brace-expansion` do `npm` embutido no Node | `npm`, `npx` e `corepack` removidos da imagem final |
| SeaweedFS: CVE-2026-116587 em `go-jose/v4` 4.1.5 (item 2) | Imagem oficial 4.52, fixada por digest, sem achados altos ou críticos, em 02/11/2026 |
| Proxy: CVE-2026-116587 em `go-jose/v3` 3.0.5 (item 1) | `go-jose/v3` no commit `0e502b8` do ramo v3 do projeto, em 04/11/2026; detalhes no item 1 |
| Keycloak: CVE-2026-102554 em `com.google.guava:guava` 33.6.0 (item 3) | Guava 33.7.2 no lugar do JAR embutido, conferida pelo SHA-256 no build da imagem, em 04/11/2026 (ver item 3) |

## Ocorrências altas, uma a uma

### 1. Corrigido em 04/11/2026

CVE-2026-116587 (GHSA-mgcc-cww5-fp2q) em `go-jose/v3` 3.0.5, dependência indireta do Caddy (`caddytls → smallstep/certificates → go.step.sm/crypto/jose`), não tem versão publicada corrigida na linha v3. Nem o Caddy (até a 2.11.8) nem o smallstep publicaram versão sem a v3. Compilar sem a PKI interna também não é possível, porque `caddytls` e o adaptador do Caddyfile a importam.

- **Correção aplicada:** o `go.mod` do proxy exige `v3.0.6-0.20261030183946-0e502b87c7aa`. É o commit `0e502b8` do ramo `v3` do próprio go-jose (PR 314, de 30/10/2026), que porta a correção da v4.1.6: módulo RSA limitado a 4096 bits, conferência de p·q = n e recusa de JWK com parâmetros privados nos cabeçalhos JWS e JWE. Quando a v3.0.6 sair, ela substitui o commit.
- **Por que não uma cópia local com `replace`:** o Trivy ignora módulos substituídos por pasta local e deixaria de ver a `go-jose/v3` inteira, inclusive o que não foi corrigido.
- **Evidência:** a imagem do proxy fica sem achado alto. Uma JWS de 4 KB com JWK malformada, enviada a um `acme_server` de teste, custava 2,6 s de CPU por requisição antes e custa 0,01 s depois. O certificado por `tls internal` e a emissão ACME continuam funcionando.
- **Limite:** CVE-2026-116585 e CVE-2026-116586 (médias, ver "Médias e baixas") não têm correção na v3. O Trivy deixa de apontá-las porque compara por faixa de versão (até 3.0.5).

### 2. Corrigido em 02/11/2026

CVE-2026-116587 saiu da imagem do SeaweedFS na versão 4.52; ver "Corrigido anteriormente".

### 3. Corrigido em 04/11/2026: CVE-2026-102554 em `com.google.guava:guava` 33.6.0, imagem do Keycloak

| Item | Registro |
| --- | --- |
| Imagem e digest | `quay.io/keycloak/keycloak:26.8.1@sha256:3f3c5f8e03c614774b4bd9173b88391fefa4153bfc010d8012d59ad825377332`, o digest mais recente (`26.8.1-2`); não há 26.8.2 nem versão mais nova em 04/11/2026 |
| Componente | `/opt/keycloak/lib/lib/main/com.google.guava.guava-33.6.0-jre.jar`, idêntico ao JAR do Maven Central |
| Condições para exploração | O atacante precisa fazer o processo desserializar bytes dele com `ObjectInputStream.readObject()` (classes `CompactHashMap`, `CompactHashSet`, `MapMakerInternalMap`). Impacto: esgotamento de memória. CVSS 5.9 (o scanner classifica como alta). Aqui não havia caminho: instância única, sem desserialização Java de dados do cliente |
| Correção | Guava 33.7.2-jre (GHSA-xxph-c9ww-hj94), baixada do Maven Central no build e conferida pelo SHA-256 fixado no Dockerfile (`b5309422…606c`; o mesmo arquivo tem assinatura PGP válida do mantenedor da Guava). O JAR antigo sai, o nome é acertado nos índices do Quarkus (`appmodel.dat`, `deployment-class-path.dat`, `quarkus-application.dat`, texto de mesmo tamanho), e o `kc.sh build` da produção (ou o `start-dev` do ambiente local) refaz o índice a partir deles. As demonstrações usam o mesmo procedimento em `demos/imagens/keycloak.Dockerfile` |
| Compatibilidade | O Keycloak usa a Guava em `CaseFormat` (nomes das opções de configuração) e em `BloomFilter`/`Funnels` (política de senhas proibidas, inclusive arquivos `.bloom` pré-calculados); gRPC, Micrometer e OpenTelemetry também a referenciam. As 188 referências desses JARs a classes, métodos e campos da Guava resolvem igual nas duas versões (176 resolvem; 12 dependem do `failureaccess`, ausente também na imagem oficial). Notas da 33.7.0 a 33.7.2: acréscimos de API, `module-info.class` na raiz do JAR e a correção; `BloomFilter.readFrom` lê o mesmo formato |
| Ensaio | `prova.sh` com a imagem nova: suítes 01, 02 e 04, 53 de 53 (login, segundo fator, renovação, logout, provedor e banco fora do ar). Fora do portal, a mesma troca: OIDC com PKCE, renovação, logout, API e console de administração com alteração de configuração, senhas proibidas por texto e por `.bloom` gerado com a 33.6.0, em `start-dev` e em `start` com PostgreSQL, iguais à imagem oficial |
| Análise depois | Trivy 0.70.0: o CVE-2026-102554 some e nenhum achado novo aparece, em nenhuma gravidade (38 médios e 28 baixos, iguais). Ficam os itens 4 a 6 |
| Quando remover | Na primeira versão do Keycloak com a Guava 33.7.2 ou mais nova: o `rm` do JAR antigo falha no build, e o bloco sai do Dockerfile |

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
- Proxy: 3 médias em dependências Go indiretas, sem correção publicada. Duas são da `go-jose/v3`, CVE-2026-116585 (pânico em JWE com CBC-HMAC) e CVE-2026-116586 (JSON aninhado demais). Seguem sem correção na v3, mas desde 04/11/2026 o Trivy não as aponta (ver item 1). Só são alcançáveis com `acme_server` ou `tls internal`, ausentes do Caddyfile; qualquer mudança nele exige reavaliá-las.

## Decisão operacional

Itens 1 a 6 aceitos por Felipe em 01/11/2026, com reavaliação até 01/12/2026 (ver o início deste documento); o item 2 foi corrigido em 02/11/2026, os itens 1 e 3 em 04/11/2026, e os demais seguem no aceite. Este item deixou de bloquear a abertura do portal a clientes; `docs/PUBLICACAO.md` mantém as pendências restantes. A análise semanal da CI (`imagens.yml`) e a reavaliação manual a cada implantação continuam, e um achado novo, crítico ou com correção publicada reabre a decisão.

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
