# Auditoria somente leitura em Production — 2026-11-25 00:57 UTC

Autorizada pelo proprietário. Banco `omnigestao_prod` (confirmado por `current_database()`),
sessão com `default_transaction_read_only=on` + `BEGIN TRANSACTION READ ONLY` … `ROLLBACK`.
Credencial passada ao `psql` só por variáveis de ambiente; saída redigida (host/usuário/senha).
**Nenhuma escrita.** Script: `auditoria-venda-000760-readonly.sql` + complemento abaixo.

## VDA-L01-2026-000760 (loja-1 · RAFACELL ASSISTEC · L01)

| Fato | Valor no banco |
|---|---|
| Venda | `concluida`, R$ 119,90, 21/11/2026 15:25 (BRT), cartão de crédito 119,90, sem cliente |
| Sessão de caixa | `cmwqhfve…` (terminal `cmpkfba8…`), aberta 11:07, **FECHADA** 18:10 BRT de 21/11, saldoFinal 636,89, sem contagem |
| Linha 0 | `CONTROLE DE VIDEO GAME PS4 WIRELESS`, qtd 1, `itemType=produto`, `produtoId=cmpevc3i…` (cadastrado, ativo). `inventoryId` = SKU do produto. `qtyReturned` no payload = 0 |
| Devoluções da venda | **0** |
| Devoluções da loja-1 (toda a história) | **1** — `DEV-2026-0001`, de 22/05/2026, venda `VDA-2026-0005` |
| Créditos / usos de crédito (21–24/11) | **0 / 0** |
| Venda com X-360 após a original | **0** (nenhuma, em qualquer data) |
| Vendas com `creditoVale` desde 01/11 | **0** |
| Estoque PS4 | saída −1 (1→0) pela venda; nenhuma entrada depois. Saldo atual **0** |
| Estoque X-360 (`cmpevc4dq…`) | nenhuma movimentação; saldo atual **1** |
| Financeiro | só a entrada de 119,90 da venda; **nenhum** lançamento de R$ 10,00, saída ou estorno |
| Operações de caixa (21–22/11) | nenhuma |

## Diagnóstico

**Devolução apenas local, nunca persistida (categoria 2).** O produto é cadastrado (não é avulso — hipótese descartada).

- O modal mostrava "Devolvido 1" porque o terminal gravou a devolução no `localStorage` (`qtyReturned=1`).
- No servidor não há documento, crédito, estoque nem financeiro: a devolução **não existe**.
- Causa mais provável: colisão do número local. Um terminal sem devoluções anteriores em 2026 gera
  `DEV-2026-0001`; esse número **já existe** na loja-1 (maio). A rota antiga respondia `ok/idempotente`
  e o terminal marcava a devolução como sincronizada — ela sumia sem erro. (Alternativa: o POST nem
  chegou ao servidor. O resultado no banco é o mesmo; só o `localStorage` do terminal distingue.)
- Sem o crédito no servidor, a nova venda com vale de R$ 119,90 não podia ser gravada → a troca não concluiu.
- A venda segue `concluida` porque nenhuma devolução foi persistida.

**Consequência:** qualquer terminal da loja-1 cuja primeira devolução de 2026 recebeu `DEV-2026-0001`
perdeu essa devolução em silêncio. Só existe 1 devolução gravada na loja desde maio — outras podem
estar só nos navegadores.

## Estado real × sistema (a reconciliar)

| Item | Físico (segundo o proprietário) | Sistema hoje |
|---|---|---|
| PS4 | voltou para a loja | estoque 0 |
| X-360 | entregue ao cliente | estoque 1 |
| R$ 10,00 | recebidos em dinheiro em 21/11 | sem registro |
| Venda 000760 | trocada | `concluida`, sem devolução |

## VDA-L01-2026-000767

Linhas `CABO DE AUDIO P2 PARA P2 KAIDI KD-29` e `CABO DE CELULAR USB LIGHTNING 2 METROS KAIDI`:
sem campos `sku`/`barcode` no snapshot. O `inventoryId` de cada linha guarda o **código operacional
da época** (SKU, ex.: `KD-327A`). O EAN existe só no **cadastro atual** (os dois produtos têm `sku` e
`barcode` preenchidos). O painel novo mostra o código gravado na venda e o EAN do cadastro atual,
rotulado como tal.
