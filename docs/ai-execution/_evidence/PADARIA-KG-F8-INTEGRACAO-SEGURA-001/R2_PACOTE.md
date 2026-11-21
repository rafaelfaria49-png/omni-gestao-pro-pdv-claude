# Revisão independente R2 — PADARIA-KG-F8-INTEGRACAO-SEGURA-001

Você é o revisor independente (somente leitura). NÃO edite arquivos, NÃO faça commit/push, NÃO acesse rede nem bancos. Leia o código da worktree atual (git) e emita um veredito.

## Contexto
Repositório OmniGestão (Next.js 16 + Prisma 6 + PostgreSQL). Branch `claude/padaria-kg-f8-integracao-segura-001`, HEAD `3e2e795`, criada a partir de `406ea48` (PR #335: venda manual por peso KG + estoque KG, empilhada sobre #315). Integra a PR #331 (F8 troca/devolução, head `b0de724`) por merge (`d8254c2`) + um commit de adaptação (`17dffc7`).

Comandos úteis: `git diff 406ea48..HEAD`, `git diff b0de724..HEAD`, `git show d8254c2 --stat`, `git show 17dffc7`, `git diff 406ea48 b0de724 -- <arquivo>`.

Contratos a preservar:
- #335/#315: `ItemVenda.quantidade` é `Int?` — linha KG grava `quantidade = NULL` e `quantidadeKg` (Decimal, até 3 casas). Venda KG tem `payload.manualKgSale = "classic-manual-kg-v1"`. Migration `20261029120000_manual_kg_sale_quantity` cria triggers (`manual_kg_guard_return`, `manual_kg_guard_return_item`, `manual_kg_guard_finance_sale`, `manual_kg_guard_credit_use`...) que exigem `set_config('omni.manual_kg_writer','additive-v2')` em escritas que referenciam venda KG, e recusam qualquer devolução de venda KG. Cálculo monetário em centavos inteiros, baixa fracionada em milésimos.
- Política: devolução/troca de venda KG BLOQUEADA (`DEVOLUCAO_KG_BLOQUEADA`), reembolso em dinheiro BLOQUEADO (`REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA`), devolução sem venda de origem no servidor (SEM_RECEBIMENTO) BLOQUEADA. A venda KG confirmada só sai pelo cancelamento integral autorizado.
- #331: escritor único `lib/pdv/devolucao/registrar-devolucao.ts` (lock FOR UPDATE na venda, teto por item, idempotência por localId pós-lock, vale pelo valor pago, sem saída financeira), elegibilidade no servidor, fila offline com recusa definitiva × aguardar, encaminhamento ao Financeiro, cancelamento com lock + bloqueio de devolução concorrente.

## R2 — o que mudou desde R1
Sua R1 (REQUEST_CHANGES) apontou: P1 identidade ambígua em `lib/pdv/devolucao/product-keys.ts`; P2 espelho local em `lib/operations-store.tsx` (`inventoryMatchesDevLine`); P2 referência KG zerada em `lib/pdv/devolucao/pendencia-financeiro.ts`. Correções no commit `3e2e795` (`git show 3e2e795`), cada uma provada RED com o código antigo e GREEN depois:
- P1: códigos do payload sem vínculo inequívoco viram `ambiguo` e só resolvem por Produto.id/chave exata. Teste PG "NOME repetido entre produtos + SKU herdado" em `troca-imediata.pg.test.ts`.
- P2: correspondência estrita com `produtoId` (sem fallback por SKU) e nenhuma compensação em produto `vendaPorPeso`/`vendaPesoIndisponivel`. Teste de componente em `fila-devolucao-provider.component.test.ts`.
- P2: linha KG entra na referência pelo valor pago da linha. Teste PG em `f8-venda-kg.pg.test.ts`.
Resultados: troca-imediata.pg 32/32; runner KG 79/79; unit/component 226/226; typecheck 0; E2E KG autenticado 13/13 (antes das correções R1, que não tocam o fluxo E2E da venda KG).

## Pedido
1. Verifique se as três correções fecham os achados sem regressão: repetição legítima do mesmo produto em linhas; SKU alterado/removido; replay idempotente; espelho local quando o snapshot não tem `dbId`.
2. Faça uma passada nova, completa, nos arquivos da integração (`git diff 406ea48..HEAD`), procurando P0/P1/P2 restantes.

## Saída exigida
- `VEREDITO: APPROVE | APPROVE_WITH_LIMITATIONS | REQUEST_CHANGES`
- Achados P0–P3 com arquivo:linha, cenário concreto e correção. Só o que for verificado; marque o que for especulativo.
- Riscos residuais em 3–5 linhas.
