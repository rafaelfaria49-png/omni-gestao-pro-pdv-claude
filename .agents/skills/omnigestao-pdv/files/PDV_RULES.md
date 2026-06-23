# PDV — Regras de produto e implementação

**Fonte estendida:** `docs/ai/MASTER_CONTEXT.md` §7 (Arquitetura do PDV), `docs/ai/CURRENT_STATUS.md` (seção PDV), relatórios em `docs/modules/reports/PDV_*.md`.

## Definições

- **PDV** = caixa / balcão de vendas (`/dashboard/vendas`, alias `/dashboard/pdv`).
- **Venda Completa** é um **módulo comercial separado** do PDV “rápido”: fluxo com cliente obrigatório e etapas adicionais — **não** tratar como sinônimo do PDV de balcão.

## Arquitetura (alto nível)

- Entrada: `app/dashboard/vendas/page.tsx` → `VendasPageClient` → `VendasPDV` → `PdvClassic` / `PdvSupermercado` / ramos assistência.
- **Modo rápido:** query `?modo=rapido` e preferência em `lib/omnigestao-pdv-modo.ts`.
- **Assistência enterprise:** `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` — finalização via `finalizeSaleTransaction`, caixa compartilhada `CaixaStatusBar`.

## Busca de produto e catálogo (oficial)

- Preferir **`useClienteSearch`** onde aplicável ao fluxo de cliente.
- Filtrar catálogo com **`filterPdvCatalogBySearch`** (`lib/pdv-product-search.ts`).
- Scan/código de barras: **`findPdvProductByScan`** (`lib/pdv-product-search.ts`).
- **Não** reintroduzir listas mockadas tipo **`MOCK_CUSTOMERS_INITIAL`** ou **`PDV_PRODUCTS_BASE`** como fonte de verdade de produção; seeds/mock só em contexto Lovable ou testes, conforme política do projeto.

## `saleMode === "completa"`

- Existe no fluxo clássico para exigir cliente antes de finalizar; **não** é a arquitetura final desejada para todo o PDV — não generalizar como padrão único.

## UI / layout

- Ver `files/UI_RULES.md`. PDV deve respeitar **AppShell** como scroll owner; evitar `h-screen`/`overflow-auto` em wrappers que quebrem o shell.
