import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

// FINANCEIRO-F9-ESTORNO-INTEGRACAO-ISOLADA-001 — integração #384 + #341 em PostgreSQL REAL.
// `*.pg.ts` fica fora do include global. Sem leitura de `.env`: a URL vem só do processo, e o
// teste exige loopback + banco `fin_integ_qa*` e FALHA explicitamente (nunca pula).

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const url = process.env.FIN_INTEG_TEST_DATABASE_URL ?? ""
// As três chaves apontam para o MESMO banco descartável — nunca herdam outro ambiente.
const env: Record<string, string> = url ? { FIN_INTEG_TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url } : {}

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/fin-f9-estorno-integ/*.pg.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**", ".claude/worktrees/**"],
    env,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
