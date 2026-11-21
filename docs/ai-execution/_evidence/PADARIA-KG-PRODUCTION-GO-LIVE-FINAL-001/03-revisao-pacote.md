# Revisão independente (R) — reconciliação da pilha KG com a main 5126589

Você é revisor independente, somente leitura. NÃO edite arquivos, NÃO rode git commit/push, NÃO conecte em banco.
Repositório: worktree atual (branch `claude/padaria-kg-release-readiness-a4-a8-001`, HEAD `7baa625`).

## Contexto
Pilha de PRs empilhadas: main → #315 (estoque KG) → #335 (venda manual KG) → #336 (F8 trocas KG) → #337 (docs/readiness).
A main avançou 79 commits (vestuário P02 com variantes, aparelho por IMEI serializado, compat, revogação de sessão).
Foram feitos 3 merges de reconciliação; revise SOMENTE a resolução de conflitos e a integração semântica:

1. `b51e5ec` (main → #315). Conflitos: `lib/estoque/stock-ledger-service.ts`, `lib/cadastros/product-commercial-contract.ts`,
   `app/api/ops/inventory/route.ts`, `lib/pdv-catalog.ts`, `lib/operations-store.tsx`, 5 PDVs (`pdv-supermercado`,
   `pdv-assistencia-enterprise`, `pdv-venda-completa-enterprise`, `venda-completa-enterprise`, `PdvBlackEdition`),
   `CadastrosHub.tsx`, `eslint.config.mjs`. Comando: `git show --cc b51e5ec` e `git diff b51e5ec^1 b51e5ec -- <arquivo>`.
2. `828bb6d` (#315 → #335). Conflitos: `app/api/ops/devolucao/route.ts`, `app/api/ops/inventory/route.ts`,
   `app/api/vendas/[id]/cancelar/route.ts`, `app/api/vendas/[id]/corrigir-itens/route.ts`, `lib/operations-store.tsx`,
   `lib/ops-upsert-venda.ts`, `lib/pdv-catalog.ts`.
3. `dbb4c51` (#335 → #336). Além dos conflitos, as travas de aparelho por IMEI que a main colocou na rota antiga de
   devolução foram PORTADAS para o escritor único `lib/pdv/devolucao/registrar-devolucao.ts` (a #336 moveu a escrita
   para lá). Confira se a proteção da main (recusa fail-closed, nada gravado, 409 `APARELHO_DEVOLUCAO_NAO_INTEGRADA`)
   continua equivalente para devolução E troca F8, e se a ordem relativa às travas KG está correta.

## O que procurar (prioridade)
- Trava perdida de qualquer lado (KG ou vestuário/IMEI) em algum caminho de escrita (estoque, venda, devolução, cancelamento, correção).
- Ordem de validação que deixe gravar parcialmente antes de recusar.
- Variável/escopo errado (ex.: `input` vs `cmd` no stock-ledger), tipos opcionais somados que mudem contrato.
- Mudança semântica acidental em contratos existentes (UN, venda normal, F8 UN, aparelho).
- Migrations: confirme que a pilha não altera nenhuma migration da main (só acrescenta 20261025, 20261029, 20261106, 20261108).

## Formato da resposta
Veredito: APPROVE | APPROVE_WITH_NOTES | REQUEST_CHANGES.
Lista de achados com severidade (P0–P3), arquivo:linha, cenário concreto de falha. Sem achados = diga explicitamente.
