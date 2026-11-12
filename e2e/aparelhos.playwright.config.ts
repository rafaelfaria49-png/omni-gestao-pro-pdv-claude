import { defineConfig, devices } from "@playwright/test"

/**
 * E2E autenticado de Aparelhos (OMNI-APARELHOS-ENDTOEND-001). Só pelo runner isolado
 * (`scripts/aparelhos/run-aparelhos-e2e.mjs`): build de produção + PG descartável.
 */
const baseURL = process.env.APARELHOS_E2E_BASE_URL
if (!baseURL) throw new Error("Execute pelo runner isolado (APARELHOS_E2E_BASE_URL ausente).")

export default defineConfig({
  testDir: "aparelhos",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../test-results/aparelhos-e2e/report.json" }]],
  outputDir: "../test-results/aparelhos-e2e/artifacts",
  use: {
    baseURL,
    serviceWorkers: "block",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "off",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
