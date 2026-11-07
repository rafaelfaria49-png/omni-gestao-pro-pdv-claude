# Nota de versionamento (T1 da #315, 2026-11-07)

Só a **Fase 1 (A2)** deste registro é versionada na #315: `README.md`, `01-a2-validacao.txt` e
`harness/a2-credenciais.cjs`. O A2 é passo do runbook do estoque KG (A1–A6).

A **Fase 2** (prontidão do cliente padaria) é outro escopo e fica **só em disco** na worktree
`.worktrees/estoque-manual-kg-001`, intacta: `harness/golive.spec.ts`, `harness/golive.playwright.config.ts`,
`harness/golive-start.cjs`, `harness/seed-golive.mjs` e `telas/01..06-*.png`. Motivo técnico adicional: o
`golive.spec.ts` foi escrito para rodar de outra pasta; versionado aqui, ele quebrava o `tsc` (imports relativos) e
seria coletado pelo Vitest (`**/*.spec.ts`).

Os SHA-256 de todos os arquivos (versionados ou não) estão no `reused-evidence-manifest.txt` da PR #337.
