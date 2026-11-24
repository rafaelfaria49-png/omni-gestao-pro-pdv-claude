# OMNI-FINANCEIRO-F9-ESTORNOS-CONSOLIDACAO-FINAL-001 — relatório

Data: 2026-11-24 · Repositório: rafaelfaria49-png/omni-gestao-pro-pdv-claude
Branch: `feat/omni-financeiro-f9-estornos-final-001` · worktree `.worktrees/fin-f9-estornos-final-001`
Base: `origin/main` **c2e9319** (pós-#394). Sem migration, sem schema, sem auth/proxy, sem Production, sem merge.

## 1. Origem e reconciliação

| PR | Head usado | Situação na main | Como entrou |
|---|---|---|---|
| #384 estorno por identidade + Caixa | `bb76132` | 0 de 2 commits na main | merge `133bfb5` — único conflito: `docs/ai/CURRENT_STATUS.md` (adendos mantidos, os dois) |
| #341 F9 + HUB + comprovante | `6c4641f` | 1 de 9 commits já equivalente na main (heap do typecheck); demais fora | merge `1efa9ac`, sem conflito |
| #388 avisos do HUB (Toaster) | `ca845f9` | 0 de 1 na main | merge `4b51e76`, sem conflito |

Reaproveitado sem mudança: todo o código das três PRs; a suíte combinada `test/fin-f9-estorno-integ`
(64d3bba) e o spec de aceite `e2e/specs/financeiro-f9-estorno-aceite-002.spec.ts` (bcba569) — commit
`5b1755a`. O patch do Toaster que estava em bcba569 **não** foi copiado: veio da #388.
As três PRs originais ficaram intocadas (evidência).

## 2. Correções novas (commit `4057b12`)

**R1 · PATCH parcial/liquidar sem idempotência e com movimentação fora da transação.**
`PATCH /api/financeiro/receber` `op=parcial|liquidar` gravava título e histórico, e só depois, fora da
transação, a movimentação (`.catch(console.error)`): uma falha deixava baixa sem entrada financeira, e
retry ou clique duplo gravava 2º pagamento. Agora usa `executarRecebimentoFinanceiro` (o motor do
`receber-lote`, #341): título + histórico + movimentação + carteira numa `$transaction`.
- `idempotencyKey` + `saldoEsperado` (opcionais, juntos): retry = replay (`jaRegistrado: true`), mesma
  chave com outro valor = 409 `*_idempotency_conflict`, saldo mudou = 409 `*_saldo_divergente`.
- Sem chave (legado): chave gerada no servidor — atômico, sem proteção de retry. A tela do HUB já não
  usa este caminho (usa `receber-lote`), só chamadores legados/API.
- Período fechado continua bloqueando operação nova; replay de operação já gravada passa (igual ao lote).

**R2 · Estorno da OS (`estornarRecebimentoOSV3`) sem identidade, sem saída financeira e com caixa cego.**
Antes: estornava "o último" sem identidade, não lançava a saída na `MovimentacaoFinanceira` (fluxo de
caixa ficava com a entrada inteira), criava `estorno_recebimento_cr` sem forma nem referência — o que
**bloqueava** depois qualquer estorno do mesmo título pelo Financeiro (`estorno_de_caixa_legado_sem_referencia`)
— e compensava a gaveta mesmo quando o pagamento nunca passou por ela (ex.: recebido no HUB).
Agora, na mesma transação e travas de antes:
- alvo = último pagamento ATIVO por `pagamentosAtivosDoHistorico`; histórico ambíguo = recusa;
- entrada de caixa localizada por `localizarEntradaCaixaDoPagamento` (contrato da #384):
  `encontrada` → compensação no **caixa atual aberto** com `refCaixaOperacaoId`, `historicoIndex` e a
  forma da entrada original (por forma, no split); `sem_caixa` → nenhuma compensação;
  `ambigua` → recusa sem escrita;
- saída financeira com `estornarMovimentacaoDePagamentoReceber` (valor exato, carteira recalculada);
- pré-condição `recebidoEsperado` (o hook da tela envia o recebido exibido): 2º clique/retry recusado.
- Sessão fechada nunca é editada (exigência de caixa aberto mantida).

**R3 · achado da revisão independente (P2-4), corrigido.** O recebimento misto da OS dividido por forma
(ex.: 30 dinheiro + 20 pix) grava N entradas de caixa com o mesmo `operacaoId`, mas o pagamento no ledger
não tinha `loteId` → o localizador não ligava as entradas e o estorno (OS ou HUB) seria recusado.
- dados novos: `recebimento-misto-service` carimba `loteId = operacaoId` (mesmo campo do `receberOSV3`);
- legado: `localizarEntradaCaixaDoPagamento` aceita o grupo de entradas com o MESMO `operacaoId`, numa só
  sessão, cuja soma livre é exatamente o pagamento — só se for o único grupo e o único pagamento candidato.
- P2-2 da revisão: `POST /api/financeiro/contas-receber/estornar-ultimo-pagamento` passa a aceitar
  `recebidoEsperado` (sem chamador na UI; protege retry de API).

Mudança de contrato a conhecer: compensação da OS continua na sessão ATUAL (o dinheiro sai da gaveta
de agora); a do Financeiro (#384) continua na sessão de ORIGEM. As duas referenciam a entrada original,
então nenhuma entrada é compensada duas vezes (G2).

## 3. Testes

PostgreSQL 17 descartável no scratchpad (porta própria, `SHOW data_directory` conferido), schema pelo
datamodel vigente (`migrate diff --from-empty`). Nenhum banco real tocado.

| Suíte | Resultado |
|---|---|
| **Nova** `test/fin-f9-estornos-final` (F1–F6 PATCH, G1–G7 estorno OS) | **RED 9/11 na base consolidada `5b1755a`** (F1–G5) → **GREEN 13/13**; G6/G7 (misto dividido) adicionados depois da revisão, sem rodada RED própria (`consolidacao-RED-base-5b1755a.txt`, `consolidacao-GREEN.txt`) |
| `test/ops-v4-financeiro-retirada-garantia-00{1,2}` (FRG) / `ops-v4-fluxo-curto-006` | 77/77 · 18/18 (rerun pós-R3; 1 timeout intermitente de 5 s no T50, verde na repetição) |
| `test/fin-f9-estorno-integ` (A–K #384+#341, Relatório Geral) | 14/14 |
| `test/fin-estorno-p1` (#384) | 24/24 |
| `test/fin-receb-f9-print` (#341) | 26/26 |
| `test/ops-v3-recebimento-misto/recebimento-misto.pg.ts` | 36/36 (com o mock de sessão corrigido) |
| `test/ops-v3-recebimento-misto/hardening-p1.pg.ts` | 22/22 |
| `test/ops-v3-recebimento-misto/hardening-p1-transitivos.pg.ts` | 32/51 — **as mesmas 19 falhas na `origin/main`** (rotas globais/seed; pré-existente) |
| Runner CI `scripts/ci/run-root-pg-suites.mjs` | OPS V4 fluxo 41/41, 006 18/18, 007 13/13, FRG 77/77; `aparelhos` não preparou no Windows (erro de stdio do `prisma migrate diff`; roda no CI Linux) |
| Unit/componente afetados (Node 22) | 3196 pass; 6 falhas = 2 arquivos PG-only + 3 PDV instáveis sob carga, **verdes isolados** (131/131 e 200/200) |
| `npm run typecheck` (heap 6144) | exit 0 |
| `npm run lint` | 0 erros (67 avisos pré-existentes) |

Harness corrigido (só teste): as suítes `ops-v3-recebimento-misto/*.pg.ts` simulavam sessão com
`storeAccess: "all"`, mas `canAccessStore` exige `allowedStoreIds` → 103/109 caíam no guard de loja
na própria main. O mock agora lista as lojas criadas pela suíte.

## 4. Relatório Geral (PR #381, já na main)

Provado em PG pela consulta real `generalAggregates`: recebimento posterior não vira venda
(classe `recebimento_titulo`), estorno abate (`estorno_recebimento`), caixa das sessões com recebimentos
e estornos separados (integ D; G2: recebimentos 150 / estornos 150 após estorno pela OS + pelo HUB),
lojas isoladas (consultas por `storeId`; F6 e integ multi-loja).

## 5. Revisão independente (segurança e integridade financeira)

Revisor separado, somente leitura, sobre `origin/main...HEAD`: **nenhum P0/P1**. Conferidos: estorno
duplo / pagamento errado, baixa dupla, divergência título×histórico×movimentação×carteira×caixa, sessão
fechada, referência inventada, escopo `storeId` em todo SQL cru, ordem de travas, sucesso sem confirmação
na UI (HUB e F9), Relatório Geral. P2 apontados:
- P2-1 (#384): janela de deadlock quando outro recebimento entra numa 3ª sessão entre a leitura prévia e a
  trava do título — desfecho seguro (rollback total, `titulo_alterado`; lote faz replay). Não alterado.
- P2-2: `recebidoEsperado` na rota `estornar-ultimo-pagamento` — **corrigido**.
- P2-3 (pré-existente, igual na main): `POST /api/pdv/receber-conta` confere a sessão ABERTA fora da
  transação e sem trava — recebimento pode cair numa sessão fechada no mesmo instante. **Proposto em
  separado** (travar a sessão FOR SHARE dentro da transação, como o lote/V3).
- P2-4: misto dividido por forma — **corrigido (R3)**.
- P2-5: política diferente para sessão de origem fechada (OS compensa no caixa atual; Financeiro recusa) —
  ambas sem editar sessão fechada; decisão de produto.
- P2-6 (Contas a PAGAR, fora do escopo): `estornarMovimentacaoPorReferencia` (#341) estorna o líquido; no
  `pagar` op=estornar "último" depois de re-pagamentos pode estornar a mais (na main estornava a menos).
  **Proposto em separado** — Contas a Pagar não faz parte deste GOAL.

## 6. Riscos residuais e procedimento

- Títulos legados já estornados em duplicidade ou com estorno sem referência ficam **bloqueados**
  (`historico_ambiguo` / `caixa_identidade_insuficiente`), nos dois caminhos. Regularização: conciliação
  manual no Financeiro (lançamento de ajuste documentado), nunca edição de sessão fechada. Nenhum dado
  histórico corrigido.
- Estorno com o caixa de origem fechado (Financeiro): recusado com orientação (devolução no caixa atual
  + ajuste pelo procedimento de conciliação) — contrato da #384, sem mudança.
- `estornarRecebimentoOSV3` é Server Action que lança `Error`: em produção a mensagem chega mascarada
  (só digest) — padrão pré-existente de todas as recusas dessa action; trocar por resultado devolvido é
  frente própria.
- PATCH legado sem `idempotencyKey` segue sem proteção de retry (agora atômico). Nenhum chamador da UI.
- Espelho `pagamentoV3` da OS não é atualizado por baixas/estornos feitos pelo Financeiro (pré-existente
  e documentado); as leituras de saldo/entrega usam o título (ledger autoritativo).
- Painel legado `components/dashboard/financeiro/contas-receber.tsx` baixa no cliente e depois chama
  `vincular-caixa` — fora do escopo, não alterado.
- `06-pdv-caixa-historico` (E2E) segue desatualizado na main (não escolhe terminal) — pré-existente.
