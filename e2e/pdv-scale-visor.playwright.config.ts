import { defineConfig } from "@playwright/test"
import { resolve } from "node:path"

export default defineConfig({
  testDir: "./specs", testMatch: "pdv-scale-visor.spec.ts", fullyParallel: false, workers: 1, retries: 0,
  reporter: "line", outputDir: resolve(__dirname, "../test-results/pdv-scale-visor"), timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4179", browserName: "chromium", serviceWorkers: "block",
    launchOptions: process.env.PDV_TEST_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PDV_TEST_CHROMIUM_EXECUTABLE } : {},
  },
  webServer: {
    command: "node --import tsx e2e/fixtures/pdv-core.ts --serve --scale-visor",
    cwd: resolve(__dirname, ".."), url: "http://127.0.0.1:4179/health", reuseExistingServer: false, timeout: 180000,
  },
})
