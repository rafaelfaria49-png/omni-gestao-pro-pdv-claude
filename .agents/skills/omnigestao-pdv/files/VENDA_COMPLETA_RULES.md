# Venda Completa — Regras

**Fonte:** `docs/ai/MASTER_CONTEXT.md` §7.5; código em `components/dashboard/vendas/pdv-classic.tsx`.

## O que é

- Modo de venda com **`saleMode === "completa"`** no fluxo clássico: **cliente obrigatório** antes de finalizar; opções de pagamento via `PaymentModal`; opção de emitir nota (NFC-e **não** implementada ponta a ponta — ver roadmap fiscal).

## Relação com o PDV

- **Venda Completa NÃO é o PDV genérico** — é fluxo comercial **adicional** acoplado ao classic. **PDV** = caixa/balcão; não usar `saleMode="completa"` como **arquitetura final** para todos os cenários de loja.

## O que evitar

- Não generalizar lógica “completa” para **supermercado** ou ramos que não precisam de NFC-e/cliente obrigatório sem decisão de produto.
- Não reintroduzir mocks globais de cliente/produto (`MOCK_CUSTOMERS_INITIAL`, `PDV_PRODUCTS_BASE`) como substituto de cadastro real.
