import { defineConfig } from "@playwright/test"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

/** OMNI-PRINT-004C — PDV Clássico real + API de impressão real sobre PostgreSQL descartável + agente real com spooler SIMULADO.
 * Rodar via tools/print-004c-e2e/run-playwright.mjs (reseta o banco print_lab_* e define PRINT_PG_URL). */
export default defineConfig({
  testDir: "./specs", testMatch: "print-direct-004c.spec.ts", fullyParallel: false, workers: 1, retries: 0,
  reporter: "line", outputDir: join(tmpdir(), "print-direct-004c-playwright"),
  timeout: 90000,
  use: { baseURL: "http://127.0.0.1:4181", browserName: "chromium", viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" },
  webServer: { command: "node --import tsx e2e/fixtures/print-direct.ts --serve", cwd: resolve(__dirname, ".."), url: "http://127.0.0.1:4181/health", reuseExistingServer: false, timeout: 180000 },
})
