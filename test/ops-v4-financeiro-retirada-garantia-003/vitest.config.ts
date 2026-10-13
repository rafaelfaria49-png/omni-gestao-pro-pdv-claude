import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({ resolve: { alias: { "@": root, "server-only": root + "test/server-only.ts" } }, test: { environment: "jsdom", include: ["test/ops-v4-financeiro-retirada-garantia-003/*.test.tsx"], fileParallelism: false, css: false } });
