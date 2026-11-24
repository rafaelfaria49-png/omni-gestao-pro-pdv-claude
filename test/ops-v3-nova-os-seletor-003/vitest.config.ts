import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPERACOES-V3-NOVA-OS-SELETOR-003 — runner dedicado (jsdom): seletor "Novo atendimento"
// da V3, Nova OS em modo orçamento e Retorno / Garantia pela OS original, com as
// Server Actions V3 espiãs. A suíte global segue intocada. Aliases do hub Lovable
// (`@/api/*`, `@/types/*`) espelham o tsconfig.json, como em ops-datas-retroativas-001.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/api\/(.*)$/, replacement: resolve(root, "components/operacoes/lovable/api/$1") },
      { find: /^@\/types\/(os|estoque|loja|venda|servico|atendimento)$/, replacement: resolve(root, "components/operacoes/lovable/types/$1") },
      { find: /^@\//, replacement: `${root.replace(/\\/g, "/")}/` },
      { find: "server-only", replacement: resolve(root, "test/server-only.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["test/ops-v3-nova-os-seletor-003/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    testTimeout: 60_000,
    css: false,
  },
});
