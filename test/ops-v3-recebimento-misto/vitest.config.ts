import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-V3-RECEBIMENTO-MISTO-A-PRAZO-001 — runner dedicado dos testes MONTADOS (jsdom).
// Lista fechada desta tarefa; a suíte global (environment node) segue intocada.

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
    include: ["test/ops-v3-recebimento-misto/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    testTimeout: 15_000,
    css: false,
  },
});
