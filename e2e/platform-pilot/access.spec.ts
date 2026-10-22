import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../lib/auth/access-policy"

const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const contexts = new Set<APIRequestContext>()
const headers = (storeId = "pilot-a") => ({ "x-assistec-loja-id": storeId })
const password = (key: string) => process.env[`PILOT_PASSWORD_${key.toUpperCase()}`]!

async function loginCredentials(email: string, value: string, store = "pilot-a") {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: value, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: store, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const context = await request.newContext({ baseURL, storageState: state })
  contexts.add(context)
  const session = await (await context.get("/api/auth/session")).json()
  expect(!!session?.user?.id).toBe(true)
  return context
}
const login = (key: string, store?: string) => loginCredentials(`${key.toLowerCase()}@pilot.invalid`, password(key), store)
async function policy(actor: APIRequestContext, storeId: string, modules: readonly string[]) {
  const r = await actor.patch(`/api/platform/stores/${storeId}/access`, { data: { version: 1, modules } })
  expect(r.status()).toBe(200)
}
async function setupPage(page: Page, actor: APIRequestContext) {
  await page.context().addCookies((await actor.storageState()).cookies)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => { await dialog.getByRole("button", { name: "Voltar depois" }).click() })
}
test.afterEach(async () => { for (const ctx of contexts) await ctx.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

test("landing e login apresentam acesso operacional sem cadastro/pagamento fictício", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Entrar no sistema" })).toHaveAttribute("href", "/login")
  await expect(page.locator("body")).not.toContainText(/R\$|teste grátis|créditos|Criar conta/i)
  await page.getByRole("link", { name: "Entrar no sistema" }).click()
  await expect(page.getByLabel("Email")).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/teste grátis|Criar conta/i)
})

test("responsável legado mantém autoridade, visão interna e configurações", async ({ page }) => {
  const actor = await login("owner", "pilot-legacy")
  const s = await (await actor.get("/api/auth/session")).json()
  expect({ scope: s.user.accessScope, platform: s.user.platformAuthority }).toEqual({ scope: null, platform: true })
  expect((await actor.get("/api/admin/users")).status()).toBe(200)
  await setupPage(page, actor); await page.goto("/dashboard")
  await expect(page.getByRole("link", { name: "IA Mestre", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Master Console", exact: true }).first()).toBeVisible()
  await page.goto("/dashboard/configuracoes?sec=geral")
  await expect(page.getByRole("button", { name: "Fiscal", exact: true }).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Segurança/ }).first()).toBeVisible()
})

test("cliente básico: desktop, busca, cadastros e menu móvel usam o pacote liberado", async ({ page }) => {
  const actor = await login("adminA")
  await setupPage(page, actor); await page.goto("/dashboard")
  await expect(page.getByRole("heading", { name: "Padaria Piloto A" })).toBeVisible()
  for (const name of ["IA Mestre", "Omni Agent HUB", "Marketing IA", "WhatsApp HUB", "Master Console", "Gestão da Rede", "Catálogo de Aparelhos", "Operações HUB"]) await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "PDV Clássico", exact: true }).first()).toBeVisible()
  await page.screenshot({ path: "test-results/platform-pilot/basic-desktop.png", fullPage: true })
  await page.keyboard.press("Control+k")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("dialog")).not.toContainText(/Nova OS|WhatsApp|IA Mestre|Financeiro HUB/)
  await page.keyboard.press("Escape")
  await page.goto("/dashboard/cadastros-v2")
  await expect(page.getByRole("heading", { name: "Cadastros HUB", exact: true })).toBeVisible()
  for (const label of ["Serviços", "Técnicos", "Equipamentos", "Importação", "Auditoria"]) await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/dashboard")
  await page.getByRole("button", { name: "Abrir menu de navegação" }).click()
  await expect(page.getByRole("dialog", { name: "Navegação" })).not.toContainText(/IA Mestre|Master Console|WhatsApp HUB|Catálogo de Aparelhos/)
  await expect(page.getByRole("dialog", { name: "Navegação" }).getByRole("link", { name: "PDV Clássico" })).toBeVisible()
  await page.screenshot({ path: "test-results/platform-pilot/basic-mobile.png", fullPage: true })
})

test("nega URL, API, payload comercial e promoção adulterados no servidor", async () => {
  const actor = await login("adminA")
  for (const route of ["/dashboard/ia-mestre", "/dashboard/omni-agent", "/dashboard/financeiro-v2", "/dashboard/configuracoes-v2", "/dashboard/pdv-next", "/dashboard/landing-preview"]) {
    const r = await actor.get(route, { maxRedirects: 0 }); expect([302, 303, 307, 308]).toContain(r.status())
  }
  for (const route of ["/api/ia-mestre/conversations", "/api/marketplace/connections", "/api/contador/documentos?c=2026-10", "/api/catalogo/aparelhos/search?q=x", "/api/user/credits"]) expect((await actor.get(route, { headers: headers() })).status()).toBe(403)
  expect((await actor.post("/api/billing/checkout", { data: { plan: "DIAMANTE" } })).status()).toBe(403)
  expect((await actor.put("/api/stores/pilot-a", { headers: headers(), data: { subscriptionPlan: "OURO", moduleAccess: { version: 1, modules: ["ai"] } } })).status()).toBe(403)
  expect((await actor.put("/api/stores/pilot-a/settings", { headers: headers(), data: { platformAuthority: true } })).status()).toBe(403)
  expect((await actor.post("/api/admin/users", { data: { name: "Ataque sintético", email: "attack@pilot.invalid", role: "SUPER_ADMIN", accessScope: "PLATFORM" } })).status()).toBe(403)
  expect((await actor.patch("/api/admin/users/pilot-owner", { data: { active: false } })).status()).toBe(403)
  expect((await actor.post("/api/print/raw", { headers: headers(), data: { host: "127.0.0.1", port: 9, data: "AA==" } })).status()).toBe(403)
})

test("gestor A lista apenas equipe local e não consulta/altera B sem filtro confiado", async () => {
  const actor = await login("managerA")
  const users = await (await actor.get("/api/admin/users")).json()
  expect(users.users.every((u: { storeIds: string[] }) => u.storeIds.length && u.storeIds.every((id) => id === "pilot-a"))).toBe(true)
  expect(users.users.some((u: { id: string }) => u.id === "pilot-owner" || u.id === "pilot-adminB")).toBe(false)
  expect((await actor.get("/api/admin/users?storeId=pilot-b")).status()).toBe(403)
  expect((await actor.get("/api/clientes/pilot-client-b", { headers: headers("pilot-b") })).status()).toBe(403)
  expect((await actor.get("/api/stores/pilot-b/settings")).status()).toBe(403)
  expect((await actor.patch("/api/admin/users/pilot-adminB", { data: { name: "Invasão sintética" } })).status()).toBe(403)
  expect((await actor.post("/api/admin/users", { data: { name: "Cross store", email: "cross@pilot.invalid", role: "CAIXA", lojaId: "pilot-b", allowedStoreIds: [] } })).status()).toBe(403)
})

test("caixa usa lookup e pagamentos compartilhados sem ganhar Cadastros completo", async () => {
  const actor = await login("cashier")
  expect((await actor.post("/api/clientes/search", { headers: headers(), data: { q: "Sintético" } })).status()).toBe(200)
  const r = await actor.get("/api/clientes/pilot-client-a", { headers: headers() })
  expect(r.status()).toBe(200)
  const data = await r.json(); expect(JSON.stringify(data).includes("private-a@pilot.invalid")).toBe(false)
  expect((await actor.get("/api/ops/contas-receber-list?lojaId=pilot-a", { headers: headers() })).status()).toBe(200)
  expect((await actor.get("/api/admin/users")).status()).toBe(403)
  const s = await (await actor.get("/api/auth/session")).json(); expect(s.user.role).toBe("CAIXA")
})

test("configurações básicas persistem e preferências de ramo não concedem módulos", async () => {
  const actor = await login("adminA")
  const r = await actor.put("/api/stores/pilot-a/settings", { headers: headers(), data: { contactEmail: "operacao-a@pilot.invalid", printerConfig: { capabilities: { version: 1, business: { primaryBranch: "assistencia" }, overrides: { "service.technical": true, "catalog.deviceCompatibility": true } } } } })
  expect(r.status()).toBe(200)
  expect((await db.storeSettings.findUniqueOrThrow({ where: { storeId: "pilot-a" } })).contactEmail).toBe("operacao-a@pilot.invalid")
  expect((await actor.get("/api/ops/ordens?lojaId=pilot-a")).status()).toBe(403)
  expect((await actor.get("/api/catalogo/aparelhos/search?q=x", { headers: headers() })).status()).toBe(403)
  await actor.put("/api/stores/pilot-a/settings", { headers: headers(), data: { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } } })
})

test("mudança e revogação da liberação valem para a mesma sessão, por loja efetiva", async () => {
  const owner = await login("owner"), actor = await login("multi")
  try {
    await policy(owner, "pilot-a", [...BASIC_MODULE_ACCESS.modules, "service", "accountant"])
    expect((await actor.get("/api/ops/ordens?lojaId=pilot-a")).status()).toBe(200)
    const state = await actor.storageState(); state.cookies = state.cookies.map((c) => c.name === "assistec-active-store" ? { ...c, value: "pilot-b" } : c)
    const mixed = await request.newContext({ baseURL, storageState: state }); contexts.add(mixed)
    expect((await mixed.get("/api/contador/documentos?c=2026-10", { headers: headers("pilot-a") })).status()).toBe(403)
    await policy(owner, "pilot-b", BASIC_MODULE_ACCESS.modules.filter((m) => !["settings", "catalog"].includes(m)))
    expect((await mixed.get("/api/admin/users?storeId=pilot-b")).status()).toBe(403)
    const lookup = await mixed.get("/api/clientes/pilot-client-b", { headers: headers("pilot-b") })
    expect(lookup.status()).toBe(200); expect(JSON.stringify(await lookup.json()).includes("private-b@pilot.invalid")).toBe(false)
    await policy(owner, "pilot-a", BASIC_MODULE_ACCESS.modules)
    expect((await actor.get("/api/ops/ordens?lojaId=pilot-a")).status()).toBe(403)
  } finally { await policy(owner, "pilot-a", BASIC_MODULE_ACCESS.modules); await policy(owner, "pilot-b", BASIC_MODULE_ACCESS.modules) }
})

test("Server Action real revalida loja/módulo mesmo chamada por página permitida", async () => {
  const manifest = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"))
  const entry = Object.entries(manifest.node as Record<string, { exportedName?: string; filename?: string }>).find(([, v]) => v.exportedName === "getCaixaSessaoAbertaV3" && v.filename?.includes("pdv-servico-actions"))
  expect(!!entry).toBe(true)
  const owner = await login("owner", "pilot-b"), basic = await login("adminA")
  const options = { headers: { "Next-Action": entry![0], "Content-Type": "text/plain;charset=UTF-8" }, data: JSON.stringify(["pilot-b"]) }
  const allowed = await owner.post("/dashboard", options)
  expect(allowed.status()).toBe(200); expect(await allowed.text()).toContain("Operador Privado B")
  const denied = await basic.post("/dashboard", options)
  expect(denied.status()).toBeGreaterThanOrEqual(400); expect(await denied.text()).not.toContain("Operador Privado B")
})

test("provisionamento atômico cria ADMIN local com primeiro acesso obrigatório", async () => {
  const owner = await login("owner"), local = await login("adminA")
  const input = { storeName: "Nova Padaria Sintética", name: "Novo Cliente Sintético", email: "new-client@pilot.invalid", branch: "padaria" }
  expect((await local.post("/api/platform/provision", { data: input })).status()).toBe(403)
  const r = await owner.post("/api/platform/provision", { data: input }); expect(r.status()).toBe(201)
  const created = await r.json()
  expect({ role: created.user.role, scope: created.user.accessScope, required: created.user.mustChangePassword }).toEqual({ role: "ADMIN", scope: "STORE", required: true })
  const client = await loginCredentials(input.email, created.temporaryPassword, created.store.id)
  expect((await client.get("/api/stores")).status()).toBe(403)
  const before = await db.store.count()
  expect((await owner.post("/api/platform/provision", { data: input })).status()).toBe(409)
  expect(await db.store.count()).toBe(before)
})

test("senha temporária exige troca própria e revoga sessões; desativação invalida JWT", async ({ page }) => {
  const actor = await login("temporary")
  await setupPage(page, actor); await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/conta\/seguranca/)
  expect((await actor.post("/api/account/password", { data: { currentPassword: password("temporary"), newPassword: "SenhaSinteticaForte123!", userId: "pilot-owner" } })).status()).toBe(400)
  const newPassword = "aA1!" + randomBytes(18).toString("hex")
  const changed = await actor.post("/api/account/password", { data: { currentPassword: password("temporary"), newPassword } })
  expect(changed.status()).toBe(200)
  expect(!!(await (await actor.get("/api/auth/session")).json())?.user).toBe(false)
  const fresh = await loginCredentials("temporary@pilot.invalid", newPassword)
  expect((await (await fresh.get("/api/auth/session")).json()).user.mustChangePassword).toBe(false)
  const seller = await login("seller"), manager = await login("managerA")
  try {
    expect((await manager.patch("/api/admin/users/pilot-seller", { data: { active: false } })).status()).toBe(200)
    expect(!!(await (await seller.get("/api/auth/session")).json())?.user).toBe(false)
    expect((await seller.get("/api/ops/vendas-list?lojaId=pilot-a")).status()).toBe(401)
  } finally { await manager.patch("/api/admin/users/pilot-seller", { data: { active: true } }) }
})
