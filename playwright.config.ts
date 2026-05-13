import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const authFile = path.join(__dirname, "e2e", ".auth", "storage.json")

/**
 * E2E leve — Fase 1.
 *
 * Pré-requisitos:
 * - `.env` com `DATABASE_URL` + NextAuth (`AUTH_SECRET`, `NEXTAUTH_URL`, etc.)
 * - `PLAYWRIGHT_E2E_PASSWORD` ou `ADMIN_DEFAULT_PASSWORD` para o utilizador de teste
 *
 * Comandos:
 * - `npm run test:e2e` — sobe `npm run dev` se nada estiver a ouvir na porta (reuseExistingServer)
 * - `SKIP_WEBSERVER=1 npm run test:e2e` — assume app já em http://127.0.0.1:3000
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts" },
    {
      name: "chromium",
      dependencies: ["setup"],
      testMatch: "specs/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
  webServer:
    process.env.SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          url: "http://127.0.0.1:3000",
          reuseExistingServer: true,
          timeout: 120_000,
        },
})
