# Union Solutions: site institucional

Site estático em português do Brasil, feito com [Astro](https://astro.build) e TypeScript. O build gera arquivos em `dist/` e não exige servidor Node em produção.

Para publicar, comece por [`docs/PUBLICACAO.md`](docs/PUBLICACAO.md). O estado desta entrega e as evidências estão em [`docs/FECHAMENTO.md`](docs/FECHAMENTO.md).

O portal do cliente é uma aplicação separada, com servidor e serviços próprios: não é publicado junto com este site. Veja [`portal/README.md`](portal/README.md).

## Instalação e execução

Requer Node.js 22.12 ou superior. O Astro está fixado na versão 7.3.8 porque a 7.4 exige Node 22.23.4 ou superior.

```bash
npm install
npm run dev       # desenvolvimento em http://localhost:4321
npm run build     # gera dist/
npm run preview   # serve dist/ em http://localhost:4321
```

Em um terminal comum, `npm run dev` e `npm run preview` ficam em primeiro plano: encerre com `Ctrl+C`.

Para deixar a prévia em segundo plano, use `npm run preview -- --background`. Para consultar ou encerrar um servidor em segundo plano:

```bash
node node_modules/astro/bin/astro.mjs preview status
node node_modules/astro/bin/astro.mjs preview stop
```

Para o servidor de desenvolvimento, troque `preview` por `dev`. O Astro também coloca o servidor em segundo plano por conta própria quando detecta execução automatizada; nesse caso, os mesmos comandos valem.

### Disco sem symlinks

O projeto funciona em discos vfat/exFAT, que não aceitam symlinks. Por isso, o `.npmrc` usa `bin-links=false` e os scripts chamam o Astro diretamente pelo Node. Use sempre os scripts do npm, pois `npx astro` não funciona nessa configuração.

## Verificações

| Comando | O que faz | Precisa de dados reais? |
| --- | --- | --- |
| `npm run verify` | Tipos, build e links internos, com um H1 por página | Não |
| `npm run check:contact` | Gera o site em cada modo de contato numa pasta isolada, confere o HTML e a resposta do `check:publish`. Não altera `dist/` | Não |
| `npm run check:publish` | Bloqueia a publicação enquanto faltarem dados reais, houver valores de exemplo ou `dist/` não corresponder à configuração | Sim |

`npm run check` e `npm run check:links` também podem ser executados isoladamente.

## Estrutura

```text
brand/originais/      Originais da marca. Não editar.
docs/FECHAMENTO.md    Relatório de fechamento e evidências dos produtos.
public/               Assets finais: logo, favicon, imagem social, .htaccess.
scripts/              Geração de assets e verificações.
src/config/site.ts    Dados institucionais, contatos, modo de contato e navegação.
src/data/products.ts  Catálogo de produtos.
src/data/services.ts  Serviços, modalidades e competências tecnológicas.
src/lib/              Envio do formulário, links de contato e opções.
src/components/       Componentes.
src/layouts/          Layout base, com SEO e metadados.
src/pages/            Rotas.
src/styles/           Variáveis de design (tokens.css) e estilos globais.
```

## Como editar

**Produtos.** Edite `src/data/products.ts`. Um novo item gera a página, a entrada no catálogo e a opção no formulário. Inclua também o slug no tipo `ProductSlug` e um esquema em `src/components/ProductGlyph.astro`; o `npm run check` aponta o que faltar. O campo `onHome` define a seleção editorial da home, com no máximo três produtos, e `capabilities` aceita até três itens no catálogo.

Cada afirmação precisa de evidência no repositório do produto. Limites e disponibilidade ficam nos campos `goodToKnow` e `availability`, exibidos uma vez na página do produto. Os esquemas gráficos são fluxos conceituais, não telas, e seus rótulos usam termos do texto da página.

**Serviços e tecnologias.** Edite `src/data/services.ts`.

**Home, Sobre e Contato.** Os textos estão em `src/pages/index.astro`, `src/pages/sobre.astro` e `src/pages/contato.astro`.

**Fundador e links.** Edite `src/config/site.ts`.

**Design.** Cores, tipografia, espaçamento, bordas, larguras e estados de interação estão em `src/styles/tokens.css`.

**Marca.** Os assets são derivados de `brand/originais/` com `npm run assets:brand` (requer Python com Pillow): `Logo-01.png` é a marca completa e `Logo-06.png`, o símbolo. O fundo dos arquivos é `#1A1360`, igual a `--brand`. Se essa variável mudar, a logo passará a mostrar um retângulo de outra cor.

A marca completa é apenas recortada e redimensionada. Os ícones de 16, 32 e 48 px (`favicon.ico` e `favicon-32.png`) têm o traço do símbolo engrossado, porque a linha dupla original ficaria com menos de 1 px nesses tamanhos. Essa é a única versão adaptada; os originais não são alterados.

## Configuração

Domínio e canais ficam em variáveis de ambiente, lidas por `src/config/site.ts`. Nenhum componente guarda esses valores.

```bash
cp .env.example .env
```

Preencha `.env` com dados reais e apague as linhas que não usar. **Os valores entram nos arquivos gerados: depois de qualquer alteração, gere o build e implante de novo.**

**Tudo o que tem prefixo `PUBLIC_` fica visível para qualquer visitante. Nunca coloque segredos, tokens ou chaves de API nessas variáveis.**

| Variável | Efeito |
| --- | --- |
| `PUBLIC_SITE_URL` | Domínio definitivo com HTTPS. Habilita canonical, sitemap, `og:url`, `og:image` e dados estruturados, além da linha `Sitemap` no `robots.txt`. |
| `PUBLIC_CONTACT_FORM_ENDPOINT` | Endpoint HTTPS que recebe o formulário. O site inclui um em `public/contato.php`, publicado junto com ele: `https://unionsolutions.tech/contato.php`. |
| `PUBLIC_CONTACT_EMAIL` | E-mail exibido no rodapé e na página de contato. |
| `PUBLIC_CONTACT_WHATSAPP` | WhatsApp, com DDI, DDD e número. |
| `PUBLIC_CONTACT_PHONE` | Telefone, opcional. Sozinho, não conta como canal de contato. |
| `PUBLIC_COMPANY_ADDRESS`, `PUBLIC_COMPANY_CNPJ` | Dados opcionais exibidos no rodapé. |
| `PUBLIC_PORTAL_URL` | URL HTTPS do portal do cliente. Com valor, mostra "Área do cliente" no cabeçalho e no menu móvel. Sem valor, o botão não é gerado. |

Sem domínio, os metadados que dependem dele são omitidos; título, descrição e os demais continuam publicados. E-mail, WhatsApp ou URL malformados interrompem o build.

### Modos de contato

A página `/contato/` se apresenta conforme a configuração:

| Modo | Quando | O que aparece | Publicação |
| --- | --- | --- | --- |
| **A. Formulário** | Há endpoint | Formulário operacional. E-mail, telefone e WhatsApp configurados aparecem como alternativa. | Permitida |
| **B. Contato direto** | Sem endpoint, com e-mail ou WhatsApp | Links para os canais configurados, com mensagem inicial preenchida conforme o produto ou serviço. Nenhum campo é exibido. | Permitida |
| **C. Sem canal** | Sem endpoint, e-mail nem WhatsApp | Aviso curto de indisponibilidade, com o assunto preservado. Nenhum campo é exibido. | Bloqueada |

Links podem indicar o assunto: `/contato/?interesse=consultoria` ou `/contato/?interesse=produto&produto=hookguard`. Valores desconhecidos são ignorados. Esses parâmetros nunca carregam dados pessoais.

### Endpoint incluído: `contato.php`

`public/contato.php` vai para `public_html` junto com o site e cumpre o contrato abaixo usando o `mail()` do PHP da hospedagem, com remetente `contato@unionsolutions.tech` e `Reply-To` de quem escreveu. Ele aceita só `POST` JSON da própria origem (ou de `https://unionsolutions.tech` e `www`), valida os campos como a página, ignora envios com o campo-armadilha preenchido respondendo sucesso, limita a 5 envios por hora por endereço (registro em `contato-limite/`, fora de `public_html`) e não grava o conteúdo das mensagens em lugar nenhum. Erro do servidor de e-mail responde `502`, e a página mantém os dados para nova tentativa.

Teste local com Apache e PHP reais, e-mail capturado em arquivo: `sh scripts/testa-contato.sh` (exige Docker e o build gerado). Depois de publicar, envie uma mensagem de verdade e confira a chegada na caixa `contato@`, inclusive na pasta de spam; se não chegar, o PHP `mail()` da hospedagem está bloqueado ou mal avaliado por SPF, e o caminho é trocar o envio por SMTP autenticado.

### Contrato do endpoint

O formulário envia um `POST` com `Content-Type: application/json`:

```json
{
  "nome": "",
  "empresa": "",
  "email": "",
  "telefone": "",
  "interesse": "produto | consultoria | arquitetura | desenvolvimento | parceria",
  "produto": "slug do produto, ainda-nao-sei ou vazio",
  "mensagem": ""
}
```

- **Sucesso:** resposta 2xx, sem redirecionamento. O corpo é opcional. Um JSON com `"ok": false` conta como recusa.
- **Erro:** qualquer outra resposta, falha de rede ou demora acima de 15 segundos. Os dados permanecem no formulário.
- **Sem repetição automática:** após um timeout, o processamento anterior pode ter ocorrido; a pessoa decide se envia de novo.
- **O que o sucesso significa:** o endpoint aceitou a solicitação. A página não afirma que um e-mail chegou à caixa de entrada.

O serviço escolhido precisa:

- aceitar JSON e permitir CORS a partir do domínio do site;
- entregar as mensagens a quem vai respondê-las;
- ter proteção própria contra spam, pois o site traz apenas um campo-armadilha simples.

Para um serviço com outro formato, ajuste `createContactAdapter` em `src/lib/contact-adapter.ts`.

### Privacidade

O site não usa cookies, analytics, pixels nem publicidade, e não faz requisições a terceiros: fontes e imagens são servidas pelo próprio domínio. O conteúdo do formulário não vai para `localStorage`, logs ou URLs.

Dados só saem do navegador por ação do visitante:

- **Formulário:** enviados ao endpoint configurado.
- **WhatsApp:** o link abre o WhatsApp, com o assunto no texto da mensagem. O envio e a conversa ficam com o aplicativo.
- **E-mail:** o link abre o aplicativo de e-mail do visitante, com o assunto preenchido.

A hospedagem pode registrar acessos em logs próprios.

**Não há política de privacidade publicada**, porque ela depende de dados que ainda não existem: identificação do controlador, canal para o titular e serviço de recebimento. Avalie isso com quem cuida da conformidade jurídica da empresa antes de abrir o site ao público. Ao escolher o serviço, ajuste os avisos em `src/components/ContactForm.astro` e `src/components/DirectContact.astro`.

## Publicação

### Sequência

Depois de preencher `.env`:

```bash
npm run verify
npm run check:publish
```

`check:publish` exige:

- `PUBLIC_SITE_URL` com HTTPS, sem localhost, IP, domínio de exemplo ou endereço temporário de teste;
- pelo menos um canal real: endpoint, e-mail ou WhatsApp;
- nenhum valor de exemplo de `.env.example` (`SUBSTITUIR`);
- `dist/` gerado com a mesma configuração: canonical e `og:image` em cada página, sitemap e `robots.txt` no domínio, contato correspondente, nenhum resto de teste e nenhum arquivo interno.

A validação é de formato: um valor fictício bem formado passaria. Confirmar que domínio e canais são reais é responsabilidade de quem publica.

### Hostinger (hospedagem estática)

Não há servidor Node em produção: a Hostinger só serve os arquivos de `dist/`. O site espera estar na raiz do domínio.

1. No hPanel, abra o gerenciador de arquivos do site e entre em `public_html`.
2. Envie o **conteúdo** de `dist/`, não a pasta `dist` em si. Em `public_html` devem ficar `index.html`, `404.html`, `_astro/`, `brand/`, `og/`, `produtos/`, `servicos/`, `contato/`, `sobre/` e os demais arquivos.

   Para enviar um único arquivo e extrair no servidor, gere o pacote validado com `sh scripts/empacotar-site.sh`, descrito em [`docs/PUBLICACAO.md`](docs/PUBLICACAO.md).

3. Confirme que `.htaccess` chegou, pois arquivos com ponto podem ficar ocultos no gerenciador. Ele define a página 404 e o redirecionamento para HTTPS.
4. Se houver uma página padrão da hospedagem em `public_html`, confira o que é e remova apenas o que não for do site.
5. Ative o SSL do domínio no hPanel. Sem certificado, o redirecionamento para HTTPS falha.

Para atualizar o site, gere o build de novo e substitua os arquivos. Apague os antigos de `_astro/`, cujos nomes mudam a cada build.

### Conferência depois de publicar

```bash
DOMINIO=https://unionsolutions.tech
for rota in / /produtos/ /produtos/hookguard/ /produtos/filenorm/ /produtos/assinaflow/ /produtos/archlens/ /produtos/fluxe-b2b-suite/ /produtos/comercialcloud/ /servicos/ /servicos/consultoria/ /servicos/arquitetura/ /servicos/desenvolvimento/ /sobre/ /contato/ /robots.txt /sitemap-index.xml /og/union-solutions.png /nao-existe/; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$DOMINIO$rota")" "$rota"
done
```

Espera-se `200` em todas, exceto `/nao-existe/`, que deve responder `404` com a página do site. Confira também:

- `curl -sI http://unionsolutions.tech/` redireciona para `https://`;
- `curl -sI https://unionsolutions.tech/produtos` redireciona para `/produtos/`. O `astro preview` local responde 404 nesse caso; a conferência vale para a hospedagem;
- a página `/contato/` mostra o modo esperado, e um link de produto chega com o assunto correto;
- no modo formulário, faça um envio real para um destino autorizado e confirme que a mensagem chegou;
- se a página 404 do site não aparecer, a hospedagem não aplicou o `.htaccess`: confira se ele está em `public_html`.

## Dúvidas de conteúdo

As dúvidas materiais que restam estão em [`docs/FECHAMENTO.md`](docs/FECHAMENTO.md).
