import { defineConfig } from "@playwright/test"

/** Só roda chamado por tests/real-stack/run.mjs (stack local isolada). */
export default defineConfig({
  testDir: ".",
  testMatch: /real-stack\.spec\.ts/,
  timeout: 1_800_000,
  workers: 1,
  outputDir: "../../test-results/real-stack/playwright",
  reporter: [["list"], ["json", { outputFile: "../../test-results/real-stack/report.json" }]],
})
