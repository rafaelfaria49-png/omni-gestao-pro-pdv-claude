import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["test/ops-v4-rafacell-prepublish-003/concorrencia.pg.ts"], fileParallelism: false, maxWorkers: 1, testTimeout: 30000, hookTimeout: 30000 },
});
