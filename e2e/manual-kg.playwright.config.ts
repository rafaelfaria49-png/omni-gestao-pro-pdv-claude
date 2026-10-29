import { defineConfig, devices } from "@playwright/test"
if (process.env.MANUAL_KG_E2E_ORIGIN !== "http://localhost:31479") throw Error("USE_MANUAL_KG_ISOLATED_RUNNER")
export default defineConfig({ testDir: "manual-kg", fullyParallel: false, workers: 1, retries: 0, timeout: 90000, expect: { timeout: 20000 },
 reporter: [["list"], ["json", { outputFile: "../test-results/manual-kg/e2e.json" }]], outputDir: "../test-results/manual-kg/e2e-artifacts",
 use: { baseURL: process.env.MANUAL_KG_E2E_ORIGIN, serviceWorkers: "block", trace: "off", screenshot: "only-on-failure", locale: "pt-BR", navigationTimeout: 60000 },
 projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
