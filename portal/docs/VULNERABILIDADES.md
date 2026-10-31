# Análise de vulnerabilidades

Executada em 31/10/2026 sobre as imagens finais construídas pela configuração de produção e sobre as dependências declaradas. Relatórios completos em `artifacts/portal-qa/producao/vulnerabilidades/` (JSON por imagem, `ferramenta.txt`, `imagens.txt`), pasta local não versionada.

| Ferramenta | Versão | Base de dados | Escopo |
| --- | --- | --- | --- |
| Trivy | 0.70.0 (`aquasec/trivy@sha256:be1190af…`) | Vulnerabilidades: 31/10/2026 18:53 UTC. Java: 31/10/2026 01:06 UTC | Pacotes do sistema, binários Go, JARs e `node_modules` de cada imagem |
| npm audit | npm 11 (Node 24) | Registro npm em 31/10/2026 | Dependências de produção do web (`frontend`) |

Os identificadores das imagens analisadas estão em `imagens.txt`. Uma execução que falhe não significa ausência de vulnerabilidades, e a base de dados muda todos os dias: repita a análise antes de implantar.

## Resultado por imagem

| Imagem | Crítica | Alta | Média | Baixa | Situação |
| --- | --- | --- | --- | --- | --- |
| API (`backend`) | 0 | 0 | 1 | 0 | Aceito, ver abaixo |
| Web (`frontend`) | 0 | 0 | 0 | 0 | Sem achados |
| Proxy (`proxy`) | 0 | 1 | 3 | 0 | Aceito com mitigação, ver abaixo |
| Operações (`ops`) | 0 | 0 | 0 | 0 | Sem achados |
| PostgreSQL (`postgres`) | 0 | 0 | 0 | 0 | Sem achados |
| Keycloak (`keycloak`) | 0 | 4 | 38 | 28 | Aceito com mitigação, ver abaixo |
| SeaweedFS `4.51` | 0 | 1 | 0 | 0 | Aceito com mitigação, ver abaixo |
| ClamAV `1.5` | 0 | 0 | 0 | 0 | Sem achados |

`npm audit --omit=dev` no web: 0 vulnerabilidades.

## Corrigido nesta rodada

A primeira análise, antes das correções, tinha 2 críticas e 46 altas. O que foi feito:

| Achado | Correção |
| --- | --- |
| Proxy: `brotli` crítica, `curl` alta, Go 1.26.8 e `golang.org/x/net` antigos na imagem `caddy:2.11-alpine` | O Caddy 2.11.7 passou a ser compilado na própria imagem, com Go 1.27.3 e dependências fixadas em `go.mod`/`go.sum`, sobre Alpine 3.22 sem `curl` nem `brotli` |
| PostgreSQL: 61 achados no binário `gosu`, compilado com Go antigo | `gosu` removido da imagem. O container já inicia como usuário `postgres`, então ele nunca era executado |
| Web: 6 altas em `undici` e `brace-expansion` do `npm` embutido no Node | `npm`, `npx` e `corepack` removidos da imagem final. O servidor só usa `node server.js` |

## Achados sem correção e justificativa

| Achado | Imagem | Avaliação |
| --- | --- | --- |
| CVE-2026-116587, `go-jose/v3` 3.0.5, alta. DoS ao analisar JWKs com parâmetros RSA forjados | Proxy (dependência indireta do Caddy, sem versão corrigida na linha v3). SeaweedFS (`go-jose/v4`, corrigido em 4.1.6, mas a imagem oficial 4.51 ainda não a inclui) | O proxy não analisa JWKs de origem externa na configuração usada (não há servidor ACME interno nem autenticação JWT no Caddy). O SeaweedFS fica em rede interna sem porta publicada, e só a API e as operações falam com ele, com credenciais. Exploração exigiria acesso prévio à rede interna |
| CVE-2026-102554, Guava 33.6.0, alta. DoS por desserialização Java | Keycloak | O Keycloak não desserializa objetos Java vindos de clientes. Correção depende de nova versão do Keycloak (a 26.8.1 é a mais recente em 31/10/2026) |
| CVE-2026-119373 e CVE-2026-119586, `sqlite-libs`, altas | Keycloak (base UBI 9) | O Keycloak não usa SQLite: o banco é PostgreSQL. O pacote vem da imagem base e a Red Hat o marca como `affected`, sem correção publicada |
| CVE-2026-91403, OpenJDK, alta. Desconfiança de uma CA intermediária | Keycloak | Marcado `will_not_fix` pela Red Hat. Não afeta as conexões do Keycloak, que saem só para o SMTP e o banco configurados |
| CVE-2026-118259, `opentelemetry-api`, média | API | Dependência transitiva do Quarkus 3.40.1. O portal não processa cabeçalhos `tracestate` de clientes externos (a API fica atrás do BFF) |
| 38 médias e 28 baixas da base UBI 9 | Keycloak | Pacotes do sistema da imagem oficial. Sem correção publicada pela Red Hat na data |

**Nenhum achado bloqueia a implantação** pelo critério combinado: não há vulnerabilidade crítica ou alta explorável a partir da internet na topologia usada. Os itens do Keycloak e do SeaweedFS dependem de versões novas dos projetos, que precisam ser acompanhadas.

## Não coberto

- Teste de invasão e análise estática do código próprio.
- `pom.xml` foi analisado indiretamente, pelos JARs dentro da imagem da API. Não houve análise com ferramenta Maven própria.
- O runner de testes (`mcr.microsoft.com/playwright`) não foi analisado: não vai para produção.

## Como repetir

```bash
# Depois de construir as imagens com prova.sh iniciar:
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.70.0 image --scanners vuln union-portal-prova-backend:latest
cd portal/frontend && npm audit --omit=dev
```
