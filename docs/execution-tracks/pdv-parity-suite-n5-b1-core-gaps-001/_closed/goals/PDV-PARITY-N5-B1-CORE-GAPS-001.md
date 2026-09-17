<!-- AEP:META
{
  "aep": "1.0-R2",
  "id": "PDV-PARITY-N5-B1-CORE-GAPS-001",
  "track": "pdv-parity-suite-n5-b1-core-gaps-001",
  "title": "N5-B1: fechar gaps P1-01 e P2-02/P2-03/P2-05 e provar/corrigir P2-06 nas 4 superfícies oficiais do PDV",
  "status": "READY",
  "class": "C3",
  "risk_tier": "ALTO",
  "branch": "goal/pdv-parity-n5-b1-core-gaps-r2",
  "worktree": "C:/Projetos/omni-gestao-pdv-n5b1-core-gaps-r2",
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

# PDV-PARITY-N5-B1-CORE-GAPS-001 — Gaps centrais P1/P2 do PDV (execução R2)

- trilha: `pdv-parity-suite-n5-b1-core-gaps-001`
- classe: C3 · risco: ALTO · revisão independente obrigatória
- plano: audit canônico `docs/pdv/PDV_PARITY_SUITE_N5_AUDIT_001.md` (commit `02fc0bfb3cd571b089ac47395fed4f2c3d8e640b`)
- branch: `goal/pdv-parity-n5-b1-core-gaps-r2` (a partir da `origin/main` corrente no início da execução R2)
- worktree: `C:/Projetos/omni-gestao-pdv-n5b1-core-gaps-r2`
- replanejamento: autorização humana `PDV-N5-B1-R2-AEP-REPLAN-001` — identidade de track/GOAL preservada
- teste: `npx vitest run lib/pdv lib/pdv-hold.test.ts lib/pdv-payments.test.ts lib/pdv-formas-pagamento.test.ts lib/pdv-finalize-integrity.test.ts lib/pdv-pending-post-sale-effects.static.test.ts`

## Revisão R2 — por que este GOAL foi replanejado

A tentativa a1 na branch `goal/pdv-parity-n5-b1-core-gaps` (commit
`43694cbe386e0afec961ebd1a1ceb050c7d971f2`) foi reprovada pela revisão
independente estrita: `CLASSIFICACAO_FINAL=C` · `AEP_CLASSIFICATION=A` ·
`INDEPENDENCE_CLASSIFICATION=A` · `INTEGRATION_READINESS=NOT_READY`.
A branch a1 NÃO será integrada e permanece intocada — sem reset, force-push
ou reutilização. Os commits `310bfd3` e `43694cb` não devem ser importados.

Blockers registrados pela revisão estrita:

1. Assistência não consome `creditDoc` corretamente.
2. Classic aceita produto por peso com preço inválido/R$0.
3. Classic/Super/Assist podem fechar o modal durante a finalização e
   reconfirmar enquanto a chamada anterior ainda está em voo.
4. Após PENDING, reconfirmação pelo modal pode gerar nova identidade.

Observações adicionais da revisão:

- VC `multiplePayments` ainda pode falhar silenciosamente;
- FAILED em Super/Assist precisa preservar o contrato de erro do modal.

## Objetivo

Eliminar GAP-P1-01, P2-02, P2-03, P2-05 e corrigir/provar P2-06
nas 4 superfícies oficiais do PDV, preservando motor de venda,
idempotência, capabilities N4 e comportamento específico legítimo
de cada superfície.

## Contrato

1. **P1-01** — Venda Completa "Limpar tudo" deve realmente iniciar uma venda
   nova, sem resíduos operacionais de cliente, desconto, tipo, observação,
   endereço, carrinho, busca ou estado transitório da venda anterior.
   Não apagar preferências permanentes, StoreSettings, holds existentes
   ou dados persistidos do cliente.
   Nota R2: contrato mantido integralmente; como a tentativa a1 não será
   integrada, a execução R2 entrega também este fix.
2. **P2-02** — Uniformizar a resolução de `creditDoc` nas superfícies oficiais
   que usam crédito/vale, sem ampliar autoridade financeira. Assistência
   NÃO pode descartar `meta.creditDoc`. Exigências:
   - cliente explicitamente selecionado tem precedência;
   - crédito de terceiro não herda `clienteId` incorreto;
   - `storeId` permanece autoridade;
   - capability continua obrigatória;
   - sem alteração de saldo/ledger;
   - sem cross-store.
3. **P2-03** — `sales.paymentMethods` e `pdv.multiplePayments` desabilitadas
   continuam fail-closed audível, sem apresentar controles aparentemente
   quebrados. Exigências:
   - Venda Completa com `multiplePayments=false` coberta pelo mesmo contrato;
   - nenhuma ação de pagamento/múltiplo pode cair em `return` silencioso
     quando ainda houver entry point acionável (teclado/race incluído);
   - feedback operacional sem spam/loop;
   - ocultar/desabilitar entry points quando adequado.
   Não criar entitlement novo.
4. **P2-05** — Produto por peso com preço efetivo inválido não pode criar
   linha vendável em TODOS os fluxos oficiais que possuam esse comportamento,
   incluindo Classic e Supermercado. Preço efetivo `0`, negativo, `NaN`
   ou ausente/inválido rejeita a linha. Não inferir preço, não editar
   cadastro automaticamente, não liberar fracionado genericamente.
5. **P2-06** — Existe GAP real (comprovado pela revisão da a1): corrigir e
   provar a máquina de estado de finalização nas 4 superfícies.
   `PROVEN_NO_FIX` NÃO é resultado aceitável nesta execução. Garantias:
   - finalização em voo impede Cancelar/fechar o modal;
   - `onOpenChange` não reseta busy durante o voo;
   - não existe close → reopen → reconfirm concorrente;
   - CONFIRMED libera estado normalmente;
   - FAILED libera para nova tentativa consciente;
   - PENDING NÃO permite nova identidade via reconfirmação do modal;
   - PENDING segue o fluxo de retry/reenvio com identidade estável;
   - Super/Assist devolvem resultado explícito ao modal em vez de
     bare-return interpretável como sucesso; FAILED preserva o contrato
     de erro do modal.
   Não criar nova idempotência de negócio. A idempotência N1 server-side
   permanece autoridade final (última defesa).

## Fora de escopo (NÃO fazer)

- GAP-P2-01 (política de PIN); GAP-P2-04 (keymap F2/F4/F5/F10);
- P3s; N5-C; Next/Black; entitlement/plano; Central de Configurações;
- filmLookup/osLookup; schema/migrations;
- branch candidata a1 (`goal/pdv-parity-n5-b1-core-gaps`): intocada —
  sem reset, force-push, reutilização ou import dos commits `310bfd3`/`43694cb`.

## Prova obrigatória (testes)

A suite N5-A deve ser atualizada para exigir os contratos R2 (sem enfraquecer
drift guards); testes específicos novos só onde a suite não provar.
Presença de código/fonte (presence/source-string) NÃO é prova aceitável para
P2-06: exigir teste comportamental/helper apropriado para a máquina de estado
de finalização.

Casos de prova obrigatórios:

1. Assistência `creditDoc` (não descarta `meta.creditDoc`; precedência do
   cliente selecionado; `storeId` autoridade; sem saldo/ledger; sem cross-store);
2. Classic + Supermercado: peso com preço efetivo 0/negativo/NaN/ausente-inválido
   não cria linha vendável;
3. VC `multiplePayments=false`: feedback operacional, sem falha silenciosa;
4. close/cancel durante finalize em voo: modal não fecha, busy preservado,
   sem reconfirm concorrente;
5. reentrada após PENDING: sem nova identidade via reconfirmação do modal;
6. FAILED explícito em Super/Assist: contrato de erro do modal preservado;
7. duplo clique / Enter / F-key no confirmar;
8. identidade estável do retry/reenvio.

## Critério de pronto

Aceite final do GOAL (todos obrigatórios):

1. `GAP_P1_01=FIXED`
2. `GAP_P2_02=FIXED_ALL_APPLICABLE_SURFACES`
3. `GAP_P2_03=FIXED`
4. `GAP_P2_05=FIXED_ALL_WEIGHT_SURFACES`
5. `GAP_P2_06=FIXED_AND_PROVEN`
6. `ASSIST_CREDITDOC_RESIDUAL=NONE`
7. `CLASSIC_WEIGHT_ZERO_RESIDUAL=NONE`
8. `MID_FLIGHT_RECONFIRM=BLOCKED`
9. `PENDING_IDENTITY=STABLE`
10. `FAILED_MODAL_CONTRACT=EXPLICIT`

E ainda:

- Suite N5-A atualizada para os contratos R2, sem enfraquecer drift guards;
- `N5A_CONTRACTS=PASS`, `N1_REGRESSION=PASS`, `N3_REGRESSION=PASS`,
  `N4_REGRESSION=PASS`, `PRODUCTION_BEHAVIOR_CHANGES=ONLY_AUTHORIZED_GAPS`;
- `npm run typecheck`, `npm run build`, `git diff --check`,
  `node scripts/track.mjs verify --all` verdes.

PIN e keymap continuam fora de escopo.

## Commit / push

- Push autorizado somente para `goal/pdv-parity-n5-b1-core-gaps-r2`, na worktree
  `C:/Projetos/omni-gestao-pdv-n5b1-core-gaps-r2`. Não integrar main. A branch a1
  `goal/pdv-parity-n5-b1-core-gaps` permanece intocada e não será integrada.
  Não abrir N5-B2. Não iniciar N5-C. Não decidir PIN/keymap. PARE após relatório
  (`NEXT_STEP=REVISÃO-INDEPENDENTE-N5-B1`).
