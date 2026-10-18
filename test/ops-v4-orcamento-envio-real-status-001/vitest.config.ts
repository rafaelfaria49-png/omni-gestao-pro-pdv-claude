import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export default defineConfig({
  resolve: { alias: { "@": root, "server-only": resolve(root, "test/server-only.ts") } },
  test: { environment: "jsdom", include: ["test/ops-v4-orcamento-envio-real-status-001/*.test.tsx"], fileParallelism: false, css: false },
});
