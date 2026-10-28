# Revisão independente R5 — PR #315 (ESTOQUE-MANUAL-KG-001): resolução do merge com a main

Você é o revisor independente R5. Sandbox somente leitura: não altere arquivos, não faça commit, não acesse rede nem
banco. Responda em português.

## Contexto

- Repositório: OmniGestão Pro (Next.js 16, React 19, Prisma 6). Worktree atual = branch `claude/estoque-manual-kg-001`.
- R1–R3 pediram mudanças; **R4 APPROVE** no código da PR (head funcional `cdb1d19`). Depois disso só entraram commits
  de documentação (`b00b230`, `5e1feb9`).
- A main avançou para `34b70a1` (PR #317, `pdv-padaria-kg-guard-ux-003`). O merge conflitou em 4 arquivos.
- Commit a revisar: **`02bed64`** (merge). Pai 1 = `5e1feb9` (branch, revisada até R4), pai 2 = `34b70a1` (main).
  Base comum = `a288ea2`.

## O que cada lado fez com a venda por peso

- **Branch (#315):** `lib/pdv-weight-sale-guard.ts`. As rotas `/api/ops/inventory` e `/api/ops/inventory/lookup`
  projetam `vendaPesoIndisponivel: true` quando `isProductWeightDeclared(metadata)`. Seis superfícies de PDV recusam no
  `addToCart` com `pdvWeightSaleBlockedNotice`. `usePdvWeightBlockedCartGuard` limpa carrinho restaurado. O servidor
  recusa venda com KG (409, sem efeito parcial).
- **Main (#317):** as mesmas rotas projetam `vendaPorPeso: commercial.vendaPorPeso` e, se KG, `precoPorKg`, via
  `productCommercialCatalogProjection`. O `lib/pdv-scan-lookup.ts` repassa os dois. O PDV Clássico ganhou
  `blockWeightSale(...)` em todos os caminhos (addToCart, avulso, comanda importada, retomada, F4, qty, balança,
  confirmação de pagamento).
- Os dois derivam de `productCommercialFromMetadata(metadata).modoVenda === "peso"`.

## Resolução aplicada (união)

1. As duas rotas importam as duas projeções. As linhas de corpo já tinham auto-mergeado, então o item sai com
   `vendaPorPeso`, `precoPorKg` (KG) e `vendaPesoIndisponivel`.
2. `lib/pdv-scan-lookup.ts`: o tipo `LookupRow` e o mapeamento carregam os três campos.
3. `components/dashboard/vendas/pdv-classic.tsx` `addToCart`: primeiro o guard da branch
   (`pdvWeightSaleBlockedNotice`, título "Venda por peso ainda não liberada"), depois o da main (`blockWeightSale`,
   título "Venda por peso ainda não disponível"), ambos antes de qualquer checagem de estoque.

Comandos úteis: `git show 02bed64 --cc`, `git diff 5e1feb9 02bed64`, `git diff 34b70a1 02bed64`,
`git diff a288ea2 34b70a1 -- <arquivo>`.

## Já verificado pelo executor

- `npm run typecheck`: exit 0.
- Vitest: `lib/pdv-weight-sale-guard.test.ts`, `lib/pdv/weight-sale-guard-surfaces.component.test.ts`,
  `lib/pdv/classic-weight-sale-guard.component.test.ts`, `lib/pdv/inventory-commercial-guard.test.ts`,
  `lib/ops-upsert-venda-fractional.test.ts`, `lib/pdv-scan*`: 9 arquivos, 130 testes passaram.
- A suíte completa roda em paralelo.
- `prisma/` não foi tocado pelo merge.

## O que revisar

1. A resolução preserva o comportamento dos dois lados? Procure um caminho em que um produto KG/G volte a ser
   vendável, ou em que um produto UN passe a ser bloqueado.
2. Antes do merge, o `vendaPorPeso` vindo do inventário não existia na branch. Agora ele chega às 5 superfícies
   não-Clássico e aos mapeadores de catálogo (`lib/pdv-catalog.ts`, mapeadores em cada PDV). Algum caminho dessas
   superfícies usa `product.vendaPorPeso` ANTES do guard da branch? Por exemplo: abrir diálogo de peso, passo de
   quantidade 0,05, pular checagem de estoque, F4 ou alteração de quantidade, retomada de venda, comanda. Isso
   levaria a gravar quantidade fracionada ou a contornar o 409?
3. Há interação do merge com o 409 do servidor (`ops-upsert-venda`) ou com o `lib/ops-upsert-venda-fractional.test.ts`
   alterado pela main?
4. A duplicação de guard no Clássico (dois títulos diferentes) é só cosmética ou cria um defeito? Por exemplo: dois
   toasts, retorno inconsistente, `useCallback` com dependências erradas.
5. Algo mais no diff `34b70a1..02bed64` fora dos 4 arquivos que mude o comportamento da main.

## Formato da resposta

Primeira linha: `VEREDITO: APPROVE` ou `VEREDITO: REQUEST_CHANGES`.

Depois liste os achados com severidade (P0 bloqueia a produção, P1 bloqueia o merge, P2 deve corrigir, P3 é cosmético).
Para cada achado dê o arquivo:linha, o cenário concreto e a correção sugerida. Achados P2/P3 não impedem APPROVE se
você julgar que não bloqueiam. Seja específico e não invente: cite o código.
