import { defineConfig,devices } from "@playwright/test"
import path from "node:path"
// Installed Playwright gates Chromium SW network/offline control behind this flag.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS="1"
export default defineConfig({testDir:"./reports",workers:1,retries:0,timeout:240000,expect:{timeout:90000},
  reporter:[["list"],["json",{outputFile:path.resolve("docs/ai-execution/_evidence/OMNI-RELATORIOS-HUB-ENTERPRISE-REAL-001/e2e-results.json")}]],
  use:{...devices["Desktop Chrome"],serviceWorkers:"allow",timezoneId:"America/Los_Angeles",baseURL:"http://127.0.0.1:3107",screenshot:"only-on-failure",trace:"retain-on-failure"}})
