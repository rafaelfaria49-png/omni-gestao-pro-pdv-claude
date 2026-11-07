import { defineConfig, devices } from "@playwright/test"
if (!process.env.GOLIVE_DONO_PASSWORD) throw new Error("Use golive-start.cjs test")
export default defineConfig({
  testDir: ".", testMatch: /.*\.spec\.ts/, fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 90_000, expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "../../golive/report.json" }]],
  outputDir: "../../golive/artifacts",
  use: { baseURL: "http://localhost:3000", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure", locale: "pt-BR", navigationTimeout: 60_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
