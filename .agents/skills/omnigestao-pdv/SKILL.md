---
name: omnigestao-pdv
description: >-
  Guides OmniGestão Pro PDV and sales-floor flows: caixa/balcão, cliente no PDV, product search,
  barcode scan, keyboard shortcuts, modo rápido, Venda Completa boundaries, and vendas routes.
  Use when changing or debugging components under vendas/PDV, pdv-product-search, or caixa UX.
---

# OmniGestão PDV

Nome: **OmniGestão PDV**

Use quando a tarefa envolver PDV, vendas, caixa, cliente no PDV, busca de produto, hotkeys, Venda Completa, histórico de vendas.

Leia primeiro `files/CORE_RULES.md`, depois `files/PDV_RULES.md` e os demais arquivos conforme a subtarefa.

Reforçar:

- PDV é caixa/balcão.
- Venda Completa NÃO é PDV; é módulo comercial separado.
- Não usar `saleMode="completa"` como arquitetura final.
- Não reintroduzir `MOCK_CUSTOMERS_INITIAL` nem `PDV_PRODUCTS_BASE`.
- Usar `useClienteSearch`, `filterPdvCatalogBySearch`, `findPdvProductByScan`.

## Mapa de `files/`

| Arquivo | Uso |
|---------|-----|
| `CORE_RULES.md` | Global — primeiro |
| `PDV_RULES.md` | Produto + busca + anti-mock |
| `PDV_ARCHITECTURE.md` | Componentes, layout, busca (relatório) |
| `PDV_HOTKEYS.md` | Atalhos por shell |
| `VENDA_COMPLETA_RULES.md` | Modo completa vs PDV |
| `KNOWN_BUGS.md` | Regressões já corrigidas |
| `PRISMA_RULES.md` | Dados (transações fora do UI) |
| `TYPESCRIPT_RULES.md` | Strict / aliases |
| `UI_RULES.md` | Tokens, AppShell, overflow |
