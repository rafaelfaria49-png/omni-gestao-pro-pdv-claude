import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-V4-FLUXO-CURTO-007 — runner dedicado: fluxo Retorno / Garantia montado (jsdom,
// hook real da V4 + seletor real, actions "use server" espiãs) + integração PostgreSQL
// descartável (o .pg.test.ts declara ambiente node e falha com BLOQUEIO_EXPLICITO_PG
// sem banco local — nunca skip). Lista fechada, sem passWithNoTests; arquivos em
// sequência (a concorrência mede travas reais no banco). A suíte global segue intocada.

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
    include: ["test/ops-v4-fluxo-curto-007/*.test.tsx", "test/ops-v4-fluxo-curto-007/*.pg.test.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    css: false,
  },
});
