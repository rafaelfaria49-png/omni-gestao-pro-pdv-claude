import { defineConfig } from "@playwright/test"
const port = Number(process.env.PESSOAS_TEST_PORT)
if (!Number.isInteger(port) || port < 1024 || !process.env.PESSOAS_HOMOLOGATION_DATABASE_URL) throw new Error("E2E_ISOLAMENTO_AUSENTE")
export default defineConfig({
  outputDir: process.env.PESSOAS_E2E_ARTIFACTS,
  testDir: ".", testMatch: "frontend.e2e.ts", workers: 1, retries: 0, forbidOnly: true,
  timeout: 90_000, expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: process.env.PESSOAS_E2E_REPORT }]],
  use: { baseURL: "http://127.0.0.1:" + port, viewport: { width: 1440, height: 900 }, trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port " + port,
    url: "http://127.0.0.1:" + port + "/login", reuseExistingServer: false, timeout: 120_000,
  },
})
