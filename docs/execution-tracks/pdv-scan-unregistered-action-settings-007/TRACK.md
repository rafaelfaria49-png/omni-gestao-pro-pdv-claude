<!-- AEP:TRACK
{
  "completion_when_empty": "PAUSED"
}
-->

# Trilha `pdv-scan-unregistered-action-settings-007`

> Esqueleto gerado por `node scripts/track.mjs init pdv-scan-unregistered-action-settings-007`.
> Conteúdo preenchido a partir do GOAL humano PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007-ENDTOEND (prompt do dono, 2026-09-17).

## Objetivo

Configuração server-first e por loja para o comportamento do PDV ao bipar um produto
não cadastrado: `avisar e continuar` (GOAL 006), `avisar e oferecer Item Avulso`
(hint de Insert + contexto do código) ou `abrir Item Avulso automaticamente` (opt-in).
Mesma política para as 4 superfícies compatíveis (Clássico/Rápido, Assistência/Rápido,
Supermercado/Rápido, Venda Completa), sem duplicar regras locais, preservando o scanner
do GOAL 006. PDV Next/Black: apenas auditado.

## Escopo — paths_base (gramática limitada: "a/b/c/arquivo.ext" ou "a/b/c/**")

- lib/pdv-scan-unregistered-action.ts
- lib/pdv-scan-unregistered-action.test.ts
- lib/pdv-scan-input.ts
- lib/pdv-scan-input.test.ts
- lib/store-settings-types.ts
- lib/store-settings-provider.tsx
- lib/pdv-settings-server-first.ts
- lib/pdv-settings-server-first.test.ts
- lib/pdv-settings-classification.ts
- components/dashboard/vendas/use-pdv-scan-feedback.ts
- components/dashboard/vendas/pdv-scan-inline-feedback.tsx
- components/dashboard/vendas/item-avulso-modal.tsx
- components/dashboard/vendas/pdv-classic.tsx
- components/dashboard/vendas/pdv-assistencia-enterprise.tsx
- components/dashboard/vendas/pdv-supermercado.tsx
- components/dashboard/vendas/venda-completa-enterprise.tsx
- components/dashboard/vendas/pdv-scan-autoclear.static.test.ts
- components/configuracoes-v3/features/settings/sections/PdvSection.tsx
- docs/pdv/PDV_SCAN_UNREGISTERED_ACTION_SETTINGS_007.md
- docs/ai-execution/_evidence/**

## Fora de escopo

- Cálculo de venda, estoque, preço, desconto, pagamento, Caixa, Financeiro, Fiscal;
- Prisma/schema/migrations (campo aditivo em `StoreSettings.printerConfig` JSONB);
- auth/proxy; Operações V4; WhatsApp; Marketplace;
- cadastro automático de Produto (Item Avulso NÃO cadastra produto);
- scanner do PDV Next/Black (comportamento próprio deliberado — apenas auditado).

## Comando de teste da trilha

```
npx vitest run lib/pdv-scan-unregistered-action.test.ts lib/pdv-scan-input.test.ts lib/pdv-settings-server-first.test.ts lib/store-settings-put.test.ts components/dashboard/vendas/pdv-scan-autoclear.static.test.ts lib/pdv/parity-keymap.test.ts
```

## Gates extras exigidos por esta trilha

- `npm run typecheck` e `npm run build` limpos antes do commit;
- prova de browser (PNGs em `docs/ai-execution/_evidence/`) cobrindo os 3 modos e as 4 superfícies.

## Branch e worktree

- padrão de branch: `work/pdv-scan-unregistered-settings-007` (a partir de `origin/main`)
- padrão de worktree: `C:/Projetos/work/pdv-scan-unregistered-settings-007`

## Plano de origem

- plan_ref: prompt GOAL PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007-ENDTOEND + auditoria `docs/pdv/PDV_SCAN_INLINE_FEEDBACK_AUTOFOCUS_006.md`
- plan_rev: 1

## Estado

O estado ratificado vive em `state.json` (derivado) e `LEDGER.jsonl` (append-only).
Não edite nenhum dos dois à mão: `node scripts/track.mjs verify` detecta a divergência.
