import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
import path from "node:path";
export default defineConfig({
  ...base, testDir: path.resolve(__dirname,"../../e2e"), outputDir: path.resolve(__dirname,".local/playwright"),
  retries: 0, workers: 1, webServer: undefined,
  use: { ...base.use, baseURL: "http://127.0.0.1:3043", channel: "msedge" },
  projects: [
    { name: "setup", testMatch: "ops-v4-garantias-auth.setup.ts", timeout: 240000, retries: 0 },
    { name: "chromium", dependencies: ["setup"], testMatch: "specs/**/*.spec.ts", retries: 0, use: { channel: "msedge", storageState: path.resolve(__dirname,"../../e2e/.auth/storage.json") } },
  ],
});
