import { defineConfig, devices } from "@playwright/test"
if (!process.env.PILOT_BASE_URL) throw new Error("Use scripts/platform/run-pilot-e2e.mjs")
export default defineConfig({
  testDir: "platform-pilot", fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 120_000, expect: { timeout: 25_000 },
  reporter: [["list"], ["json", { outputFile: "../test-results/platform-pilot/report.json" }]],
  outputDir: "../test-results/platform-pilot/artifacts",
  use: { baseURL: process.env.PILOT_BASE_URL, serviceWorkers: "block", trace: "off", screenshot: "only-on-failure", locale: "pt-BR", navigationTimeout: 60_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
