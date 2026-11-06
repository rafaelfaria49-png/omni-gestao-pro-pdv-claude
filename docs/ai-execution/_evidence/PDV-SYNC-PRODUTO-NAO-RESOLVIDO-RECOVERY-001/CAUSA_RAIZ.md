# CAUSA_RAIZ — PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001

Referências de linha em `origin/main@35a3971c` (código servido em produção).

## Cadeia real do erro

1. **Catálogo do PDV** — `app/api/ops/inventory/route.ts:90`: `id = sku.trim() || row.id`, `dbId = row.id`.
   O carrinho usa `id` como `inventoryId` (`pdv-classic.tsx` `pushCartLine({ inventoryId: product.id })`).
   Ou seja: **quando o produto tem SKU, a identidade enviada é o SKU, que é editável no Cadastro.**
2. **Linha da venda** — `lib/operations-sale-line.ts:50`: o `SaleLineRecord` guarda só `inventoryId`.
   O `dbId` (cuid estável) que o cliente conhece **nunca era enviado**.
3. **Servidor** — `lib/ops-upsert-venda.ts:975-980`: resolve `Produto` por
   `{ storeId, OR: [id, sku, barcode] = inventoryId }`. Sem casamento, em fluxo ao vivo
   (`enforceStock`), `:1041` lança `UnresolvedProductError` → V2 responde
   `409 { code: "PRODUTO_NAO_RESOLVIDO", inventoryIds }` (`app/api/ops/venda-persist/v2/route.ts:198`).
   A transação inteira (numeração inclusa, `sale-writer-v2.ts`) reverte: **nada é gravado**.
4. **Cliente transforma rejeição definitiva em pendência eterna** — `lib/operations-store.tsx:2733-2771`:
   qualquer falha de `persistPendingSale` devolve `{ ok: true, pending: true }`. A venda fica
   `syncPending` com payload **congelado** (o operador não consegue "revisar o item" nela).
5. **Reenviar** — `doRetrySyncSale` reenvia o mesmo payload → mesmo 409, para sempre
   (classificado ACTION_REQUIRED, então sem loop automático — só manual).
6. **Novas vendas travadas** — `pdv-classic.tsx:1532/2210`: `pendingSaleIdentityRef.isUnresolved(sales)`
   bloqueia abrir pagamento/confirmar enquanto a identidade registrada em `:2353` estiver pendente.
   O carrinho da venda pendente permanece na tela (contrato PENDING). Só "Cancelar venda" (`:2074`)
   libera a guarda.
7. **UX** — o 409 traz `inventoryIds`, mas `parseSalePersistError` descartava; o banner dizia
   "Revise o item e reenvie a mesma venda" (`pending-sync-classification.ts:179`) — ação impossível
   numa pendência congelada — e não dizia qual venda nem qual linha.

## Classificação

| Parte | Status | Prova |
|---|---|---|
| Deadlock "pendência eterna + novas vendas bloqueadas" para `PRODUTO_NAO_RESOLVIDO` | **CONFIRMADO** (código) | itens 4–6; teste estático em `lib/vendas/produto-nao-resolvido-recovery.test.ts` |
| Identidade mutável (SKU) como chave de resolução; `dbId` estável não enviado | **CONFIRMADO** (código) | itens 1–3; `lib/ops-upsert-venda-produto-identidade.test.ts` reproduz SKU editado → 409 na base |
| Qual mudança de cadastro disparou ESTE incidente (SKU editado, produto excluído, SKU com espaço legado, etc.) | **NÃO PROVADO** | exige o `inventoryId` da pendência (só no navegador do operador) ou leitura de `estoque_produtos` em produção — leitura de produção foi **negada pela política de permissões** desta sessão |

Hipóteses para o gatilho, em ordem de plausibilidade (nenhuma afirmada como fato):
H1 SKU do produto alterado no Cadastro depois que o PDV carregou o catálogo; H2 produto excluído
ou movido; H3 SKU legado com espaço (catálogo usa `trim()`, servidor compara exato) — o writer
canônico atual normaliza, mas importações antigas podem não ter normalizado.

Refutadas: linhas `comp-`/`voice-` (o guard do cliente `findUnresolvedSaleLines` bloquearia antes
do envio); serviço/avulso/O.S. (são virtuais, `isVirtualSaleLine`); erro de loja (catálogo e escrita
usam o mesmo `storeId` do `storageKey`).

## Evidência de produção (somente leitura, request logs Vercel)

Respostas `POST /api/ops/venda-persist/v2` em 2026-11-01 (UTC): 409 às 15:03:17–15:03:20, 15:09:35,
15:10:30, 15:10:45, 15:10:55, 15:11:50, 15:40:53–15:40:54; 200 às 15:04:20, 15:07:09, 15:07:44,
15:09:16, 15:16:31, 15:20:38, 15:39:40. O corpo/código do 409 e o `console.warn` não aparecem nos
request logs, então **não está provado** que todos os 409 são `PRODUTO_NAO_RESOLVIDO`, nem de qual
terminal/loja vieram. Os 200 intercalados mostram que vendas foram gravadas no período (de qual
terminal, não provado).
