import { defineConfig } from "@playwright/test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export default defineConfig({
  testDir: "./specs", testMatch: "pdv-core-n5.spec.ts", fullyParallel: false, workers: 1, retries: 0,
  reporter: "line", outputDir: join(tmpdir(), "pdv-n5-c-playwright"),
  timeout: 45000,
  maxFailures: 1,
  use: { baseURL: "http://127.0.0.1:4179", browserName: "chromium", viewport: { width: 1440, height: 1100 }, serviceWorkers: "block" },
  webServer: { command: "node --import tsx e2e/fixtures/pdv-core.ts --serve", cwd: resolve(__dirname, ".."), url: "http://127.0.0.1:4179/health", reuseExistingServer: false, timeout: 180000 },
})
