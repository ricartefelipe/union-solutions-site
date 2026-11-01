# Padrão visual compartilhado

O site institucional e o portal do cliente são aplicações separadas, mas usam a mesma identidade. A fonte da verdade é `src/styles/tokens.css`; o portal mantém uma cópia idêntica em `portal/frontend/src/styles/tokens.css`, e `npm run check:brand` (portal) falha se as cópias divergirem, assim como as logos em `public/brand/` e o `favicon.ico`.

## Tokens

| Grupo | Tokens | Regra |
| --- | --- | --- |
| Cor | `--brand`, `--brand-deep`, `--brand-lift`, `--accent`, `--paper`, `--mist`, `--ink`, `--ink-soft`, `--on-dark`, `--on-dark-soft` | `--brand` é o fundo medido na logo original e não muda. Texto sobre fundo escuro usa `--on-dark`/`--on-dark-soft`; sobre claro, `--ink`/`--ink-soft`. Contraste conferido por axe (WCAG 2.1 AA) nas duas aplicações |
| Estados | `--danger`, `--danger-bg`, `--danger-deep`, `--notice-*`, `--success`, `--success-bg`, `--neutral-bg`, `--neutral-ink`, `--info-bg` | Erro, atenção, sucesso, neutro e informação. Selos e alertas só usam estes pares |
| Bordas | `--line`, `--line-on-dark`, `--line-strong`, `--radius` (0,25 rem) | Cantos discretos; campos usam `--line-strong` |
| Tipografia | `--font-display` (Outfit) para títulos, `--font-body` (Hanken Grotesk) para texto; `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl`; `--text-h2`, `--text-h1-page`, `--text-h1-home` (site); `--text-h1-app`, `--text-h2-app` (portal) | O site usa a escala editorial; o portal, a escala de aplicação, menor, por ser denso. Nenhum tamanho fixo fora dos tokens |
| Espaço | `--space-1` a `--space-7`, `--gutter`, `--section`, `--page-hero` | Margens laterais por `--gutter` (16 px a 32 px), container `--page` (80 rem), medida de leitura `--measure` (65 ch) |
| Interação | `--control-height` (3 rem), `--focus-width`, `--focus-offset`, `--transition` | Todo controle tem ao menos 2,75 rem de altura; foco visível com anel de 3 px (`:focus-visible`), em `--accent` sobre fundo escuro |

## Componentes e estados

| Elemento | Site | Portal |
| --- | --- | --- |
| Cabeçalho e página atual | `aria-current="page"` nos itens do menu e no botão de contato; menu móvel com `aria-expanded`, fecha com Esc e devolve o foco | Barra com nome, organização, notificações com contador e "Sair"; navegação com `aria-current="page"` sublinhado em `--accent` |
| Botões e links | `.btn`, `.btn--ghost`; links de texto sublinhados | Os mesmos, mais `.btn--danger` para revogar e arquivar; toda ação sensível pede confirmação em `<dialog>` acessível |
| Formulários | Campos com rótulo visível, "(opcional)" quando não obrigatório, erro por campo com `aria-describedby`, resumo de erro com foco | O mesmo padrão em `ApiForm`: erro da API com detalhes por campo, código de correlação e foco no alerta; sucesso em `role="status"` |
| Tabelas e listas | Listas editoriais (`.rows`, `.node-list`) | `.table-wrap` com rolagem horizontal, cabeçalhos `scope="col"`; listas `.list` com título, metadados e ações alinhadas; paginação `Anterior`/`Próxima` e aviso "Mostrando N de M" quando uma lista é carregada de uma vez |
| Filtros | Não há | Formulário `GET` com `role="search"`, campos em linha a partir de 48 rem (`.form--filters`), estado preservado na URL e na paginação |
| Situações | Não há | `Badge` com tom por valor (`ok`, `warn`, `bad`, `info`, neutro) e rótulos em português de `lib/labels.ts` |
| Vazio, carregando, erro, sem acesso | 404 própria com navegação | `Empty` por lista com texto específico; `loading.tsx`; `error.tsx` com código de correlação; `/sem-acesso`, `/sessao-encerrada`, convite inválido; registro inexistente responde "Registro não encontrado" sem revelar se existe para outro cliente |
| Largura | 320 a 1440 px sem rolagem horizontal; verificado em 320, 390, 768, 1024 e 1440 | Idem; tabelas rolam dentro do próprio bloco |

## Como manter

1. Novo token: adicione em `src/styles/tokens.css`, copie para o portal e rode `npm run check:brand` em `portal/frontend`.
2. Nova cor, tamanho ou espaçamento fixo em CSS é defeito: use um token.
3. Antes de entregar, repita as capturas em `portal/e2e` (`02-seguranca` cobre axe e rolagem) e a inspeção visual nas cinco larguras.
