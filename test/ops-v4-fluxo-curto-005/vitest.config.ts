import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-V4-FLUXO-CURTO-005 — runner dedicado: bloco "Próxima ação" montado (jsdom)
// + integração PostgreSQL descartável (o .pg.test.ts declara ambiente node e
// falha com BLOQUEIO_EXPLICITO_PG sem banco local — nunca skip). Lista fechada,
// sem passWithNoTests. A suíte global (vitest.config.ts) permanece intocada.

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
    include: ["test/ops-v4-fluxo-curto-005/*.test.tsx", "test/ops-v4-fluxo-curto-005/*.pg.test.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    testTimeout: 30_000,
    css: false,
  },
});
