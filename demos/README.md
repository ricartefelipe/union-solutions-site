# Demonstrações de produtos na VPS do portal

Cada pasta (`demos/<produto>/`) é uma demonstração pública de um produto da Union, com dados fictícios, rodando na mesma VPS do portal, **isolada dele**:

| Aspecto | Como |
| --- | --- |
| Rede | Banco numa rede interna própria; o proxy alcança a aplicação pela rede `demos`, que não contém nenhum serviço do portal; só a API tem saída para a internet, por uma rede só dela (entrega de webhooks e e-mail do link de acesso) |
| Memória | Limites por container (API 768 MB, banco 256 MB, painel 256 MB); uso medido: cerca de 470 MB no total |
| Dados | Descartados e recriados todo dia às 04:30 UTC (`demo.sh reiniciar-dados`, timer `systemd`); nada de cliente entra aqui |
| Entrada | Pelo proxy do portal, com certificado próprio por ACME; só as rotas do produto, sem `actuator` além da vivacidade |
| Limites do produto | Corpo de 256 KB, 60 eventos por minuto por projeto, 5 000 eventos por mês por conta (cota gratuita) |

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
