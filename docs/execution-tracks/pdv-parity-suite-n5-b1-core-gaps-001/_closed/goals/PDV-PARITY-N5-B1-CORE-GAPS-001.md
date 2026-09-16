<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B1-CORE-GAPS-001",
  "track": "pdv-parity-suite-n5-b1-core-gaps-001",
  "title": "N5-B1: fechar gaps P1-01 e P2-02/P2-03/P2-05 e provar/corrigir P2-06 nas 4 superfícies oficiais do PDV",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-b1-core-gaps",
  "worktree": "C:/Projetos/omni-gestao-pdv-n5b1-core-gaps",
  "test_command": "npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts",
  "allowlist": [
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/payment-modal.tsx",
    "lib/pdv/**",
    "lib/pdv-hold.test.ts",
    "lib/pdv-payments.test.ts",
    "lib/pdv-formas-pagamento.test.ts",
    "lib/pdv-finalize-integrity.test.ts",
    "lib/pdv-pending-post-sale-effects.static.test.ts",
    "docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md",
    "docs/ai-execution/_evidence/**"
  ],
  "gates_liberados": [],
  "read_budget": 200,
  "plan_ref": "docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md (GAP-P1-01, GAP-P2-02, GAP-P2-03, GAP-P2-05, GAP-P2-06)",
  "plan_rev": "02fc0bfb3cd571b089ac47395fed4f2c3d8e640b",
  "familia_executor": "zcode",
  "revisao_independente": true,
  "reversibilidade": "GOAL de paridade operacional nas bordas das 4 superfícies; sem schema/migration; reversível por revert do commit",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-PARITY-N5-B1-CORE-GAPS-001 — Gaps centrais P1/P2 do PDV

- trilha: `pdv-parity-suite-n5-b1-core-gaps-001`
- classe: C3 · risco: ALTO · revisão independente obrigatória
- plano: audit canônico `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md` (commit `02fc0bfb3cd571b089ac47395fed4f2c3d8e640b`)
- branch: `goal/pdv-parity-n5-b1-core-gaps` (a partir de `origin/main` pós-merge do plano N5-B1)
- worktree: `C:/Projetos/omni-gestao-pdv-n5b1-core-gaps`
- teste: `npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts`

## Objetivo

Eliminar GAP-P1-01, P2-02, P2-03, P2-05 e provar/corrigir P2-06,
preservando motor de venda, idempotência, capabilities N4
e comportamento específico legítimo de cada superfície.

## Contrato

1. **P1-01** — Venda Completa "Limpar tudo" deve realmente iniciar uma venda
   nova, sem resíduos operacionais de cliente, desconto, tipo, observação,
   endereço, carrinho, busca ou estado transitório da venda anterior.
   Não apagar preferências permanentes, StoreSettings, holds existentes
   ou dados persistidos do cliente.
2. **P2-02** — Uniformizar resolução creditDoc nas superfícies oficiais
   necessárias, sem ampliar autoridade financeira, sem cross-store,
   sem alterar saldo/ledger e respeitando customerStoreCredit.
   Cliente explicitamente selecionado mantém precedência.
3. **P2-03** — `sales.paymentMethods` e `pdv.multiplePayments` desabilitadas
   devem continuar fail-closed, mas sem apresentar controles aparentemente
   quebrados. Ocultar/desabilitar entry points quando adequado e fornecer
   feedback operacional quando ação bloqueada ainda puder ser disparada
   por teclado/race.
4. **P2-05** — Supermercado não pode aceitar linha por peso com preço efetivo
   <= 0, NaN ou inválido. Não inferir preço e não alterar cadastro
   automaticamente.
5. **P2-06** — Primeiro PROVAR anti-duplo-submit nas quatro superfícies.
   Se já houver proteção equivalente: `DOUBLE_SUBMIT_PROTECTION=PROVEN_NO_FIX`.
   Se houver gap real: corrigir minimamente, sem criar nova camada de
   idempotência de negócio. A idempotência N1 server-side permanece
   autoridade final.

## Fora de escopo (NÃO fazer)

- GAP-P2-01 (política de PIN); GAP-P2-04 (keymap F2/F4/F5/F10);
- P3s; N5-C; Next/Black; entitlement/plano; Central de Configurações;
- filmLookup/osLookup; schema/migrations.

## Critério de pronto

1. `GAP_P1_01=FIXED`, `GAP_P2_02=FIXED`, `GAP_P2_03=FIXED`, `GAP_P2_05=FIXED`;
   `DOUBLE_SUBMIT_PROTECTION=PROVEN_NO_FIX` ou `FIXED_AND_PROVEN`.
2. Suite N5-A atualizada para exigir os novos contratos (sem enfraquecer
   drift guards); testes específicos novos só onde a suite não provar.
3. `N5A_CONTRACTS=PASS`, `N1_REGRESSION=PASS`, `N3_REGRESSION=PASS`,
   `N4_REGRESSION=PASS`, `PRODUCTION_BEHAVIOR_CHANGES=ONLY_AUTHORIZED_GAPS`.
4. `npm run typecheck`, `npm run build`, `git diff --check`,
   `node scripts/track.mjs verify --all` verdes.

## Commit / push

- Push autorizado somente para `goal/pdv-parity-n5-b1-core-gaps`. Não integrar
  main. Não abrir N5-B2. Não iniciar N5-C. PARE após relatório
  (`NEXT_STEP=REVISÃO-INDEPENDENTE-N5-B1`).
