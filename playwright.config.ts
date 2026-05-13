import path from "node:path"
import { config as loadEnv } from "dotenv"
import { defineConfig, devices } from "@playwright/test"

loadEnv({ path: path.join(__dirname, ".env") })

/** NEXTAUTH em `localhost` com baseURL em `127.0.0.1` partia cookies / redirects no login E2E. */
function alignNextAuthUrlForLoopbackE2E(): void {
  const raw = process.env.NEXTAUTH_URL?.trim()
  if (!raw) return
  try {
    const u = new URL(raw)
    if (u.hostname !== "localhost") return
    u.hostname = "127.0.0.1"
    process.env.NEXTAUTH_URL = u.origin
  } catch {
    /* ignore */
  }
}

alignNextAuthUrlForLoopbackE2E()

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
 * - `PLAYWRIGHT_E2E_SKIP_WEBSERVER=1 npm run test:e2e` — assume app já na mesma origem que `PLAYWRIGHT_BASE_URL` (omitir `webServer`)
 */
/** Evita `localhost` → `::1` no Windows (ECONNREFUSED) alinhando browser + APIRequest com IPv4. */
function normalizeE2EOrigin(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "")
  if (!trimmed) return "http://127.0.0.1:3000"
  try {
    const u = new URL(trimmed)
    if (u.hostname === "localhost") u.hostname = "127.0.0.1"
    return u.origin
  } catch {
    return trimmed
  }
}

const defaultBase = normalizeE2EOrigin(
  process.env.PLAYWRIGHT_BASE_URL?.trim()?.replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.trim()?.replace(/\/$/, "") ||
    "http://127.0.0.1:3000",
)

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 90_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: defaultBase,
    navigationTimeout: 90_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "setup", testMatch: "auth.setup.ts", timeout: 240_000, retries: 0 },
    {
      name: "chromium",
      dependencies: ["setup"],
      retries: process.env.CI ? 2 : 1,
      testMatch: "specs/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_E2E_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          url: defaultBase,
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            ...process.env,
            NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=6144"].filter(Boolean).join(" "),
          },
        },
})
