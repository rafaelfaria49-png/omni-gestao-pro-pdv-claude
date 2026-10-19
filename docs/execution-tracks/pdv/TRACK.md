<!-- AEP:TRACK
{
  "completion_when_empty": "PAUSED"
}
-->

# Trilha `pdv`

> Esqueleto gerado por `node scripts/track.mjs init pdv`.
> Todo campo `<PREENCHER>` exige decisão humana. O AEP não inventa conteúdo de trilha.

## Objetivo

<PREENCHER>

## Escopo — paths_base (gramática limitada: "a/b/c/arquivo.ext" ou "a/b/c/**")

- <PREENCHER>

## Fora de escopo

- <PREENCHER>

## Comando de teste da trilha

```
<PREENCHER>
```

## Gates extras exigidos por esta trilha

- <PREENCHER>

## Branch e worktree

- padrão de branch: <PREENCHER>
- padrão de worktree: <PREENCHER>

## Plano de origem

- plan_ref: <PREENCHER>
- plan_rev: <PREENCHER>

## Estado

O estado ratificado vive em `state.json` (derivado) e `LEDGER.jsonl` (append-only).
Não edite nenhum dos dois à mão: `node scripts/track.mjs verify` detecta a divergência.

## Handoff final N5 — 14/10/2026

- Plano humano: `PDV-N5-FINAL-HANDOFF-B2-C-001`, revisão 1; branch de planejamento
  `plan/pdv-n5-b2-c-final-001`, criada da main `a70469ddb96ba60f9575ab8036a78a71da35d35d`.
- PR #269 mergeado normalmente nesse SHA: N5-B1 001/002/003 DONE; 004 permanece
  BLOCKED, sem reabertura. [Smoke documentado](../../pdv/PDV_N5_B1_PRODUCTION_SMOKE_CLOSEOUT_004.md).
- Primeiro: [N5-B2 PIN/keymap](goals/PDV-PARITY-N5-B2-PIN-KEYMAP-001.md), READY,
  C3/ALTO; preservar PIN vigente e uso real, implementar matriz e testes focados.
- Sucessor: [N5-C E2E](goals/PDV-PARITY-N5-C-E2E-002.md), READY, C3/ALTO;
  cinco cenários F-08, reuso de provas, somente lacunas em ambiente isolado.
- Cada GOAL declara sua própria branch/worktree, allowlist, teste, aceite e
  commit/push restritos; R por família independente e parada após um GOAL.
  C exige B2 DONE, R favorável e publicação em main; nova sessão/comando humano.
- Esta entrega só planeja. Aplicar o ritual de planejamento do AEP (§2), sem
  `open`/`close` dos GOALs futuros. READY faz a projeção mudar PAUSED → RUNNING;
  isso não declara execução. Ao esvaziar o plano, `completion_when_empty` segue PAUSED.
- Smoke produtivo permanece BLOCKED; não repetir smoke/R4/build/Docker nem
  corrigir Auth.js. Fechamento técnico do Core separado de N6/N7 e Fiscal completo.

## Replanejamento N5-C rev2 — 18/10/2026

- Autorização humana: `PDV-N5-C-REV2-UNBLOCK-PLAN-003`. Mesmo GOAL
  [PDV-PARITY-N5-C-E2E-002](goals/PDV-PARITY-N5-C-E2E-002.md), READY, plan_rev 2.
- Main remota confirmada no pré-flight: `180a2f2ab450cc2686b5087dc09b1a0ee58b5f72`.
  A ref main local estava em `c5728f0d001bf13cd89a48ee5b1793bddd42129a`; não foi alterada.
- Branch N5-C validada em `af12ed3d0159f97bb125a62a0466362f4a89af8b`.
  Único commit acima da main remota: matriz, evidência e ratificação AEP do
  bloqueio; nenhum código produtivo. Preservado integralmente como ancestral
  da branch de planejamento `plan/pdv-n5-c-rev2-audit-assistencia`, em worktree própria.
- Evento BLOCKED de `2026-10-18T23:26:54.741Z` preservado literalmente no ledger,
  sem remoção, reescrita ou evento READY. Reabertura pelo AEP §§2–3, seguida de
  `registry` e `verify --all`; não por `close`.
- Os cinco caminhos E2E/docs originais permanecem; acrescentados somente
  `components/dashboard/vendas/pdv-assistencia-enterprise.tsx` e
  `lib/pdv/parity-assistencia-finalize-audit.component.test.ts`.
- Após merge humano: correção local CONFIRMED-only, payload real e sem duplicação;
  prova de componente/handler real e cinco cenários F-08 em ambiente isolado.
  R por outra família permanece obrigatória; não promover PARTIAL sem prova.
- Matriz e evidência originais do bloqueio permanecem históricas nesta entrega.
  Sem implementação, E2E, close, merge ou investigação de WIPs de outras sessões.
  Próximo passo: `HUMANO_MERGEAR_N5_C_REV2`.
