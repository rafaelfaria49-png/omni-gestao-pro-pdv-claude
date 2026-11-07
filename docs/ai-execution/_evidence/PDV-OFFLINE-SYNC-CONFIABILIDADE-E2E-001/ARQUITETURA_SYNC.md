# ARQUITETURA_SYNC

## Peças
| Peça | Arquivo | Papel |
|---|---|---|
| Motor puro | `lib/vendas/sale-sync-engine.ts` (novo) | prazo (`fetchTextWithTimeout`), prova (`confirmedSaleEvidence`), códigos do cliente, desfecho legível, backoff, conectividade útil, bloqueio de meios offline, estado operacional (`operatorSaleSyncView`), união entre abas (`mergeSalesFromOtherTab`) + lápides, Web Locks (`withSaleSyncLock`). |
| Classificação | `lib/vendas/pending-sync-classification.ts` | + `AUTH_REQUIRED` / `RESPOSTA_INCONCLUSIVA` / `SEM_CONEXAO` (AUTO_RETRY), `PERMISSION_DENIED` (ACTION_REQUIRED); mensagens específicas para os códigos de negócio do GOAL. |
| Store | `lib/operations-store.tsx` | serviço comum de sync: finalização, automático e manual passam por `persistPendingSale` → `settlePersistResponse`. |
| UI | `pdv-pending-sync-badge.tsx`, `vendas-arquivo-geral.tsx`, `fechamento-caixa-modal.tsx` | painel, histórico/detalhe, ciência no fechamento. |
| SW | `next.config.mjs` | `by-client-sale-id` e `venda-persist/v2` (GET) `NetworkOnly`. |

## Identidade
`clientSaleId` (`cs_` + UUID) gerado **uma vez** na finalização, gravado com a venda inteira no
`localStorage` **antes** do primeiro envio. Referência provisória `PEND-…` até o servidor alocar `VDA-…`.
Toda tentativa (finalização, automática, manual, outra aba) usa a MESMA identidade. O servidor é
idempotente por `(storeId, clientSaleId)`.

## Uma tentativa
```
offline (navigator.onLine=false) ── manual: SEM_CONEXAO na hora, sem fetch
        │                           automático: nem tenta
online ─┬─ manual: [Verificando] GET by-client-sale-id (10 s)
        │     ├─ 200 com a venda → CONFIRMADA (JA_EXISTIA_NO_SERVIDOR), sem POST
        │     ├─ rede/prazo     → "Nada foi enviado", venda preservada
        │     ├─ 401            → AUTH_REQUIRED
        │     └─ 404/403/5xx    → segue
        └─ [Enviando] POST venda-persist/v2 (25 s)
              ├─ 2xx + venda da mesma loja/identidade → CONFIRMADA
              ├─ 2xx sem prova → consulta por clientSaleId → confirma ou RESPOSTA_INCONCLUSIVA
              ├─ 4xx com code  → desfecho de negócio (REJEITADA / EXIGE_CORRECAO / QUARENTENA)
              ├─ 401/403 sem code → AUTH_REQUIRED / PERMISSION_DENIED
              └─ rede/prazo/5xx → resultado DESCONHECIDO, mesma identidade (SEM_RESPOSTA/SEM_CONEXAO/SERVIDOR_INDISPONIVEL)
```
Cada desfecho grava na própria venda: `syncLastAttemptAt`, `syncLastAttemptSource` (manual/auto/finalize),
`syncLastAttemptOutcome`, `syncAttemptCount`; confirmação grava `syncConfirmedAt`.

## Reenvio automático
Gatilhos: montagem do provider, `online` (zera backoff), aba visível, foco, intervalo de 30 s.
Só AUTO_RETRY; backoff por venda (rede 15 s, servidor 30 s, sessão 60 s, dobrando até 5 min);
single-flight entre abas por Web Locks em modo `try` (se outra aba envia, esta não envia). Manual usa
modo `wait` (até 30 s) e ignora backoff. Recusa de negócio nunca entra em loop.

## Fila entre abas
Gravação = união monotônica com o blob atual: pendência só da outra aba entra; confirmação vence
pendência; nada daqui é removido; só sai o que tem lápide (`omnigestao:pdv-sale-tombstones:{loja}`,
gravada ANTES de remover: descarte verificado no servidor ou recusa definitiva na finalização).
O evento `storage` aplica a mesma união na outra aba, sem F5.

## Decisão: localStorage, não IndexedDB
Avaliado. Mantido `localStorage` porque: (1) a gravação síncrona antes do `fetch` é exatamente a
garantia pedida ("identidade persistida ANTES da primeira tentativa") — IndexedDB é assíncrono e
exigiria transação + espera antes do envio em todos os PDVs; (2) a fila já existente vive ali e uma
migração em P0 é risco de perda; (3) os modos de falha (quota, corrupção, sobrescrita entre abas)
foram tratados diretamente. Limite: ~5 MB por origem; o blob inclui o histórico local de vendas.
Registrado em `RISCOS_REMANESCENTES.md`.

## Coalescência (duplo clique × venda nova)
Uma finalização só reaproveita uma pendente se o carrinho daquela tentativa ainda está **aberto nesta
aba** (`openSaleAttemptsRef`). Cancelar/Limpar nos 4 PDVs chama `releaseSaleAttempt`; recarregar a
página ou outra aba também encerra. Duplo clique concorrente segue protegido por `finalizeInFlightRef`.
