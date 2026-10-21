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

## Replanejamento N5-C rev4 — 20/10/2026

- Autorização humana: `PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005`. Reabre o mesmo
  [PDV-PARITY-N5-C-E2E-002](goals/PDV-PARITY-N5-C-E2E-002.md), READY, plan_rev 4,
  pelo ritual de planejamento AEP §§2–3; sem novo GOAL funcional ou evento READY.
- `origin/main=13700862405a89da3c7d16702318735a88348133`, ancestral do BLOCKED
  rev3 `0ca9eb1a28d254822db60f69cdcd6be868424101`, cujo pai documental é
  `d0ef175f2438f1c302431f81dbe5530968c5a658`. Os três eventos BLOCKED permanecem
  byte a byte no ledger; os dois commits locais entram por ancestralidade.
- Planejamento isolado na branch `plan/pdv-n5-c-rev4-retry-audit`, worktree
  `C:/Projetos/omni-gestao/.worktrees/plan-pdv-n5-c-rev4-retry-audit`, criada
  do BLOCKED validado. Merge normal com origin/main: Already up to date.
- Preservados os dez padrões rev3. Acrescentados somente Supermercado,
  Venda Completa e seus dois testes locais de auditoria, conforme GOAL rev4.
  Venda Completa tem exposição equivalente confirmada por inspeção read-only,
  sem execução ou falha E2E declarada. Nenhuma mudança no motor/API de auditoria.
- Matriz/evidências REV1–REV3 integrais: rev3 13 PASS, 1 FAIL, 6 NOT_RUN e
  13 TESTED, 6 PARTIAL, 1 BLOCKED. Os sete WIPs de implementação e fingerprints
  permanecem intactos e não são incorporados ao planejamento.
- Retomada futura corrige Supermercado D, executa os seis NOT_RUN e mantém
  cinco F-08/20 combinações, regressão Classic/Assistência, ambiente isolado,
  zero escrita produtiva e R independente para implementação/testes/matriz.
- [Relatório e fingerprints](_closed/reports/PDV-N5-C-REV4-FINAL-RETRY-AUDIT-PLAN-005.md).
  Commit/push somente da branch de planejamento e um PR contra main.
  Sem implementação, open/close de execução, merge ou DONE nesta entrega.
  Próximo passo: `HUMANO_MERGEAR_N5_C_REV4`. Parar.

## Replanejamento N5-C rev5 — 20/10/2026

- Autorização humana `PDV-N5-C-REV5-REGRESSION-REOPEN-006`; mesmo
  [PDV-PARITY-N5-C-E2E-002](goals/PDV-PARITY-N5-C-E2E-002.md), READY, plan_rev 5.
- Branch/worktree `plan/pdv-n5-c-rev5-regression-closeout`, criada diretamente de
  `origin/main=a874342f5366427f8f7cfebc96a9c14c8efe39ad`, sem cherry-pick ou
  ancestralidade de `cdda749`/`01b9c0e`. Somente documentos, provas e ledger AEP.
- Quatro eventos BLOCKED preservados literalmente; a main de origem tem sete
  linhas, prefixo exato das oito do ledger transportado. Nenhum evento READY.
- Base isolada `16c496a`: 45 PASS. Candidato isolado `cdda749`: 28 PASS/17 FAIL.
  Classificação: zero baseline, três regressões de compatibilidade estática,
  14 fixtures/mocks, zero inconclusivas. A lista individual consta nas provas.
- Achado de remount Assistência comprovado com provider/handler/retry/auditoria
  reais: cinco testes históricos PASS e diagnóstico adicional FAIL, evento
  esperado um/observado zero após confirmar com a tela desmontada.
- Preservados os 14 padrões rev4; duas inclusões exatas para corrigir os testes
  herdados sem retirar casos/asserts. Nenhuma correção implementada nesta entrega.
- Matriz/evidência rev4 transportadas integralmente: 20/20 E2E históricos,
  19 TESTED/1 PARTIAL; exigidos nova validação e novo R sobre o SHA corrigido.
- [Relatório e preservação](_closed/reports/PDV-N5-C-REV5-REGRESSION-REOPEN-006.md).
  Commit/push somente da branch de planejamento; PR documental para merge humano.
  Sem open/close de execução, código produtivo, implementação rev5 ou merge.
  Próximo passo: `HUMANO_MERGEAR_N5_C_REV5`. Parar.
