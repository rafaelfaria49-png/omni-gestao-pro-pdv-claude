<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B1-PENDING-IDENTITY-002",
  "track": "pdv-parity-suite-n5-b1-core-gaps-001",
  "title": "N5-B1: identidade PENDING sobrevive à restauração de estado (reload/draft/hold/resume) sem segunda venda",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-b1-pending-identity-r3",
  "worktree": "C:/Projetos/omni-gestao-pdv-n5b1-pending-identity-r3",
  "test_command": "npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts",
  "allowlist": [
    "components/dashboard/vendas/pdv-classic.tsx",
    "components/dashboard/vendas/pdv-assistencia-enterprise.tsx",
    "components/dashboard/vendas/pdv-supermercado.tsx",
    "components/dashboard/vendas/venda-completa-enterprise.tsx",
    "components/dashboard/vendas/payment-modal.tsx",
    "lib/pdv/**",
    "lib/pdv-hold.ts",
    "lib/pdv-hold.test.ts",
    "lib/pdv-payments.test.ts",
    "lib/pdv-formas-pagamento.test.ts",
    "lib/pdv-finalize-integrity.test.ts",
    "lib/pdv-pending-post-sale-effects.static.test.ts",
    "docs/ai-execution/_evidence/**",
    "docs/execution-tracks/REGISTRY.md",
    "docs/execution-tracks/pdv-parity-suite-n5-b1-core-gaps-001/LEDGER.jsonl",
    "docs/execution-tracks/pdv-parity-suite-n5-b1-core-gaps-001/state.json",
    "docs/execution-tracks/pdv-parity-suite-n5-b1-core-gaps-001/_closed/goals/PDV-PARITY-N5-B1-CORE-GAPS-001.md",
    "docs/execution-tracks/pdv-parity-suite-n5-b1-core-gaps-001/_closed/reports/PDV-PARITY-N5-B1-CORE-GAPS-001-a1.md"
  ],
  "gates_liberados": [],
  "read_budget": 200,
  "plan_ref": "Revisão independente estrita do candidato R2 (autorização humana PDV-N5-B1-PENDING-IDENTITY-AEP-PLAN-002)",
  "familia_executor": "zcode",
  "revisao_independente": true,
  "reversibilidade": "GOAL de identidade/estado PENDING nas bordas das superfícies e mecanismos restauráveis; sem schema/migration; sem camada server-side nova; reversível por revert do commit",
  "gates_extra": [],
  "gate_humano": {
    "requerido": false,
    "pendente": false
  }
}
-->

# PDV-PARITY-N5-B1-PENDING-IDENTITY-002 — Identidade PENDING sobrevive à restauração de estado (execução R3)

- trilha: `pdv-parity-suite-n5-b1-core-gaps-001`
- classe: C3 · risco: ALTO · revisão independente obrigatória
- GOAL corretivo da trilha: `PDV-PARITY-N5-B1-CORE-GAPS-001` permanece **DONE e imutável**
  (technical commit `ec59559d902cda411816f4a299f3322f513fc632`, AEP close
  `ebeab29f9f5b54cc7f7e9b1422ac31fe5a20c0ca`)
- autorização humana: `PDV-N5-B1-PENDING-IDENTITY-AEP-PLAN-002`
- branch: `goal/pdv-parity-n5-b1-pending-identity-r3`
- worktree: `C:/Projetos/omni-gestao-pdv-n5b1-pending-identity-r3`
- teste: `npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts`

## Revisão estrita — por que este GOAL existe

A revisão independente estrita do candidato R2 classificou:
`CLASSIFICACAO_FINAL=C` · `AEP_CLASSIFICATION=A` · `INDEPENDENCE_CLASSIFICATION=A`.
Todos os itens foram aprovados:

- `GAP_P1_01=FIXED`
- `GAP_P2_02=FIXED_ALL_APPLICABLE_SURFACES`
- `GAP_P2_03=FIXED`
- `GAP_P2_05=FIXED_ALL_WEIGHT_SURFACES`
- `FAILED_MODAL_CONTRACT=EXPLICIT`
- `MID_FLIGHT_RECONFIRM=BLOCKED` em sessão

**ÚNICO BLOCKER:** `PENDING_IDENTITY` não sobrevive à restauração de estado.
Cenários comprovados:

- **A (reload/draft):** PENDING → reload → draft restaurado → nova confirmação
  → `generateClientSaleId()` → **segunda venda**.
- **B (hold/resume):** PENDING → guardar em espera → resume → nova confirmação
  → nova identidade → **segunda venda**.

A idempotência N1 não protege esses casos porque a nova tentativa possui
outro `clientSaleId`.

## Base da correção (fluxo R3 obrigatório)

A execução R3 NÃO recria o N5-B1 do zero. Ela preserva integralmente o
candidato aprovado `ebeab29`:

1. criar a branch R3 `goal/pdv-parity-n5-b1-pending-identity-r3` **a partir de
   `ebeab29f9f5b54cc7f7e9b1422ac31fe5a20c0ca`**;
2. incorporar `origin/main` corrente por merge normal;
3. abrir este GOAL 002 na trilha;
4. corrigir **somente** o blocker de identidade PENDING;
5. revalidar **todo** o N5-B1 (suite completa do GOAL 001 + novos testes deste GOAL).

## Objetivo

Garantir que uma venda já classificada como PENDING continue reconhecida como
a **MESMA intenção de venda** após restauração de estado. Nenhum caminho de
`reload`, `draft restore`, `hold save` ou `hold resume` pode permitir que o
PaymentModal gere uma segunda venda enquanto a pendência original continua
unresolved.

## Contrato PENDING

A identidade/estado PENDING deve sobreviver de forma segura aos mecanismos de
restauração. A implementação escolhe, após investigar o código real:

- persistir/reidratar referência à pendência; **ou**
- carregar a identidade a partir do mecanismo `syncPending` existente; **ou**
- combinar ambas;

desde que exista **UMA fonte canônica e testável**. Não prescrever arquitetura
artificial. O mecanismo canônico `syncPending` existente vive em
`lib/operations-store.tsx` / `lib/operations-sale-types.ts`: consumo via API
existente é permitido; **modificação** neles (motor `finalizeSaleTransaction` /
operations-store) é **STOP para replanejamento**, não autorização automática.

## Regras de segurança

1. Com pendência unresolved associada à venda restaurada: abrir/reconfirmar
   pagamento **NÃO pode criar novo `clientSaleId`**.
2. O operador deve ser direcionado ao fluxo **existente** de Reenviar/retry da
   venda pendente (Vendas → Reenviar sync + auto-sync, contrato de
   `lib/pdv/finalize-modal-contract.ts`).
3. Não criar segunda fila de retry.
4. Não criar nova camada server-side de idempotência. **N1 permanece autoridade
   final.**

## Reload / Draft (Venda Completa explícita)

Cobrir explicitamente Venda Completa: PENDING → persistência/restauração do
draft → reload → carrinho restaurado. Após restauração, a UI precisa saber que
existe pendência associada **antes** de permitir nova confirmação.

Aceite (um dos dois):

- `PENDING_RELOAD_IDENTITY=STABLE`, **ou**
- `PENDING_RELOAD_RECONFIRM=BLOCKED_BY_EXISTING_IDENTITY`

## Hold / Resume (superfícies oficiais com hold)

Cobrir as superfícies oficiais que permitem hold: PENDING → salvar hold →
retomar hold. A operação não pode simplesmente limpar a proteção PENDING. A
identidade/referência necessária deve acompanhar o estado restaurável de forma
**backward-compatible**. Holds legados sem essa informação continuam válidos.

Aceite:

- `PENDING_HOLD_RESUME_IDENTITY=STABLE`
- `PENDING_HOLD_RESUME_RECONFIRM=BLOCKED`

## Ciclo de vida da referência PENDING

A referência PENDING **NÃO** pode ser descartada apenas por: fechar modal,
salvar hold, resume, reload ou re-render. Ela pode deixar de bloquear somente
quando houver **evidência canônica de resolução terminal** da pendência, ou
quando o operador iniciar de fato uma **venda nova independente**, sem
reutilizar o estado pendente anterior. **Não apagar a venda PENDING original.**

## Isolamento

Qualquer persistência/reidratação deve respeitar `storeId`,
`pdvType/surfaceId`, terminal quando aplicável e identidade da venda. **Não
permitir associação de pending entre lojas.**

## Prova obrigatória (testes comportamentais)

Presença de código/fonte (grep/source-string) NÃO é prova aceitável. Exigir
testes comportamentais para:

1. PENDING → reload → draft restore → confirmar (sem segunda venda);
2. PENDING → hold → resume → confirmar (sem segunda venda);
3. PENDING → fechar/reabrir modal na mesma sessão;
4. retry/reenvio mantém identidade original;
5. CONFIRMED libera estado;
6. FAILED permite nova tentativa consciente;
7. venda nova realmente limpa NÃO herda pending anterior;
8. hold legado (sem informação de identidade) continua funcionando;
9. isolamento Store A / Store B;
10. nenhuma segunda `finalizeSaleTransaction` é emitida nos cenários de restore.

## Não reabrir gaps já aprovados (regressão)

Preservar como regressão — não refatorar além do necessário ao blocker:

- P1-01 reset total; P2-02 creditDoc; P2-03 fail-closed feedback;
- P2-05 peso inválido; P2-06 mid-flight protection;
- FAILED explícito; capabilities N4; holds/snapshot; N1 pending/retry.

## Fora de escopo (NÃO fazer)

- PIN; keymap F2/F4/F5/F10; P3s; N5-C; Fiscal; schema/migrations;
- Next/Black; entitlement/plano; filmLookup/osLookup;
- as 28 falhas baseline da full suite;
- branch candidata R2 (`goal/pdv-parity-n5-b1-core-gaps-r2`): intocada —
  sem reset, force-push ou reutilização; o R3 preserva `ec59559`/`ebeab29`.

## Critério de pronto

Aceite final do GOAL (todos obrigatórios):

1. `PENDING_RELOAD_IDENTITY=STABLE` **ou** `PENDING_RELOAD_RECONFIRM=BLOCKED_BY_EXISTING_IDENTITY`
2. `PENDING_HOLD_RESUME_IDENTITY=STABLE`
3. `PENDING_HOLD_RESUME_RECONFIRM=BLOCKED`
4. `Nenhuma segunda finalizeSaleTransaction nos cenários de restore=PROVEN`
5. `HOLD_LEGADO_COMPATIBLE=PASS`
6. `STORE_ISOLATION=PASS`
7. `N5B1_REGRESSION=PASS` (gaps aprovados do GOAL 001 preservados)
8. `N1_REGRESSION=PASS`

E ainda: `npm run typecheck`, `npm run build`, `git diff --check`,
`node scripts/track.mjs verify --all` verdes.

## Commit / push

- Push autorizado somente para `goal/pdv-parity-n5-b1-pending-identity-r3`, na
  worktree `C:/Projetos/omni-gestao-pdv-n5b1-pending-identity-r3`. A execução só
  começa após o merge humano do PR de plano
  (`goal/pdv-n5-b1-pending-identity-aep-plan-to-main`).
- STOP para replanejamento (não autorização automática) se a correção exigir
  alterar o motor `finalizeSaleTransaction` / operations-store
  (`lib/operations-store.tsx`, `lib/operations-sale-types.ts`).
- PARE após o relatório. Não iniciar N5-B2. Não iniciar N5-C. Não decidir
  PIN/keymap.
