# FINANCEIRO-F9-ESTORNO-INTEGRACAO-ISOLADA-001 — Integração de teste #384 + #341

Data: 2026-11-21. Branch temporária exclusiva: `claude/fin-f9-estorno-integracao-isolada-001`
(worktree `.worktrees/fin-f9-estorno-integ-001`). **Não publicada. Sem merge, sem Production, sem
migration, sem flag.** Nenhuma PR original foi alterada.

## 1. SHAs

| Ref | SHA |
|---|---|
| `origin/main` (reconferido) | `464190a6e42011615a92f3b1edd86fb46f7b0b3e` |
| #384 `claude/financeiro-estorno-recebimentos-p1-001` | `bb761323eb5cfc5e7ec51cad78e4d3ee535fa3ff` |
| #341 `claude/financeiro-recebimentos-f9-print-001` | `6c4641f864fd6992836e02cfe9b832193fab5213` |
| #383 (não tocada) | `74c150425fcad272328a23a6d5a482a72e029bd7` |
| merge main → #384 | `f854e36` |
| merge → #341 | `9852cfe` |

Ordem simulada: `main → #384 → #341`, dois `git merge --no-ff` (sem rebase/reset/force).

## 2. Conflitos

**Textuais: nenhum.** Os quatro arquivos comuns foram mesclados pelo git e revisados à mão:

| Arquivo | Resultado combinado | Decisão |
|---|---|---|
| `app/api/financeiro/receber/route.ts` | #341 mexe só no GET (`clienteId`, `nomesAmbiguos`); #384 no PATCH `estornar` | hunks disjuntos, mantidos os dois |
| `app/api/pdv/receber-conta/route.ts` | ledger ganha `loteId`+`formaPagamento` (#341); caixa ganha `historicoIndex` e entrada com `idempotenciaDoChamador` (#384); replay de operação estornada → 409 (#341) | as duas identidades convivem e concordam (provado no cenário D) |
| `components/financeiro/lovable/context/FinanceiroRealContext.tsx` | hunk do audit por `localKey` **idêntico** nas duas; `receberTitulos` (#341) + `estornarReceber` com `recebidoEsperado` (#384) | mantidos os dois |
| `docs/ai/CURRENT_STATUS.md` | dois adendos independentes | mantidos os dois |

**Semânticos (arquivos diferentes, contrato comum) — verificados:**
- Identidade do pagamento: `estorno_pagamento.refHistoricoIndex` (#384 sempre grava) é exatamente o que
  `pagamentosDoLedger`/`operacaoEstornadaNoLedger` (#341) leem. Para toda forma de ledger que a #384
  escreve (último, por índice, título completo), os dois módulos classificam igual; onde a #341 vê
  "ambíguo", a #384 também (a #384 é mais estrita: também bloqueia valor divergente — só bloqueia).
- `receber-lote` do HUB (#341) já chama `createMovimentacaoEntradaFromReceber` com
  `idempotenciaDoChamador: true` → a 2ª parcial menor tem entrada (defeito A4 da #384 não reaparece).
- HUB não usa mais `PATCH op=parcial/liquidar` (único chamador UI passou a ser `receber-lote`).
- Workflow `fiscal-xsd-worker.yml` e `package.json` (heap 6144) da #341: o hunk do workflow é
  **idêntico (mesmo blob `9331a69`)** ao da #383 → sem conflito com a frente da #383.

## 3. Testes financeiros em PG descartável

PostgreSQL 17 local, `127.0.0.1:55497`, cluster no scratchpad, `fsync=off`; schema = `prisma migrate
diff --from-empty --to-schema-datamodel` do schema da branch (inalterado em relação à main). Massa
sintética; cada teste cria a(s) própria(s) loja(s).

Nova suíte `test/fin-f9-estorno-integ/integracao.pg.ts` (handlers reais de #341 **e** #384; só `@/auth`,
`next/cache` e selo de assinatura simulados): **14/14**, repetida 4× sem instabilidade —
`integracao-combinada.txt`.

**Contraprova:** a MESMA suíte sobre a #341 sozinha (6c4641f) → **7/14 falham** (estorno de 100 em vez
de 50, nenhuma compensação de caixa, estorno com caixa fechado aceito, legado ambíguo estornado) —
`contraste-341-sozinha.txt`. A combinação é necessária.

| Cenário | Teste | Prova |
|---|---|---|
| A parcial 100 + 50 em 300 | `A.` | recebido 150, saldo 150, entradas `[100, 50]`, 2 `loteId` distintos, reenvio = replay, 0 caixa |
| B estorno da 2ª parcial | `B+C.` | saldo 200, saída `[50]`, `refHistoricoIndex: 1`, 1ª parcial com 2ª via válida (100), 2ª → 409 |
| C estorno da 1ª | `B+C.` | saldo 300, `pendente`, saídas `[50, 100]`, refs `[1, 0]`, novo estorno → 422 sem escrita |
| D F9 caixa aberto → estorno HUB | `D` | compensação na **mesma sessão**, `refCaixaOperacaoId` = entrada do 2º pagamento, `historicoIndex` 1 e `loteId` concordam; retry antigo → 409 `operacao_estornada`; Relatório Geral: recebimentos 150, estornos −50, caixa 150/50 |
| E só HUB | `E` | com caixa aberto na loja, 0 operação de caixa no recebimento e no estorno; sessão byte-a-byte igual |
| F lote | `F` (HUB e PDV) | estorno de 1 de 3 títulos não toca os outros 2; retry do lote → 409 `operacao_estornada`; 2ª via consolidada recusada; PDV: compensa só o item (30) apontando a operação do lote |
| G clique duplo | `G` (HUB e PDV, singular e lote) | 1 baixa e 1 movimentação por título; caixa 50 |
| H resposta perdida | `H` | replay devolve a MESMA `operacaoId`/`recebidoEm`, nada gravado; estorno repetido com 2º pagamento ativo → 409 `estornar_titulo_alterado`, nada revertido |
| I estorno + retry | `I`, `D`, `F` | HUB singular/lote e PDV → 409; 2ª via 409 |
| J caixa fechado | `J` | 409 `estornar_caixa_sessao_fechada` com orientação, nada gravado, sessão intacta; novo recebimento na sessão fechada recusado |
| K segurança | `K` (3 testes) | outra loja: 409/404/404 e nenhuma escrita nas duas lojas; `lojaId` ≠ header → 400; TÉCNICO → 403 nas duas rotas; legado ambíguo → 409 `historico_ambiguo` e sem 2ª via |

## 4. Riscos residuais investigados

| # | Risco | Situação na combinação | Bloqueia publicação? |
|---|---|---|---|
| 1 | `PATCH op=parcial` sem idempotência | **Mitigado na UI**: o HUB da #341 recebe só por `receber-lote` (chave + advisory lock). `receberParcial`/`liquidarReceber` do contexto ficam sem chamador. A rota segue aceitando chamadas diretas (API legada). | Não |
| 2 | Liquidação/parcial com movimentação fora de transação | Idem: só no `PATCH` legado, fora do caminho da UI. `receber-lote` grava tudo numa `$transaction`. | Não |
| 3 | Individual × lote | HUB: singular = lote de 1 (mesma rota). PDV: singular sem trava prévia do título → na corrida de clique duplo a perdedora recebe **409 `titulo_alterado`** (CAS), nunca duplica; reenvio = replay 200. **Pré-existente** na main; o modal do F9 trava o botão. | Não (P3) |
| 4 | Estorno da Operações V3 | V3 usa `estornarContaReceber` da #384 → agora grava `refHistoricoIndex` (2ª via da #341 passa a recusar só o pagamento certo; antes recusava tudo). **Pré-existente, P2:** o estorno da V3 grava `estorno_recebimento_cr` sem `formaPagamento`/`refCaixaOperacaoId` e **sem saída financeira**; e o replay da V3 (`receberOSV3`) não checa operação estornada. Na combinação, estorno posterior pelo HUB num título desses é **bloqueado** (fail-closed). Nenhuma das PRs toca `lib/operacoes-v3`. | Não para #384/#341; frente própria |
| 5 | Reimpressão após estorno | `recibo-recebimento` recusa (409) o pagamento estornado e a operação de lote que contenha um item estornado; o pagamento não estornado do mesmo título segue com 2ª via | Não |

## 5. Revisão independente (contexto limpo, só leitura)

Sem P0/P1. Achados:

- **P2 pré-existente — V3 replay ignora estorno posterior** (`lib/operacoes-v3/pdv-servico-actions.ts` ~518). Correção sugerida: `operacaoEstornadaNoLedger(titulo.payload, operacaoId)` antes de `replayRecebimentoOSV3`. Frente V3.
- **P2 pré-existente — estorno da V3 sem referência de caixa e sem saída financeira** (~790). Correção: V3 chamar `estornarRecebimentoContaReceber`. Frente V3.
- **P3 da combinação (plausível, estreito)** — pagamento do HUB (sem caixa, por contrato) passa pela heurística legada de valor da #384; com uma entrada de caixa legada órfã de mesmo valor pode casar com ela (ou bloquear). Correção: marcar no ledger a origem `financeiro_hub` e tratá-la como `sem_caixa`. Encaminhar às duas PRs como follow-up.
- **P3** — `estorno_titulo` contado pela #341 e ignorado por `pagamentosAtivosDoHistorico` (#384); só alcançável se um título ESTORNADO for reaberto por `upsertContaReceber`. Encaminhar à #384.
- **P3** — inversão de ordem de trava rara (sessão que aparece depois da prévia): o Postgres detecta, nada é gravado, vira 409/503.
- **P3 pré-existente** — dedupe do PDV singular por sessão × `loteId` no ledger sem sessão.

Nenhum P0/P1/P2 decorrente da combinação → **nenhuma correção de código na branch temporária**.

## 6. Validação técnica

| Gate | Resultado |
|---|---|
| Suíte PG #384 (`test/fin-estorno-p1`) | 24/24 |
| Suíte PG #341 (`test/fin-receb-f9-print`) | 26/26 |
| Suíte PG integração (`test/fin-f9-estorno-integ`) | 14/14 (4 execuções) |
| `ops-v4-fluxo-curto-006/retirada.pg` | 18/18 |
| `recebimento-lote-lock.postgres` | 6/6 |
| `ops-v3-recebimento-misto` (todos os `*.pg.ts`, 109 testes) | main 6 ✓ / 103 ✗; integração 6 ✓ / 103 ✗ — **idêntico teste a teste** (0 novas falhas). Causa comum, pré-existente: os testes simulam a sessão antiga `{ storeAccess: "all" }` sem `allowedStoreIds`, e o `canAccessStore` atual recusa ("Sem permissão para esta unidade"). Suíte desatualizada na `main`, fora do escopo |
| Componentes/unidade Financeiro, F9, recibos, Relatórios, Caixa (Node 22) | 401 passed / 42 skipped / 0 failed (26 arquivos) |
| Vitest amplo (`app/api components/dashboard lib/caixa lib/contas-receber lib/financeiro lib/operacoes-v3 lib/pdv lib/relatorios`), Node 26, mesmo comando nas duas árvores | main 464190a: 2694 ✓ / 362 ✗; integração: 2764 ✓ / 366 ✗. **0 regressões**: as 4 a mais são testes novos da #341 em `parity-pin-keymap.component.test.ts`, que falham só no Node 26 (`localStorage` do jsdom) e passam no Node 22 |
| `npm run typecheck` (heap 6144 MB) | exit 0 |
| ESLint (43 arquivos TS alterados + suíte nova) | 0 erros, 1 warning pré-existente (`FinanceiroRealContext.tsx:837`) |
| `npm run build` | `MIGRATION_SKIPPED` · "Compiled successfully" · exit 0 (`.env` local aponta só para o PG descartável). 1ª tentativa caiu em `EPERM` no `prisma generate` porque a suíte V3 rodava em paralelo com a DLL do engine aberta — refeita sozinha |

### 6.1 Interface (E2E autenticado, app real)

Build de produção local + `next start` em `127.0.0.1:3007`, NextAuth real, banco descartável
`fin_receb_f9_qa_e2e` com a massa sintética da #341 (`qa-bootstrap.mjs`: loja QA + outra loja,
terminal PDV1, usuários ADMIN e TÉCNICO `*.test` com senha aleatória só no `.env` local).

| Spec | Resultado |
|---|---|
| `financeiro-f9-tres-layouts-001` — **PDV Clássico, Assistência e Supermercado**: F9 com caixa fechado/terminal, lista de devedores, busca nome/telefone/CPF, parcial com clique duplo, cupom 58/80 mm, 2ª via, foco; rede caída, resposta perdida, 403, 409 real, homônimos, outra loja; API TÉCNICO/loja sem vínculo → 403 | **7/7** |
| `financeiro-recebimentos-f9-print-001` — HUB parcial + comprovante, lote por cliente, 2ª via sem nova baixa; PDV Classic F9; HUB integral, lote de 3, tela de sucesso após recarga, **estorno pela UI** (`refHistoricoIndex`), 2ª via do estornado → 409 e "Reimprimir" desabilitado | **3/3** (isolado; na rodada completa o teste do PDV caiu no lock de terminal deixado pelo spec anterior — TTL 120 s) |
| `02-pdv-vendas`, `04-financeiro-v2`, `07-financeiro-relatorios-export` (smokes PDV, HUB, Relatórios) | 3/3 |
| `06-pdv-caixa-historico` | ✗ — para no seletor de terminal ("Selecionar Terminal", terminal em uso). O spec (ago/2026) não trata o seletor, nenhuma PR o toca; a #341 corrigiu o mesmo motivo no spec 02. Pré-existente por leitura de código; **não executado na main** |

**Não coberto por E2E nesta rodada:** tela de Fechamento de Caixa e Relatório Geral pela UI. Cobertos
pela consulta real (`generalAggregates` no cenário D) e pelo agregado do fechamento
(`aggregateCaixaOperacoes`) em todos os cenários PG, mais os testes de unidade de `lib/relatorios` e
`lib/caixa-fechamento-resumo` (verdes). Impressão física: não testada (spooler simulado).

## 7. Publicação da branch temporária

**Não publicada.** Nada foi enviado ao GitHub, então não há Preview desta branch. A prova de isolamento do
Preview feita para a #384 (envs genéricas de Preview → Neon QA, distintas das de Production) vale para
branches sem env própria, mas não foi refeita aqui — publicar exigiria reconferir os metadados antes.

## 8. Plano de publicação (não executado)

1. **#384 primeiro.** Merge limpo na main.
2. **#341 depois.** Sobre main+#384 o merge é limpo (provado aqui); hunk do audit no
   `FinanceiroRealContext` já igual. Sem schema/migration nas duas → merge não exige rollout de banco.
3. A #383 segue na sua frente; o único arquivo comum com a #341 (`fiscal-xsd-worker.yml`) tem hunk idêntico.

**Ajustes nas PRs originais: nenhum obrigatório.** Follow-ups recomendados (P3, não bloqueiam):
- #384 + #341: marcar no ledger a origem `financeiro_hub` do `receber-lote` e tratá-la como `sem_caixa`
  no estorno (evita a heurística legada de valor num pagamento que, por contrato, nunca entrou na gaveta).
- #384: `pagamentosAtivosDoHistorico` contar `estorno_titulo` como a #341 já faz (defesa para título reaberto).

**Frentes próprias (pré-existentes, fora destas PRs):**
- V3: replay checar `operacaoEstornadaNoLedger`; estorno da V3 passar pelo `estornarRecebimentoContaReceber`
  (forma, referência de caixa e saída financeira). P2.
- PDV singular: travar o título (`FOR UPDATE`) antes do CAS para o clique duplo concorrente virar replay. P3.
- Suíte PG da V3 e spec E2E 06 desatualizados em relação à `main` (sessão sem `allowedStoreIds`; seletor de terminal).

## 9. Veredito

- **GO técnico** para integrar na ordem `#384 → #341`: sem conflito textual, sem conflito semântico
  com perda, duplicidade, valor errado ou divergência Caixa × Financeiro; 0 regressões contra a main.
- **NO-GO Production por ora:** merge e deploy dependem de decisão humana, do CI das duas PRs
  e do smoke operacional em loja (impressão física e fechamento de caixa pela tela). Nenhuma
  migration é necessária.
