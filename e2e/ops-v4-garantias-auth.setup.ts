import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
/** Sessão real de Credentials, exclusivamente no servidor e usuário sintéticos. */
setup("autenticar usuário sintético e confirmar sessão", async ({ page, baseURL }) => {
  setup.setTimeout(180000);
  if (baseURL !== "http://127.0.0.1:3043" || process.env.PLAYWRIGHT_E2E_EMAIL !== "garantias@qa.test") throw new Error("Somente QA local de garantias.");
  const csrf = await page.request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  await page.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: process.env.PLAYWRIGHT_E2E_EMAIL, password: process.env.PLAYWRIGHT_E2E_PASSWORD!, callbackUrl: baseURL + "/dashboard/operacoes-v4-preview" }, headers: { "X-Auth-Return-Redirect": "1" }, maxRedirects: 0 });
  const session = await (await page.request.get("/api/auth/session")).json();
  expect(session.user?.email).toBe("garantias@qa.test");
  const file = path.join(__dirname,".auth/storage.json"); fs.mkdirSync(path.dirname(file),{recursive:true});
  await page.context().storageState({ path: file });
});
