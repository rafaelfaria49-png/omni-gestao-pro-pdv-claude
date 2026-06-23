# PDV — Arquitetura (layout, busca, componentes)

Este arquivo consolida o relatório técnico copiado de `docs/modules/reports/PDV_RAPIDO_LAYOUT_E_BUSCA.md`. Visão macro adicional: `docs/ai/MASTER_CONTEXT.md` §7 (Arquitetura do PDV).

---

# PDV RÃ¡pido / ClÃ¡ssico Omni â€” layout, scroll e busca

**Data:** 2026-05-09  
**Rota:** `/dashboard/vendas?modo=rapido`  
**Escopo:** `PdvClassic` + `PdvOmniClassicShell` com `isModoRapido === true` e `uiShell === "omni-smart"`. **Sem** alteraÃ§Ã£o em `PdvAssistenciaEnterprise`, Prisma, financeiro ou migrations.

---

## 1. Componente identificado

| PeÃ§a | Arquivo |
|------|---------|
| PÃ¡gina | `app/dashboard/vendas/page.tsx` â†’ `VendasPageClient` |
| OrquestraÃ§Ã£o | `components/dashboard/vendas/vendas-pdv.tsx` â†’ `PdvClassic` |
| Shell visual (BIPE, carrinho, F3) | `components/dashboard/vendas/pdv-omni-classic-shell.tsx` |
| CatÃ¡logo | `mergePdvCatalogWithInventory(PDV_PRODUCTS_BASE, inventory)` em `pdv-classic.tsx` |
| Filtro (antes) | LÃ³gica inline em `filteredProducts` e `bipeSuggestions` (substring simples, EAN sem normalizaÃ§Ã£o, F3 listava **todos** os produtos) |

---

## 2. Causa raiz â€” busca

1. **DiÃ¡logo F3** renderizava `props.products.map` **sem filtro** â†’ â€œgradeâ€ com catÃ¡logo inteiro independente do que o operador digitava.  
2. **SugestÃµes do BIPE** nÃ£o normalizavam acentos; `barcode` era comparado sem `toLowerCase`; **categoria** nÃ£o entrava na sugestÃ£o; matches muito amplos com `includes` em termos de 1 caractere.  
3. **Grid legado** (`filteredProducts` na UI â€œtouch/defaultâ€) misturava regras de categoria oculta com `includes` bruto em nome/cat sem normalizaÃ§Ã£o consistente.

**SoluÃ§Ã£o:** `lib/pdv-product-search.ts` com `normalizePdvSearchText` (trim, minÃºsculas, NFD + remoÃ§Ã£o de diacrÃ­ticos), `productMatchesPdvSearch` (nome, categoria, SKU, `codigo`, `codigoBarras`, `barcode`, `id`) e regra para termo com **1 caractere**: apenas `startsWith` em nome/categoria (cÃ³digos continuam com `includes` normalizado).

---

## 3. Causa raiz â€” layout / scroll

1. **Modo rÃ¡pido** empilhava tabela de itens + **barra inferior** de total/Finalizar, gerando sensaÃ§Ã£o de â€œpÃ¡ginaâ€ rolÃ¡vel e espaÃ§o vazio.  
2. **ItemsTable** no estado vazio usava `h-full min-h-[200px]`, forÃ§ando altura mÃ­nima grande dentro da Ã¡rea flex.  
3. Shell sem `h-full min-h-0` explÃ­cito no root dificultava o encaixe na cadeia flex do dashboard.

**SoluÃ§Ã£o:** no modo rÃ¡pido, **duas colunas**: esquerda = carrinho com scroll interno; direita = painel fixo (largura limitada) com total, contagem, venda anterior e **Finalizar** sempre visÃ­vel na coluna. Empty state do carrinho sem `h-full`/min-height agressivo. Root do shell com `h-full min-h-0`.

---

## 4. Arquivos alterados

- `lib/pdv-product-search.ts` â€” **novo** (normalizaÃ§Ã£o + match + `filterPdvCatalogBySearch`).  
- `components/dashboard/vendas/pdv-classic.tsx` â€” `filteredProducts` e `bipeSuggestions` via `productMatchesPdvSearch` + `useMemo` para categorias ocultas.  
- `components/dashboard/vendas/pdv-omni-classic-shell.tsx` â€” layout modo rÃ¡pido (row + aside); F3 com campo de filtro e lista filtrada; empty state â€œNenhum produto encontradoâ€; ajustes ItemsTable vazio; root `h-full min-h-0`.

---

## 5. Comportamento da busca (apÃ³s)

- Campo vazio no F3 â†’ lista **completa** (grade padrÃ£o).  
- Com termo â†’ apenas itens compatÃ­veis (nome, categoria, SKU, cÃ³digo interno, EAN/barcode, id).  
- BIPE/autocomplete â†’ mesma regra, atÃ© 8 sugestÃµes.  
- Acentos ignorados na comparaÃ§Ã£o (`PelÃ­cula` Ã— `pelicula`).

---

## 6. Layout (apÃ³s)

- Sem barra de total â€œsoltaâ€ embaixo da mesa no modo rÃ¡pido; total + aÃ§Ã£o principal na **coluna direita**.  
- Scroll principal da tabela de linhas no **viewport interno** da tabela.  
- Modo clÃ¡ssico completo (nÃ£o rÃ¡pido) mantÃ©m grid 9+3 e `ShortcutBar` como antes.

---

## 7. ValidaÃ§Ã£o

| Comando | Resultado |
|---------|-----------|
| `npx eslint` (arquivos tocados) | 0 erros; 2 *warnings* prÃ©-existentes em `pdv-classic` (`addToCart` / `useCallback`). |
| `npx tsc --noEmit` | OK |
| `npx next build --webpack` | OK |

(`npm run lint` no repo completo tende a manter o mesmo perfil de warnings histÃ³ricos.)

---

## 8. Riscos remanescentes

- **Pagamento pÃ³s-F1** continua em modal â€” â€œbotÃµes de pagamentoâ€ no sentido de formas de pagamento **nÃ£o** foram duplicados na coluna direita (apenas Finalizar).  
- **Viewport muito estreito**: coluna direita tem `min-w-[232px]`; em telas muito baixas, validar manualmente.  
- **Termo de 1 letra** em nome/categoria sÃ³ faz `startsWith` â€” pode excluir matches centrais; trade-off para reduzir ruÃ­do.
