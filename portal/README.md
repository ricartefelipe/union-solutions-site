# Portal do Cliente Union Solutions

Aplicação separada do site institucional, onde clientes acompanham projetos, documentos, entregas, suporte e produtos contratados, e a equipe da Union administra esses registros.

O portal exige runtime e serviços persistentes: **não pode ser publicado na hospedagem estática do site**. O site funciona sem ele, e a única ligação é o botão "Área do cliente", configurado em `PUBLIC_PORTAL_URL`.

| Parte | Tecnologia |
| --- | --- |
| Web e BFF (`frontend/`) | Next.js 16, React 19, TypeScript |
| API (`backend/`) | Java 21, Quarkus 3.40, Hibernate, Liquibase |
| Banco | PostgreSQL 17 |
| Identidade | Keycloak 26.8 (OpenID Connect) |
| Arquivos | Armazenamento privado compatível com S3 (SeaweedFS) |
| Antivírus | ClamAV |
| Proxy em produção | Caddy, com TLS |
| Backup em produção | restic |
| E-mail local | Mailpit (nenhum e-mail real é enviado) |

## Iniciar localmente

Requer Docker com Compose. O primeiro início baixa imagens e assinaturas do antivírus.

```bash
sh portal/deploy/local/portal.sh up
```

O comando gera os segredos locais em `portal/deploy/local/.env` (não versionado), constrói as imagens e aguarda os serviços ficarem saudáveis.

| Endereço | Serviço |
| --- | --- |
| http://localhost:3100 | Portal |
| http://localhost:8025 | Caixa de e-mails de desenvolvimento |
| http://localhost:8180 | Keycloak |

**Primeiro acesso:** abra a caixa de e-mails, siga o link enviado para `admin@portal.invalid`, defina a senha e entre em http://localhost:3100.

```bash
sh portal/deploy/local/portal.sh status            # situação dos serviços
sh portal/deploy/local/portal.sh logs backend      # registros de um serviço
sh portal/deploy/local/portal.sh down              # encerra e mantém os dados
sh portal/deploy/local/portal.sh backup            # copia bancos e arquivos
sh portal/deploy/local/portal.sh restore <pasta>   # restaura um backup
sh portal/deploy/local/portal.sh destroy           # apaga todos os dados locais, com confirmação
```

No ambiente local, o segundo fator fica desligado. Em produção, ele é obrigatório para a equipe da Union.

**Massa de demonstração (opcional, só em desenvolvimento):** defina `PORTAL_DEMO_ENABLED=true` em `portal/deploy/local/.env` e reinicie. Ela cria uma organização identificada como `[Demonstração]`, com as contas `admin.demo@portal.invalid` e `cliente.demo@portal.invalid` e a senha `PORTAL_DEMO_PASSWORD` do mesmo arquivo. A API recusa iniciar em produção com essa opção ativa.

## Testes

```bash
# API: testes de integração com PostgreSQL real. Exige Java 21, Maven e Docker.
cd portal/backend && mvn test

# Web: tipos, identidade visual igual à do site e armazenamento de sessões contra PostgreSQL real (exige Docker)
cd portal/frontend && npm ci && npm run typecheck && npm run check:brand && npm run test:session

# Navegador real, contra o ambiente local em execução. Exige Google Chrome.
cd portal/e2e && npm ci && npm test
```

A suíte de navegador deve começar em ambiente zerado, e o arquivo `03-operacao` restaura backups e reinicia serviços. Os testes da configuração de produção rodam com `deploy/production/teste/prova.sh`, descrito em [Implantação](docs/IMPLANTACAO.md). Em disco sem symlinks (vfat/exFAT), rode testes e builds locais a partir de uma cópia em outro disco: o Maven e o `node_modules` ficam muito lentos nesse tipo de sistema de arquivos. O `.npmrc` já evita os symlinks de `node_modules/.bin`.

## Estrutura

```text
backend/src/main/java/.../domain/          Entidades e transições de estado
backend/src/main/java/.../application/     Regras, autorização (AccessPolicy) e auditoria
backend/src/main/java/.../infrastructure/  REST, S3, ClamAV e Keycloak
backend/src/main/resources/db/changelog/   Migrations Liquibase em YAML
frontend/src/proxy.ts                      Sessão, CSP e cabeçalhos em toda requisição
frontend/src/app/bff/                      Proxy para a API: tokens nunca chegam ao navegador
frontend/src/app/(portal)/                 Telas autenticadas
deploy/local/                              Ambiente de desenvolvimento
deploy/production/                         Compose, proxy, operações, systemd e portal-prod.sh
deploy/production/teste/                   Ambiente isolado que exercita a configuração de produção
deploy/keycloak/                           Realm e tema de login
e2e/                                       Testes em navegador real
docs/                                      Documentação
```

## Documentação

- [Guia operacional](docs/OPERACAO.md): administração, antivírus, backup, observabilidade.
- [Implantação](docs/IMPLANTACAO.md): dependências de produção e procedimento.
- [Segurança e limitações](docs/SEGURANCA.md): controles e limitações.
- [Privacidade](docs/PRIVACIDADE.md): inventário de dados e campos a preencher.
- [Vulnerabilidades](docs/VULNERABILIDADES.md): análise de dependências e imagens.
- [Evidências](docs/EVIDENCIAS.md): testes executados e resultados.
- [OpenAPI](docs/api/openapi.yaml): contrato da API, gerado a partir do código.
