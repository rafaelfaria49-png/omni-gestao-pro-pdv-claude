import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium, expect, test, type Locator, type Page } from "@playwright/test"

/*
 * OMNI-PWA-INSTALACAO-PUBLICACAO-FINAL-001 — instalação do OmniGestão Pro pelo navegador (PWA).
 *
 * Roda no build de produção (`next start`, service worker ATIVO) do CI com banco descartável.
 * Usa perfil PERSISTENTE (como o do Edge/Chrome do cliente): perfil anônimo nunca é instalável.
 * Prova: instalabilidade real no Chromium, ciclo completo de beforeinstallprompt (recusado, aceito,
 * appinstalled), matriz desktop + mobile (Android/iOS/Firefox/Edge/Chrome) sem overflow nem sobreposição,
 * funil /gestao-lojas → /baixar → /login, modo standalone, persistência de sessão após reinício,
 * logout, troca para loja B e auditoria transparente do Cache Storage após sair.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const out = "test-results/platform-pilot"
const password = (key: string) => process.env[`PILOT_PASSWORD_${key.toUpperCase()}`]!
test.use({ screenshot: "off", trace: "off", video: "off" })

const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0"
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
const FIREFOX_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0"
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36"
const ANDROID_EDGE_UA = ANDROID_CHROME_UA + " EdgA/142.0.0.0"
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const IOS_CHROME_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1"

const dirs: string[] = []
async function profile(extra: Parameters<typeof chromium.launchPersistentContext>[1] = {}, dir?: string) {
  const userDataDir = dir ?? (await mkdtemp(path.join(os.tmpdir(), "omni-pwa-")))
  if (!dir) dirs.push(userDataDir)
  const context = await chromium.launchPersistentContext(userDataDir, {
    baseURL,
    serviceWorkers: "allow",
    locale: "pt-BR",
    viewport: { width: 1440, height: 1000 },
    ...extra,
  })
  return { context, userDataDir }
}
test.afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})

async function secretInput(input: Locator, value: string) {
  await input.evaluate((node, secret) => {
    const element = node as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, secret)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }, value)
}
async function loginForm(page: Page, key: string) {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(`${key.toLowerCase()}@pilot.invalid`)
  await secretInput(page.getByLabel("Senha", { exact: true }), password(key))
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}
async function logout(page: Page) {
  await page.goto("/dashboard/configuracoes?sec=seguranca")
  await page.getByRole("button", { name: "Encerrar sessão", exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
}
async function storesSeenByPage(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const r = await fetch("/api/stores", { credentials: "include" })
    const j = (await r.json()) as { stores?: { id: string }[] }
    return (j.stores ?? []).map((s) => s.id).sort()
  })
}
async function swReady(page: Page) {
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker?.getRegistration()), undefined, {
    timeout: 30_000,
  })
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
}
async function inspectCacheStorage(page: Page) {
  return page.evaluate(async () => {
    if (!("caches" in window)) return { supported: false, caches: {} as Record<string, string[]> }
    const out: Record<string, string[]> = {}
    for (const name of (await caches.keys()).sort()) {
      const c = await caches.open(name)
      const reqs = await c.keys()
      out[name] = reqs.map((r) => new URL(r.url).pathname + new URL(r.url).search).sort()
    }
    return { supported: true, caches: out }
  })
}
async function assertNoButtonOverlap(page: Page, scopeSelector: string) {
  const overlap = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return []
    const items = Array.from(root.querySelectorAll("a, button")).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const pairs: string[] = []
    for (let i = 0; i < items.length; i++) {
      const a = items[i].getBoundingClientRect()
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j].getBoundingClientRect()
        const interX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const interY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (interX > 1 && interY > 1) {
          pairs.push(`${items[i].textContent?.trim()} <> ${items[j].textContent?.trim()}`)
        }
      }
    }
    return pairs
  }, scopeSelector)
  expect(overlap).toEqual([])
}

test("manifesto oficial, ícones e /baixar instalável no Chromium (Edge/Chrome), sem login", async () => {
  const { context } = await profile()
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    const consoleErrors: string[] = []
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text())
    })
    expect((await page.goto("/baixar"))?.status()).toBe(200)
    await swReady(page)
    const manifest = await (await page.request.get("/manifest.webmanifest")).json()
    expect(manifest).toMatchObject({
      id: "/",
      name: "OmniGestão Pro",
      short_name: "OmniGestão Pro",
      start_url: "/login",
      scope: "/",
      display: "standalone",
      lang: "pt-BR",
    })
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const r = await page.request.get(icon.src)
      expect(r.status(), icon.src).toBe(200)
      expect(r.headers()["content-type"]).toContain("image/png")
    }
    const appleIcon = await page.request.get("/apple-touch-icon.png")
    expect(appleIcon.status()).toBe(200)
    expect(appleIcon.headers()["content-type"]).toContain("image/png")

    const cdp = await context.newCDPSession(page)
    const app = await cdp.send("Page.getAppManifest")
    expect(app.errors).toEqual([])
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors")
    await writeFile(
      path.join(out, "pwa-installability.json"),
      JSON.stringify({ url: app.url, installabilityErrors, manifestErrors: app.errors, consoleErrors }, null, 2),
    )
    expect(installabilityErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  } finally {
    await context.close()
  }
})

test("um clique: recusa volta aos passos manuais sem sucesso fictício; aceite confirma e appinstalled conclui", async () => {
  const { context } = await profile()
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto("/baixar")
    const card = page.getByTestId("pwa-install-card")
    await expect(card).toHaveAttribute("data-mode", /manual-chrome|um-clique/)

    // 1) Instalação recusada (`dismissed`): não pode exibir sucesso fictício e volta aos passos manuais.
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>
      ;(window as unknown as Record<string, number>).__promptCalls = 0
      e.prompt = async () => {
        ;(window as unknown as Record<string, number>).__promptCalls++
      }
      e.userChoice = Promise.resolve({ outcome: "dismissed" })
      window.dispatchEvent(e)
    })
    await expect(card).toHaveAttribute("data-mode", "um-clique")
    await assertNoButtonOverlap(page, '[data-testid="pwa-install-card"]')
    await card.getByRole("button", { name: "Instalar OmniGestão Pro" }).click()
    await expect(card.getByRole("status")).toContainText("Instalação cancelada")
    await expect(card).toHaveAttribute("data-mode", "manual-chrome")
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__promptCalls)).toBe(1)

    // 2) Instalação aceita (`accepted`): confirmação honesta sem afirmar "instalado" antes de `appinstalled`.
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>
      e.prompt = async () => {
        ;(window as unknown as Record<string, number>).__promptCalls++
      }
      e.userChoice = Promise.resolve({ outcome: "accepted" })
      window.dispatchEvent(e)
    })
    await expect(card).toHaveAttribute("data-mode", "um-clique")
    await card.getByRole("button", { name: "Instalar OmniGestão Pro" }).click()
    await expect(card).toHaveAttribute("data-mode", "instalacao-aceita")
    await expect(card.getByRole("status")).toContainText("Instalação confirmada no navegador")
    expect(await page.evaluate(() => (window as unknown as Record<string, number>).__promptCalls)).toBe(2)
    expect(await card.getByRole("button", { name: /Instalar/ }).count()).toBe(0)

    // 3) Evento real `appinstalled`: agora sim muda para "instalado".
    await page.evaluate(() => {
      window.dispatchEvent(new Event("appinstalled"))
    })
    await expect(card).toHaveAttribute("data-mode", "instalado")
    await expect(card.getByRole("status")).toContainText("instalado")
  } finally {
    await context.close()
  }
})

test("matriz desktop e mobile (Edge/Chrome/Firefox/Android/iOS): passos específicos, sem overflow e sem sobreposição", async ({
  browser,
}) => {
  const casos: { ua: string; mode: string; texto: RegExp; mobile?: boolean; screenshot?: string }[] = [
    { ua: EDGE_UA, mode: "manual-edge", texto: /Instalar este site como um aplicativo/, screenshot: "baixar-pwa-1440.png" },
    { ua: CHROME_UA, mode: "manual-chrome", texto: /Instalar página como app/ },
    { ua: FIREFOX_UA, mode: "navegador-sem-suporte", texto: /não instala sites como aplicativo/ },
    { ua: ANDROID_CHROME_UA, mode: "manual-android-chrome", texto: /Adicionar à tela inicial/, mobile: true, screenshot: "baixar-pwa-375.png" },
    { ua: ANDROID_EDGE_UA, mode: "manual-android-edge", texto: /Adicionar ao telefone/, mobile: true },
    { ua: IOS_SAFARI_UA, mode: "manual-ios-safari", texto: /Adicionar à Tela de Início/, mobile: true },
    { ua: IOS_CHROME_UA, mode: "manual-ios-outro", texto: /abra esta página no Safari/i, mobile: true },
  ]
  for (const c of casos) {
    const context = await browser.newContext({
      baseURL,
      userAgent: c.ua,
      ...(c.mobile ? { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } }),
    })
    const page = await context.newPage()
    const consoleErrors: string[] = []
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text())
    })
    await page.goto("/baixar")
    const card = page.getByTestId("pwa-install-card")
    await expect(card).toHaveAttribute("data-mode", c.mode)
    await expect(card).toContainText(c.texto)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await assertNoButtonOverlap(page, '[data-testid="pwa-install-card"]')
    expect(consoleErrors).toEqual([])
    if (c.screenshot) {
      await page.screenshot({ path: `${out}/${c.screenshot}`, fullPage: true, animations: "disabled" })
    }
    await context.close()
  }
})

test("funil comercial /gestao-lojas → /baixar → /login preserva landing premium e não anuncia .exe público", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const consoleErrors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text())
  })
  expect((await page.goto("/gestao-lojas"))?.status()).toBe(200)
  const linkBaixar = page.locator('main a[href="/baixar"]').first()
  await expect(linkBaixar).toBeVisible()
  await linkBaixar.click()
  await expect(page).toHaveURL(/\/baixar/)
  await expect(page.getByTestId("pwa-install-card")).toBeVisible()
  await expect(page.locator("body")).toContainText("O download público do instalador ainda não está liberado.")
  expect(await page.locator('a[href$=".exe"], a[download]').count()).toBe(0)
  expect((await page.request.get("/login")).status()).toBe(200)
  expect(consoleErrors).toEqual([])
  await context.close()
})

test("aberto como app (standalone desktop e iOS navigator.standalone): mostra instalado e leva ao login", async () => {
  const { context } = await profile()
  try {
    await context.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone")
          ? ({ ...original(q), matches: true, media: q } as MediaQueryList)
          : original(q)
    })
    const page = context.pages()[0] ?? (await context.newPage())
    await page.goto("/baixar")
    const card = page.getByTestId("pwa-install-card")
    await expect(card).toHaveAttribute("data-mode", "instalado")
    await expect(card.getByRole("link", { name: "Entrar no sistema" })).toHaveAttribute("href", "/login")
  } finally {
    await context.close()
  }
})

test("mesmo perfil do app: login A → reinício mantém sessão → sair → auditoria cache offline → login B só com pilot-b", async () => {
  test.setTimeout(240_000)
  let { context, userDataDir } = await profile()
  const evidencia: Record<string, unknown> = {}
  try {
    let page: Page = context.pages()[0] ?? (await context.newPage())
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })
    await loginForm(page, "adminA")
    await swReady(page)
    // Recarrega para garantir que o Service Worker ativo esteja controlando a página (como após a 1ª visita).
    await page.reload()
    await swReady(page)
    evidencia.swControllingBeforeLogout = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    evidencia.lojasA = await storesSeenByPage(page)
    expect(evidencia.lojasA).toEqual(["pilot-a"])
    evidencia.cacheAntesLogout = await inspectCacheStorage(page)

    // Reinício: fecha o "app" e abre de novo pelo start_url do manifesto (/login).
    await context.close()
    ;({ context } = await profile({}, userDataDir))
    page = context.pages()[0] ?? (await context.newPage())
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })
    await page.goto("/login")
    await expect(page).toHaveURL(/\/dashboard/)
    evidencia.reinicioMantemSessao = true

    await logout(page)
    evidencia.saiu = true
    evidencia.cacheAposLogoutOnline = await inspectCacheStorage(page)

    // Auditoria read-only (sem asserção que oculte achado): mede exatamente o que o Cache Storage
    // devolve SEM internet logo após logout (regra pré-existente NetworkFirst 24h do next-pwa).
    await context.setOffline(true)
    evidencia.medicaoCacheOfflineAposSair = await storesSeenByPage(page).catch((e: Error) => `erro: ${e.message}`)
    await context.setOffline(false)

    await loginForm(page, "adminB")
    evidencia.entrouB = true
    const session = await (await page.request.get("/api/auth/session")).json()
    expect(session.user.email).toBe("adminb@pilot.invalid")
    evidencia.lojasB = await storesSeenByPage(page)
    expect(evidencia.lojasB).toEqual(["pilot-b"])
    await page.goto("/dashboard")
    await expect(page.locator("body")).not.toContainText("Padaria Piloto A")
  } finally {
    await writeFile(path.join(out, "pwa-multiloja.json"), JSON.stringify(evidencia, null, 2))
    await context.close()
  }
})
