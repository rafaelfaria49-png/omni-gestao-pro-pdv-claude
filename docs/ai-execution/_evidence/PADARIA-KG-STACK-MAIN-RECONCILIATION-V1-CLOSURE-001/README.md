# PADARIA-KG-STACK-MAIN-RECONCILIATION-V1-CLOSURE-001

2026-11-08 · Claude Code (Opus 5.5). Produção somente leitura: **0 escritas, 0 migrations, 0 deploys, 0 envs
alteradas, 0 merges na `main`**, venda KG desligada, nenhuma sessão de caixa tocada. Frentes #327/#334/#328/#339
não alteradas.

## Reconciliação (merge commit, sem rebase/force)

| PR | Antes | Merge da main / da base | Gate MIG-X (runbook) |
| --- | --- | --- | --- |
| #315 | `bed911a` | `9631590` = bed911a + main `ce9228c` | `df828d0` |
| #335 | `3ebbd76` | `df65d6e` = 3ebbd76 + 9631590 | `2a5a8f2` |
| #336 | `bc1c3fc` | `c082532` = bc1c3fc + df65d6e | `709c64e` |
| #337 | `7b72223` | `2238d5d` = 7b72223 + c082532 | `39a3878` + este registro |

- Zero conflitos. A main trouxe só a #339 (10 commits desde `7cac3d8`).
- Todo arquivo alterado pelo merge ficou **idêntico à main**, exceto `prisma/schema.prisma` (só as colunas KG +
  `quantidadeKg`) e `components/cadastros/lovable/components/cadastros/produto-ia.tsx` (só a formatação KG).
- sha256 inalterados: `20261025` `f07242c4…`, `20261029` `8757ee99…`, `20261106` `56ac126a…`; `07` (LF) `dea40868…`.
- `20261107120000_catalogo_aparelhos_loja` (`57b39143…`) entra pela main, idêntica.

## Migrations em PostgreSQL 17.10 descartável (127.0.0.1:55479)

| Prova | Resultado |
| --- | --- |
| Banco no estado pré-#339 (`7cac3d8`) + histórico até `20261022` → `migrate status` | pendentes: as 3 KG **e** a `20261107` → um `migrate deploy` do topo aplicaria o catálogo junto (motivo do gate MIG-X) |
| Ordem KG → catálogo | 4 aplicadas, `migrate status` em dia, `migrate diff` vs schema = 0 linhas, 5 colunas `double precision` |
| Ordem catálogo → KG | idem (objetos disjuntos; ordem indiferente) |
| Suíte KG oficial (`run-manual-kg-tests.mjs`), 2 rodadas em banco novo | **79/79 + 35** verificações (migration/Prisma315/RLS) nas duas; valores inteiros históricos preservados |
| Integração PG do catálogo (main) sobre banco migrado pela cadeia KG | **12/12** |

## Validação

| Item | Resultado |
| --- | --- |
| `npm run typecheck` | PASS (exit 0) |
| ESLint com os ignores do CI | 0 erros (85 avisos) |
| `git diff --check` | limpo |
| `prisma validate` | válido |
| Vitest dirigido (catálogo, estoque, devolução, vendas, cadastros; Node 22) | 124 arquivos, 2250 passed, 8 skipped, 0 falhas |
| Build `scripts/vercel-build.mjs` | `MIGRATION_SKIPPED`, compilado, `PROXY_PRISMA_ARTIFACT_VERIFIED` |
| E2E KG autenticado (`run-manual-kg-e2e.mjs`) | **13/13** |
| Revisão independente (subagente de contexto limpo, só leitura) | **APPROVE**; 2 P3 sem defeito da integração (mensagem de duplicidade com estoque bruto — linha de 2026-07, fora do escopo; prova cross-version anterior sem catálogo — coberta pelas provas acima) |
| Revisão cruzada Codex da #336 | **não executada**: CLI 0.166 sem cota até 2026-11-10 21:48 |

## V1 e Neon (somente leitura)

Arquivos `01`–`06`. Resumo no §11 de `docs/padaria/pesagem/KG_RELEASE_READINESS_A4_A8.md` e no §0.1 do runbook.

- Neon: identidade `omnigestao_prod` @ `ep-summer-tooth-acltc6wi` (host direto travado antes de conectar),
  `transaction_read_only=on`, todas as transações em ROLLBACK; credencial lida do arquivo local de segredos sem
  impressão (saída com URL redigida).
- Vercel: `vercel api` GET de projetos, deployments, aliases e metadados de env (sem `decrypt`; `value` descartado).
