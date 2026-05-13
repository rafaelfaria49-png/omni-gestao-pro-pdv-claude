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

  /** Evita corrida com `webServer` do Playwright (setup pode arrancar antes do `npm run dev` aceitar ligações). */
  const deadline = Date.now() + 90_000
  let originReady = false
  while (Date.now() < deadline) {
    try {
      const probe = await page.request.get("/login")
      if (probe.ok()) {
        originReady = true
        break
      }
    } catch {
      /* ECONNREFUSED enquanto o servidor ainda não escuta */
    }
    await page.waitForTimeout(400)
  }
  if (!originReady) {
    throw new Error("E2E: o servidor de desenvolvimento não respondeu em GET /login dentro do tempo.")
  }

  /** Selo de assinatura (httpOnly) — necessário para o proxy não redirecionar /dashboard → /meu-plano. */
  const seal = await page.request.post("/api/subscription/seal", {
    data: { vencimento: "2099-12-31", plano: "bronze", status: "ativa" },
  })
  if (!seal.ok()) {
    const body = await seal.text().catch(() => "")
    throw new Error(`E2E: POST /api/subscription/seal falhou (${seal.status()}). ${body.slice(0, 200)}`)
  }

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /OmniGestão Pro/i })).toBeVisible()

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Senha").fill(password)
  try {
    await Promise.all([
      page.waitForURL(/\/dashboard(\/|$)/, { timeout: 45_000 }),
      page.getByRole("button", { name: "Entrar" }).click(),
    ])
  } catch {
    const errText = await page
      .locator("p.text-destructive")
      .first()
      .textContent()
      .catch(() => null)
    throw new Error(
      errText?.trim()
        ? `Login não redirecionou para /dashboard: ${errText.trim()} (URL: ${page.url()})`
        : `Login não redirecionou para /dashboard (URL: ${page.url()}). Verifique credenciais, npm run db:seed-admin e alinhe PLAYWRIGHT_BASE_URL com NEXTAUTH_URL (ex.: http://localhost:3000).`,
    )
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  await page.context().storageState({ path: authFile })
})
