<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003",
  "track": "pdv-parity-suite-n5-b1-core-gaps-001",
  "title": "N5-B1 na main atual: reload seguro da Assistência, sales corrente nos atalhos e gate PENDING único",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-b1-current-main-correction-r4",
  "worktree": "C:/Projetos/omni-gestao-pdv-n5b1-current-main-correction-r4",
  "test_command": "npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts lib/operations-sale-line.test.ts lib/operations-sale-types.test.ts lib/operations-sales-merge.test.ts lib/operations-sales-merge-v2.test.ts lib/operations-store-sale-conflict-safety.test.ts lib/ops-upsert-venda-lines-integrity.test.ts lib/ops-upsert-venda-accessory-selection.test.ts lib/ops-upsert-venda-pix-aprazo-resync.test.ts lib/vendas/sale-client-sync.test.ts lib/vendas/local-sale-identity.test.ts lib/vendas/sale-identity-contracts.test.ts lib/vendas/sale-identity-conflict.test.ts lib/vendas/sale-finalize-busy.test.ts lib/pdv-settings-server-first.test.ts lib/store-settings-request-epoch.test.ts lib/pdv-scan-input.test.ts lib/pdv-scan-prefix.test.ts lib/pdv-scan-lookup.test.ts lib/pdv-scan-unregistered-action.test.ts lib/pdv-product-search.test.ts",
  "allowlist": [
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "lib/pdv/**",
    "docs/ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md"
  ],
  "gates_liberados": [],
  "read_budget": 200,
  "plan_ref": "Autorização humana PDV-N5-B1-CURRENT-MAIN-CORRECTION-AEP-PLAN-003 (2026-10-01)",
  "plan_rev": 3,
  "base_commit": "ceeffeb05681e094f4e711c13387ba95851bcf24",
  "familia_executor": "openai",
  "revisao_independente": true,
  "reversibilidade": "Mudança localizada nas bordas PDV e contratos existentes em lib/pdv; sem schema/migration ou novo motor; revert dos commits técnicos",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003 — Corretivo final sobre a main atual (R4)

- Trilha: `pdv-parity-suite-n5-b1-core-gaps-001`.
- Classe C3, risco ALTO, revisão independente obrigatória por outra família declarada.
- Executor previsto: Codex, família `openai`; a revisão R não pode ser do mesmo executor/família.
- Autorização humana de planejamento: `PDV-N5-B1-CURRENT-MAIN-CORRECTION-AEP-PLAN-003`, 01/10/2026.
- Branch/worktree de implementação futura: os valores exatos do bloco AEP:META.
- GOALs 001 e 002 permanecem **DONE e imutáveis**, assim como seus relatórios e ledger.
- Este plano não declara nenhum gap corrigido. Implementação somente após **merge humano do PR de planejamento**.

## Contexto e base obrigatória

A revisão independente final do R3 retornou `CLASSIFICACAO_FINAL=C`,
`AEP_CLASSIFICATION=A` e `INTEGRATION_READINESS=NOT_READY` (contexto fornecido pelo humano).
O R3 já foi integrado historicamente à main pelo [PR #210](https://github.com/rafaelfaria49-png/omni-gestao-pro-pdv-claude/pull/210),
merge `c5a10df13af296b7392aa1d763fc9049d4950875`. Não há sync/integração do candidato antigo.

Pré-flight deste planejamento: `git fetch origin` executado com sucesso;
`MAIN_CURRENT_SHA=ceeffeb05681e094f4e711c13387ba95851bcf24`.
A main não avançou além da última referência humana. Inspeção read-only confirmou os três gaps:

| Gap | Evidência na main registrada |
| --- | --- |
| P1 Assistência/reload | `pdv-assistencia-enterprise.tsx:168` (`CartPersisted`) e :1337–1360 não serializam `pendingIdentity`; restore :1247–1297 não a reidrata; PENDING :2080–2094 só registra em memória. |
| P2 sales stale/atalhos | Venda Completa :429–495: F1 captura `handleClickFinalize`, mas as dependências :489 não incluem o handler nem `sales`; Assistência :1455–1678: listener captura `openPaymentModal`, dependências :1677 não incluem o handler nem `sales`. Ambos consultam `isUnresolved(sales)` na abertura. |
| P2 autoridades divergentes | Venda Completa :791: abertura por `isUnresolved(sales)`; :864: confirmação por `hasPending()`. |

Antes da implementação futura, fazer novo fetch e registrar a main corrente.
Se houver avanço, verificar **primeiro** esses três gaps no código corrente.
Se todos estiverem comprovadamente resolvidos por upstream: **PARE**,
reporte `UPSTREAM_ALREADY_FIXED=YES` e encaminhe a decisão de governança ao humano;
não implemente nem crie outro GOAL desnecessário.

Se qualquer gap permanecer, criar a branch/worktree R4 exclusivamente da
`origin/main` corrente, já contendo o merge humano deste plano. O SHA acima
é evidência deste pré-flight, não uma ordem para usar uma base antiga.
Não reaplicar nem corrigir os 71 commits históricos, nem partir de R2/R3.
O `base_commit` operacional continua sendo calculado pelo AEP via merge-base.

## Objetivo e fonte canônica

Fechar definitivamente o contrato PENDING do N5-B1 na main atual:

1. Assistência restaura a referência PENDING com seu carrinho e impede segunda venda.
2. Clique, F1 e atalhos operacionais decidem sobre o mesmo `sales` corrente.
3. Abertura e confirmação consultam o mesmo contrato canônico de resolução.

A referência existente é `PendingSaleIdentity` e
`createPendingSaleIdentityGuard` em `lib/pdv/finalize-modal-contract.ts`.
A autoridade de resolução é `sales/syncPending` do operations-store, consumida
pela API existente. Não criar outra identidade, outro guard independente,
outra fila de retry, ou nova camada server-side de idempotência. N1 permanece
autoridade final; Reenviar/auto-sync existentes reutilizam a identidade original.

## Contrato — Assistência / reload

`PENDING → cache real do carrinho → reload → restore → tentar pagar/confirmar`:

- `pendingIdentity` deve atravessar o serializer/cache **efetivamente usado pela Assistência**,
  preservando `id/clientSaleId` canônicos; reidratar antes de permitir pagamento.
- Registrar o resultado PENDING deve persistir também a referência, mesmo quando
  o carrinho não muda e o effect debounced de 500 ms não é disparado novamente.
  Não deixar janela de reload sem proteção após o retorno PENDING.
- Nova sessão/component mount não pode depender do guard em memória anterior.
- Com pendência unresolved, segunda `finalizeSaleTransaction = 0` e nenhum
  novo `clientSaleId` pode ser gerado; orientar o retry existente.
- Lista parcial/ausência de venda não prova resolução: preservar fail-closed.
  Só evidência canônica terminal libera a referência conforme o contrato existente.
- Carrinhos/dados e holds legados sem `pendingIdentity` permanecem compatíveis.
  Manter normalização de linhas, prazo de cache, descontos e contexto do cliente.
- Preservar isolamento por `storeId`, superfície e terminal onde aplicável;
  Store A nunca pode registrar ou liberar a pendência da Store B.
- Fechar modal, render, reload ou hold/resume não limpa arbitrariamente a referência.

## Contrato — sales corrente / clique e atalhos

Cobrir **Venda Completa e Assistência**, incluindo F1 e atalhos existentes de
pagamento. Não alterar o mapeamento F2/F4/F5/F10.

Após `syncPending=true → syncPending=false`, com cart/modais e demais
dependências do listener inalterados:

- Clique e teclado precisam liberar **o mesmo token** e chegar à mesma decisão.
- O listener instalado deve consultar o estado corrente; closures anteriores não
  podem manter bloqueio, nem permitir pagamento indevidamente.
- Provar cada via isoladamente, com fixtures frescas: clicar primeiro pode limpar
  o token e esconder um F1 stale, tornando o teste inválido.
- Não aceitar `eslint-disable` para esconder dependência necessária. Resolver o
  lifecycle real do handler/dependências, preservando guards de foco/modal e mid-flight.

## Contrato — gate único

Em cada superfície, abertura e confirmação (inclusive modal já aberto quando
`sales` muda) devem usar autoridade equivalente baseada no estado atual.
É proibido manter `abertura → isUnresolved(sales)` e
`confirmação → hasPending()` como decisões divergentes.

Identidade ausente na lista parcial e `syncPending=true` bloqueiam; resolução
terminal canônica libera consistentemente. `hasPending()` pode continuar sendo
API de introspecção, mas não autoridade operacional alternativa.
Preservar a distinção CONFIRMED/PENDING/FAILED e o mutex de finalização.

## Testes obrigatórios — mesma execução de produção

Os testes R3 em `lib/pdv/pending-identity-restore.test.ts` recriam
`persistDraft/restoreDraft/simulateConfirmAttempt` dentro do harness.
Eles continuam como regressão, mas **não provam** o cache da Assistência nem
o listener real. A crítica da revisão anterior deve virar teste regressivo
que falhe sobre a main registrada e passe com a correção.

Novos testes ficam em `lib/pdv/**` e devem executar a mesma serialização,
persistência/reidratação e handlers usados em produção. Pode haver extração
mínima para `lib/pdv/**` se a UI realmente consumir esse código; não aceitar
uma persistência ou decisão paralela criada apenas para testes. Testes de
helper isolado e buscas de string são complementares, não prova de wiring
React, cache ou atualização do listener. Exercitar o componente/listener real
ou o lifecycle de binding compartilhado efetivamente instalado em produção.

| Prova obrigatória | Aceite |
| --- | --- |
| Assistência PENDING → cache → reload/remount → restore → confirmar | Identidade igual no payload real e no guard novo; segunda finalize ZERO; geração de identidade nova ZERO. |
| Registro PENDING sem alteração do carrinho | Cache real contém a identidade imediatamente após o desfecho, sem depender de outra edição de carrinho. |
| Venda Completa F1 com sales pending | Bloqueio + feedback existente; finalize ZERO. |
| Venda Completa F1 após syncPending=false | Libera token e alcança a decisão do clique, sem clique anterior ou mudança incidental de dependências. |
| Assistência F1/atalhos com sales pending | Mesma decisão do clique; finalize ZERO. |
| Assistência F1/atalhos após syncPending=false | Libera token e alcança a mesma decisão do clique em fixtures independentes. |
| Abertura versus confirmação direta/modal já aberto | Decisão equivalente com sales atual: pending, resolved e lista parcial. |
| Classic e Supermercado | Regressões existentes verdes; seus arquivos produtivos ficam fora da allowlist. |
| Hold/resume R3 e dados legados | Identidade estável; reconfirmar unresolved não duplica; legado continua válido. |
| Store A / Store B | Cache, restore, resolução e hold permanecem isolados. |

## Regressões e comando de teste

O `test_command` do AEP:META roda a suite N5-B1 existente + todos os novos
testes sob `lib/pdv`, além das regressões read-only abaixo. Não alterar
arquivos externos à allowlist só por estarem no comando de teste.

- N5-B1: P1-01 reset total, P2-02 creditDoc, P2-03 fail-closed feedback,
  P2-05 peso inválido, P2-06 mid-flight protection, FAILED explícito,
  pending identity hold/resume e comportamento das quatro superfícies.
- N1: `pdv-finalize-integrity`, `operations-sale-line/types`,
  `operations-sales-merge/-v2`, `operations-store-sale-conflict-safety`,
  `ops-upsert-venda-lines-integrity/accessory-selection/pix-aprazo-resync`,
  `sale-client-sync/local-sale-identity/sale-identity-contracts/sale-identity-conflict/sale-finalize-busy`.
  Preservar identidade no retry e idempotência sem duplicar efeitos.
- N3 StoreSettings: `pdv-settings-server-first` e `store-settings-request-epoch`.
- N4 capabilities: `lib/pdv/capability-runtime.test.ts`, incluído pela suite `lib/pdv`.
- Scanner GOALs 005/006/007: `pdv-scan-input/prefix/lookup/unregistered-action`
  e `pdv-product-search`.

Na implementação futura, exigir também `npm run typecheck`, `npm run build`,
ESLint dos dois componentes e módulos produtivos alterados, `git diff --check`
e `node scripts/track.mjs verify --all`. Não corrigir falhas baseline alheias ao GOAL.

## Allowlist e fronteiras

Allowlist produtiva mínima:

- `components/dashboard/vendas/pdv-assistencia-enterprise.tsx`
- `components/dashboard/vendas/venda-completa-enterprise.tsx`
- `lib/pdv/**` (contrato e novos testes comportamentais usados pela produção)

Único path documental adicional:
`docs/ai-execution/_evidence/PDV-PARITY-N5-B1-CURRENT-MAIN-CORRECTION-003.md`,
para evidência da execução e revisão. Os artefatos derivados de fechamento
são geridos pelo AEP; não autorizar edição manual de state/ledger/registry.

A inspeção encontrou o serializer da Assistência no próprio componente e o
guard canônico em `lib/pdv`: nenhum path produtivo adicional é necessário
neste plano. Outro path só pode entrar após investigação provar a localização
do contrato necessário e **replanejamento humano**, nunca expansão automática.

`lib/operations-store.tsx` e `lib/operations-sale-types.ts` são somente leitura.
Se for preciso alterar operations-store, seu motor ou esses tipos: **PARE para
replanejamento**. `lib/pdv-hold.ts`, PaymentModal, Classic e Supermercado também
ficam somente leitura neste GOAL; regressão não é autorização de edição.

Fora de escopo: PIN; keymap F2/F4/F5/F10; N5-C; Fiscal; Cadastros; Caixa;
schema/migrations; Next/Black; entitlement; P3s; reescrever histórico R2/R3.

## Critério de pronto da implementação futura

Todos obrigatórios, com evidência comportamental e revisão R:

```text
ASSIST_PENDING_RELOAD=SAFE
ASSIST_PENDING_RELOAD_SECOND_FINALIZE=ZERO
PENDING_IDENTITY_REHYDRATED=YES
VC_F1_CURRENT_SALES=YES
ASSIST_F1_CURRENT_SALES=YES
CLICK_KEYBOARD_PARITY=PASS
CONFIRM_OPEN_GATE_CONVERGED=YES
PENDING_RELOAD_IDENTITY=STABLE
PENDING_HOLD_RESUME_IDENTITY=STABLE
N5B1_REGRESSION=PASS
N1_REGRESSION=PASS
N3_REGRESSION=PASS
N4_REGRESSION=PASS
```

A revisão independente deve validar contra a main usada, cache/listeners
reais, allowlist, gates e evidências. `AEP_CLASSIFICATION=A` isolado não
prova segurança técnica nem readiness; não declarar DONE antes do aceite.

## Separação entre planejamento e execução

Este planejamento vive na branch
`goal/pdv-n5-b1-current-main-correction-aep-plan`, baseada exclusivamente em
`origin/main`, em worktree dedicada. Commit/push autorizados **nesta sessão**
somente para essa branch; PR contra main; merge exclusivo do humano.

Mudanças deste passo: novo GOAL 003, ponteiro sucessor no TRACK e artefatos
derivados por `node scripts/track.mjs registry`. GOALs 001/002, seus relatórios
e LEDGER não mudam. `PRODUCTION_FILES=0` e `TEST_FILES=0`.

Validação deste plano: `node scripts/track.mjs registry`,
`node scripts/track.mjs verify --all` e `git diff --check`.
Não executar `open` nem `close`, implementar código, iniciar N5-B2 ou N5-C.

Ao entregar o PR de planejamento, reportar:
`NEXT_STEP=HUMANO_MERGEAR_PR_N5_B1_CORRECTION_003_PLAN` e **PARE**.
