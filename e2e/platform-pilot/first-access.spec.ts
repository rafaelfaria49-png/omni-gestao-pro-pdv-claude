import { randomBytes } from "node:crypto"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"

const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.CI !== "true" || process.env.PILOT_TEST_DATABASE_URL !== database || process.env.MIGRATION_AUTHORITY_ENABLED !== "false") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
// Secrets only live in memory. No auto screenshots, videos, traces, storageState or secret assertions.
test.use({ screenshot: "off", trace: "off", video: "off" })
test.afterAll(async () => { await db.$disconnect() })

async function secretInput(input: Locator, value: string) {
  await input.evaluate((node, secret) => {
    const element = node as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, secret)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  }, value)
}
async function login(page: Page, email: string, password: string) {
  await page.goto("/login")
  // Existing active-store preference only; authentication still goes through the real login form.
  if (email === "owner@pilot.invalid") await page.evaluate(() => localStorage.setItem("assistec-pro-loja-ativa-v1", "pilot-legacy"))
  await page.getByLabel("Email", { exact: true }).fill(email)
  await secretInput(page.getByLabel("Senha", { exact: true }), password)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await expect(page).toHaveURL(/\/(dashboard|conta\/seguranca)/)
}
async function logout(page: Page) {
  await page.goto("/dashboard/configuracoes?sec=seguranca")
  await page.getByRole("button", { name: "Encerrar sessão", exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(!!(await (await page.request.get("/api/auth/session")).json())?.user).toBe(false)
}
const wizard = (page: Page) => page.getByRole("dialog").filter({ has: page.getByTestId("first-access-store") })
const field = (scope: Locator, label: string) => label === "Preço venda (R$)"
  ? scope.getByLabel(/^Preço venda \(R\$ \/ /)
  : label === "SKU" ? scope.getByLabel(/^(SKU|Código interno \(SKU\))$/)
    : scope.locator(`xpath=.//div[label[normalize-space()="${label}"]]`).locator("input, textarea").first()
const productModal = (page: Page) => page.locator("div.fixed.inset-0").filter({ has: page.locator('[data-omni-ui-kit="modal-header"]') }).filter({ has: page.getByRole("button", { name: "Salvar produto", exact: true }) })
const row = (page: Page, name: string) => page.locator("tbody tr").filter({ hasText: name })
async function products(page: Page) {
  await page.goto("/dashboard/cadastros-v2")
  await expect(page.getByText("Cadastros: Padaria / Confeitaria")).toBeVisible()
  await page.getByRole("button", { name: "Produtos", exact: true }).click()
}
async function assertWidth(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  const dialog = wizard(page)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
}
async function authority(storeId: string, email: string) {
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } })
  const user = await db.adminUser.findUniqueOrThrow({ where: { email }, include: { adminUserStores: { orderBy: { storeId: "asc" }, select: { storeId: true } } } })
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { storeId } })
  return { modules: store.moduleAccess, profile: store.profile, plan: store.subscriptionPlan, role: user.role, scope: user.accessScope, memberships: user.adminUserStores, config: settings.printerConfig }
}

test("jornada integral: provisionar → senha obrigatória → assistente → produto unitário → novo login", async ({ page, browser }) => {
  test.setTimeout(240_000)
  const email = "first-access-client@pilot.invalid"
  await login(page, "owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!)
  await page.goto("/dashboard/plataforma")
  await page.getByLabel("Nome da loja", { exact: true }).fill("Padaria Primeiro Acesso Sintética")
  await page.getByLabel("Responsável da loja").fill("Responsável Primeiro Acesso Sintético")
  await page.getByLabel("Email de acesso").fill(email)
  await page.getByLabel("Ramo principal").selectOption("padaria")
  await page.getByRole("button", { name: "Provisionar cliente", exact: true }).click()
  await expect(page.getByText("Loja e conta criadas. A senha deverá ser trocada no primeiro acesso.")).toBeVisible()
  let temporary = await page.getByLabel("Senha temporária individual").inputValue()
  expect(temporary.length > 12).toBe(true)
  await page.getByRole("button", { name: "Ocultar e descartar", exact: true }).click()
  const store = await db.store.findFirstOrThrow({ where: { name: "Padaria Primeiro Acesso Sintética" } })
  const before = await authority(store.id, email)

  const clientContext = await browser.newContext({ baseURL: process.env.PILOT_BASE_URL, serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    const client = await clientContext.newPage()
    await login(client, email, temporary)
    await expect(client.getByRole("heading", { name: "Primeiro acesso", exact: true })).toBeVisible()
    const temporarySession = await (await client.request.get("/api/auth/session")).json()
    expect({ email: temporarySession?.user?.email, required: temporarySession?.user?.mustChangePassword }).toEqual({ email, required: true })
    expect((await client.request.get("/api/stores")).status()).toBe(403)
    const personal = "aA1!" + randomBytes(18).toString("hex")
    await secretInput(client.getByLabel("Senha atual", { exact: true }), temporary)
    await secretInput(client.getByLabel("Nova senha", { exact: true }), personal)
    await secretInput(client.getByLabel("Confirme a nova senha", { exact: true }), personal)
    const signout = client.waitForResponse((response) => response.url().includes("/api/auth/signout") && response.request().method() === "POST").catch(() => null)
    const [changed] = await Promise.all([
      client.waitForResponse((response) => response.url().includes("/api/account/password") && response.request().method() === "POST"),
      client.getByRole("button", { name: "Alterar minha senha", exact: true }).click(),
    ])
    const changedBody = await changed.json()
    expect({ status: changed.status(), error: changedBody.error }).toEqual({ status: 200, error: undefined })
    expect((await signout)?.status()).toBe(200)
    await expect(client).toHaveURL(/\/login(?:\?|$)/)
    expect(!!(await (await client.request.get("/api/auth/session")).json())?.user).toBe(false)
    temporary = ""
    await login(client, email, personal)
    const session = await (await client.request.get("/api/auth/session")).json()
    expect({ platform: session.user.platformAuthority, scope: session.user.accessScope, required: session.user.mustChangePassword }).toEqual({ platform: false, scope: "STORE", required: false })
    const modal = wizard(client)
    await expect(modal.getByLabel("Nome da loja (nome fantasia)")).toHaveValue(store.name)
    await expect(modal.getByTestId("first-access-store")).toContainText(store.name)
    await modal.getByLabel("CNPJ", { exact: true }).fill("00.000.000/0001-00")
    await modal.getByRole("button", { name: "Continuar", exact: true }).click()
    await modal.getByLabel("Rua", { exact: true }).fill("Rua Sintética da Padaria")
    await modal.getByLabel("Número", { exact: true }).fill("12")
    await modal.getByLabel("Bairro", { exact: true }).fill("Bairro Sintético")
    await modal.getByLabel("Cidade", { exact: true }).fill("Cidade Sintética")
    await modal.getByLabel("Estado", { exact: true }).fill("SP")
    await modal.getByLabel("CEP", { exact: true }).fill("00000-000")
    await modal.getByLabel("Telefone", { exact: true }).fill("11999990001")
    await modal.getByLabel("WhatsApp da loja", { exact: true }).fill("11999990002")
    await modal.getByLabel("WhatsApp do responsável", { exact: true }).fill("11999990003")
    await modal.getByLabel("E-mail", { exact: true }).fill("contato-primeiro@pilot.invalid")
    await modal.getByRole("button", { name: "Continuar", exact: true }).click()
    await expect(modal).toContainText("Padaria / Confeitaria")
    await expect(modal.getByRole("combobox")).toHaveCount(0)
    await modal.getByRole("button", { name: "Concluir", exact: true }).click()
    await expect(modal.getByRole("heading", { name: "Dados básicos da loja concluídos", exact: true })).toBeVisible()
    await expect(modal.getByRole("status")).toHaveText("Dados básicos salvos e conferidos.")
    await expect(modal.getByRole("link", { name: "Acessar Clientes", exact: true })).toHaveAttribute("href", "/dashboard/clientes")
    expect(await authority(store.id, email)).toEqual(before)
    const persisted = await db.store.findUniqueOrThrow({ where: { id: store.id } })
    expect(persisted).toMatchObject({ cnpj: "00.000.000/0001-00", phone: "11999990001", address: { rua: "Rua Sintética da Padaria", numero: "12" } })
    await client.screenshot({ path: "test-results/platform-pilot/first-access-complete.png", fullPage: true })
    await modal.getByRole("link", { name: "Acessar Cadastros para incluir produtos" }).click()
    await expect(client.getByText("Cadastros: Padaria / Confeitaria")).toBeVisible()
    await client.getByRole("button", { name: "Produtos", exact: true }).click()
    const toolbar = client.getByPlaceholder("Buscar em produtos…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
    await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
    const product = productModal(client)
    await expect(product.getByRole("combobox", { name: "Forma de venda" })).toHaveValue("unidade")
    await expect(field(product, "Nome")).toHaveAttribute("placeholder", "Ex.: Pão francês")
    await field(product, "Nome").fill("Pão Unitário Primeiro Acesso Sintético")
    await field(product, "SKU").fill("PILOT-FIRST-UNIT-1")
    await field(product, "Preço venda (R$)").fill("1,50")
    await product.getByRole("button", { name: "Salvar produto", exact: true }).click()
    await expect(client.getByText("Produto salvo com sucesso.").first()).toBeVisible()
    await expect(product).toHaveCount(0)
    await client.getByPlaceholder("Buscar em produtos…").fill("PILOT-FIRST-UNIT-1")
    await row(client, "Pão Unitário Primeiro Acesso Sintético").getByRole("button", { name: /Editar/ }).click()
    await expect(field(productModal(client), "SKU")).toHaveValue("PILOT-FIRST-UNIT-1")
    await productModal(client).getByRole("button", { name: "Cancelar", exact: true }).click()
    await logout(client)
    await login(client, email, personal)
    await client.goto("/dashboard/configuracoes?sec=geral")
    await expect(wizard(client)).toHaveCount(0)
    await expect(client.getByLabel("Nome da empresa", { exact: true })).toHaveValue(store.name)
    await expect(client.getByLabel("Email", { exact: true })).toHaveValue("contato-primeiro@pilot.invalid")
    await expect(client.getByLabel("Rua", { exact: true })).toHaveValue("Rua Sintética da Padaria")
    await expect(client.locator("#ramo-recursos").getByRole("combobox", { name: "Ramo principal" })).toHaveValue("padaria")
    await products(client)
    await client.getByPlaceholder("Buscar em produtos…").fill("PILOT-FIRST-UNIT-1")
    await expect(row(client, "Pão Unitário Primeiro Acesso Sintético")).toHaveCount(1)
    expect(await db.produto.count({ where: { storeId: store.id, sku: "PILOT-FIRST-UNIT-1" } })).toBe(1)
    expect(await authority(store.id, email)).toEqual(before)
    for (const path of ["ia-mestre", "omni-agent", "marketing-ia", "whatsapp", "master-console", "unidades", "catalogo-aparelhos", "operacoes-v3"]) await expect(client.locator(`a[href="/dashboard/${path}"]`)).toHaveCount(0)
    await client.setViewportSize({ width: 390, height: 844 })
    await client.goto("/dashboard")
    await client.getByRole("button", { name: "Abrir menu de navegação" }).click()
    await expect(client.getByRole("dialog", { name: "Navegação" })).not.toContainText(/IA Mestre|Master Console|WhatsApp HUB|Catálogo de Aparelhos/)
  } finally { temporary = ""; await clientContext.close() }
})

test("A→B durante leitura não mistura identidade nem transfere dispensa; teclado, desktop e 390/320 px", async ({ page }) => {
  await login(page, "owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!)
  await page.goto("/dashboard/configuracoes?sec=lojas")
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  let seen = false
  await page.route("**/api/stores/pilot-initial-a", async (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    const response = await route.fetch(); seen = true
    await held
    try { await route.fulfill({ response }) } catch { /* canceled by the store switch */ }
  })
  const card = (id: string) => page.locator("[role=button][tabindex]").filter({ has: page.getByText(id, { exact: true }) })
  await card("pilot-initial-a").getByRole("button", { name: "Gerenciar", exact: true }).click()
  await expect.poll(() => seen).toBe(true)
  await expect(wizard(page)).toContainText("Padaria Inicial A")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Retomar configuração inicial", exact: true })).toBeVisible()
  await card("pilot-initial-b").getByRole("button", { name: "Gerenciar", exact: true }).click()
  const modal = wizard(page)
  await expect(modal.getByLabel("Nome da loja (nome fantasia)")).toHaveValue("Padaria Inicial B")
  release()
  await page.unroute("**/api/stores/pilot-initial-a")
  await expect(modal.getByLabel("Nome da loja (nome fantasia)")).toHaveValue("Padaria Inicial B")
  await modal.getByLabel("CNPJ", { exact: true }).fill("00.000.000/0002-00")
  await modal.getByLabel("CNPJ", { exact: true }).press("Tab")
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BUTTON")
  await modal.getByRole("button", { name: "Continuar", exact: true }).click()
  await expect(modal.getByLabel("Telefone", { exact: true })).toHaveValue("11999990022")
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await assertWidth(page)
    await modal.getByLabel("Rua", { exact: true }).fill("Rua B digitada")
    await expect(modal.getByLabel("Rua", { exact: true })).toHaveValue("Rua B digitada")
    await page.screenshot({ path: `test-results/platform-pilot/first-access-${width}.png`, fullPage: true })
  }
  await expect(modal.getByLabel("WhatsApp da loja", { exact: true })).toHaveValue("11999990033")
  expect((await db.store.findUniqueOrThrow({ where: { id: "pilot-initial-b" } })).cnpj).toBe("")
})

test("falha de contatos, duplo clique e resposta incerta preservam dados e retomam só o patch restante", async ({ page }) => {
  await login(page, "onboardingmulti@pilot.invalid", process.env.PILOT_PASSWORD_ONBOARDINGMULTI!)
  const modal = wizard(page)
  await expect(modal.getByLabel("Nome da loja (nome fantasia)")).toHaveValue("Padaria Inicial A")
  const before = await authority("pilot-initial-a", "onboardingmulti@pilot.invalid")
  await modal.getByLabel("CNPJ", { exact: true }).fill("00.000.000/0001-00")
  await modal.getByRole("button", { name: "Continuar", exact: true }).click()
  await expect(modal.getByLabel("Telefone", { exact: true })).toHaveValue("11999990011")
  await expect(modal.getByLabel("E-mail", { exact: true })).toHaveValue("pilot-initial-a@pilot.invalid")
  await modal.getByLabel("E-mail", { exact: true }).fill("retry@pilot.invalid")
  await expect(modal.getByLabel("Número", { exact: true })).toHaveValue("42")
  await modal.getByLabel("Rua", { exact: true }).fill("Rua Sintética A revisada")
  await modal.getByRole("button", { name: "Continuar", exact: true }).click()
  let fail = true, storePuts = 0, contactPuts = 0
  await page.route("**/api/stores/pilot-initial-a", async (route) => {
    if (route.request().method() === "PUT") storePuts++
    await route.fallback()
  })
  await page.route("**/api/stores/pilot-initial-a/settings", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback()
    contactPuts++
    if (fail) return route.fulfill({ status: 500, json: { error: "Falha sintética de contatos" } })
    // Apply the real writer, then lose only its response. The reader must resolve this uncertainty.
    await route.fetch(); await route.abort("connectionreset")
  })
  await modal.getByRole("button", { name: "Concluir", exact: true }).dblclick()
  await expect(modal.getByRole("alert")).toContainText("Salvamento incompleto")
  await expect(page.getByRole("heading", { name: "Dados básicos da loja concluídos", exact: true })).toHaveCount(0)
  expect({ storePuts, contactPuts }).toEqual({ storePuts: 1, contactPuts: 1 })
  await modal.getByRole("button", { name: "Voltar", exact: true }).click()
  await expect(modal.getByLabel("E-mail", { exact: true })).toHaveValue("retry@pilot.invalid")
  await modal.getByRole("button", { name: "Continuar", exact: true }).click()
  fail = false
  await modal.getByRole("button", { name: "Concluir", exact: true }).click()
  await expect(modal.getByRole("heading", { name: "Dados básicos da loja concluídos", exact: true })).toBeVisible()
  expect({ storePuts, contactPuts }).toEqual({ storePuts: 1, contactPuts: 2 })
  await page.unrouteAll({ behavior: "wait" })
  const saved = await db.store.findUniqueOrThrow({ where: { id: "pilot-initial-a" } })
  expect(saved).toMatchObject({ logoUrl: "/synthetic-logo.svg", phone: "11999990011", address: { rua: "Rua Sintética A revisada", numero: 42, complemento: "Fundos A", cadastroExtra: "preservado" } })
  expect(await authority("pilot-initial-a", "onboardingmulti@pilot.invalid")).toEqual(before)
  await modal.getByRole("button", { name: "Fechar", exact: true }).click()
  await page.goto("/dashboard/configuracoes?sec=geral")
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("retry@pilot.invalid")
  await page.getByLabel("Telefone", { exact: true }).fill("")
  await page.getByRole("button", { name: "Salvar alterações", exact: true }).click()
  await expect(page.getByText("Dados básicos salvos e conferidos.", { exact: true })).toBeVisible()
  await logout(page)
  await login(page, "onboardingmulti@pilot.invalid", process.env.PILOT_PASSWORD_ONBOARDINGMULTI!)
  await page.goto("/dashboard/configuracoes?sec=geral")
  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("retry@pilot.invalid")
  await expect(page.getByLabel("Telefone", { exact: true })).toHaveValue("")
  expect((await db.store.findUniqueOrThrow({ where: { id: "pilot-initial-a" } })).logoUrl).toBe("/synthetic-logo.svg")
})

test("operador sem configuração e payload para outra loja não gravam; A01 sintética conserva autoridade", async ({ page }) => {
  await login(page, "cashier@pilot.invalid", process.env.PILOT_PASSWORD_CASHIER!)
  const before = await db.store.findUniqueOrThrow({ where: { id: "pilot-a" } })
  for (const id of ["pilot-a", "pilot-b"]) {
    const headers = { "x-assistec-loja-id": id }
    expect((await page.request.put(`/api/stores/${id}`, { headers, data: { name: "Ataque sintético" } })).status()).toBe(403)
    expect((await page.request.put(`/api/stores/${id}/settings`, { headers, data: { contactEmail: "attack@pilot.invalid" } })).status()).toBe(403)
  }
  expect(await db.store.findUniqueOrThrow({ where: { id: "pilot-a" } })).toEqual(before)
  await page.context().clearCookies()
  await login(page, "admina@pilot.invalid", process.env.PILOT_PASSWORD_ADMINA!)
  for (const suffix of ["", "/settings"]) {
    expect((await page.request.put(`/api/stores/pilot-b${suffix}`, { headers: { "x-assistec-loja-id": "pilot-a" }, data: suffix ? { contactEmail: "attack@pilot.invalid" } : { name: "Ataque sintético" } })).status()).toBe(403)
  }
  await page.context().clearCookies()
  await login(page, "owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!)
  const session = await (await page.request.get("/api/auth/session")).json()
  expect({ scope: session.user.accessScope, platform: session.user.platformAuthority, stores: session.user.storeAccess }).toEqual({ scope: null, platform: true, stores: "all" })
  expect((await page.request.get("/api/admin/users")).status()).toBe(200)
  await expect(wizard(page)).toHaveCount(0)
})
