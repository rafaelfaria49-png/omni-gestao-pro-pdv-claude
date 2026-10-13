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

## GOAL sucessor 003 — corretivo sobre a main corrente (R4)

- Autorização humana: PDV-N5-B1-CURRENT-MAIN-CORRECTION-AEP-PLAN-003 (01/10/2026).
- Contrato e allowlist específicos: [PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003](goals/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md).
- Branch futura: goal/pdv-parity-n5-b1-current-main-correction-r4.
- Worktree futura: C:/Projetos/omni-gestao-pdv-n5b1-current-main-correction-r4.
- Base: origin/main corrente, após merge humano do plano; pré-flight registrado em ceeffeb05681e094f4e711c13387ba95851bcf24.
- R3 já integrado historicamente pelo PR #210; não há sync/integração de candidato antigo. GOALs 001/002 seguem DONE e imutáveis.
- Classe C3, risco ALTO, revisão independente obrigatória. Cache real da Assistência, sales corrente nos atalhos e gate único são os únicos gaps do sucessor.
- O test_command do GOAL 003 amplia a regressão read-only N5-B1 com N1, N3, N4 e scanner 005/006/007; paths_base desta trilha não ampliam sua allowlist.
- Planejamento governance-only: goal/pdv-n5-b1-current-main-correction-aep-plan, em worktree dedicada. Não executar open nesta sessão nem implementar antes do merge humano.

## GOAL sucessor 004 — smoke autenticado de produção e closeout

- Autorização humana: PDV-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004-PLAN (13/10/2026).
- Contrato: [PDV-PARITY-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004](goals/PDV-PARITY-N5-B1-PRODUCTION-SMOKE-CLOSEOUT-004.md).
- PR #248 integrado por merge normal 9b0a0e81f4030c1d3df2592d48021d8206f229af, ancestral da main observada no planejamento: 1a80f2c51671c9f8a23d64ea2f3c1f096fd78b8d. GOALs 001–003 permanecem DONE.
- Classe C3, risco ALTO; executor futuro Codex / família openai; revisão R futura obrigatória por outra família declarada.
- Branch futura: goal/pdv-n5b1-production-smoke-closeout-004.
- Worktree futura: C:/Projetos/omni-gestao-pdv-n5b1-production-smoke-004.
- Base futura: origin/main corrente, após merge humano deste plano e novo pré-flight sem GOAL ativo ou conflito paralelo na trilha.
- Smoke não destrutivo nas duas produções; Classic, Assistência, Supermercado e Venda Completa recebem PASS, NOT_ACCESSIBLE ou BLOCKED individualmente, com evidência e motivo, sem alterar StoreSettings.
- Sessão válida autorizada obrigatória; se ausente: SMOKE_BLOCKED=AUTH_REQUIRED. Proibidos venda real, finalizar pagamento, abrir/fechar caixa, movimentar estoque, migrations, configurações permanentes e interferência em terminal ocupado.
- PRODUCTION_AUTHENTICATED_SMOKE é separado de PENDING_PRODUCTION_END_TO_END=NOT_EXECUTED_BY_DESIGN. A prova comportamental R4 aprovada não será fabricada em produção.
- Allowlist documental exclusiva do GOAL 004 prevalece sobre paths_base e teste históricos da trilha; nenhuma alteração produtiva autorizada. Test_command: node scripts/track.mjs verify --all.
- Commit/close AEP/push e PR documental de execução somente após aprovação R, na branch do GOAL 004; merge reservado ao humano.
- Planejamento governance-only: plan/pdv-n5b1-production-smoke-closeout-004, em worktree dedicada; commit/push e PR contra main autorizados. Não executar open/close ou smoke, nem iniciar N5-B2/N5-C nesta sessão.
- Próximo passo exclusivo: NEXT_STEP=HUMANO_MERGEAR_PLANO_SMOKE_004.
