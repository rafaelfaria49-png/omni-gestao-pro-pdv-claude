# PDV Rápido / Clássico Omni — layout, scroll e busca

**Data:** 2026-05-09  
**Rota:** `/dashboard/vendas?modo=rapido`  
**Escopo:** `PdvClassic` + `PdvOmniClassicShell` com `isModoRapido === true` e `uiShell === "omni-smart"`. **Sem** alteração em `PdvAssistenciaEnterprise`, Prisma, financeiro ou migrations.

---

## 1. Componente identificado

| Peça | Arquivo |
|------|---------|
| Página | `app/dashboard/vendas/page.tsx` → `VendasPageClient` |
| Orquestração | `components/dashboard/vendas/vendas-pdv.tsx` → `PdvClassic` |
| Shell visual (BIPE, carrinho, F3) | `components/dashboard/vendas/pdv-omni-classic-shell.tsx` |
| Catálogo | `mergePdvCatalogWithInventory(PDV_PRODUCTS_BASE, inventory)` em `pdv-classic.tsx` |
| Filtro (antes) | Lógica inline em `filteredProducts` e `bipeSuggestions` (substring simples, EAN sem normalização, F3 listava **todos** os produtos) |

---

## 2. Causa raiz — busca

1. **Diálogo F3** renderizava `props.products.map` **sem filtro** → “grade” com catálogo inteiro independente do que o operador digitava.  
2. **Sugestões do BIPE** não normalizavam acentos; `barcode` era comparado sem `toLowerCase`; **categoria** não entrava na sugestão; matches muito amplos com `includes` em termos de 1 caractere.  
3. **Grid legado** (`filteredProducts` na UI “touch/default”) misturava regras de categoria oculta com `includes` bruto em nome/cat sem normalização consistente.

**Solução:** `lib/pdv-product-search.ts` com `normalizePdvSearchText` (trim, minúsculas, NFD + remoção de diacríticos), `productMatchesPdvSearch` (nome, categoria, SKU, `codigo`, `codigoBarras`, `barcode`, `id`) e regra para termo com **1 caractere**: apenas `startsWith` em nome/categoria (códigos continuam com `includes` normalizado).

---

## 3. Causa raiz — layout / scroll

1. **Modo rápido** empilhava tabela de itens + **barra inferior** de total/Finalizar, gerando sensação de “página” rolável e espaço vazio.  
2. **ItemsTable** no estado vazio usava `h-full min-h-[200px]`, forçando altura mínima grande dentro da área flex.  
3. Shell sem `h-full min-h-0` explícito no root dificultava o encaixe na cadeia flex do dashboard.

**Solução:** no modo rápido, **duas colunas**: esquerda = carrinho com scroll interno; direita = painel fixo (largura limitada) com total, contagem, venda anterior e **Finalizar** sempre visível na coluna. Empty state do carrinho sem `h-full`/min-height agressivo. Root do shell com `h-full min-h-0`.

---

## 4. Arquivos alterados

- `lib/pdv-product-search.ts` — **novo** (normalização + match + `filterPdvCatalogBySearch`).  
- `components/dashboard/vendas/pdv-classic.tsx` — `filteredProducts` e `bipeSuggestions` via `productMatchesPdvSearch` + `useMemo` para categorias ocultas.  
- `components/dashboard/vendas/pdv-omni-classic-shell.tsx` — layout modo rápido (row + aside); F3 com campo de filtro e lista filtrada; empty state “Nenhum produto encontrado”; ajustes ItemsTable vazio; root `h-full min-h-0`.

---

## 5. Comportamento da busca (após)

- Campo vazio no F3 → lista **completa** (grade padrão).  
- Com termo → apenas itens compatíveis (nome, categoria, SKU, código interno, EAN/barcode, id).  
- BIPE/autocomplete → mesma regra, até 8 sugestões.  
- Acentos ignorados na comparação (`Película` × `pelicula`).

---

## 6. Layout (após)

- Sem barra de total “solta” embaixo da mesa no modo rápido; total + ação principal na **coluna direita**.  
- Scroll principal da tabela de linhas no **viewport interno** da tabela.  
- Modo clássico completo (não rápido) mantém grid 9+3 e `ShortcutBar` como antes.

---

## 7. Validação

| Comando | Resultado |
|---------|-----------|
| `npx eslint` (arquivos tocados) | 0 erros; 2 *warnings* pré-existentes em `pdv-classic` (`addToCart` / `useCallback`). |
| `npx tsc --noEmit` | OK |
| `npx next build --webpack` | OK |

(`npm run lint` no repo completo tende a manter o mesmo perfil de warnings históricos.)

---

## 8. Riscos remanescentes

- **Pagamento pós-F1** continua em modal — “botões de pagamento” no sentido de formas de pagamento **não** foram duplicados na coluna direita (apenas Finalizar).  
- **Viewport muito estreito**: coluna direita tem `min-w-[232px]`; em telas muito baixas, validar manualmente.  
- **Termo de 1 letra** em nome/categoria só faz `startsWith` — pode excluir matches centrais; trade-off para reduzir ruído.
