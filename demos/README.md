# Demonstrações de produtos

Cada pasta (`demos/<produto>/`) é uma demonstração pública de um produto da Union, com dados fictícios, numa VPS própria, separada da VPS do portal. `demos/proxy` termina TLS e encaminha cada endereço à sua demonstração:

| Aspecto | Como |
| --- | --- |
| Rede | Banco numa rede interna própria; o proxy alcança a aplicação pela rede `union-demos`; só HookGuard e FileNorm têm saída para a internet, por uma rede só da API (entrega de webhooks e e-mail do link de acesso) |
| Memória | Limite de memória em cada container; em falta de memória na máquina, o kernel encerra primeiro as demonstrações, antes do proxy (`oom_score_adj: 500`) |
| Dados | Descartados e recriados todo dia, em horários escalonados entre 04:30 e 07:30 UTC (`demo.sh reiniciar-dados`, timer `systemd`); nada de cliente entra aqui |
| Entrada | Pelo proxy das demonstrações, com certificado próprio por ACME; só as rotas do produto, sem `actuator` além da vivacidade |
| Limites do produto | Ver a tabela de cada demonstração abaixo |

## Demonstrações

| Produto | Endereço | Como funciona | Memória medida | Limites |
| --- | --- | --- | --- | --- |
| HookGuard | `demo-hookguard.unionsolutions.tech` | Visitante informa o próprio e-mail e o código público da demonstração (`HOOKGUARD_DEMO_ACCESS_CODE`, publicado no site) e o link de entrada aparece na tela; sem o código, vai por e-mail. Cria projeto e envia webhooks; entregas reais a destinos HTTPS públicos | cerca de 470 MB | Corpo de 256 KB, 60 eventos/min por projeto, 5 000 eventos/mês por conta |
| FileNorm | `demo-filenorm.unionsolutions.tech` | Visitante informa o próprio e-mail e o código público da demonstração (`FILENORM_DEMO_ACCESS_CODE`, publicado no site) e o link de entrada aparece na tela; sem o código, vai por e-mail. Gera uma chave de API e envia OFX, CNAB, CSV ou PDF; recebe eventos padronizados | cerca de 460 MB | Arquivo de 2 MB, 5 000 registros, 10 páginas de PDF |
| ComercialCloud | `demo-comercialcloud.unionsolutions.tech` | Modo de demonstração do produto: a conta de demonstração (`admin@demo.com`, senha publicada no site) entra na loja fictícia com produtos, clientes e vendas da carga inicial; a API não responde sem a sessão dela. Sem Keycloak e com o cadastro público fechado no proxy | cerca de 440 MB | Imagens de 64 MB em memória; sem cobrança, fiscal nem e-mail reais (modos sandbox) |

| ArchLens | `demo-archlens.unionsolutions.tech` | Conta pública `architect`: cria uma avaliação, importa o arquivo de exemplo (`/amostra/analysis.json`, gerado pelo analisador do próprio produto) e percorre inventário, achados, questionário, dimensões e roteiro; sem Keycloak | cerca de 330 MB | Contas compartilhadas; só a `architect` é pública; corpo de 1 MB; sem LLM e sem saída para a internet |
| AssinaFlow | `demo-assinaflow.unionsolutions.tech` | Visitante cria conta, contrata, troca e cancela um plano; sem verificação de e-mail e sem envio de e-mail | cerca de 550 MB | Modo `demo` com gateway `simulated`: nada é cobrado, sem Stripe e sem saída para a internet. O painel `/admin` não é oferecido: mostraria os e-mails dos outros visitantes |
| Fluxe B2B Suite | `demo-fluxe.unionsolutions.tech` | Conta pública `visitante@demo-fluxe.unionsolutions.tech` (nenhum e-mail é enviado): compra na loja (`/`), acompanha na operação (`/ops/`) e na administração (`/admin/`); perfil de piloto do produto, sem Keycloak e sem observabilidade | cerca de 1 GB | Gateway fictício, e-mail só em log, sem saída para a internet; autocadastro, troca e recuperação de senha fechados no proxy, porque as contas são compartilhadas |
| cards-api | `demo-cards.unionsolutions.tech` | Conta `visitante@demo-cards.unionsolutions.tech`, senha `union-demo`: cria conta, simula a entrega por webhook, valida o cartão, emite cartão virtual e revela CVV; perfil `demo`, com simuladores | cerca de 730 MB, Keycloak incluso | Keycloak só na rede interna: o navegador alcança apenas a emissão de token. Conta compartilhada: não informe dados reais |
| order-service | `demo-orders.unionsolutions.tech` | `/entrar` grava no navegador um token público com escopos de pedidos e abre o Order Ledger; cria e consulta pedidos | cerca de 330 MB | O token vale um ano, é refeito a cada reinício diário e o segredo que o assina fica no `.env`; todos os visitantes usam a mesma origem de pedidos |
| VueMind Wallet | `demo-vuemind.unionsolutions.tech` | `demo@vuemind.dev`, senha `demo123`: saldo, extrato, favorecidos e PIX, com o front Vue e a `vuemind-api` na mesma origem | cerca de 125 MB | API em memória. Arquivo sem documentos |
| SpringMind | `demo-springmind.unionsolutions.tech` | `demo@vuemind.dev`, senha `demo123`: carteira completa, com o front ReactMind na mesma origem e dados em PostgreSQL | cerca de 300 MB | Conta compartilhada. Arquivo sem documentos |
| Skillforge | `demo-skillforge.unionsolutions.tech` | Contas `aluno`, `docente` e `administracao`, senha `union-demo`: a administração cria curso e turma e matricula, o docente publica, o aluno conclui a aula | cerca de 700 MB, Keycloak incluso | Só o login do Keycloak é público; console, contas e outros realms fechados no proxy. Uploads até 8 MB. Contas compartilhadas: não informe dados reais |
| Recorvia | `demo-recorvia.unionsolutions.tech` | Contas do realm de demonstração do produto, senha `Recorvia#Demo2026`: `ana.owner@acme.test` (proprietária), `bruno.finance@acme.test` (financeiro) e `davi.auditor@acme.test` (auditoria) na Acme; `carla.owner@beta.test` na Beta, com cliente, plano e assinatura de exemplo; `equipe@recorvia.test`, equipe da plataforma (`/admin/servicos`). Catálogo, assinaturas, faturas e cobranças, com o pagamento pelo checkout do simulador do produto | cerca de 720 MB (Keycloak 520 MB, RabbitMQ 110 MB, PostgreSQL 60 MB; os serviços Go menos de 10 MB cada), medido na VPS em 27/11 | Pagamento só pelo simulador, sem dinheiro; e-mails retidos no Mailpit da rede interna, sem envio; webhooks para fora não são entregues; só o login do Keycloak é público. Corpo de 1 MB. Contas compartilhadas: não informe dados reais |

Medido na VPS em 03/11/2026, depois das atualizações e do reinício dos dados, com as onze demonstrações no ar e sem visitantes: cerca de 5,9 GB em uso e 2,0 GB disponíveis de 7,9 GB, com 114 MB de swap. Cada um dos dois Keycloak usa cerca de 450 MB. Os dados são recriados todo dia. No modo de demonstração do ComercialCloud, o locatário e o usuário são fixos no servidor (`COMERCIAL_CLOUD_TENANT_RESOLUTION: demo`): o navegador não escolhe o locatário.

## Fluxe B2B Suite: o que a demonstração muda em relação ao produto

Código em quatro repositórios, nas tags de `demos/fluxe/.env.example`. Depois de subir, `ajustar_carga` em `demo.sh` desativa as contas da plataforma, com senha pública no repositório do produto, e dá à conta pública o papel `admin`, para abrir as três aplicações, e um endereço no domínio da Union.

Na versão v1.5.7 o dono de uma conta `admin` lista só o próprio locatário, a cobrança recorrente vencida é liquidada uma única vez, sem repetição a cada minuto, e os workers voltam a processar pedidos depois de uma queda do RabbitMQ (conferido na VPS em 03/11/2026).

## Versões e análise de imagens (04/11/2026)

| Sistema | Versão em produção |
| --- | --- |
| Fluxe B2B Suite | fluxe-b2b-suite v1.5.9, spring-saas-core v1.4.3, node-b2b-orders v1.4.9, py-payments-ledger v2.0.8, com o RabbitMQ 4.4.0 e o Node 22 nas interfaces |
| ComercialCloud | v1.5.3, com a API só para a sessão da conta de demonstração e o Node 22 no front |
| ArchLens | v1.0.1, com a API fechada ao público e a ponte `/bff/v1` |
| Skillforge | v0.16.2, com a interface pública só depois do ajuste das contas e do cliente do realm, e o primeiro login com o servidor frio corrigido |
| FileNorm | v0.3.3 |
| SpringMind | springmind v0.4.1, reactmind v0.2.0 e mind-shared v2.2.1 |
| VueMind | vuemind-api v0.4.1, vuemind v0.2.0 e mind-shared v2.2.1 |
| cards-api | v1.4.6, com o console público só depois do ajuste da conta |
| AssinaFlow | v1.0.11, com o RabbitMQ 4.4.0 na imagem do produto e as rotas públicas respondendo 4xx, e não 500, a corpo vazio ou JSON inválido |
| order-service | v2.0.2 |
| HookGuard | v1.0.9, com a API sem root e o código de acesso da demonstração |
| Recorvia | v0.4.1 |

Achados HIGH e CRITICAL com correção disponível (Trivy 0.70.0, `--ignore-unfixed`), antes e depois:

| Imagem | Antes | Depois |
| --- | --- | --- |
| Keycloak (cards e Skillforge) | 96 (26.2) e 91 (26.4) | 1 (26.8.1) |
| cards-admin | 62 | 0 |
| cards-api | 0 | 0 |
| ComercialCloud, API | 38 | 0 |
| ComercialCloud, front | 43 | 0 |
| Skillforge, API | 9 | 0 |
| Skillforge, web | 10 | 0 |
| FileNorm, API | 2 | 0 |
| FileNorm, web | 0 | 0 |
| SpringMind, API e web | 45 e 49 | 0 e 0 |
| VueMind, API e web | 63 e 49 | 0 e 0 |
| Fluxe, saas-core | 57 | 0 (v1.4.2: a `libexpat` 2.9.0 da base saiu com as correções do Alpine na etapa final) |
| Fluxe, loja | 26 | 0 |
| Fluxe, operação e administração | 62 e 62 | 0 e 0 |
| Fluxe, orders e payments (API e workers) | 0 | 0 |
| PostgreSQL 16 (nove demonstrações) e MariaDB 10.11 (cards) | 26 (1 crítico) cada | 0 e 0 (`demos/imagens`, na VPS desde 03/11/2026; 0 também sem `--ignore-unfixed`) |
| Redis 7 (Fluxe) | 0 | 0 |
| RabbitMQ, Fluxe | 71 (3.13.7) | 0 (4.4.0) |
| RabbitMQ, AssinaFlow (`assinaflow-rabbitmq:4-patched`) | 0 (3.13.7 com `apk upgrade`) | 0 (4.4.0), nenhum achado de nenhuma gravidade |
| AssinaFlow, web | 2 (`libexpat` 2.9.0, publicada em 03/11/2026) | 0 (imagem reconstruída: o Dockerfile do produto já executa `apk upgrade`) |
| AssinaFlow, API, PostgreSQL e Redis | 0 | 0 |

Recorvia v0.4.1, analisado na VPS em 27/11 com o Trivy 0.70.0 (`HIGH,CRITICAL`, `--ignore-unfixed`): nenhum achado nas imagens `demo-recorvia-*` (API, worker, migrate, seed, simulador e interface, esta em Alpine 3.24.2), no Redis 8.8.4, no RabbitMQ 4.2.9 e no Mailpit v1.33.1.

Reanalisadas em 04/11/2026, depois da rodada final, as 29 imagens construídas para as demonstrações (as dez pilhas acima, menos o HookGuard, que não mudou) não têm nenhum achado HIGH ou CRITICAL, com ou sem correção disponível. O PostgreSQL do AssinaFlow vem da imagem do próprio produto: mantém o `gosu`, recompilado com Go 1.27.3, sem achados.

Rodada final na VPS em 04/11/2026, conferida pelos endereços públicos: ArchLens com `/api/v1/*` respondendo 404, ponte sem sessão e cabeçalhos de identidade forjados respondendo 401, e login, criação e leitura de avaliação pela interface; ComercialCloud com clientes, usuários, auditoria e configurações respondendo 401 sem sessão, senha errada e token forjado recusados, e login pela interface com a conta de demonstração; VueMind e SpringMind com PIX imediato e agendado (executado depois da data) com end-to-end, data no passado e além de 365 dias recusadas, chave CNPJ com dígito inválido recusada e sem rolagem horizontal em 390 px; Fluxe com pedido até `PAID` e um único pagamento `SETTLED`, administração vendo 1 locatário e as APIs anunciando 1.4.2, 1.4.8 e 2.0.7; AssinaFlow, cards, FileNorm, Skillforge (três papéis) e Orders (pedido idempotente) no fluxo básico.

Atualização de 09/11/2026 na VPS: FileNorm v0.3.3 e HookGuard v1.0.8 (correção do go-jose em ambos), com as imagens construídas numa máquina de trabalho, carregadas na VPS e aproveitadas por `up -d` sem `--build`, porque a VPS tinha 1,5 GB de RAM livre. A demo do FileNorm passou a mostrar o link de entrada na tela para quem informa o código público (`FILENORM_DEMO_ACCESS_CODE`); conferido pelo endereço público: sem código, a resposta só confirma o envio por e-mail; com código, devolve o link, e o link cria a sessão. O HookGuard ficou só por e-mail até a 1.0.8, porque a chave `exposeMagicLink` revelava o link a qualquer um e a demo entrega webhooks a destinos públicos. A 1.0.9 trouxe o código de acesso da demonstração, igual ao do FileNorm, e a demo passou a usá-lo em 09/11/2026.

Última atualização na VPS em 04/11/2026, com as versões da tabela acima, conferida pelos endereços públicos, uma pilha por vez: HookGuard e FileNorm com as rotas de dados respondendo 401 sem credencial; ArchLens com `/api/v1/*` em 404, ponte sem sessão em 401 e login e avaliação criada e lida pela tela; ComercialCloud com clientes, usuários, auditoria e configurações em 401 sem sessão, senha errada e token forjado recusados e cliente criado e lido com a conta pública; AssinaFlow com cadastro, assinatura, troca de plano e cancelamento, e outro usuário recebendo 403; Orders com pedido idempotente; Fluxe com pedido até `PAID` e um único pagamento `SETTLED`, administração vendo uma empresa e as APIs anunciando 1.4.3, 1.4.9 e 2.0.8; VueMind e SpringMind com PIX imediato, agendado executado depois da data, datas fora da janela e CNPJ inválido recusados, e sem rolagem horizontal em 390 px; cards e Skillforge mostrando "indisponível" durante o `reiniciar-dados`; o cards aceita o login na primeira tentativa assim que abre, e o Skillforge também, a não ser no caso da pendência abaixo. As imagens novas não têm achado HIGH ou CRITICAL com correção; o proxy das demonstrações tem 1 HIGH sem correção publicada (`go-jose/v3` 3.0.5, no módulo de PKI interna do Caddy, que o Caddyfile não habilita).

Skillforge v0.16.2 e AssinaFlow v1.0.11 na VPS em 04/11/2026, uma pilha por vez, conferidos pelos endereços públicos: no Skillforge, 5 `reiniciar-dados` seguidos, cada um seguido do primeiro login pelo link "Entrar" da página inicial, com o papel que entra primeiro alternando entre aluno, docente e administração: 15 de 15 logins. Antes, o primeiro login com o servidor frio falhava (a navegação e a pré-busca de `/login` gravavam o `state` no mesmo cookie; agora cada login pendente tem o seu, e a pré-busca recebe 204 sem cookies). Também o fluxo básico: a administração cria um curso e abre uma turma com o docente, e o docente vê os dois, abre uma unidade e publica uma aula. No AssinaFlow, login, cadastro e criação de usuário respondem 400 a corpo vazio, JSON inválido e campos faltando, e o webhook do Stripe 404 (no modo simulação a rota não existe); assinatura, troca de plano e cancelamento agendado continuam funcionando, e outro usuário recebe 403. As três imagens novas (API e interface do Skillforge, aplicação do AssinaFlow) não têm achado HIGH/CRITICAL, com ou sem correção.

Pendências conhecidas, sem correção disponível ou fora do alcance desta mudança:

- **Keycloak 26.8.1 (cards e Skillforge):** reanalisado em 04/11/2026, já no digest mais recente (`26.8.1-2`), sem versão nova. O achado HIGH da Guava 33.6.0 (CVE-2026-102554, corrigida na 33.7.2) sai com `demos/imagens/keycloak.Dockerfile`, que troca só esse JAR (ver "Imagens próprias"); na VPS ele continua até a imagem nova ser construída lá. Restam 3 sem correção do fabricante na base UBI 9 (`sqlite-libs` 2 e OpenJDK 1), aceitos em `.trivyignore.yaml` até 01/12/2026 e avaliados em `portal/docs/VULNERABILIDADES.md`.
- **Keycloak 26.8:** recusa o token com `Origin` fora de `webOrigins` (403 "Invalid origin"). O `demo.sh` do cards ajusta o cliente `cards-admin` para o endereço público.
- **VueMind e SpringMind:** desde 03/11/2026 o comprovante do PIX traz o end-to-end no formato do arranjo do Banco Central, com o ISPB fictício `99999999`, e avisa que o PIX é simulado.
- **FileNorm:** o link de acesso só aparece na resposta com o código de acesso da demonstração; na VPS o modo está desligado e o link vai por e-mail. Destinatário recusado pelo servidor de e-mail responde 500.

## RabbitMQ 4

Fluxe e AssinaFlow usam o RabbitMQ 4.4.0: a Fluxe na imagem `rabbitmq:4.4.0-alpine`, sem o painel de administração, que a demonstração não expõe; o AssinaFlow na imagem do próprio produto, a partir da v1.0.8. Medido com o limite da demonstração, em repouso: 94 MB sem painel e 99 MB com painel, contra 133 MB do 3.13 com painel. A verificação de saúde (`rabbitmq-diagnostics ping`) sobe uma máquina Erlang à parte a cada execução e produz picos curtos, de até 178 MB no 4.4 e 197 MB no 3.13, sem estouro dos limites.

Os dados do RabbitMQ ficam num volume anônimo, que o reinício diário apaga. Para trocar a versão, recrie tudo com `reiniciar-dados`: a 4.4 também arranca sobre dados da 3.13, mas mensagens persistentes dessas filas se perdem em silêncio, e os workers da Fluxe até node-b2b-orders v1.4.6 e py-payments-ledger v2.0.5 não se recuperam de um broker sem filas sem reiniciar.

- **Fluxe:** tags de `.env.example` no `.env`, `sh demo.sh instalar`, `sh demo.sh construir` numa máquina de trabalho para orders e payments (API e workers), que mudaram na v1.4.7 e na v2.0.6, imagens carregadas na VPS e `sh demo.sh reiniciar-dados`. A imagem do RabbitMQ vem do Docker Hub; saas-core e frontends não mudam de código.
- **AssinaFlow:** `ASSINAFLOW_TAG=v1.0.8` no `.env` e `sh demo.sh instalar`. `subir` reconstrói todas as imagens na VPS; para poupar memória, construa só a do RabbitMQ (`deploy/images/rabbitmq.Dockerfile`) numa máquina de trabalho, carregue como `demo-assinaflow-rabbitmq:latest` e rode `sh demo.sh reiniciar-dados`, que não reconstrói. O site do proxy não muda.

Conferido numa máquina de trabalho em 03/11/2026, com as tags de produção da Fluxe e a branch do AssinaFlow que vira a v1.0.8: pedido até `PAID` em 4,2 s (4,3 s no 3.13), um único pagamento, administração vendo só o próprio locatário, cobrança recorrente vencida liquidada uma vez em dois ciclos, `flag.created` do saas-core entregue por `saas.events`; no AssinaFlow, cadastro, assinatura, renovação assíncrona cobrada pelo consumidor da fila `payments.charge`, troca de plano e cancelamento.

Implantado na VPS em 03/11/2026 (04/11 em UTC), com o volume da 3.13 descartado e as duas filas rodando sem root (uid 100). Conferido pelos endereços públicos: na Fluxe, pedido até `PAID` em 4,4 s com um único pagamento `SETTLED`, administração vendo 1 de 5 locatários, recorrência vencida liquidada uma vez e mantida assim por mais dois ciclos; depois de duas quedas seguidas do RabbitMQ, os workers se reconectaram sem reiniciar (`rabbitmq.reconnected` e `outbox.dispatcher_stopped` duas vezes cada) e um pedido novo chegou a `PAID` em 4,7 s. No AssinaFlow, assinatura, troca de plano, renovação de R$ 39,90 pela fila `payments.charge` (evento `PAYMENT_CHARGE_REQUESTED` enviado e consumido, ciclo avançado em um mês) e cancelamento agendado.

## ArchLens e AssinaFlow

Nome curto de serviço não é seguro na rede `union-demos`: `backend` responde também pelo ComercialCloud. Por isso o frontend do ArchLens usa o alias `archlens-api`. A versão do ArchLens vem de `ARCHLENS_REF` (tag de release ou commit; `ARCHLENS_COMMIT`, de `.env` antigos, ainda vale). A API do ArchLens não é pública: o navegador fala com a ponte `/bff/v1` do frontend, que confere a sessão e envia a identidade à API com `ARCHLENS_LOCAL_HEADER_AUTH_SECRET`, segredo que só o servidor conhece; sem ele, a API responde 401, e o Caddy devolve 404 para `/api/v1/*`. Para atualizar um `.env` anterior: `sh demo.sh segredos` acrescenta o segredo sem mexer nos outros valores; depois ajuste `ARCHLENS_REF`, rode `instalar` (copia o Caddy novo), recarregue o proxy (`sh ../proxy/recarregar.sh`) e rode `subir`.

## Proxy (na VPS, em `/opt/union-solutions/demos/proxy`)

```bash
cp .env.example .env && chmod 600 .env
docker compose --env-file .env -f compose.yaml up -d --build
```

Depois de instalar ou alterar um site, recarregue o proxy com `sh recarregar.sh`, nesta pasta. O script valida a configuração e só então a aplica, pela administração do Caddy num socket Unix dentro do container (`/tmp/caddy-admin.sock`, permissão 0600, sem porta TCP). As outras demonstrações não saem do ar, e uma configuração inválida é recusada sem mudar a que está em execução.

Mudanças no próprio `Caddyfile` pedem reinício (`docker compose --env-file .env restart proxy`): ele é montado como arquivo, e a cópia por `tar` ou `rsync` troca o arquivo, que o container não vê até reiniciar. A pasta `sites/` é montada inteira, então sites novos ou alterados valem com a recarga. A primeira vez que este `Caddyfile` entra na VPS também pede reinício, porque a versão anterior desligava a administração (`admin off`) e não aceitava recarga.

## Demonstrações do portfólio: o que muda em relação aos produtos

- **Imagens:** `cards`, `orders`, `vuemind`, `springmind` e `skillforge` são construídas numa máquina de trabalho, com `sh demo.sh construir`, e carregadas na VPS. `subir` e `reiniciar-dados` não compilam.
- **Skillforge:** a API e o front validam o emissor pela URL pública do Keycloak. Eles a alcançam pelo alias do proxy na rede `union-demos`, sem saída para a internet. Ao instalar o site, recrie o proxy com `docker compose --env-file .env -f compose.yaml up -d --no-build proxy`, para o alias valer.
- **cards-api:** `demo.sh` dá e-mail e senha à conta `admin` do realm, porque o console exige e-mail e a carga do produto não traz nenhum.
- **Skillforge e cards-api, ordem de subida:** `subir` e `reiniciar-dados` sobem primeiro banco, Keycloak e API, ajustam as contas e o cliente do realm, e só então a interface pública (`web` no Skillforge, `cards-admin` no Cards). Antes, a interface atendia enquanto as contas ainda não estavam ajustadas: em 20 reinícios medidos localmente em 04/11/2026, 14 de 100 tentativas de login no Skillforge feitas durante o reinício viram o erro `Invalid parameter: redirect_uri` do Keycloak ou tiveram a senha recusada, e no Cards, em 5 reinícios, o console atendia com o login recusado (403 "Invalid origin") por 7 a 17 s em cada um. Com a ordem nova, em mais 20 reinícios de cada um, nenhuma tentativa viu esses erros: até o fim, o proxy responde que a demonstração está temporariamente indisponível. Se o ajuste falhar, o script para com erro (e o timer aparece como falho em `systemctl --failed`), em vez de deixar a demonstração sem login até o dia seguinte. A verificação de saúde do Keycloak, e a da API do Cards, só aceitam a resposta 200: a 503 também traz "UP" no corpo.
- **Recorvia:** `construir` constrói na VPS, a partir da tag clonada por `instalar`, só as imagens do produto, e não as comuns de `demos/imagens`, sem subir nada, para a análise antes de publicar; `subir` constrói e sobe; `reiniciar-dados` não compila, então, ao trocar de tag ou de `compose.yaml`, rode `subir`. O nginx da interface do produto fixa a API em `api`, nome que na rede `union-demos` responde por outras demonstrações: a imagem `web` da demonstração parte da do produto e troca o endereço pelo alias `recorvia-api`, e a construção falha se a troca não acontecer. A API fica só na rede interna, porque confia no `X-Real-IP` do nginx. A interface e o Keycloak só aceitam `X-Forwarded-*` da faixa da rede do proxy, que o `demo.sh` lê a cada execução (`DEMOS_PROXY_SUBNET`). O emissor OIDC é o endereço público; a API descobre o Keycloak pela rede interna (`RECORVIA_OIDC_DISCOVERY_URL`) e, com `KC_HOSTNAME_BACKCHANNEL_DYNAMIC`, troca o código e busca as chaves por ela, sem alias no proxy. A revogação o Keycloak 26.8 anuncia no endereço público, que a API não alcança: ao sair, a sessão local termina, a do Keycloak termina na confirmação de saída, no navegador, e a API só registra um aviso de revogação recusada. `demo.sh` ajusta o realm da tag, que é o do ambiente local do produto: endereço público e segredo do `.env` no cliente `recorvia-web`, nome da demonstração e proteção contra força bruta desligada, para um visitante não bloquear as contas compartilhadas com tentativas erradas; as ações que trocam senha, segundo fator, chave de acesso ou perfil ficam desligadas no realm, e o proxy recusa a autorização com `kc_action`, para ninguém tomar uma conta compartilhada até o reinício diário. O Keycloak usa o banco embutido do modo de desenvolvimento, dentro do contêiner, e o reinício diário volta o realm ao da tag. Os e-mails ficam no Mailpit da rede interna, sem envio: a conta SMTP do portal não é usada porque qualquer visitante poderia disparar e-mails pela caixa da Union, e o link do portal do cliente aparece na própria tela do cliente. O worker e a carga rodam em `development`, porque em `production` o worker exige SMTP com TLS, e o Mailpit não tem; a API roda em `production`. A tela `/admin/servicos` é da interface do produto e fica aberta no proxy; o resto de `/admin*`, onde está o console do Keycloak, fica fechado, como a documentação da API (`/api/openapi.yaml`).
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

### ComercialCloud: sessão da demonstração (a partir da v1.5.2)

A API exige a sessão emitida à conta de demonstração. Ao atualizar uma VPS que está na v1.5.0, `sh demo.sh segredos` acrescenta ao `.env` o segredo da sessão (gerado) e a senha da conta, sem mexer no que já existe; depois, troque `COMERCIALCLOUD_TAG` e rode `instalar` e `subir`. Sem o segredo, o backend não sobe.

### Imagens próprias (`demos/imagens`)

A imagem oficial do PostgreSQL e a do MariaDB, em todas as versões publicadas até 03/11/2026, trazem o `gosu` 1.19 compilado com Go 1.24.6 (26 achados, 1 crítico). Ele só serve para o entrypoint trocar de root para o usuário do banco. `postgres.Dockerfile` e `mariadb.Dockerfile` removem o binário, e o container inicia direto como `postgres` (uid 70) ou `mysql` (uid 999). Volumes criados pela imagem oficial continuam funcionando, porque o diretório de dados já pertence a esse usuário. Todas as demonstrações com PostgreSQL usam `union-demos-postgres:16`; o cards usa `union-demos-mariadb:10.11`.

O Keycloak 26.8.1 embute a Guava 33.6.0-jre (CVE-2026-102554, HIGH, corrigida na 33.7.2), e o fabricante ainda não publicou versão com a correção. `keycloak.Dockerfile` parte da imagem oficial fixada pelo digest e troca só esse JAR: baixa a 33.7.2 do Maven Central, confere o SHA-256 fixado no arquivo, acerta o nome do JAR nos índices do Quarkus e roda `kc.sh build`, que falha se algo não bater. O Keycloak usa a Guava na conversão de nomes de opções (`CaseFormat`) e na política de senhas proibidas (`BloomFilter`, inclusive arquivos `.bloom` gerados antes); entre as duas versões não mudou nada que ele use. Cards, Skillforge e Recorvia usam `union-demos-keycloak:26.8.1`. Quando sair Keycloak com a Guava corrigida, o build falha no `rm` do JAR antigo: volte para a imagem oficial.

Fluxe, Skillforge, Orders, SpringMind e cards sobem e reiniciam os dados com `--no-build`, inclusive pelo timer da madrugada: construa as imagens na VPS **antes** de copiar os `compose.yaml` novos.

```bash
cd /opt/union-solutions/demos/imagens
docker build -t union-demos-postgres:16 -f postgres.Dockerfile .
docker build -t union-demos-mariadb:10.11 -f mariadb.Dockerfile .
docker build -t union-demos-keycloak:26.8.1 -f keycloak.Dockerfile .
```

Depois, em cada demonstração, `sh demo.sh reiniciar-dados` troca o banco e o Keycloak já com as imagens novas.

Registro DNS `A` de `demo-<produto>.unionsolutions.tech` para o IP da VPS, antes de `instalar`. Timer diário: copie `systemd/*` para `/etc/systemd/system` e `systemctl enable --now demo-<produto>.timer`.

Capacidade: a VPS tem 8 GB e nenhum dado precisa de backup, porque tudo é recriado todo dia. Se o uso crescer além da capacidade desta VPS, pare a demonstração menos procurada: `sh demo.sh parar`.
