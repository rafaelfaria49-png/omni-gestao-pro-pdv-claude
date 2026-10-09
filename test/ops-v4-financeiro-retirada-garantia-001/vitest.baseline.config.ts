import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — runner do GERADOR do baseline de
// equivalência (só `*.gerar.ts`). Fora do test_command: roda uma única vez,
// antes da mudança na projeção, e o resultado é versionado.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["test/ops-v4-financeiro-retirada-garantia-001/*.gerar.ts"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
  },
});
