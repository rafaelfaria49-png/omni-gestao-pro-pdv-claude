# Sonda local da árvore que o J4 publicaria (main + #315)

- `git merge-tree --write-tree 37acc3b 104d768` → árvore `ff3870d429f4859740e1d9704dbe8b2c8bbbd599`, **sem conflito**,
  159 arquivos de diferença em relação à main.
- Commit local **não publicado** `e058d9c` (pais `37acc3b`, `104d768`) só para testar; worktree temporária
  `.worktrees/kg-readiness-j4-probe`, removida ao final.
- `prisma generate` + `tsc --noEmit` (Node 22, heap 4 GB): **0 erros**.
- Vitest em `lib/estoque`, `lib/ops-upsert-venda*`, `app/api/ops/inventory`, `app/api/ops/venda-persist`,
  `lib/vendas/sale-sync*`, `lib/pdv/pending*`, `scripts/backfill-deposito*`: **531/548**; as 4 falhas são de
  `app/api/ops/inventory/import/route.canonical-014.test.ts` (403 em vez de 200/400) e **falham igual na main
  `37acc3b`** e no topo da pilha → pré-existentes, não introduzidas pela #315 (13 restantes não executados: skip/todo do próprio Vitest).
- A mesma árvore rodou como versão "#315" no ensaio run-05 (replay entre versões), PASS.

**Limite:** isto não substitui a CI do head exato da #315 depois da reconciliação (T2): a CI roda E2E,
postgres-integration e build da Vercel que não foram reproduzidos aqui.
