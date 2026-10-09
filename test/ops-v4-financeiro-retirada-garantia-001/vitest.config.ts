import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — runner dedicado: equivalência (node),
// superfícies montadas (jsdom, `buildVals` real) e integração PostgreSQL
// descartável (o .pg.test.ts declara ambiente node e falha com
// BLOQUEIO_EXPLICITO_PG sem banco `ops_v4_frg_qa*` — nunca skip). Lista fechada,
// sem passWithNoTests; arquivos em sequência. A suíte global segue intocada.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": resolve(root, "test/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "test/ops-v4-financeiro-retirada-garantia-001/*.test.ts",
      "test/ops-v4-financeiro-retirada-garantia-001/*.test.tsx",
    ],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    css: false,
  },
});
