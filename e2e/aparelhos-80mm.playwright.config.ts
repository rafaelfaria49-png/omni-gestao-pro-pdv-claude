import { defineConfig, devices } from "@playwright/test"

/**
 * Layout real (Chromium) dos documentos de aparelhos em bobina 80 mm
 * (OMNI-APARELHOS-TERMO-80MM-PRINT-LAYOUT-P1-001). Sem servidor, sem banco, sem login:
 * renderiza o fragmento que vai para a ponte Electron dentro do mesmo documento que ela monta.
 *
 *   npx playwright test -c e2e/aparelhos-80mm.playwright.config.ts
 *
 * EVIDENCE_LABEL=antes|depois troca a pasta das evidências (PNG + PDF 80 mm).
 */
export default defineConfig({
  testDir: "aparelhos-80mm",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  outputDir: "../test-results/aparelhos-80mm/artifacts",
  use: { locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
