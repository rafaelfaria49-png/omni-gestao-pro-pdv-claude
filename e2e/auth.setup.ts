import fs from "node:fs"
import path from "node:path"
import { test as setup, expect } from "@playwright/test"

const authFile = path.join(__dirname, ".auth", "storage.json")

setup("autenticar e gravar sessão", async ({ page }) => {
  const email = process.env.PLAYWRIGHT_E2E_EMAIL?.trim() || "admin@rafacell.com.br"
  const password =
    process.env.PLAYWRIGHT_E2E_PASSWORD?.trim() ||
    process.env.ADMIN_DEFAULT_PASSWORD?.trim() ||
    ""

  if (!password) {
    throw new Error(
      "Defina PLAYWRIGHT_E2E_PASSWORD ou ADMIN_DEFAULT_PASSWORD no ambiente para executar E2E.",
    )
  }

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /OmniGestão Pro/i })).toBeVisible()

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Senha").fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()

  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 45_000 })

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
