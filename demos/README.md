# Demonstrações de produtos na VPS do portal

Cada pasta (`demos/<produto>/`) é uma demonstração pública de um produto da Union, com dados fictícios, rodando na mesma VPS do portal, **isolada dele**:

| Aspecto | Como |
| --- | --- |
| Rede | Banco numa rede interna própria; o proxy alcança a aplicação pela rede `demos`, que não contém nenhum serviço do portal; só HookGuard e FileNorm têm saída para a internet, por uma rede só da API (entrega de webhooks e e-mail do link de acesso) |
| Memória | Limite de memória em cada container; em falta de memória na máquina, o kernel encerra primeiro as demonstrações (`oom_score_adj: 500`) |
| Dados | Descartados e recriados todo dia, em horários escalonados entre 04:30 e 05:40 UTC (`demo.sh reiniciar-dados`, timer `systemd`); nada de cliente entra aqui |
| Entrada | Pelo proxy do portal, com certificado próprio por ACME; só as rotas do produto, sem `actuator` além da vivacidade |
| Limites do produto | Ver a tabela de cada demonstração abaixo |

## Demonstrações

| Produto | Endereço | Como funciona | Memória medida | Limites |
| --- | --- | --- | --- | --- |
| HookGuard | `demo-hookguard.unionsolutions.tech` | Visitante entra com o próprio e-mail (link por SMTP), cria projeto e envia webhooks; entregas reais a destinos HTTPS públicos | cerca de 470 MB | Corpo de 256 KB, 60 eventos/min por projeto, 5 000 eventos/mês por conta |
| FileNorm | `demo-filenorm.unionsolutions.tech` | Visitante entra com o próprio e-mail, gera uma chave de API e envia OFX, CNAB, CSV ou PDF; recebe eventos padronizados | cerca de 460 MB | Arquivo de 2 MB, 5 000 registros, 10 páginas de PDF |
| ComercialCloud | `demo-comercialcloud.unionsolutions.tech` | Modo de demonstração do produto: "Entrar em modo demo" abre a loja fictícia com produtos, clientes e vendas da carga inicial; sem Keycloak e com o cadastro público fechado no proxy | cerca de 440 MB | Imagens de 64 MB em memória; sem cobrança, fiscal nem e-mail reais (modos sandbox) |

| ArchLens | `demo-archlens.unionsolutions.tech` | Conta pública `architect`: cria uma avaliação, importa o arquivo de exemplo (`/amostra/analysis.json`, gerado pelo analisador do próprio produto) e percorre inventário, achados, questionário, dimensões e roteiro; sem Keycloak | cerca de 330 MB | Contas compartilhadas; só a `architect` é pública; corpo de 1 MB; sem LLM e sem saída para a internet |
| AssinaFlow | `demo-assinaflow.unionsolutions.tech` | Visitante cria conta, contrata, troca e cancela um plano; sem verificação de e-mail e sem envio de e-mail | cerca de 550 MB | Modo `demo` com gateway `simulated`: nada é cobrado, sem Stripe e sem saída para a internet. O painel `/admin` não é oferecido: mostraria os e-mails dos outros visitantes |
| Fluxe B2B Suite | `demo-fluxe.unionsolutions.tech` | Conta pública `ops@demo.example.com`: compra na loja (`/`), acompanha na operação (`/ops/`) e na administração (`/admin/`); perfil de piloto do produto, sem Keycloak e sem observabilidade | cerca de 1 GB | Gateway fictício, e-mail só em log, sem saída para a internet; autocadastro, troca e recuperação de senha fechados no proxy, porque as contas são compartilhadas |

Medido na VPS em 02/11/2026 com as seis demonstrações no ar e sem visitantes: cerca de 2,4 GB ainda disponíveis de 7,9 GB, com 350 MB de swap em uso. Atenção: no modo de demonstração do ComercialCloud a API aceita o locatário informado pelo navegador; só existem locatários fictícios da carga inicial, e os dados são recriados todo dia. Defeito do produto observado no teste: rotas inexistentes respondem 500 em vez de 404 (`GlobalExceptionMapper`), e duas imagens de produtos da carga inicial não carregam.

## Fluxe B2B Suite: o que a demonstração muda em relação ao produto

Código em quatro repositórios, nas tags de `demos/fluxe/.env.example`. Sem alterar os repositórios do produto, a demonstração:

- aplica `patches/orders-total.patch`: o serviço de pedidos não grava `totalAmount`, a loja envia o pagamento sem valor e todo checkout falha na última etapa;
- aplica `patches/shop-confirmacao.patch`: ao concluir a compra, o carrinho esvaziado invalida a primeira etapa e a loja fica na revisão com total zero, sem mostrar a confirmação;
- embute o motor de migração do Prisma na imagem (`orders-api.Dockerfile`): a imagem do produto o baixa na subida, o que não funciona sem internet;
- usa os contextos `staging,seed` do Liquibase: `prod,seed`, do perfil de piloto, falha em banco novo;
- depois de subir, ajusta a carga inicial (`ajustar_carga` em `demo.sh`): desativa as duas contas da plataforma, uma delas com e-mail real e ambas com senha pública no repositório, troca a região dos locatários pela que as telas de pagamento aceitam e dá à conta pública o papel `admin`, para abrir as três aplicações.

Defeitos do produto vistos no teste e ainda não tratados: uma cobrança recorrente da carga inicial é reprocessada a cada minuto; o pedido gera dois pagamentos, um da loja e um do worker; o preço do item vem do navegador; cinco das imagens da carga (Unsplash) respondem 404; o dono de uma conta `admin` de um locatário lista todos os locatários.

## ArchLens e AssinaFlow

Nome curto de serviço não é seguro na rede `demos`: `backend` responde também pelo ComercialCloud. Por isso o frontend do ArchLens usa o alias `archlens-api`. O ArchLens não publica tags: a versão fica presa ao commit de `.env.example`.

## Operação (na VPS, em `/opt/union-solutions/demos/<produto>`)

```bash
sh demo.sh segredos     # cria .env com a senha do banco; preencha DEMO_SMTP_PASSWORD
sh demo.sh instalar     # baixa a tag do produto e instala o site no proxy do portal
(cd ../../portal/deploy/production && docker compose --env-file .env up -d --build proxy)
sh demo.sh subir
sh demo.sh status
```

Fluxe B2B Suite: `sh demo.sh construir` numa máquina de trabalho e carregue as imagens na VPS (`docker save demo-fluxe-... | gzip | ssh ... 'gunzip | docker load'`); `subir` e `reiniciar-dados` não compilam. ArchLens e AssinaFlow podem seguir o mesmo caminho, para poupar o portal da compilação (`docker compose --env-file .env -f compose.yaml up -d --no-build --wait`).

Registro DNS `A` de `demo-<produto>.unionsolutions.tech` para o IP da VPS, antes de `instalar`. Timer diário: copie `systemd/*` para `/etc/systemd/system` e `systemctl enable --now demo-<produto>.timer`.

Condição para o aceite: a demonstração é provisória, na capacidade da VPS atual. Se o uso crescer ou o portal passar a sofrer, a demonstração sai antes do portal: `sh demo.sh parar`.
