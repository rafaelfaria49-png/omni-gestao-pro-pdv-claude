import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  cacheDir: "test/pesagem/.artifacts/vite",
  test: { environment: "node", include: ["test/pesagem/**/*.test.ts"], maxWorkers: 1, cache: false },
})
