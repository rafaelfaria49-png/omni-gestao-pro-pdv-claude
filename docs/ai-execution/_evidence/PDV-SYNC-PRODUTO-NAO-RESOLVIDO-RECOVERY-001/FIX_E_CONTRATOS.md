# FIX_E_CONTRATOS — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Sem mudança de schema Prisma, migration, auth, proxy ou rota nova.

## 1. Identidade estável do produto na linha (`produtoId`)

- `lib/operations-store.tsx` (`finalizeSaleTransaction`): linhas `produto` recebem
  `produtoId = InventoryItem.dbId` do catálogo da loja. Serviço/avulso/O.S. não recebem.
- `lib/operations-sale-types.ts`: `SaleLineRecord.produtoId?`.
- `lib/ops-upsert-venda.ts`: `productResolutionKey(line)`.
  - `produtoId` presente → `findFirst({ storeId, id: produtoId })` **somente**. Não encontrado ⇒
    `UnresolvedProductError` (sem cair para SKU — o SKU antigo pode pertencer hoje a outro produto).
  - ausente (payload legado, pendências antigas) → OR `id|sku|barcode` inalterado.
  - mapa de resolução e agregação de baixa usam a mesma chave; `ItemVenda.inventoryId` continua o cuid.
- Linhas virtuais continuam isentas antes de qualquer lookup.
- Fingerprint de replay (`legacy-sale-fingerprint.ts`) não lê `produtoId` → retry idêntico não muda.

Contrato: cliente antigo × servidor novo = comportamento legado. Cliente novo × servidor antigo =
campo extra ignorado (sanitizador preserva campos; resolução legada). Deploy sem ordem obrigatória.

## 2. `PRODUTO_NAO_RESOLVIDO` na finalização = FAILED (não PENDING)

Só quando a identidade (`clientSaleId`) foi criada NESTA chamada (`!reusedIdentity`). Identidade
reaproveitada do mapa compartilhado de tentativas pode estar PENDING em outra aba; nesse caso o
retorno PENDING antigo é mantido (achado F1 da revisão).

`lib/operations-store.tsx` (`finalizeSaleTransaction`, logo após o `persistPendingSale` da tentativa
nova): com `code === "PRODUTO_NAO_RESOLVIDO"`:
- remove do estado só a linha `syncPending` desta tentativa (`saleMatches` por `clientSaleId`/id) e
  limpa o `persistedSaleAttempt`;
- recarrega o catálogo (`refreshInventoryFromServer`);
- devolve `{ ok: false, reason }` com "Venda NÃO registrada — nada foi gravado no servidor…" e a linha.

Por que é seguro: o servidor faz replay por `clientSaleId`/`pedidoId` antes de resolver produtos, e o
409 sai de dentro da transação (rollback total, numeração inclusa). A tentativa nunca teve efeito
local (`localEffectsApplied: false`). O carrinho e a sessão ficam intactos; a guarda de identidade
não é registrada (FAILED), então a próxima venda não trava.

Fora do escopo do FAILED: o **Reenviar** de pendência já existente e o auto-retry — continuam
PENDING. Pendência existente nunca é apagada.

## 3. Diagnóstico acionável

- `lib/vendas/sale-client-sync.ts`: `parseSalePersistError` extrai `inventoryIds` do 409 (máx. 20,
  128 chars cada, só strings).
- `SaleRecord.syncUnresolvedInventoryIds` gravado em `markSaleBlocked` só quando o 409 traz (falha de rede
  posterior não apaga), limpo em `clearSaleSyncFailure`.
- Rota V1 (`app/api/ops/venda-persist/route.ts`) passa a devolver `inventoryIds` no 409, como a V2.
- `lib/vendas/pending-sync-classification.ts`: `UNRESOLVED_PRODUCT_CODE`,
  `unresolvedSaleLineLabels(lines, refs)` (usa as linhas da PRÓPRIA venda), copy nova
  ("Item: X (código Y). … A venda não foi gravada no servidor." + "Regularize em Cadastros … e use
  Reenviar desta mesma venda. Não finalize de novo.").
- `components/dashboard/vendas/pdv-pending-sync-badge.tsx`: motivo amarrado à venda; em
  ACTION_REQUIRED mostra `Venda <ref> de dd/mm hh:mm:`. Sem nome/CPF de cliente.
- Linha não resolvida que JÁ carrega `produtoId` (`unresolvedLinesCarryStableId`) ⇒ o produto foi
  excluído: o banner diz que recadastrar o código não recupera a venda e aponta o administrador.

## 4. Preflight da recuperação de quarentena alinhado ao writer

`lib/vendas/quarantine-recovery-service.ts#readProductFacts` agrupa por `productResolutionKey`
(exportada de `ops-upsert-venda.ts`) e consulta `{ storeId, id }` quando há `produtoId` — o preview
não bloqueia o que o writer grava nem confere saldo contra o produto que hoje ocupa o SKU antigo.

## Não alterado (relatado, fora do escopo)

- Devolução (`app/api/ops/devolucao/route.ts:211`), cancelamento (`app/api/vendas/[id]/cancelar/route.ts:332`),
  corrigir-itens ainda resolvem por `payload.lines[].inventoryId`
  (SKU). Mesma fragilidade a SKU editado depois da venda; podem passar a preferir `produtoId` em GOAL próprio.
- Ferramenta de revínculo explícito de linha de pendência a outro produto (com seleção do operador e
  auditoria) — não implementada.
- Caminhos sem `enforceStock` (`sync-legacy-vendas`, recuperação histórica): `produtoId` de produto
  excluído agora grava a venda sem baixa (só log), onde antes o SKU poderia casar um produto recriado.
  Aceito: é o comportamento fail-closed desejado contra falso match (achado F7).
- Logs do servidor (`console.warn` com `inventoryIds`) não aparecem nos request logs da Vercel;
  correlação por request-id não adicionada.
