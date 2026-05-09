# PDV — Correção: Busca de Produtos no Campo BIPE

> Commit: `78030e2` — `fix(pdv): autocomplete de produto no campo BIPE com busca por SKU`  
> Data: 2026-05-09  
> Branch: `terminal-1`

---

## Causa Raiz

Dois problemas independentes travavam a localização de produtos no PDV Clássico (shell `omni-smart`):

### 1. Grid de produtos ignorava SKU e código interno na busca

`filteredProducts` em `pdv-classic.tsx` avaliava apenas `name`, `category` e `barcode`. Produtos cujo código mais natural para o operador era o **SKU** (campo `p.sku`) ou um **código interno** (`p.codigo`) simplesmente não apareciam no painel de busca `F3`.

```ts
// antes — ignorava SKU e código
if (!matchName && !matchCat && !matchBarcode) return false
```

### 2. Campo BIPE sem autocomplete enquanto o operador digitava

O campo "Código / Bipe" do shell só reagia ao `Enter` (via `findPdvProductByScan`). Não havia feedback visual durante a digitação — o operador não sabia se existia um produto com aquele fragmento de texto/SKU até pressionar Enter e receber a mensagem de erro.

---

## Como foi corrigido

### `components/dashboard/vendas/pdv-classic.tsx`

**1. `filteredProducts` — critérios de filtro expandidos**

```ts
const matchSku = p.sku ? p.sku.toLowerCase().includes(term) : false
const matchCodigo = (p as { codigo?: string }).codigo
  ? (p as { codigo?: string }).codigo!.toLowerCase().includes(term)
  : false
if (!matchName && !matchCat && !matchBarcode && !matchSku && !matchCodigo) return false
```

**2. `bipeSuggestions` — autocomplete em tempo real (useMemo)**

Computa até 8 sugestões à medida que `bipeCode` muda, buscando por:
- `p.name` (nome)
- `p.sku` (SKU)
- `p.codigo` (código interno)
- `p.barcode` (EAN/código de barras)
- `p.id` (igualdade exata)

```ts
const bipeSuggestions = useMemo(() => {
  const t = bipeCode.trim().toLowerCase()
  if (!t) return []
  return products
    .filter((p) => matchName || matchSku || matchCodigo || matchBarcode || matchId)
    .slice(0, 8)
}, [bipeCode, products])
```

**3. `handleBipeSuggestionSelect` — handler de clique na sugestão (useCallback)**

Ao clicar em uma sugestão:
1. Chama `addToCart(product, qty)` com a quantidade atual do campo Qtd.
2. Limpa `bipeCode` e reseta `shellNextQty` para `"1"`.
3. Atualiza `shellInfo` com confirmação do item adicionado.
4. Retorna o foco para o campo BIPE via `queueMicrotask`.

---

### `components/dashboard/vendas/pdv-omni-classic-shell.tsx`

**1. Props adicionadas a `PdvOmniClassicShellProps`**

```ts
bipeSuggestions?: PdvCatalogProduct[]
onBipeSuggestionSelect?: (product: PdvCatalogProduct) => void
```

**2. Campo BIPE envolvido em `<div relative>` com dropdown absoluto**

- O `PosField` foi movido para dentro de um `<div className="relative ...">`.
- Dropdown aparece quando `bipeCode.trim().length >= 1`.
- Lista de sugestões: `<ul>` com scroll, max-height 240px.
- Cada item exibe: nome (truncado), linha secundária com `SKU · EAN · Estoque: N`, preço à direita.
- Mensagem de fallback quando `bipeSuggestions` está vazio: `"Nenhum produto encontrado para '…'"`.
- `onMouseDown` com `e.preventDefault()` evita que o campo BIPE perca o foco antes do clique ser processado.
- Tokens visuais: `inkUi` (Black/Midnight) vs Classic — `border-white/10 bg-[#111111]` vs `border-border bg-card`.

---

## Arquivos Alterados

| Arquivo | Linhas alteradas | Natureza |
|---------|-----------------|----------|
| `components/dashboard/vendas/pdv-classic.tsx` | +37 / -0 | Lógica: filtro, useMemo, useCallback, props passadas ao shell |
| `components/dashboard/vendas/pdv-omni-classic-shell.tsx` | +89 / -14 | UI: props, wrapper div relativo, dropdown de sugestões |

---

## Fluxo Validado

```
Operador digita "ip" no campo BIPE
  → bipeSuggestions filtra produtos com "ip" no nome/SKU/código/EAN
  → Dropdown aparece com até 8 resultados (ex.: "iPhone 14 Case", "iPod Touch")
  → Operador clica → produto adicionado ao carrinho → foco retorna ao BIPE

Operador digita "SKU-123" e pressiona Enter
  → handleShellBipeKeyDown chama findPdvProductByScan (inalterado)
  → Produto localizado e adicionado normalmente

Operador abre busca F3 e digita "sku" no campo de filtro
  → filteredProducts agora inclui p.sku na comparação → produto encontrado
```

O comportamento `Enter` via `findPdvProductByScan` foi **mantido intacto** — a correção é aditiva.

---

## Riscos Remanescentes

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| `p.codigo` usa cast `(p as { codigo?: string })` pois não está no tipo `PdvCatalogProduct` | Baixo | O campo existe no inventário Prisma e é mapeado em `mergePdvCatalogWithInventory`; o cast é seguro enquanto o tipo não for atualizado |
| Dropdown não fecha ao pressionar Escape | Baixo | Limpar `bipeCode` via `setBipeCode("")` ou `Escape` nativo já fecha (sem `bipeCode` o dropdown não renderiza) |
| Sugestões baseadas apenas em `products` (mock + inventário local) | Médio | Quando Prisma for integrado ao PDV, `products` virá de dados reais e o autocomplete funcionará sobre o catálogo real automaticamente |
| Sem debounce no `bipeSuggestions` | Muito baixo | `useMemo` é síncrono mas barato para arrays pequenos (tipicamente < 500 produtos no PDV); debounce desnecessário agora |
