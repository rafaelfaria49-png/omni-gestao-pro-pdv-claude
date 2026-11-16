import { defineConfig, devices } from "@playwright/test"
const baseURL = process.env.VESTUARIO_P02_E2E_BASE_URL
if (!baseURL) throw new Error("Execute somente pelo runner P03 isolado.")
export default defineConfig({
  testDir: "vestuario-p03", fullyParallel: false, forbidOnly: true, retries: 0, workers: 1, timeout: 240_000,
  expect: { timeout: 30_000 }, reporter: [["list"], ["json", { outputFile: "../test-results/vestuario-p03-e2e/report.json" }]],
  outputDir: "../test-results/vestuario-p03-e2e/artifacts",
  use: { baseURL, serviceWorkers: "block", navigationTimeout: 60_000, actionTimeout: 30_000, screenshot: "only-on-failure", trace: "off", locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
