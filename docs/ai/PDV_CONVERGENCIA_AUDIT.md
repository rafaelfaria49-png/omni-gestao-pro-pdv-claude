# Auditoria de Convergência dos PDVs — 24/05/2026

> Somente análise. Objetivo: todos os layouts compartilharem o mesmo núcleo operacional de
> caixa/venda (inclusive os gated/experimentais, alinhados sem liberar em produção).

## Núcleo operacional compartilhado ("core")

| Core | Arquivo | Papel |
|---|---|---|
| Motor venda/caixa | `lib/operations-store.tsx` | `finalizeSaleTransaction`, venda-persist, `syncPending` retry, reconciliação (caixa-falso), à-prazo na tx, débito de crédito |
| Persistência server | `lib/ops-upsert-venda.ts` + `/api/ops/venda-persist` | Venda+Item+Estoque+Financeiro idempotente |
| Barra de caixa | `components/dashboard/caixa/caixa-status-bar.tsx` | Abrir/Fechar + Sangria/Suprimento + pill terminal + KPIs |
| Sangria/suprimento | `lib/pdv-caixa-operacao.ts` | retry + idempotência por `localId` |
| Pagamento/desconto | `components/dashboard/vendas/payment-modal.tsx` | formas + desconto |
| Terminal | `lib/pdv-terminal.ts` | seleção/lock/`terminalId` |
| Item avulso / OS virtual | `lib/os-pdv-virtual-lines.ts` | linhas que não baixam estoque |
| Auditoria | `lib/audit-log.ts` | trilha local |

## Matriz por PDV

| PDV | finalizeSaleTransaction | CaixaStatusBar | Sangria/Supr. | Terminal | Persistência | Status |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Clássico (`pdv-classic`) | ✅ | ✅ (+gear redundante) | ✅×2 | ✅ | server real | maduro |
| Rápido/Supermercado (`pdv-supermercado`) | ✅ | ✅ | ✅ | ✅ | server real | ok |
| Assistência (`pdv-assistencia-enterprise`) | ✅ | ✅ | ✅ | ✅ | server real | ok |
| Venda Completa (`pdv-venda-completa-enterprise` + `venda-completa-enterprise`) | ✅ | ✅ | ✅ | ✅ | server real | ok (2 arquivos = dup) |
| **PDV Next/Black** (`PdvBlackEdition`, gated) | ❌ | ❌ (shell próprio) | ❌ | ❌ | **stub (não persiste)** | 🔴 fora do core |

## Divergências / duplicações / drift

1. **Black Edition fora do core** — `handlePaymentConfirm` só limpa a UI (sem venda/estoque/financeiro). Lê `inventory` e estado de caixa, mas não usa `finalizeSaleTransaction` nem `CaixaStatusBar`. **Maior drift.**
2. **3 keymaps divergentes** — classic omni-smart, supermercado, assistência (e o `uiShell="default"` morto no classic).
3. **Sangria em 2 lugares no Clássico** — menu engrenagem + `CaixaStatusBar` (redundante após o fix compartilhado).
4. **Venda Completa em 2 arquivos** quase irmãos.
5. **à-prazo cache localStorage** só Clássico/Venda-Completa (servidor cobre todos via tx — autoritativo).
6. **Caixa localStorage por loja, não por terminal** (Fase 5 do plano — pendente).

## Sprint Final de Convergência (proposta)

| # | Item | Prioridade |
|---|---|---|
| 1 | **Black no core (gated):** `handlePaymentConfirm` → `finalizeSaleTransaction` + `CaixaStatusBar`. Elimina ghost-sale arquiteturalmente; continua hidden. | 🔴 P0 |
| 2 | Keymap-base compartilhado (F-keys + INSERT) | 🟠 P1 |
| 3 | Remover redundância de sangria no Clássico | 🟠 P1 |
| 4 | Consolidar Venda Completa (2→1) | 🟡 P2 |
| 5 | à-prazo uniforme (servidor fonte; cache opcional igual) | 🟡 P2 |
| 6 | Aposentar keymap `default` legado do Clássico | 🟡 P2 |
| 7 | Caixa localStorage por terminal (Fase 5) | 🟢 P3 |

Cada passo: `tsc` + `build` + homologação, sem un-gate, sem schema/auth/proxy.

## Classificação final

- **Core compartilhado:** operations-store (finalize/persist/retry/reconciliação/à-prazo), CaixaStatusBar, payment-modal, pdv-caixa-operacao, pdv-terminal, audit-log, os-pdv-virtual-lines.
- **Feature específica de layout:** shell visual + micro-UX (desde que consumam o core); keymaps → base+override.
- **Legado a aposentar:** keymap `default` do Clássico; 1 dos 2 arquivos de Venda Completa; sangria duplicada do Clássico; cache localStorage à-prazo.
- **Experimental gated:** PDV Next/Black — manter OFF, alinhar ao core (P0).
