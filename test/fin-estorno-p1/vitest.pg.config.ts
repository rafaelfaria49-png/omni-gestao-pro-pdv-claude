import { defineConfig } from "vitest/config"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { parse } from "dotenv"

// FINANCEIRO-ESTORNO-RECEBIMENTOS-P1-001 — runner dedicado da integração PostgreSQL.
// `*.pg.ts` fica fora do include global; o teste exige loopback + banco `fin_estorno_p1_qa*`
// e FALHA explicitamente (nunca pula) se o ambiente não estiver pronto.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const envFile = resolve(root, ".env")
const local = existsSync(envFile) ? parse(readFileSync(envFile)) : {}
const url = process.env.FIN_ESTORNO_TEST_DATABASE_URL ?? local.FIN_ESTORNO_TEST_DATABASE_URL ?? ""
// As três chaves apontam para o MESMO banco descartável — nunca herdam o `.env` de produção.
const env: Record<string, string> = url
  ? { FIN_ESTORNO_TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url }
  : {}

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/fin-estorno-p1/*.pg.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    env,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
