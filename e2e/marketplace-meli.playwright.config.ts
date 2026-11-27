import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.MELI_E2E_BASE_URL
if (!baseURL || !/^https:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) {
  throw new Error("Execute pelo runner isolado do Marketplace.")
}

export default defineConfig({
  testDir: "marketplace-meli",
  outputDir: "../test-results/marketplace-meli/playwright",
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
    serviceWorkers: "block",
    trace: "off",
    video: "off",
    launchOptions: { executablePath: process.env.MELI_E2E_BROWSER_PATH },
  },
})
