import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium, expect, test, type Locator, type Page } from "@playwright/test"

/*
 * OMNI-PWA-INSTALACAO-PUBLICACAO-FINAL-001 + OMNI-PWA-OFFLINE-CACHE-LOGOUT-ISOLATION-P1-001
 *
 * Roda no build de produção (`next start`, service worker ATIVO) do CI com banco PostgreSQL descartável.
 * Cobre matriz completa A–P:
 *  - Instalabilidade real no Chromium (CDP getAppManifest + getInstallabilityErrors=[]), 5 ícones PNG 200;
 *  - Ciclo beforeinstallprompt (dismissed, accepted, appinstalled), matriz desktop+mobile, funil /gestao-lojas → /baixar → /login, standalone;
 *  - Isolamento real de cache offline com DESLIGAMENTO REAL de servidor dedicado (TCP ECONNREFUSED atingindo inclusive fetches internos do SW);
 *  - APIs privadas, páginas privadas e RSC bloqueados offline após logout e sob usuário B;
 *  - Troca autorizada de loja (usuário multi), logout multi-aba, atualização de SW sobre caches legados,
 *    requisição concorrente com logout, e preservação/isolamento/visibilidade da fila de vendas pendentes do PDV em localStorage.
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

const isExpectedLocalAnalyticsWarning = (msg: string) =>
  msg.includes("/_vercel/insights/script.js") || msg.includes("%2F_vercel%2Finsights%2Fscript.js")

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
async function inspectNonPrecacheStorage(page: Page) {
  return page.evaluate(async () => {
    if (!("caches" in window)) return { supported: false, caches: {} as Record<string, string[]>, privateEntries: [] as string[] }
    const out: Record<string, string[]> = {}
    const privateEntries: string[] = []
    for (const name of (await caches.keys()).sort()) {
      if (name.startsWith("workbox-precache")) continue
      const c = await caches.open(name)
      const reqs = await c.keys()
      const paths = reqs.map((r) => new URL(r.url).pathname + new URL(r.url).search).sort()
      out[name] = paths
      for (const p of paths) {
        if (
          p.startsWith("/api/") ||
          p.startsWith("/dashboard") ||
          p.startsWith("/conta/") ||
          p.includes("_rsc=")
        ) {
          privateEntries.push(`${name}:${p}`)
        }
      }
    }
    return { supported: true, caches: out, privateEntries }
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

async function waitForOrigin(origin: string, up: boolean, timeoutMs = 45_000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try {
      const r = await fetch(`${origin}/login`)
      if (up && r.status < 500) return
    } catch {
      if (!up) return
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`waitForOrigin(${origin}, up=${up}) timed out`)
}

async function startIsolatedNext(port: number, authSecret: string): Promise<ChildProcess> {
  const origin = `http://localhost:${port}`
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", String(port)], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: database,
      DIRECT_URL: database,
      AUTH_SECRET: authSecret,
      AUTH_TRUST_HOST: "true",
      NEXTAUTH_URL: origin,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  await waitForOrigin(origin, true)
  return child
}

async function stopIsolatedNext(child: ChildProcess | null, port: number) {
  if (!child || child.exitCode !== null) return
  child.kill("SIGKILL")
  await waitForOrigin(`http://localhost:${port}`, false, 15_000)
}

test("manifesto oficial, ícones e /baixar instalável no Chromium (Edge/Chrome), sem login (Teste N)", async () => {
  const { context } = await profile()
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    const consoleErrors: string[] = []
    page.on("console", (m) => {
      if (m.type() === "error" && !isExpectedLocalAnalyticsWarning(m.text())) consoleErrors.push(m.text())
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

    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>
        ; (window as unknown as Record<string, number>).__promptCalls = 0
      e.prompt = async () => {
        ; (window as unknown as Record<string, number>).__promptCalls++
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

    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>
      e.prompt = async () => {
        ; (window as unknown as Record<string, number>).__promptCalls++
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
      if (m.type() === "error" && !isExpectedLocalAnalyticsWarning(m.text())) consoleErrors.push(m.text())
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

test("funil comercial /gestao-lojas → /baixar → /login preserva landing premium e não anuncia .exe público (Teste O)", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const consoleErrors: string[] = []
  page.on("console", (m) => {
    if (m.type() === "error" && !isExpectedLocalAnalyticsWarning(m.text())) consoleErrors.push(m.text())
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

test("aberto como app (standalone desktop): mostra instalado e leva ao login", async () => {
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

test("GREEN P1-001 (A-E, H-K, M): isolamento offline real com desligamento do servidor, upgrade legado e preservação/isolamento do PDV offline", async () => {
  test.setTimeout(240_000)
  const PORT = 3101
  const ORIGIN = `http://localhost:${PORT}`
  const SECRET = "isolated-pwa-p1-green-test-secret-0123456789abcdef"
  let srv: ChildProcess | null = await startIsolatedNext(PORT, SECRET)
  let { context, userDataDir } = await profile({ baseURL: ORIGIN })
  const evidencia: Record<string, unknown> = {
    phase: "GREEN_AFTER_P1_001_FIX",
    offlineMethod: "DEDICATED_NEXT_SERVER_SHUTDOWN_REAL_ECONNREFUSED",
  }

  try {
    let page: Page = context.pages()[0] ?? (await context.newPage())
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })

    // 1. Login A, espera SW ativo e controlando a página, navega estoque/vendas/clientes/configurações
    await loginForm(page, "adminA")
    await swReady(page)
    await page.reload()
    await swReady(page)
    evidencia.swControlling = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
    expect(evidencia.swControlling).toBe(true)

    for (const route of ["/dashboard/estoque", "/dashboard/vendas", "/dashboard/clientes", "/dashboard/configuracoes?sec=seguranca"]) {
      await page.goto(route)
    }
    evidencia.lojasA = await storesSeenByPage(page)
    expect(evidencia.lojasA).toEqual(["pilot-a"])

    // Simula caches legados de uma instalação anterior do PWA (Teste H) + venda offline pendente da Loja A (Testes I/J/K)
    const pendingSaleId = "cs_pwa_p1_pending_a_001"
    await page.evaluate(async (clientSaleId) => {
      // Caches legados pré-fix (como num cliente antigo antes do upgrade/logout)
      const apis = await caches.open("apis")
      await apis.put(new Request(`${location.origin}/api/stores`), new Response(JSON.stringify({ stores: [{ id: "pilot-a", name: "LEGACY_LEAK_A" }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      const pages = await caches.open("pages")
      await pages.put(new Request(`${location.origin}/dashboard`), new Response("<html>LEGACY_HTML_A</html>", { status: 200, headers: { "Content-Type": "text/html" } }))
      const rsc = await caches.open("pages-rsc-prefetch")
      await rsc.put(new Request(`${location.origin}/dashboard/vendas?_rsc=legacy`), new Response("LEGACY_RSC_A", { status: 200, headers: { "Content-Type": "text/x-component" } }))

      // Fila offline legítima do PDV da Loja A (em localStorage por loja)
      const opsKey = "assistec-pro-ops-v1-pilot-a"
      const current = JSON.parse(localStorage.getItem(opsKey) || "{}")
      const pendingSale = {
        id: "OFF-A-001",
        clientSaleId,
        at: new Date().toISOString(),
        total: 49.9,
        syncPending: true,
        clienteNome: "Venda Pendente Sintetica A",
        lines: [],
      }
      current.sales = [...(Array.isArray(current.sales) ? current.sales : []), pendingSale]
      localStorage.setItem(opsKey, JSON.stringify(current))
    }, pendingSaleId)

    // 2. Reinício do PWA: fecha e reabre em /login → sessão mantida
    await context.close()
    ;({ context } = await profile({ baseURL: ORIGIN }, userDataDir))
    page = context.pages()[0] ?? (await context.newPage())
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })
    await page.goto("/login")
    await expect(page).toHaveURL(/\/dashboard/)
    evidencia.reinicioMantemSessao = true

    // 3. Dispara requisição concorrente (Teste M) e faz logout
    await page.goto("/dashboard/configuracoes?sec=seguranca")
    await page.evaluate(() => {
      void fetch("/api/ops/inventory?lojaId=pilot-a", { credentials: "include" }).catch(() => {})
      void fetch("/api/ops/vendas-list?lojaId=pilot-a", { credentials: "include" }).catch(() => {})
    })
    await page.getByRole("button", { name: "Encerrar sessão", exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.waitForTimeout(400)

    // Teste A + H: ZERO caches legados e ZERO entradas privadas em CacheStorage após logout
    const afterLogoutCaches = await inspectNonPrecacheStorage(page)
    evidencia.cacheAposLogout = afterLogoutCaches
    expect(afterLogoutCaches.privateEntries).toEqual([])
    expect(Object.keys(afterLogoutCaches.caches)).not.toContain("apis")
    expect(Object.keys(afterLogoutCaches.caches)).not.toContain("pages")
    expect(Object.keys(afterLogoutCaches.caches)).not.toContain("pages-rsc")
    expect(Object.keys(afterLogoutCaches.caches)).not.toContain("pages-rsc-prefetch")

    // Teste I: venda pendente da Loja A 100% PRESERVADA após logout
    const pendingAfterLogout = await page.evaluate((id) => {
      const raw = localStorage.getItem("assistec-pro-ops-v1-pilot-a") || ""
      return raw.includes(id)
    }, pendingSaleId)
    evidencia.pendingSalePreservedAfterLogout = pendingAfterLogout
    expect(pendingAfterLogout).toBe(true)

    // 4. Testes B, C, D: DESLIGAMENTO REAL DO SERVIDOR (TCP ECONNREFUSED inclusive para o SW!)
    await stopIsolatedNext(srv, PORT)
    srv = null

    const offlineProbe = await page.evaluate(async () => {
      const targets: Array<{ url: string; headers?: Record<string, string> }> = [
        { url: "/api/stores" },
        { url: "/api/stores/pilot-a" },
        { url: "/api/stores/pilot-a/settings" },
        { url: "/api/ops/inventory?lojaId=pilot-a" },
        { url: "/api/ops/vendas-list?lojaId=pilot-a" },
        { url: "/api/ops/credito-cliente?lojaId=pilot-a" },
        { url: "/dashboard" },
        { url: "/dashboard/estoque" },
        { url: "/dashboard/vendas" },
        { url: "/dashboard/configuracoes?sec=seguranca" },
        { url: "/dashboard/estoque?_rsc=1", headers: { RSC: "1" } },
        { url: "/dashboard/vendas?_rsc=1", headers: { RSC: "1", "Next-Router-Prefetch": "1" } },
      ]
      const res: Record<string, { ok: boolean; status?: number; error?: string }> = {}
      for (const t of targets) {
        const key = t.headers?.RSC ? `${t.url} [RSC]` : t.url
        try {
          const r = await fetch(t.url, { credentials: "include", headers: t.headers })
          res[key] = { ok: true, status: r.status }
        } catch (err) {
          res[key] = { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      }
      return res
    })
    evidencia.offlineWithServerDeadAfterLogout = offlineProbe
    for (const [k, v] of Object.entries(offlineProbe)) {
      expect(v.ok, `endpoint ${k} respondeu offline após logout!`).toBe(false)
    }

    // 5. Teste E + K: Religar servidor, login B (pilot-b) → somente pilot-b, sem acesso à venda pendente da Loja A
    srv = await startIsolatedNext(PORT, SECRET)
    await loginForm(page, "adminB")
    const sessionB = await (await page.request.get("/api/auth/session")).json()
    expect(sessionB.user.email).toBe("adminb@pilot.invalid")
    evidencia.lojasB = await storesSeenByPage(page)
    expect(evidencia.lojasB).toEqual(["pilot-b"])
    await page.goto("/dashboard/vendas")
    await expect(page.locator("body")).not.toContainText("Padaria Piloto A")
    await expect(page.locator("body")).not.toContainText("Venda Pendente Sintetica A")

    // Verifica que CacheStorage continua sem dados privados durante sessão B e com servidor desligado
    const cachesDuringB = await inspectNonPrecacheStorage(page)
    evidencia.cachesDuringUserB = cachesDuringB
    expect(cachesDuringB.privateEntries).toEqual([])

    await stopIsolatedNext(srv, PORT)
    srv = null
    const userBOfflineStoreA = await page.evaluate(async () => {
      const results: Record<string, boolean> = {}
      for (const u of ["/api/stores", "/api/stores/pilot-a", "/api/ops/inventory?lojaId=pilot-a", "/api/ops/vendas-list?lojaId=pilot-a", "/dashboard/estoque"]) {
        try {
          await fetch(u, { credentials: "include" })
          results[u] = true
        } catch {
          results[u] = false
        }
      }
      return results
    })
    evidencia.userBOfflineProbeOfStoreA = userBOfflineStoreA
    for (const [u, reached] of Object.entries(userBOfflineStoreA)) {
      expect(reached, `User B obteve ${u} offline!`).toBe(false)
    }

    // 6. Teste J: Religar servidor, sair de B, retornar como adminA → venda pendente da Loja A segue íntegra na chave da Loja A
    srv = await startIsolatedNext(PORT, SECRET)
    await logout(page)
    await loginForm(page, "adminA")
    const pendingBackOnA = await page.evaluate((id) => {
      const raw = localStorage.getItem("assistec-pro-ops-v1-pilot-a") || ""
      return raw.includes(id)
    }, pendingSaleId)
    evidencia.pendingSaleStillAvailableForUserA = pendingBackOnA
    expect(pendingBackOnA).toBe(true)
  } finally {
    await writeFile(path.join(out, "pwa-multiloja.json"), JSON.stringify(evidencia, null, 2))
    await context.close()
    await stopIsolatedNext(srv, PORT).catch(() => {})
  }
})

test("multi-aba (Teste G) e troca autorizada de loja (Teste F): logout em aba 1 encerra aba 2; troca de loja não polui CacheStorage", async () => {
  test.setTimeout(180_000)
  const { context } = await profile()
  try {
    const tab1 = context.pages()[0] ?? (await context.newPage())
    await tab1.addLocatorHandler(tab1.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })

    // Login como usuário `multi` (autorizado para pilot-a e pilot-b)
    await loginForm(tab1, "multi")
    await swReady(tab1)
    await tab1.reload()
    await swReady(tab1)
    expect(await storesSeenByPage(tab1)).toEqual(["pilot-a", "pilot-b"])

    // Teste F: troca de loja via API/contexto não grava respostas em CacheStorage
    await tab1.evaluate(async () => {
      await fetch("/api/ops/inventory?lojaId=pilot-a", { credentials: "include" })
      await fetch("/api/ops/inventory?lojaId=pilot-b", { credentials: "include" })
      await fetch("/api/stores/pilot-b/settings", { credentials: "include" })
    })
    const cachesAfterSwitch = await inspectNonPrecacheStorage(tab1)
    expect(cachesAfterSwitch.privateEntries).toEqual([])

    // Teste G: abre segunda aba na mesma sessão; logout na aba 1 deve encerrar a aba 2
    const tab2 = await context.newPage()
    await tab2.addLocatorHandler(tab2.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => {
      await d.getByRole("button", { name: "Voltar depois" }).click()
    })
    await tab2.goto("/dashboard/estoque")
    await expect(tab2).toHaveURL(/\/dashboard\/estoque/)

    // Encerra sessão na aba 1
    await logout(tab1)

    // Aba 2 recebe broadcast / revalidação e bloqueia acesso com "Sua sessão foi encerrada."
    await expect(tab2.locator("body")).toContainText(/Sua sessão foi encerrada|Faça login/i, { timeout: 20_000 })
    const cachesAfterMultiTabLogout = await inspectNonPrecacheStorage(tab1)
    expect(cachesAfterMultiTabLogout.privateEntries).toEqual([])
  } finally {
    await context.close()
  }
})
