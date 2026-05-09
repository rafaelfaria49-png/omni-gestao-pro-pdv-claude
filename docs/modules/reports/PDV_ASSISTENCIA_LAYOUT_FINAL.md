# PDV Assistência — layout final no AppShell

**Escopo:** somente o PDV **Assistência** (`PdvAssistenciaEnterprise`, layout `services` em `pdv-classic`). Sem alteração de lógica de venda, busca, Prisma ou `pdv-omni-classic-shell` (PDV Omni rápido/clássico).

**Rota:** `/dashboard/vendas` quando `pdvClassicLayout === "services"` (não existe query `?modo=assistencia` no código; o modo Assistência é esse layout interno).

---

## 1. Causa raiz (histórico)

1. **`100vh` / `calc(100vh - …)`** dentro do dashboard gerava bloco maior que o slot útil sob a Topbar → scroll duplo.  
2. **Header `absolute` + `padding-top` no corpo** cortava topo quando combinado com `overflow-hidden`.  
3. **Cadeia flex** sem `min-h-0` / `basis-0` impedia encolher filhos → áreas internas não recebiam altura definida para `ScrollArea`.

---

## 2. Correções estruturais (iteração 1)

- Root do assistência sem `100vh`; header em fluxo normal; `ScrollArea` da grade sem `calc(100vh)`.  
- `AppShell` / `main` com `min-h-0 min-w-0`.  
- Wrapper **`services`** com margens negativas `-mx`/`-my` para “full-bleed” no `main`.

---

## 3. Correção definitiva pós-validação visual (2026-05-09)

### 3.1 Causa raiz REAL (overflow global + topo cortado)

1. **`<main>` do `AppShell` usa `overflow-hidden`.** O wrapper do Assistência aplicava **`-my-6` (e `-mx-*`)**. Margem negativa desloca o bloco **para fora** da caixa de conteúdo do `main`; o que sobe fica **clippado** pelo `overflow-hidden` → **faixa “Caixa Fechado”, header e input parecem “cortados”** e o operador percebe conteúdo “embaixo” da topbar.  
2. **`h-full` em vários níveis** com pai flex sem `flex-basis: 0` (`basis-0`) → porcentagem / altura “100%” **não fecha** o layout; o filho pode **crescer além** do viewport e empurrar **scroll no `document`/body** ou área branca ao rolar.  
3. **Carrinho (`ScrollArea` com `h-full`)** sem um invólucro `min-h-0 flex-1 overflow-hidden` → viewport do scroll não limitada → painel lateral **estourava** visualmente.

### 3.2 O que foi feito

| Arquivo | Mudança |
|---------|---------|
| `pdv-classic.tsx` (ramo **`services`**) | **Removidas** margens negativas `-mx`/`-my`. Wrapper: `flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden` apenas. |
| `vendas-page-client.tsx` | `h-full` trocado por **`flex-1 … basis-0`** (padrão flex para ocupar o slot sem estourar). |
| `app/dashboard/layout.tsx` | No wrapper de **`/dashboard/vendas`**: `min-w-0` + **`basis-0`** junto de `flex-1 min-h-0 overflow-hidden`. |
| `pdv-assistencia-enterprise.tsx` | Root: **`flex-1 min-h-0`** (sem `h-full`). Linha main \| aside: **`items-stretch`**, **`max-h-full`** em main e aside; aside com **`self-stretch`**. Carrinho: coluna **`flex min-h-0 flex-1 flex-col`**; lista com invólucro **`min-h-0 flex-1 overflow-hidden`** + `ScrollArea` **`h-full max-h-full`**. Rodapé total/pagamento permanece **`shrink-0`**. |

### 3.3 Hacks removidos (quando eram a causa)

- **`-mx-4 -my-6 sm:-mx-6 lg:-mx-8`** no wrapper `services` — removidos (eram a principal causa de **recorte** com `main { overflow-hidden }`).  
- Dependência de **`h-full`** no root do assistência — substituída por **`flex-1 min-h-0`**.  
- Não há **`100vh` / `calc(100vh - …)`** no arquivo do Assistência nesta versão.

**Mantido de propósito:** header interno e faixa do caixa em **fluxo normal** + **`shrink-0`**; grade com **`ScrollArea`** apenas na área central.

---

## 4. Resultado esperado (UX)

- Sem scroll “estranho” no **documento** ao usar só o PDV Assistência.  
- **“Caixa Fechado”** e campo de busca **totalmente visíveis**.  
- **Scroll** apenas na grade (tabs / busca) e na **lista do carrinho**.  
- **Total e botões de pagamento** fixos no **rodapé** do painel direito (`shrink-0`).

---

## 5. Validação (2026-05-09, local)

| Comando | Resultado |
|---------|-----------|
| `npm run lint` | **OK** (exit 0); 43 *warnings* históricos no repo, **0 erros**. |
| `npx tsc --noEmit` | **OK** (exit 0). |
| `npx next build --webpack` | **OK** (exit 0), Next.js 16.2.0 (webpack). |

---

## 6. Riscos remanescentes

- **`AppShell`** ainda usa **`min-h-screen`** na raiz; em cenários raros de conteúdo muito alto **fora** do PDV Assistência, o scroll global pode voltar — mitigação futura seria `h-svh`/`overflow-hidden` só se aceitável para todo o dashboard.  
- **`py-6` no `main`** deixa padding visível ao redor do PDV Assistência (troca intencional: **sem recorte** em troca de não ser edge-to-edge).  
- Largura fixa do aside em telas estreitas: smoke manual recomendado.
