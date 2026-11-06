# Revisão independente R3 — PADARIA-KG-F8-INTEGRACAO-SEGURA-001

Você é o revisor independente (somente leitura). NÃO edite arquivos, NÃO faça commit/push, NÃO acesse rede nem bancos. Leia o código da worktree atual (git) e emita um veredito.

## Contexto
Repositório OmniGestão (Next.js 16 + Prisma 6 + PostgreSQL). Branch `claude/padaria-kg-f8-integracao-segura-001`, HEAD `065bdf5`, criada a partir de `406ea48` (PR #335: venda manual por peso KG + estoque KG, empilhada sobre #315). Integra a PR #331 (F8 troca/devolução, head `b0de724`) por merge (`d8254c2`) + um commit de adaptação (`17dffc7`).

Comandos úteis: `git diff 406ea48..HEAD`, `git diff b0de724..HEAD`, `git show d8254c2 --stat`, `git show 17dffc7`, `git diff 406ea48 b0de724 -- <arquivo>`.

Contratos a preservar:
- #335/#315: `ItemVenda.quantidade` é `Int?` — linha KG grava `quantidade = NULL` e `quantidadeKg` (Decimal, até 3 casas). Venda KG tem `payload.manualKgSale = "classic-manual-kg-v1"`. Migration `20261029120000_manual_kg_sale_quantity` cria triggers (`manual_kg_guard_return`, `manual_kg_guard_return_item`, `manual_kg_guard_finance_sale`, `manual_kg_guard_credit_use`...) que exigem `set_config('omni.manual_kg_writer','additive-v2')` em escritas que referenciam venda KG, e recusam qualquer devolução de venda KG. Cálculo monetário em centavos inteiros, baixa fracionada em milésimos.
- Política: devolução/troca de venda KG BLOQUEADA (`DEVOLUCAO_KG_BLOQUEADA`), reembolso em dinheiro BLOQUEADO (`REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA`), devolução sem venda de origem no servidor (SEM_RECEBIMENTO) BLOQUEADA. A venda KG confirmada só sai pelo cancelamento integral autorizado.
- #331: escritor único `lib/pdv/devolucao/registrar-devolucao.ts` (lock FOR UPDATE na venda, teto por item, idempotência por localId pós-lock, vale pelo valor pago, sem saída financeira), elegibilidade no servidor, fila offline com recusa definitiva × aguardar, encaminhamento ao Financeiro, cancelamento com lock + bloqueio de devolução concorrente.

## R3 — o que mudou desde R2
R1 (P1 identidade ambígua; P2 espelho local KG; P2 referência KG) → `3e2e795`. R2 (P1 replay × período fechado; P2 confirmação da fila sem valores autoritativos; P2 `withPendingDevolucaoStock` somando UN em KG; P2 centavos perdidos em parciais) → `065bdf5` (`git show 065bdf5`). Cada correção foi provada RED com o código anterior e GREEN depois:
- Rota `app/api/ops/devolucao/route.ts`: `classifyDevolucaoAfterUniqueConflict` roda para TODO tipo antes de política/período/sessão. Tela `trocas-devolucao.tsx`: recusa classificada "aguardar" mantém o mesmo localId; "recusada"/"reidentificar" limpam.
- `lib/operations-store.tsx` (`aplicarRespostaDevolucao` confirmada): `creditIssued`, `lines[].valor/produtoId` e o saldo local do titular (por diferença) seguem o corpo 200 do servidor. `withPendingDevolucaoStock` usa `inventoryMatchesDevLine`.
- `lib/pdv/devolucao/registrar-devolucao.ts`: `valorItem = round2(round2(pagoLinha*(anterior+qty)/vendido) − jaRestituidoItem)`, mínimo 0, com o teto global da venda mantido.
Testes: troca-imediata.pg 34/34; runner KG 79/79; component trocas 15/15 e fila 11/11; typecheck 0. CI do head anterior `3e2e795`: 10/10 verdes.

## Pedido
1. Confirme que as correções da R2 fecham os achados sem regressão (replay idempotente × LOCAL_ID_CONFLITO; período fechado para intenção nova; valor do vale com desconto; teto global; devolução total → status `devolvida`; saldo local quando o servidor reconcilia a diferença; legado sem `produtoId`).
2. Faça uma passada final completa em `git diff 406ea48..HEAD` procurando P0/P1/P2 restantes. Seja estrito com severidade: P0/P1/P2 só para falha concreta, reproduzível pelo código, com efeito em dinheiro, estoque, identidade ou perda de dado. Comportamento herdado igual ao da #331 isolada, sem efeito financeiro, é P3.

## Saída exigida
- `VEREDITO: APPROVE | APPROVE_WITH_LIMITATIONS | REQUEST_CHANGES`
- Achados P0–P3 com arquivo:linha, cenário concreto e correção. Só o que for verificado; marque o que for especulativo.
- Riscos residuais em 3–5 linhas.
