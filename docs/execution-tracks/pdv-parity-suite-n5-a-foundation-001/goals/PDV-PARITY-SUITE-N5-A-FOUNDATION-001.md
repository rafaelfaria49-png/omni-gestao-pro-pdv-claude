<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-SUITE-N5-A-FOUNDATION-001",
  "track": "pdv-parity-suite-n5-a-foundation-001",
  "title": "Fundação da suite de paridade N5-A: contrato testável das bordas dos 4 PDVs oficiais (payment props, keymap, holds, finalize guards, cart reset, feedback)",
  "status": "READY",
  "class": "C2",
  "risk_tier": "MEDIO",
  "branch": "goal/pdv-parity-suite-n5-a",
  "worktree": "C:/Projetos/omni-gestao",
  "test_command": "npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts",
  "allowlist": [
    "lib/pdv/**",
    "lib/pdv-hold.ts",
    "lib/pdv-pending-post-sale-effects.static.test.ts",
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/payment-modal.tsx",
    "docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 200,
  "plan_ref": "docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md (seções F-01..F-08, G: N5-A)",
  "plan_rev": 1,
  "familia_executor": "zcode",
  "revisao_independente": true,
  "reversibilidade": "GOAL de prova: suite de contrato + extração pura de keymap; nenhum comportamento operacional muda; reversível por revert do commit",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-PARITY-SUITE-N5-A-FOUNDATION-001 — Fundação da suite de paridade N5-A

- trilha: `pdv-parity-suite-n5-a-foundation-001`
- classe: C2 · status: READY
- plano: audit canônico `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md` (commit `02fc0bf`, GAPS_P0=0 · P1=1 · P2=6 · P3=15 · N4_REGRESSION_FOUND=false · CAPABILITY_RUNTIME_COHERENT=true)
- branch: `goal/pdv-parity-suite-n5-a` (a partir de `origin/main`; base declarada `02fc0bf` é ancestral da ponta atual `fe9445b`, que só adiciona trabalho de cadastros/segurança — zero diff em paths PDV entre os dois)
- worktree: `C:/Projetos/omni-gestao`
- teste: `npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts`
- risco: `MEDIO` (toque em produção esperado = zero; extração somente-leitura)

## Objetivo

Materializar a suite base de paridade definida no audit N5 (F-01..F-07; F-08/E2E é N5-C),
tornando as bordas dos quatro PDVs oficiais (`classic`, `assistencia`, `supermercado`,
`venda-completa`) verificáveis automaticamente. Melhorar PROVA, não comportamento de produto.

## Contrato (do audit, sem reinterpretar)

1. **F-01 payment props** — contrato das props que cada superfície passa ao
   PaymentModal (`sales.paymentMethods`, `pdv.multiplePayments`,
   `pdv.customerStoreCredit`, `pdv.discounts`): default parity + override=false.
   Registra GAP-P2-02 (creditDoc fallback só Classic/Black) e GAP-P2-03
   (fail-closed silencioso) como divergências documentadas, sem corrigir.
2. **F-02 keymap** — extração de representação canônica testável do keymap ATUAL
   (tecla → superfície → ação → gate). Sem nova tecla, sem resolver colisões
   F2/F4/F5/F10 (GAP-P2-04 registrado objetivamente). Núcleo coerente F1/F7/
   Insert/Esc congelado por teste. P3-01/02/03/06 congelados como documentados.
3. **F-03 hold/resume** — snapshot versionado + `combineHoldSnapshotWithRuntime`
   + `resumeDiscountFields`/`operationalLineDiscountPct` por superfície, hold
   legado, runtime vence snapshot, isolamento loja+terminal, cliente preservado.
4. **F-04 finalize guards** — single finalize entry, FAILED honesto, pending
   honesto, guards compartilhados; mutex só na VC permanece EVIDÊNCIA para
   N5-B (GAP-P2-06), sem mutex novo.
5. **F-05 cart reset** — contrato do que cada superfície limpa; GAP-P1-01
   (VC "Limpar tudo" parcial) registrado como divergência esperada/documentada,
   sem esconder e sem corrigir; sem teste permanentemente vermelho.
6. **F-06 feedback** — gates com feedback atual registrado (incl. silêncio do
   P2-03) sem alterar UX.
7. **F-07 reparo test-only** — `lib/pdv-pending-post-sale-effects.static.test.ts`
   espera literal `writeCupom` no Black; fonte usa `writePdvBlackCupom` desde
   N2 (`cadf188`). Reparo SOMENTE do teste (BUG_OUTSIDE_N5-03 / TEST_ONLY_STALE).

## Fora de escopo (NÃO fazer)

- Política de PIN Supermercado (GAP-P2-01); keymap-base final (GAP-P2-04);
- P1 VC reset parcial (correção); creditDoc fallback (P2-02); peso R$0 (P2-05);
- mutex de finalização nas demais superfícies (P2-06); fail-closed audível (P2-03);
- helps/badges/audit divergentes (P3s); redesign; N5-B; N5-C (E2E);
- qualquer mudança de comportamento operacional.

## Critério de pronto

1. Suite base existe em `lib/pvd`→`lib/pdv/parity-*.test.ts` com fixtures por
   surfaceId; as 4 superfícies oficiais representadas por tabela (não por cópia).
2. Diferenças intencionais (B-01..B-06, U-01..U-04) explicitamente preservadas.
3. Keymap atual testável sem decisão de produto; conflitos registrados.
4. Capabilities N4 continuam coerentes (regressão focada verde).
5. Nenhum gap N5-B corrigido; nenhum comportamento operacional mudou.
6. `tsc --noEmit`, `build`, `git diff --check` limpos; TEST_ONLY_STALE reparado
   e documentado.

## Commit / push

- Commit sugerido: `test(pdv): criar fundacao da suite de paridade N5`
- Push da branch autorizado. Não integrar main. PARE após relatório
  (`NEXT_STEP=REVISÃO-INDEPENDENTE-N5-A`).
