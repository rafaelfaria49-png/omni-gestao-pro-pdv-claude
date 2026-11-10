# Revisão independente R1 — PADARIA-KG-F8-INTEGRACAO-SEGURA-001

Você é o revisor independente (somente leitura). NÃO edite arquivos, NÃO faça commit/push, NÃO acesse rede nem bancos. Leia o código da worktree atual (git) e emita um veredito.

## Contexto
Repositório OmniGestão (Next.js 16 + Prisma 6 + PostgreSQL). Branch `claude/padaria-kg-f8-integracao-segura-001`, HEAD `17dffc7`, criada a partir de `406ea48` (PR #335: venda manual por peso KG + estoque KG, empilhada sobre #315). Integra a PR #331 (F8 troca/devolução, head `b0de724`) por merge (`d8254c2`) + um commit de adaptação (`17dffc7`).

Comandos úteis: `git diff 406ea48..HEAD`, `git diff b0de724..HEAD`, `git show d8254c2 --stat`, `git show 17dffc7`, `git diff 406ea48 b0de724 -- <arquivo>`.

Contratos a preservar:
- #335/#315: `ItemVenda.quantidade` é `Int?` — linha KG grava `quantidade = NULL` e `quantidadeKg` (Decimal, até 3 casas). Venda KG tem `payload.manualKgSale = "classic-manual-kg-v1"`. Migration `20261029120000_manual_kg_sale_quantity` cria triggers (`manual_kg_guard_return`, `manual_kg_guard_return_item`, `manual_kg_guard_finance_sale`, `manual_kg_guard_credit_use`...) que exigem `set_config('omni.manual_kg_writer','additive-v2')` em escritas que referenciam venda KG, e recusam qualquer devolução de venda KG. Cálculo monetário em centavos inteiros, baixa fracionada em milésimos.
- Política: devolução/troca de venda KG BLOQUEADA (`DEVOLUCAO_KG_BLOQUEADA`), reembolso em dinheiro BLOQUEADO (`REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA`), devolução sem venda de origem no servidor (SEM_RECEBIMENTO) BLOQUEADA. A venda KG confirmada só sai pelo cancelamento integral autorizado.
- #331: escritor único `lib/pdv/devolucao/registrar-devolucao.ts` (lock FOR UPDATE na venda, teto por item, idempotência por localId pós-lock, vale pelo valor pago, sem saída financeira), elegibilidade no servidor, fila offline com recusa definitiva × aguardar, encaminhamento ao Financeiro, cancelamento com lock + bloqueio de devolução concorrente.

## Foco da revisão
1. `app/api/ops/devolucao/route.ts` — resolução do conflito (escritor da #331 + mapeamento 409 dos erros KG).
2. `app/api/vendas/[id]/cancelar/route.ts` — um lock só, releitura completa `venda = current`, ramo KG (`enterManualKgTransaction`, sessão de caixa ABERTA, fechamento) e verificações F8 (devolução concorrente, vale × pago com vale/prazo). Ordem e semântica corretas? Algo da #331 ou da #335 se perdeu?
3. `components/dashboard/vendas/trocas-devolucao.tsx` — trava KG nos botões somada a `enviando`/recuperação; algum caminho (teclado, recuperação de troca, fila) contorna a trava?
4. `lib/pdv/devolucao/registrar-devolucao.ts`, `elegibilidade.ts`, `product-keys.ts`, `pendencia-financeiro.ts` — leitura de `quantidade` anulável; bloqueio da venda KG inteira; `PRODUTO_COMERCIAL_INVALIDO`; replay/idempotência; concorrência; identidade histórica (SKU alterado/reutilizado); isolamento por loja.
5. `lib/operations-store.tsx` — `DEVOLUCAO_RECUSA_DEFINITIVA` e o espelho local (estoque local de troca UN não pode alterar saldo KG; `kgReturnBlocked`).
6. Qualquer outro leitor de `ItemVenda.quantidade`/`ItemDevolucaoVenda` introduzido pela #331 que trate `null` como 0 de forma insegura.
7. Testes: `lib/pdv/devolucao/f8-venda-kg.pg.test.ts` (novo) e `scripts/pdv/run-manual-kg-tests.mjs` — cobrem o que dizem? Falsos positivos?

Resultados locais já obtidos (PG17 descartável 127.0.0.1:55479): runner KG 78/78 (inclui 7 novos), mutação sem a trava KG reprova 3; suíte F8 `troca-imediata.pg.test.ts` 31/31 contra schema com a migration KG; 12 arquivos unit/component 225/225; eslint dos arquivos alterados limpo.

## Saída exigida
Markdown curto:
- `VEREDITO: APPROVE | APPROVE_WITH_LIMITATIONS | REQUEST_CHANGES`
- Lista de achados com severidade P0/P1/P2/P3, arquivo:linha, cenário concreto de falha e correção sugerida. Só achados verificados no código; diga explicitamente quando algo é especulativo.
- Riscos residuais fora do escopo técnico (produção, autorização) em 3–5 linhas.
