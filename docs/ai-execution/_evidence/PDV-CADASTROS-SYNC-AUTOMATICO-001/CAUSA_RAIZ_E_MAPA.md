# CAUSA_RAIZ_E_MAPA — PDV-CADASTROS-SYNC-AUTOMATICO-001

Base: `0ddd5a7` (head do PR #324, empilhado). `origin/main` = `35a3971` (inalterada).

## Por que era preciso F5

1. **O catálogo do PDV só carregava uma vez.** `lib/operations-store.tsx#loadDb` roda quando o
   provider monta, ou seja, ao trocar de loja ou dar F5. O provider fica no layout do dashboard, então
   navegar de Cadastros para Vendas na mesma aba **não** recarregava nada. Não havia versão, intervalo,
   foco, nem aviso entre abas.
2. **A identidade da linha era mutável.** O catálogo usa `id = sku.trim() || cuid`
   (`app/api/ops/inventory/route.ts#rowToItem`). O carrinho guardava esse `id`. Editar o SKU depois
   que o item entrou no carrinho deixava a linha apontando para um código que o servidor já não
   resolvia. O #324 passou a enviar `produtoId`, mas o buscava no catálogo **no momento da
   finalização**: com catálogo velho, a busca falhava do mesmo jeito.
3. **Rejeição definitiva virava pendência eterna.** O #324 resolveu isso só para
   `PRODUTO_NAO_RESOLVIDO`. Estoque insuficiente, caixa fechado, pagamentos divergentes e similares em
   venda nova continuavam virando PENDING congelado, e a guarda de identidade travava as vendas seguintes.

## Mapa de escritas de `Produto` (servidor)

| Caminho | Operação | Mexe em |
|---|---|---|
| `lib/cadastros/product-write-service.ts` (via `app/actions/cadastros.ts#upsertProduto`, `POST /api/produtos`, `PATCH /api/produtos/[id]`) | criar/editar | nome, SKU, código, preço, custo, categoria, ativo, metadata |
| `app/actions/cadastros.ts#deleteProduto`, `DELETE /api/produtos/[id]` | excluir | — |
| `POST /api/produtos/bulk-action` (inativar/excluir), `POST /api/produtos/bulk-delete` | lote | ativo / exclusão |
| `app/actions/inventario.ts` (contagem, ajuste, zeragem) → `lib/estoque/stock-ledger-service.ts` | estoque | `stock`, `precoCusto` (via `tx.produto.update`) |
| `PUT /api/ops/inventory/import` | importação | vários |
| `lib/os-itens-stock.ts` | O.S. consome/devolve | `stock` |
| writer de venda (`ops-upsert-venda` → ledger) | baixa de venda | `stock` |
| `PUT /api/ops/inventory` | — | **410 (quarentenado)** |

Todas passam pelo Prisma (`create`/`update`/`delete`/`updateMany`); o único `$queryRaw` do ledger é um
lock de leitura. `updatedAt` é `@updatedAt`. Por isso `count + max(updatedAt)` por loja muda a cada
criação, edição (inclusive de estoque) e exclusão, **sem migration**.

## Mapa de chamadores no cliente (aviso imediato `notifyCatalogChanged`)

| Tela | Sucesso que avisa |
|---|---|
| Cadastros HUB — editor (`produto-ia.tsx`) | salvar; também salvamento incerto (`SAVE_ERROR`) |
| Cadastros HUB — listagem (`CadastrosHub.tsx`) | inativar/reativar, excluir, inativar em lote, ação em lote |
| Estoque — gestão de produtos (`gestao-produtos.tsx`) | salvar, excluir, excluir em lote |
| Inventário — relatórios (`inventario-relatorios.tsx`) | ajuste/zeragem aplicados |
| Inventário — cadastro rápido (`inventario-cadastro-rapido-submit.ts`) | produto criado |

Sem aviso imediato (cobertos pela versão no foco ou no intervalo): importador de dados externos,
criação de produto pela O.S. (`OsPageClient`), baixas por venda e por O.S. de outros terminais.

## Carregamento e cache do catálogo no PDV (antes → depois)

| | Antes | Depois |
|---|---|---|
| Carga inicial | `loadDb` no mount do provider | igual + versão conhecida |
| Mesma aba (Cadastros → Vendas) | nenhuma | aviso local + check ao montar o PDV |
| Outra aba | nenhuma | BroadcastChannel (+ `storage` como fallback) → snapshot na hora |
| Outro aparelho | nenhuma | versão no foco, na volta da aba, na volta da rede e a cada 30 s com a aba visível |
| Refresh pós-descarte | `fetch` solto, sem proteção de ordem | controlador (resposta mais nova vence, por loja) |
| Service worker | NetworkFirst em `/api/*` | inalterado: online vai à rede; offline devolve a versão antiga → "sem mudança" (seguro) |
