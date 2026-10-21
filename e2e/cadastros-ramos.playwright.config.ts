import { defineConfig, devices } from "@playwright/test"

/**
 * E2E autenticado de Ramos e Cadastros. Só roda pelo runner isolado
 * (`scripts/cadastros/run-ramos-e2e-isolated.mjs`), que sobe `next start`
 * contra o PostgreSQL descartável da CI. Sem webServer, sem .env e sem retry:
 * uma falha aqui é falha da jornada, não ruído a ser repetido.
 */
const baseURL = process.env.RAMOS_E2E_BASE_URL
if (!baseURL) throw new Error("Execute pelo runner isolado (RAMOS_E2E_BASE_URL ausente).")

export default defineConfig({
  testDir: "cadastros-ramos",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: "../test-results/cadastros-ramos-e2e/report.json" }]],
  outputDir: "../test-results/cadastros-ramos-e2e/artifacts",
  use: {
    baseURL,
    // O service worker do PWA pode servir GET /api/* do cache: a prova lê sempre o servidor.
    serviceWorkers: "block",
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
    screenshot: "only-on-failure",
    // Trace registraria o preenchimento da senha sintética; evidência não leva credenciais.
    trace: "off",
    locale: "pt-BR",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
})
