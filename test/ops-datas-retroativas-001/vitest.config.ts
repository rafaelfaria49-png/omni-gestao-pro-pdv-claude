import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — runner dedicado dos testes MONTADOS (jsdom).
// Lista fechada desta tarefa; a suíte global (environment node) segue intocada.
// Os aliases do hub Lovable (`@/api/*`, `@/types/*`) espelham o `tsconfig.json`:
// as telas da V3 importam `@/api/clientes` em tempo de execução.

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
    include: ["test/ops-datas-retroativas-001/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "generated/**", "e2e/**"],
    testTimeout: 20_000,
    css: false,
  },
});
