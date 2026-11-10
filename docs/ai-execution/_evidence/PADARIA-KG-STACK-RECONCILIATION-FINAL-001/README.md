# PADARIA-KG-STACK-RECONCILIATION-FINAL-001 — ressincronização #315 → #335 → #336 → #337

2026-11-07/08 · Claude Code (Opus 5.5). **Produção não acessada**: 0 escritas, 0 migrations, 0 deploys, 0 envs alteradas,
sem merge na `main`, venda KG produtiva desligada. Nada da #315, #327, #331, #334 ou impressora foi alterado.

## Merges (merge commit, sem rebase/squash/force)

| PR | Antes | Merge | Conteúdo trazido |
| --- | --- | --- | --- |
| #335 | `406ea48` | `3ebbd76` = 406ea48 + #315 `bed911a` | só docs/evidências (A1–A6, `07` revisado, runbook); os 4 pins `ubuntu-24.04` da #338 já existiam (`8497849`) |
| #336 | `adbc66e` | `bc1c3fc` = adbc66e + `3ebbd76` | só docs |
| #337 | `1df1e79` | `2d638a4` = 1df1e79 + `bc1c3fc` | só docs; `20261106` intacta (blob `5e1771de`) |

Sem conflito textual (o "CONFLICTING" do GitHub na #335 vinha das duas bases de merge 37acc3b/104d768;
`git merge-tree --write-tree` reproduz as árvores commitadas). Código fora de `docs/` idêntico ao 1º pai nos três.

## Testes (PostgreSQL 17.10 descartável, 127.0.0.1:55479, papel `manual_kg`)

| Prova | Resultado |
| --- | --- |
| Suíte KG da #335 (`run-manual-kg-tests.mjs`) | 71/71 + 35 verificações de migration/Prisma315/RLS |
| Suíte KG do topo (#337; inclui F8×KG e `20261106`) | 79/79 + 35 |
| Mesma suíte com o `07` aplicado e validado antes (`guard-07-kg-suite/`) | 79/79 + 35; 5 CHECKs `convalidated` ao fim; 30 saldos fracionados gravados sem `23514` |
| `07` sobre banco já povoado pela suíte KG | ADD + VALIDATE sem erro (30 saldos fracionados, 80 movimentos) |
| Vitest completo #335 (Node 22) | 11.413 testes; 76 suítes falham **igual na main `7cac3d8`** na mesma máquina (`vitest-baseline/`, conjunto idêntico, 298 testes em ambos): DB não configurado, CRLF em testes estáticos, xmllint/java ausentes |
| Typecheck | #335 PASS; #337 PASS (cobre o código da #336) |
| Lint (mesmos ignores do CI) | 0 erros |
| Build #337 | `MIGRATION_SKIPPED`, compilado, `PROXY_PRISMA_ARTIFACT_VERIFIED` (`build-337.txt`) |
| E2E KG #337 (`run-manual-kg-e2e.mjs`, banco com `07` ativo) | 13/13 (`e2e-manual-kg-337.txt`); `KG_BROWSER_ERROR … 'waiting'` é pré-existente (PWA sem SW no headless) |

Harness do `07`: cópia do runner oficial em `test-results/` (ignorado) — diff em `guard-07-kg-suite/runner-diff.txt`.
Para o `ADD CONSTRAINT` as três tabelas de estoque passam a `omni_owner` e voltam a `manual_kg` logo depois
(a precondição da `20261029` exige dono = `current_user`).

## Segurança dos Previews (somente leitura)

- As três branches **não** têm override de env: usam o Preview genérico `DATABASE_URL`/`DIRECT_URL`
  (`CAgFUTJYNOJb64j1`/`WfY0iLLQ8cbQOXHd`), sem alteração desde a P3 (2026-10-27), que os apontou ao projeto Neon
  isolado do Preview (outra org). Overrides de banco só existem para outras branches (inclusive `pr315-kg` da #315).
- `scripts/vercel-build.mjs` + `migration-authority-guard.mjs`: Preview sempre `MIGRATION_SKIPPED`.

## Revisão independente

`INDEPENDENT_REVIEW.md` — APPROVE_WITH_LIMITATIONS (texto desatualizado no plano A4–A8, corrigido neste commit).
