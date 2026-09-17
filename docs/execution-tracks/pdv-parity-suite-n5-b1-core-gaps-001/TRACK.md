<!-- AEP:TRACK
{
  "completion_when_empty": "PAUSED"
}
-->

# Trilha `pdv-parity-suite-n5-b1-core-gaps-001`

> Esqueleto gerado por `node scripts/track.mjs init pdv-parity-suite-n5-b1-core-gaps-001`.
> Todo campo `<PREENCHER>` exige decisão humana. O AEP não inventa conteúdo de trilha.

## Objetivo

Fechar os gaps técnicos P1/P2 determinados do N5-B1 nas quatro superfícies
oficiais do PDV (`classic`, `assistencia`, `supermercado`, `venda-completa`),
preservando motor de venda, idempotência, capabilities N4 e comportamento
específico legítimo de cada superfície.

## Escopo — paths_base (gramática limitada: "a/b/c/arquivo.ext" ou "a/b/c/**")

- components/dashboard/vendas/pdv-classic.tsx
- components/dashboard/vendas/pdv-assistencia-enterprise.tsx
- components/dashboard/vendas/pdv-supermercado.tsx
- components/dashboard/vendas/venda-completa-enterprise.tsx
- components/dashboard/vendas/payment-modal.tsx
- lib/pdv/**
- lib/pdv-hold.test.ts
- lib/pdv-payments.test.ts
- lib/pdv-formas-pagamento.test.ts
- lib/pdv-finalize-integrity.test.ts
- lib/pdv-pending-post-sale-effects.static.test.ts
- docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md
- docs/ai-execution/_evidence/**

## Fora de escopo

- GAP-P2-01 PIN
- GAP-P2-04 keymap
- P3
- N5-C
- Next/Black
- entitlement/plano
- schema/migrations

## Comando de teste da trilha

```
npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts
```

## Gates extras exigidos por esta trilha

- nenhum (valem os gates universais; allowlist não toca caminho de gate)

## Branch e worktree

- branch de implementação: goal/pdv-parity-n5-b1-core-gaps
- worktree de implementação: C:/Projetos/omni-gestao-pdv-n5b1-core-gaps
- (este bootstrap vive em branch governance-only goal/pdv-n5-b1-aep-plan-to-main; nunca usar a worktree principal como worktree do GOAL)
- GOAL corretivo PDV-PARITY-N5-B1-PENDING-IDENTITY-002: branch de implementação goal/pdv-parity-n5-b1-pending-identity-r3, worktree C:/Projetos/omni-gestao-pdv-n5b1-pending-identity-r3 — R3 a partir do candidato aprovado ebeab29f9f5b54cc7f7e9b1422ac31fe5a20c0ca + merge de origin/main corrente; bootstrap deste GOAL vive em branch governance-only goal/pdv-n5-b1-pending-identity-aep-plan-to-main

## Plano de origem

- plan_ref: docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md
- plan_rev: 02fc0bfb3cd571b089ac47395fed4f2c3d8e640b

## Estado

O estado ratificado vive em `state.json` (derivado) e `LEDGER.jsonl` (append-only).
Não edite nenhum dos dois à mão: `node scripts/track.mjs verify` detecta a divergência.
