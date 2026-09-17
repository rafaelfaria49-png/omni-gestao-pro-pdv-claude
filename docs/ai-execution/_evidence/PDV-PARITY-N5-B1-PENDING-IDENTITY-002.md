# Evidência — PDV-PARITY-N5-B1-PENDING-IDENTITY-002 (R3)

- branch: `goal/pdv-parity-n5-b1-pending-identity-r3`
- base R2: `ebeab29f9f5b54cc7f7e9b1422ac31fe5a20c0ca` (preservado, intocado)
- main incorporada: `5b2db96c2a04ca720a7b3415d159a179abb05546` (merge normal, sem rebase/squash/force)
- data: 2026-09-17

## Estratégia (mínima e canônica)

O guard de identidade PENDING (`createPendingSaleIdentityGuard`,
`lib/pdv/finalize-modal-contract.ts`) continuou a ÚNICA fonte canônica do
token, mas agora:

1. **`isUnresolved(sales)`** — o bloqueio efetivo é avaliado contra a fonte
   canônica existente `syncPending` do operations-store (casamento
   `s.id === id || s.clientSaleId === clientSaleId`, espelhando o motor N1).
   Registro com `syncPending=true` → bloqueado; `syncPending` limpo →
   resolução terminal canônica → auto-release; registro ausente →
   conservadoramente bloqueado (`BLOCKED_BY_EXISTING_IDENTITY`; a venda
   PENDING original nunca é apagada).
2. **Identidade viaja com o estado restaurável**: campo opcional
   `pendingIdentity` em `HeldSale` (`lib/pdv-hold.ts`) e no `DraftData` da
   Venda Completa. Hold-save anexa a identidade; resume re-registra no guard.
   Draft persiste a identidade (inclusive imediatamente no branch PENDING,
   pois o efeito de draft-save não re-dispararia com carrinho inalterado) e o
   restore re-registra. Backward-compatible: holds/drafts legados sem o campo
   continuam válidos.
3. **Superfícies** (classic, supermercado, assistencia, venda-completa):
   todos os gates `hasPending()` → `isUnresolved(sales)` (abertura do modal,
   multipay, defesa em profundidade no `onConfirm`). Reconfirmar com pendência
   não resolvida é bloqueado com orientação ao retry existente
   (Vendas → Reenviar sync) — sem segunda fila, sem idempotência server-side
   nova, sem tocar `lib/operations-store.tsx` / `lib/operations-sale-types.ts`.

## Aceite

- `PENDING_RELOAD_IDENTITY=STABLE` (draft restaura e re-registra; teste 1)
- `PENDING_HOLD_RESUME_IDENTITY=STABLE` (identidade viaja no hold; teste 3)
- `PENDING_HOLD_RESUME_RECONFIRM=BLOCKED` (teste 3)
- `SECOND_FINALIZE_AFTER_RESTORE=PROVEN_NONE` (finalize spy 0 chamadas nos restores)
- `RETRY_IDENTITY_STABLE=PASS` (mesmo clientSaleId através de hold/draft)
- `HOLD_LEGADO_COMPATIBLE=PASS` (teste hold sem pendingIdentity)
- `STORE_ISOLATION=PASS` (hold/draft por loja; Store B não herda)
- `N5B1_REGRESSION=PASS` (suite canônica do GOAL 26 arquivos / 454 testes)
- `N1_REGRESSION=PASS` (8 arquivos ops/ops-upsert / 72 testes)
- `TYPECHECK=PASS` · `BUILD=PASS` · `DIFF_CHECK=PASS`

## Testes

- Novo: `lib/pdv/pending-identity-restore.test.ts` (10 testes comportamentais)
- Canônico: `npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts` → 454 passed
- N1: operations/ops-upsert safety+replay → 72 passed

## Arquivos alterados

- `lib/pdv/finalize-modal-contract.ts` — `isUnresolved` + doc do ciclo de vida
- `lib/pdv-hold.ts` — `HeldSale.pendingIdentity` opcional
- `components/dashboard/vendas/pdv-classic.tsx` — gates + hold/resume
- `components/dashboard/vendas/pdv-supermercado.tsx` — gates + hold/resume
- `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` — gates + hold/resume
- `components/dashboard/vendas/venda-completa-enterprise.tsx` — gates + hold/resume + draft pendingIdentity
- `lib/pdv/pending-identity-restore.test.ts` — novo (prova comportamental)
