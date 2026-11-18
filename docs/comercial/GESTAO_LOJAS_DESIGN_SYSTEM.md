# Vendas e Estoque — design system da página comercial

Página: `app/gestao-lojas/page.tsx` · estilos: `components/gestao-lojas/gestao-lojas.css` (todos os
tokens sob `.gl`, sem vazar para o ERP) · feito com a skill oficial `frontend-design` (Anthropic).

## Direção

**Assunto:** o balcão de uma loja pequena — caixa, produto na prateleira, comprovante na mão do cliente.
**Público:** dono ou dona de loja de variedades, acessórios ou pequeno comércio, lendo no celular ou no
computador do caixa. **Trabalho da página:** fazer a pessoa pedir um teste, sem prometer o que não existe.

**Elemento-assinatura (o único "ousado"):** o comprovante térmico, com picote serrilhado e tipografia
monoespaçada de impressora. Aparece no hero (sobre a tela real do PDV), na seção de impressão e na
confirmação do pedido — onde vira o "recibo" do protocolo. É o único movimento automático da página
(uma "impressão" de 0,9 s), desligado com `prefers-reduced-motion`.

O resto é quieto: fundo papel-frio, texto em tinta oceano, uma única cor de ação, sem gradiente, sem
neon, sem cartões idênticos com sombra.

## Tokens

| Token | Valor | Uso |
|---|---|---|
| `--gl-ink` | `#0b2a3f` | texto principal, faixa do pedido de teste |
| `--gl-ink-soft` | `#33566d` | texto secundário (7:1 sobre o papel) |
| `--gl-brand` | `#0369a1` | ação primária, links, foco — mesma cor do ícone oficial |
| `--gl-brand-strong` | `#075985` | hover/pressionado |
| `--gl-paper` | `#f6f9fb` | fundo da página (frio, não creme) |
| `--gl-surface` | `#ffffff` | formulário, telas, comprovante |
| `--gl-line` | `#d3dfe7` | réguas e bordas |
| `--gl-sky` | `#e0f2fe` | realce informativo (nota da impressora) |
| `--gl-ok` / `--gl-ok-bg` | `#166534` / `#dcfce7` | selo "Disponível" |
| `--gl-wait` / `--gl-wait-bg` | `#854d0e` / `#fef3c7` | selo "Em liberação", aviso de proposta de preço |
| `--gl-error` | `#b91c1c` | erro de campo |

Cores derivadas do ícone `public/omni-gestao-pro-icon.svg` (`#0c4a6e → #0369a1`, realce `#7dd3fc`).
Nenhuma cor fica fora dos tokens (os `#000` restantes são canais de máscara do picote).

## Tipografia

- **Bricolage Grotesque** 600/700 — títulos. Grotesca com personalidade, compressão ótica nos tamanhos grandes.
- **Inter** (`--font-sans` do app) — texto. Mantém continuidade com o sistema que o cliente vai usar.
- **IBM Plex Mono** 500/700 — **somente** no comprovante e no protocolo (é o que uma térmica imprime).

Escala: 14 · 16 · 18 · 22 · 26–36 (fluida) · 36–60 (fluida). Títulos com `-0.02em`, `text-wrap: balance`.
Linhas de texto ≤ ~36rem. Sem caixa-alta em rótulos, sem sobretítulos, sem palavra destacada no título.

## Layout

- Grade de 12 colunas efetiva, `max-width: 74rem`, margem lateral fluida (16px no celular).
- Texto sempre alinhado à esquerda. Seções separadas por régua de 1px; benefícios com régua de 2px em tinta.
- Recursos alternam texto (5/12) e tela real (7/12) a partir de 1024px; empilham abaixo disso.
- Um único bloco escuro: o pedido de teste (`#solicitar`), para a ação principal não se perder.
- Numeração só onde há sequência real (os 3 passos do pedido).

```
[marca]                       Recursos  Navegador e Windows  Planos  Dúvidas   Entrar [Pedir teste]
O balcão da sua loja,         ┌──────── tela real do PDV ─────────┐
organizado.                   │                                    │
texto de apoio                │                                    │  ┌─comprovante─┐
[Pedir um teste] [Ver o sistema] └──────────────────────────────────┘  └─/\/\/\/\/\──┘
```

## Componentes

| Componente | Onde | Regra |
|---|---|---|
| `.gl-btn--primary` / `--ghost` | CTAs | altura mínima 48px (40px no `--sm`); verbo que diz o que acontece |
| `.gl-btn[aria-disabled]` | download não liberado | tracejado, sem link, explica o motivo ao lado |
| `.gl-shot` | telas do sistema | sempre captura real com dados fictícios + legenda dizendo isso |
| `.gl-receipt` | comprovante | exemplo marcado como fictício; `role="img"` com descrição |
| `.gl-status--ok/--wait` | segmentos | "Disponível" só para o que está em produção |
| `.gl-form` | pedido de teste | campos nativos (fora do `data-slot` da densidade operacional), erro por campo com `aria-describedby`, foco no 1º erro |
| `.gl-confirm` | confirmação | só com protocolo vindo do servidor; diz "acesso ainda não criado" |
| `.gl-faq` | dúvidas | `<details>` nativo (teclado e leitor de tela sem JS) |

## Acessibilidade

Link "Pular para o conteúdo", foco visível de 3px em tudo, `aria-invalid` + mensagem por campo,
confirmação recebe foco, contraste AA em todos os pares de token, `prefers-reduced-motion` respeitado,
alvos de toque ≥ 40px, sem rolagem horizontal em 375px.

## Chaves de ambiente da página (todas falham fechado)

| Variável | Efeito |
|---|---|
| `GESTAO_LOJAS_EXIBIR_PRECOS_PROPOSTOS=1` | mostra os 3 planos propostos com aviso de "em avaliação" (só QA) |
| `GESTAO_LOJAS_WINDOWS_DOWNLOAD_URL` | URL `https` do instalador homologado; sem ela, botão desligado |
| `GESTAO_LOJAS_CONTATO_WHATSAPP` / `_EMAIL` | canais diretos; sem eles, a página não mostra número/email |
