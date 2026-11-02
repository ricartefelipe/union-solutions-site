# Demonstrações de produtos na VPS do portal

Cada pasta (`demos/<produto>/`) é uma demonstração pública de um produto da Union, com dados fictícios, rodando na mesma VPS do portal, **isolada dele**:

| Aspecto | Como |
| --- | --- |
| Rede | Banco numa rede interna própria; o proxy alcança a aplicação pela rede `demos`, que não contém nenhum serviço do portal; só a API tem saída para a internet, por uma rede só dela (entrega de webhooks e e-mail do link de acesso) |
| Memória | Limites por container (API 768 MB, banco 256 MB, painel 256 MB); uso medido: cerca de 470 MB no total |
| Dados | Descartados e recriados todo dia às 04:30 UTC (`demo.sh reiniciar-dados`, timer `systemd`); nada de cliente entra aqui |
| Entrada | Pelo proxy do portal, com certificado próprio por ACME; só as rotas do produto, sem `actuator` além da vivacidade |
| Limites do produto | Ver a tabela de cada demonstração abaixo |

## Demonstrações

| Produto | Endereço | Como funciona | Memória medida | Limites |
| --- | --- | --- | --- | --- |
| HookGuard | `demo-hookguard.unionsolutions.tech` | Visitante entra com o próprio e-mail (link por SMTP), cria projeto e envia webhooks; entregas reais a destinos HTTPS públicos | cerca de 470 MB | Corpo de 256 KB, 60 eventos/min por projeto, 5 000 eventos/mês por conta |
| FileNorm | `demo-filenorm.unionsolutions.tech` | Visitante entra com o próprio e-mail, gera uma chave de API e envia OFX, CNAB, CSV ou PDF; recebe eventos padronizados | cerca de 460 MB | Arquivo de 2 MB, 5 000 registros, 10 páginas de PDF |
| ComercialCloud | `demo-comercialcloud.unionsolutions.tech` | Modo de demonstração do produto: "Entrar em modo demo" abre a loja fictícia com produtos, clientes e vendas da carga inicial; sem Keycloak e com o cadastro público fechado no proxy | cerca de 440 MB | Imagens de 64 MB em memória; sem cobrança, fiscal nem e-mail reais (modos sandbox) |

Somadas, as três ficam em cerca de 1,4 GB, além dos cerca de 2,8 GB do portal. Atenção: no modo de demonstração do ComercialCloud a API aceita o locatário informado pelo navegador; só existem locatários fictícios da carga inicial, e os dados são recriados todo dia. Defeito do produto observado no teste: rotas inexistentes respondem 500 em vez de 404 (`GlobalExceptionMapper`), e duas imagens de produtos da carga inicial não carregam.

## Operação (na VPS, em `/opt/union-solutions/demos/<produto>`)

```bash
sh demo.sh segredos     # cria .env com a senha do banco; preencha DEMO_SMTP_PASSWORD
sh demo.sh instalar     # baixa a tag do produto e instala o site no proxy do portal
(cd ../../portal/deploy/production && docker compose --env-file .env up -d --build proxy)
sh demo.sh subir
sh demo.sh status
```

Registro DNS `A` de `demo-<produto>.unionsolutions.tech` para o IP da VPS, antes de `instalar`. Timer diário: copie `systemd/*` para `/etc/systemd/system` e `systemctl enable --now demo-<produto>.timer`.

Condição para o aceite: a demonstração é provisória, na capacidade da VPS atual. Se o uso crescer ou o portal passar a sofrer, a demonstração sai antes do portal: `sh demo.sh parar`.
