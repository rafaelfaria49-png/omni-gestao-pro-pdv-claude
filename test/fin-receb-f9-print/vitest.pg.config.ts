import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — integração em PostgreSQL REAL.
//
// `*.pg.ts` fica fora do include global (`**/*.test.ts`): a suíte global nunca roda
// estes testes sem banco. Variáveis só do ambiente do processo (sem `.env`); o próprio
// teste exige loopback + banco `fin_receb_f9_qa*` e FALHA explicitamente se não estiver.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/fin-receb-f9-print/*.pg.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**", ".claude/worktrees/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
