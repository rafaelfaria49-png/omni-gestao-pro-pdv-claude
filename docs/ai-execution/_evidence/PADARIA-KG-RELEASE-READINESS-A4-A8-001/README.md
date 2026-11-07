# PADARIA-KG-RELEASE-READINESS-A4-A8-001 — evidências

Documento principal: [`docs/padaria/pesagem/KG_RELEASE_READINESS_A4_A8.md`](../../../padaria/pesagem/KG_RELEASE_READINESS_A4_A8.md).
Roteiro das lojas: [`docs/padaria/pesagem/KG_RELEASE_CHECKLIST_DONO.md`](../../../padaria/pesagem/KG_RELEASE_CHECKLIST_DONO.md).

```text
PRODUCTION_ACCESS=NO · PRODUCTION_WRITES=0 · PRODUCTION_MIGRATIONS=0 · PRODUCTION_DEPLOY=NO · VERCEL_CHANGES=0
MERGE=NO · NEON_BRANCHES_CREATED=0 · REAL_CUSTOMER_DATA=0 · SALE_SERVER_NUMBERING_ENABLED=untouched
```

| Pasta / arquivo | Conteúdo |
| --- | --- |
| `harness/run-cross-version.mjs` | orquestrador: cluster PG 17 descartável (loopback, `--auth=trust`, porta 55493), topologia `neondb_owner`→`neon_superuser`→`pg_write_all_data`, schema da main, 01/02, fase antiga, corte 03–06 com sessão pendurada, J8, 99, aditivas, J10, fase nova, KG sob papéis reais, Redeploy Int com/sem 07, custo dos gatilhos e equivalência |
| `harness/cross-version.phase.ts` | fases `old` (código da main), `new` (topo da pilha), `old-after` (Int com credencial nova) — o mesmo arquivo roda no Vitest de cada worktree |
| `harness/kg-topology.phase.ts` | venda KG como `omni_runtime_v2` com funções SECURITY DEFINER de `omni_owner` |
| `harness/title-guard-equivalence.sql` | equivalência exata do corpo novo × original (2.304 combinações) |
| `harness/trigger-overhead.sql` | custo dos gatilhos com 30.000 vendas sintéticas, antes/depois/sem gatilho |
| `cross-version-run-05/` | **execução conclusiva**: cadeia main `37acc3b` → J4 (`ff3870d4…`) → #335 `406ea48` → topo; 07 revisado do A6 (`dea40868…`); `cross-version-summary.json` traz commits/árvores das versões e SHA-256 LF de scripts e migrations |
| `cross-version-run-04/`, `cross-version-run-03/` | execuções anteriores só main → topo (04 com o 07 revisado, 03 com o original `a407ff7f…`); mesmo resultado |
| `kg-suite-79/` | suíte oficial `scripts/pdv/run-manual-kg-tests.mjs` com a `20261106`: 79/79 + 35 verificações de compatibilidade (o `migration.json` é anterior à correção do rótulo `newMigrations` no runner; a lista de migrations aplicadas já incluía a `20261106`) |
| `reused-evidence-manifest.txt` | SHA-256 das evidências reaproveitadas (106 arquivos só em disco na worktree da #315) |
| `INDEPENDENT_REVIEW.md` | revisão independente de contexto limpo |
| `J4_TREE_PROBE.md` | verificação local da árvore main + #315 que o J4 publicaria |

Reprodução (Node 22, PostgreSQL 17 em `C:/Program Files/PostgreSQL/17/bin`, duas worktrees com `node_modules`
e `prisma generate`):

```bash
KG_ROLLOUT_07=<caminho do 07 revisado> node harness/run-cross-version.mjs <main 37acc3b> <árvore J4 main+#315> <#335 406ea48> <esta branch> <dir descartável> <dir de saída>
```

O orquestrador remove do ambiente dos filhos qualquer variável `PG*`, `DATABASE_URL`, `DIRECT_URL`, `NEON*`,
`VERCEL*`, confere identidade (banco/usuário/porta/loopback) em cada fase e recusa diretório de cluster não vazio.
As senhas sintéticas são geradas em memória e mascaradas nos JSON.
