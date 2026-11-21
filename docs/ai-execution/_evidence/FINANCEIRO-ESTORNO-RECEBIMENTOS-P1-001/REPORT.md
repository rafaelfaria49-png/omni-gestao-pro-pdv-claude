# FINANCEIRO-ESTORNO-RECEBIMENTOS-P1-001 — Relatório

Base: `origin/main` **464190a**. Branch exclusiva `claude/financeiro-estorno-recebimentos-p1-001`.
Sem schema, sem migration, sem acesso ao banco produtivo. A PR #341 não foi tocada.

## Causas raiz

| # | Defeito | Onde |
|---|---------|------|
| A1 | Estorno lançava a **soma de todas as entradas** do título, não o pagamento estornado | `estornarMovimentacaoPorReferencia` (`movimentacoes-service.ts`) |
| A2 | Qualquer estorno anterior fazia o próximo **pular inteiro** (idempotência por "já existe estorno") | idem |
| A3 | `ultimo_pagamento` **não pulava pagamentos já estornados** — o 2º estorno revertia o MESMO pagamento | `estornarContaReceber` (`contas-receber-service.ts`) |
| A4 | Heurística de parcial "soma gravada ≥ valor ⇒ retry" **descartava a entrada da 2ª parcial menor** (100 e depois 50 → só 100 no financeiro); reliquidar após estorno também era descartado | `createMovimentacaoEntradaFromReceber` chamado por `pdv/receber-conta` e `financeiro/receber` |
| B1 | Estorno pelo Financeiro **nunca tocava o Caixa** — a entrada `recebimento_cr` do PDV ficava na gaveta | `PATCH /api/financeiro/receber op=estornar` |
| B2 | `POST contas-receber/estornar-ultimo-pagamento` reescrevia só o ledger (sem movimentação, sem caixa, sem trava de período) | rota |
| B3 | Ledger, movimentação e caixa em passos separados com `.catch` (falha parcial silenciosa) | rota `financeiro/receber` |

## Contratos alterados

- **Identidade do pagamento** = índice da entrada em `payload.historico` (append-only). `estorno_pagamento.refHistoricoIndex` aponta para ela — o mesmo contrato que a #341 usa na 2ª via (`pagamentosDoLedger`).
- `estornarContaReceber`: novo `pagamentoIndex` opcional; escolhe o último pagamento **ativo**; recusa `pagamento_ja_estornado` e `historico_ambiguo` (estorno sem referência / duplicado / valor divergente).
- Novo `estornarRecebimentoContaReceber` (`lib/financeiro/services/estorno-recebimento-service.ts`): uma `$transaction` — trava sessões de caixa (FOR SHARE) → trava o título (FOR UPDATE) → ledger → saída exata → compensação de caixa. Recusas lançam `EstornoRecebimentoError` (nada gravado).
- `estornarMovimentacaoDePagamentoReceber`: saída = valor do pagamento, limitada ao líquido movimentado acima do que o ledger ainda diz recebido (legado sem entrada nunca gera saída sem entrada; `divergente` sinaliza).
- `estornarMovimentacaoPorReferencia`: estorna o **líquido** restante (originais − estornos já lançados); idempotente.
- `PATCH /api/financeiro/receber` `op=estornar`: aceita `pagamentoIndex` e `recebidoEsperado`; resposta ganha `valorEstornado`, `pagamentos[]` (índice, valor, compensações de caixa). Códigos: `estornar_<code>` com 404/409/422.
- `POST /api/pdv/receber-conta`: `CaixaOperacao.payload.historicoIndex` (identidade do pagamento no caixa); entrada financeira com `idempotenciaDoChamador` (a idempotência é o `localId` na mesma transação).
- Financeiro HUB (`FinanceiroRealContext`): envia `recebidoEsperado` (o recebido que o operador viu) e recarrega também na falha; correção da indexação do audit por `localKey` (hunk idêntico ao da #341).

### Localização da entrada de caixa do pagamento
1. Identidade gravada: `historicoIndex`, ou `loteId` do ledger = `idempotencyKey` (lote) / `operacaoId` (V3) / sufixo do `localId`. N operações com a mesma identidade (V3 dividido por forma) valem juntas só se a soma livre = pagamento.
2. Legado sem identidade: casa por valor só se nº de entradas livres com aquele valor = nº de pagamentos ativos com aquele valor e forem intercambiáveis (sessão, forma, origem).
3. Qualquer outra configuração (inclusive entrada livre que nenhum pagamento explica, ou estorno de caixa legado sem referência) = **bloqueio** `caixa_identidade_insuficiente`.
4. Sessão de origem **FECHADA** = bloqueio `caixa_sessao_fechada` com orientação (devolução no caixa atual + conciliação). Sessão fechada nunca é editada.

## Provas RED/GREEN

PostgreSQL 17 descartável em loopback (`127.0.0.1:55493`, cluster no scratchpad, bancos `fin_estorno_p1_qa*`).
Comando: `FIN_ESTORNO_TEST_DATABASE_URL=postgresql://pgqa@127.0.0.1:55493/fin_estorno_p1_qa npx vitest run --config test/fin-estorno-p1/vitest.pg.config.ts`

- **RED** (`origin/main` 464190a, mesma suíte de 19 cenários): **19/19 falham** por asserção de negócio — `red-origin-main.txt`.
- **GREEN** (esta branch): **24/24** (19 + 5 dos achados da revisão).

| Cenário obrigatório | Teste |
|---|---|
| 1 pagamento único + estorno | `1.` |
| 2/3 dois parciais, estorno só do 2º (300 → 100 + 50 → estorno 50 → saldo 200, saída 50) | `2+3.` |
| 4 estorno posterior do 1º | `4.` |
| 5 estornar de novo o mesmo pagamento | `5.`, `5b.`, `R1.` |
| 6/7 recebimento PDV com caixa aberto, estorno pelo Financeiro | `1.`, `2+3.`, `6+7.` |
| 8 recebimento direto no Financeiro HUB | `8.` |
| 9 lote com múltiplos títulos | `9.` |
| 10 concorrência recebimento × estorno | `10a.`, `10b.`, `R5.` (lote × estorno) |
| 11 falha simulada na transação (trigger no insert de caixa) | `11.` |
| 12 caixa fechado | `12.` |
| 13 cliente/título de outra loja | `13.` |
| 14 legado com identidade insuficiente | `14a.`–`14d.`, `R2.`–`R4.` |
| extra: cancelamento de venda após estorno parcial | `estorno por referência…` |
| extra: modo título completo | `modo título completo…`, `R2.` |

Invariante verificada em cada cenário: ledger líquido = movimentações (entradas − estornos) e `aggregateCaixaOperacoes` (base do fechamento) = o que segue recebido pelo caixa.

## Validação

| Gate | Resultado |
|---|---|
| `test/fin-estorno-p1` (PG) | 24/24 |
| `test/ops-v3-recebimento-misto` (PG, inclui estorno V3 e estorno pelo Financeiro) | 18/18 |
| `test/ops-v4-fluxo-curto-006/retirada.pg.test.ts` (PG) | 6/6 |
| `recebimento-lote-lock.postgres.test.ts` (PG) | 6/6 |
| Vitest das áreas Financeiro/PDV/Caixa/Vendas/Relatórios/Operações V3 | 1962 passed / 298 failed / 57 skipped — **idêntico** a `origin/main` teste a teste (0 novas falhas; as 298 são pré-existentes, ex. mock sem `storeIdFromAssistecRequestForRead` em `recebimento-lote.test.ts`) |
| `npm run typecheck` | exit 0 |
| ESLint (arquivos alterados) | 0 erros (1 warning pré-existente em linha não tocada) |
| `npm run build` | ver PR |

## Compatibilidade com a #341
Mesmo contrato `refHistoricoIndex`/`loteId`; `operacaoEstornadaNoLedger` e `pagamentosDoLedger` da #341 continuam corretos (estornos agora sempre referenciados). Conflitos de merge esperados: `app/api/pdv/receber-conta/route.ts` (hunks vizinhos, mesma região) e `FinanceiroRealContext.tsx` (hunk do audit é idêntico ao da #341). O `receber-lote` novo da #341 grava `loteId` no ledger e no caixa → coberto pela regra 1.

## Riscos residuais (não corrigidos — fora do escopo ou exigem decisão)
1. `PATCH op=parcial` não tem chave de idempotência: um duplo envio duplica ledger **e** movimentação (antes duplicava só o ledger — divergência). A trava de UI (`busy`) cobre o clique duplo; retry de rede não.
2. `PATCH liquidar/parcial` gravam a movimentação fora de transação e engolem falha (pré-existente).
3. `estornarRecebimentoOSV3` (Operações V3) segue gravando `estorno_recebimento_cr` sem `refCaixaOperacaoId` e sem saída financeira; e estorno pelo HUB de título de OS não atualiza o espelho `pagamentoV3` da OS.
4. Títulos legados já atingidos pelo defeito A3 (dois estornos no mesmo índice) ficam **bloqueados** (`historico_ambiguo`) — exigem conciliação manual.
5. Tela legada `components/dashboard/financeiro/contas-receber.tsx` (localStorage + `contas-receber/estornar` só-auditoria) não foi alterada.
