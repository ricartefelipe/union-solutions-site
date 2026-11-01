# Publicação: índice operacional

Este é o ponto de partida para publicar. **Nada foi publicado, nenhum DNS foi alterado e nenhuma conexão foi feita a servidores reais.** São duas aplicações independentes: o site pode ir ao ar sem o portal.

| Aplicação | Hospedagem | Endereço | Situação |
| --- | --- | --- | --- |
| Site institucional | Hostinger Business (contratada) | `https://unionsolutions.tech` | Pacote pronto e testado |
| Portal do cliente | VPS (não contratada) | `https://clientes.unionsolutions.tech` | Configuração de produção exercitada em ambiente isolado |

## Site institucional

### Configuração

`.env`, não versionado:

```bash
PUBLIC_SITE_URL=https://unionsolutions.tech
PUBLIC_CONTACT_EMAIL=contato@unionsolutions.tech
PUBLIC_CONTACT_FORM_ENDPOINT=https://unionsolutions.tech/contato.php
```

Com o endpoint, a página de contato mostra o formulário, que envia para `contato.php` (publicado junto com o site) e dali para a caixa `contato@` pelo `mail()` do PHP da Hostinger; o e-mail e o WhatsApp seguem como alternativa. Sem a variável, a página volta ao modo de contato direto.

`PUBLIC_PORTAL_URL` fica **ausente**: o botão "Área do cliente" só entra depois de o portal estar validado.

### Gerar o pacote

```bash
npm run verify
npm run check:contact
npm run verify           # check:contact usa builds de teste: gere de novo o build de produção
npm run check:publish
sh scripts/empacotar-site.sh
```

O script só gera o ZIP se `check:publish` aprovar. Ele extrai o pacote, compara com `dist/`, recusa arquivos que não deveriam estar nele, como `.env`, código-fonte, dependências, mapas ou endereços locais, e grava o SHA-256 e o inventário.

**Pacote atual (1.2.0, gerado em 01/11/2026, ainda não publicado):** `artifacts/pacotes/site-union-solutions-20261101-150354.zip`

**SHA-256:** `e70eb377d64b648dfa68174dbc76cd4ca628127e6e05b653f65c0b10c97884f4`

**Publicado na Hostinger em 31/10/2026 (1.1.0):** `site-union-solutions-20261031-215233.zip`. O pacote novo muda só o cabeçalho (botão de contato marcado como página atual em Contato) e a frase de assunto no formulário quando se chega por um produto ou serviço. Publique-o pelo mesmo procedimento quando quiser; não é obrigatório para o portal.

O pacote foi testado em Apache 2.4 com o `.htaccess` real. A Hostinger pode usar LiteSpeed, então confira o resultado depois de publicar.

### Antes de substituir arquivos

**Faça a cópia do conteúdo atual.** Nenhum site existente foi removido nem alterado.

1. No hPanel, identifique que tipo de site está ligado a `unionsolutions.tech`.
2. **Se o site atual foi criado no AI Builder ou no construtor de sites:** não presuma que há um `public_html` com os arquivos dele, nem que o envio de um ZIP funcione nele. Não encontrei documentação oficial que confirme esse fluxo. Confira no hPanel, ou com o suporte da Hostinger, como ligar o domínio a um site comum de arquivos (PHP/HTML) no plano Business, e o que acontece com o site do construtor. Decida isso antes de qualquer remoção.
3. **Se for um site comum de arquivos:** no Gerenciador de Arquivos, compacte o conteúdo de `public_html` e baixe o arquivo para fora do servidor. Não deixe a cópia dentro de `public_html`, pois tudo ali fica acessível pela internet.

### Publicar

1. Confira a soma do pacote: `cd artifacts/pacotes && sha256sum -c site-union-solutions-20261101-150354.zip.sha256`.
2. Em `public_html`, envie o ZIP e extraia com o conteúdo na raiz. `index.html` e `.htaccess` precisam ficar diretamente em `public_html`.
3. Apague o ZIP de `public_html` depois de extrair.
4. Ative o SSL do domínio no hPanel. Sem certificado, o redirecionamento para HTTPS falha.
5. Rode a conferência da seção "Conferência depois de publicar" do [`README.md`](../README.md).
6. Envie uma mensagem real pelo formulário e confira que ela chegou em `contato@unionsolutions.tech` (também na pasta de spam). `https://unionsolutions.tech/contato.php` aberto no navegador deve responder `405`. Se a mensagem não chegar, o `mail()` da hospedagem não está entregando: veja "Endpoint incluído" no README.

Referências da Hostinger: [Gerenciador de Arquivos](https://docs.hostinger.com/websites/file-manager) e [como enviar um site](https://www.hostinger.com/tutorials/how-to-upload-your-website/).

### Pendências do site

| Item | Efeito |
| --- | --- |
| Tipo de site no hPanel (AI Builder ou arquivos) | **Bloqueia só a etapa de envio**, até ser confirmado |
| Política de privacidade e identificação jurídica | Decisão da empresa. `check:publish` avisa, mas não bloqueia. O site não usa cookies nem rastreadores; o formulário de contato envia nome, e-mail, empresa, telefone e mensagem por e-mail à própria Union, com aviso no formulário. Veja "Privacidade" no README |
| Licenças comerciais e disponibilidade de demonstrações | Decisão da empresa, sobre textos do catálogo. Veja [`FECHAMENTO.md`](FECHAMENTO.md) |

Domínio e caixa postal **não são pendências**. A confirmação de que funcionam não prova que a versão atual esteja publicada.

## Portal do cliente

| Etapa | Documento |
| --- | --- |
| Topologia, custos e dependências | [`portal/docs/IMPLANTACAO.md`](../portal/docs/IMPLANTACAO.md) |
| Bootstrap da VPS, redes e portas | Implantação, seção "Procedimento" |
| DNS planejado | Registro `A` de `clientes.unionsolutions.tech`. Não altere MX, SPF, DKIM nem DMARC |
| TLS | Caddy, por ACME, na própria VPS |
| SMTP | Implantação, `PORTAL_SMTP_*` |
| Primeiro administrador e MFA | Implantação, etapa 4, e [`OPERACAO.md`](../portal/docs/OPERACAO.md) |
| Testes depois da implantação | Implantação, etapa 5 |
| Atualização | Implantação, seção "Atualização" |
| Backup e recuperação | [`OPERACAO.md`](../portal/docs/OPERACAO.md) |
| Segurança e limitações | [`SEGURANCA.md`](../portal/docs/SEGURANCA.md) |
| Vulnerabilidades e decisão residual (de Felipe) | [`VULNERABILIDADES.md`](../portal/docs/VULNERABILIDADES.md) |
| Privacidade | [`PRIVACIDADE.md`](../portal/docs/PRIVACIDADE.md) |
| Resultados | [`EVIDENCIAS.md`](../portal/docs/EVIDENCIAS.md) |
| Matriz de requisitos, implementação e testes | [`MATRIZ.md`](../portal/docs/MATRIZ.md) |
| Padrão visual compartilhado com o site | [`PADRAO-VISUAL.md`](PADRAO-VISUAL.md) |

### Dependem de autorização e de configuração real

Nada abaixo foi executado:

1. Contratar a VPS e dar acesso.
2. Criar o DNS do portal.
3. Preencher em `portal/deploy/production/.env`: `PORTAL_SMTP_HOST`, `PORTAL_SMTP_USER`, `PORTAL_SMTP_PASSWORD`, `PORTAL_BOOTSTRAP_ADMIN_EMAIL`, `PORTAL_PRODUCT_LINK_HOSTS`, `RESTIC_REPOSITORY`, `PORTAL_BACKUP_S3_ACCESS_KEY`, `PORTAL_BACKUP_S3_SECRET_KEY`, `PORTAL_BACKUP_KEEP_DAILY`, `PORTAL_BACKUP_KEEP_WEEKLY` e `PORTAL_BACKUP_KEEP_MONTHLY`.
4. Validar emissão do certificado, entrega de e-mail, backup externo e portas fechadas a partir de fora.
5. Preencher os campos de `PRIVACIDADE.md` antes de abrir o portal a clientes.
6. **Decidir sobre os seis achados altos de `VULNERABILIDADES.md`** (aceitar, mitigar antes ou bloquear): nenhum aceite foi registrado, e até a decisão o portal não deve ser aberto a clientes. Repetir a análise com a base do dia antes de implantar.
7. Na atualização para esta versão, avisar quem estiver logado: todas as sessões anteriores são encerradas (`IMPLANTACAO.md`, "Atualização").
8. **Aprovar a política de retenção** antes de ligar `PORTAL_RETENTION_ENABLED`: até lá o portal só simula e nada é removido (`portal/docs/OPERACAO.md`, "Retenção"). Nenhum prazo foi definido no código.

### Ativar o botão "Área do cliente"

Só depois de o portal estar operacional e validado:

```bash
# Em .env, acrescente:
PUBLIC_PORTAL_URL=https://clientes.unionsolutions.tech
npm run verify
npm run check:publish
sh scripts/empacotar-site.sh
```

Publique o novo pacote pelo mesmo procedimento. Sem essa variável, o botão não é gerado e o site continua válido.
