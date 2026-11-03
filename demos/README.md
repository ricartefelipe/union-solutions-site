# Demonstrações de produtos

Cada pasta (`demos/<produto>/`) é uma demonstração pública de um produto da Union, com dados fictícios, numa VPS própria, separada da VPS do portal. `demos/proxy` termina TLS e encaminha cada endereço à sua demonstração:

| Aspecto | Como |
| --- | --- |
| Rede | Banco numa rede interna própria; o proxy alcança a aplicação pela rede `union-demos`; só HookGuard e FileNorm têm saída para a internet, por uma rede só da API (entrega de webhooks e e-mail do link de acesso) |
| Memória | Limite de memória em cada container; em falta de memória na máquina, o kernel encerra primeiro as demonstrações, antes do proxy (`oom_score_adj: 500`) |
| Dados | Descartados e recriados todo dia, em horários escalonados entre 04:30 e 05:40 UTC (`demo.sh reiniciar-dados`, timer `systemd`); nada de cliente entra aqui |
| Entrada | Pelo proxy das demonstrações, com certificado próprio por ACME; só as rotas do produto, sem `actuator` além da vivacidade |
| Limites do produto | Ver a tabela de cada demonstração abaixo |

## Demonstrações

| Produto | Endereço | Como funciona | Memória medida | Limites |
| --- | --- | --- | --- | --- |
| HookGuard | `demo-hookguard.unionsolutions.tech` | Visitante entra com o próprio e-mail (link por SMTP), cria projeto e envia webhooks; entregas reais a destinos HTTPS públicos | cerca de 470 MB | Corpo de 256 KB, 60 eventos/min por projeto, 5 000 eventos/mês por conta |
| FileNorm | `demo-filenorm.unionsolutions.tech` | Visitante entra com o próprio e-mail, gera uma chave de API e envia OFX, CNAB, CSV ou PDF; recebe eventos padronizados | cerca de 460 MB | Arquivo de 2 MB, 5 000 registros, 10 páginas de PDF |
| ComercialCloud | `demo-comercialcloud.unionsolutions.tech` | Modo de demonstração do produto: "Entrar em modo demo" abre a loja fictícia com produtos, clientes e vendas da carga inicial; sem Keycloak e com o cadastro público fechado no proxy | cerca de 440 MB | Imagens de 64 MB em memória; sem cobrança, fiscal nem e-mail reais (modos sandbox) |

| ArchLens | `demo-archlens.unionsolutions.tech` | Conta pública `architect`: cria uma avaliação, importa o arquivo de exemplo (`/amostra/analysis.json`, gerado pelo analisador do próprio produto) e percorre inventário, achados, questionário, dimensões e roteiro; sem Keycloak | cerca de 330 MB | Contas compartilhadas; só a `architect` é pública; corpo de 1 MB; sem LLM e sem saída para a internet |
| AssinaFlow | `demo-assinaflow.unionsolutions.tech` | Visitante cria conta, contrata, troca e cancela um plano; sem verificação de e-mail e sem envio de e-mail | cerca de 550 MB | Modo `demo` com gateway `simulated`: nada é cobrado, sem Stripe e sem saída para a internet. O painel `/admin` não é oferecido: mostraria os e-mails dos outros visitantes |
| Fluxe B2B Suite | `demo-fluxe.unionsolutions.tech` | Conta pública `visitante@demo-fluxe.unionsolutions.tech` (nenhum e-mail é enviado): compra na loja (`/`), acompanha na operação (`/ops/`) e na administração (`/admin/`); perfil de piloto do produto, sem Keycloak e sem observabilidade | cerca de 1 GB | Gateway fictício, e-mail só em log, sem saída para a internet; autocadastro, troca e recuperação de senha fechados no proxy, porque as contas são compartilhadas |
| cards-api | `demo-cards.unionsolutions.tech` | Conta `visitante@demo-cards.unionsolutions.tech`, senha `union-demo`: cria conta, simula a entrega por webhook, valida o cartão, emite cartão virtual e revela CVV; perfil `demo`, com simuladores | cerca de 730 MB, Keycloak incluso | Keycloak só na rede interna: o navegador alcança apenas a emissão de token. Conta compartilhada: não informe dados reais |
| order-service | `demo-orders.unionsolutions.tech` | `/entrar` grava no navegador um token público com escopos de pedidos e abre o Order Ledger; cria e consulta pedidos | cerca de 330 MB | O token vale um ano, é refeito a cada reinício diário e o segredo que o assina fica no `.env`; todos os visitantes usam a mesma origem de pedidos |
| VueMind Wallet | `demo-vuemind.unionsolutions.tech` | `demo@vuemind.dev`, senha `demo123`: saldo, extrato, favorecidos e PIX, com o front Vue e a `vuemind-api` na mesma origem | cerca de 125 MB | API em memória. Arquivo sem documentos |
| SpringMind | `demo-springmind.unionsolutions.tech` | `demo@vuemind.dev`, senha `demo123`: carteira completa, com o front ReactMind na mesma origem e dados em PostgreSQL | cerca de 300 MB | Conta compartilhada. Arquivo sem documentos |
| Skillforge | `demo-skillforge.unionsolutions.tech` | Contas `aluno`, `docente` e `administracao`, senha `union-demo`: a administração cria curso e turma e matricula, o docente publica, o aluno conclui a aula | cerca de 700 MB, Keycloak incluso | Só o login do Keycloak é público; console, contas e outros realms fechados no proxy. Uploads até 8 MB. Contas compartilhadas: não informe dados reais |

Medido na VPS em 02/11/2026 com as onze demonstrações no ar e sem visitantes: cerca de 4,8 GB em uso pelas demonstrações e 2,3 GB disponíveis de 7,9 GB, com 420 MB de swap. Cada um dos dois Keycloak usa cerca de 450 MB. Atenção: no modo de demonstração do ComercialCloud a API aceita o locatário informado pelo navegador; só existem locatários fictícios da carga inicial, e os dados são recriados todo dia.

## Fluxe B2B Suite: o que a demonstração muda em relação ao produto

Código em quatro repositórios, nas tags de `demos/fluxe/.env.example`. Depois de subir, `ajustar_carga` em `demo.sh` desativa as contas da plataforma, com senha pública no repositório do produto, e dá à conta pública o papel `admin`, para abrir as três aplicações, e um endereço no domínio da Union.

Defeito do produto visto no teste e ainda não tratado: o dono de uma conta `admin` de um locatário lista todos os locatários.

## ArchLens e AssinaFlow

Nome curto de serviço não é seguro na rede `union-demos`: `backend` responde também pelo ComercialCloud. Por isso o frontend do ArchLens usa o alias `archlens-api`. O ArchLens não publica tags: a versão fica presa ao commit de `.env.example`.

## Proxy (na VPS, em `/opt/union-solutions/demos/proxy`)

```bash
cp .env.example .env && chmod 600 .env
docker compose --env-file .env -f compose.yaml up -d --build
```

Depois de instalar ou alterar um site, reinicie o proxy: as demonstrações ficam indisponíveis por poucos segundos.

## Demonstrações do portfólio: o que muda em relação aos produtos

- **Imagens:** `cards`, `orders`, `vuemind`, `springmind` e `skillforge` são construídas numa máquina de trabalho, com `sh demo.sh construir`, e carregadas na VPS. `subir` e `reiniciar-dados` não compilam.
- **Skillforge:** a API e o front validam o emissor pela URL pública do Keycloak. Eles a alcançam pelo alias do proxy na rede `union-demos`, sem saída para a internet. Ao instalar o site, recrie o proxy com `docker compose --env-file .env -f compose.yaml up -d --no-build proxy`, para o alias valer.
- **cards-api:** `demo.sh` dá e-mail e senha à conta `admin` do realm, porque o console exige e-mail e a carga do produto não traz nenhum.
- **VueMind e SpringMind:** `SERVER_FORWARD_HEADERS_STRATEGY=framework` faz a API reconhecer a própria origem atrás do proxy; sem isso, o login responde 403 por CORS.

## Operação (na VPS, em `/opt/union-solutions/demos/<produto>`)

```bash
sh demo.sh segredos     # cria .env com a senha do banco; preencha DEMO_SMTP_PASSWORD
sh demo.sh instalar     # baixa a tag do produto e instala o site no proxy das demonstrações
(cd ../proxy && docker compose --env-file .env up -d --no-build proxy)
sh demo.sh subir
sh demo.sh status
```

Fluxe B2B Suite: `sh demo.sh construir` numa máquina de trabalho e carregue as imagens na VPS (`docker save demo-fluxe-... | gzip | ssh ... 'gunzip | docker load'`); `subir` e `reiniciar-dados` não compilam. ArchLens e AssinaFlow podem seguir o mesmo caminho, para poupar o portal da compilação (`docker compose --env-file .env -f compose.yaml up -d --no-build --wait`).

Registro DNS `A` de `demo-<produto>.unionsolutions.tech` para o IP da VPS, antes de `instalar`. Timer diário: copie `systemd/*` para `/etc/systemd/system` e `systemctl enable --now demo-<produto>.timer`.

Capacidade: a VPS tem 8 GB e nenhum dado precisa de backup, porque tudo é recriado todo dia. Se o uso crescer além da capacidade desta VPS, pare a demonstração menos procurada: `sh demo.sh parar`.
