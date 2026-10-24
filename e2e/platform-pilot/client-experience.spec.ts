import { test, expect, request, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS, MODULES } from "../../lib/auth/access-policy"

/**
 * Experiência do cliente básico × visão interna. Banco descartável da suíte, NextAuth
 * real, build de produção. Identidades e lojas sintéticas criadas aqui; senhas só em
 * memória (nunca em títulos, logs ou artifacts).
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()
const secret = () => "aA1!" + randomBytes(18).toString("hex")

const A = "cx-padaria-a", B = "cx-loja-b", ASSIST = "cx-assist", NOVA = "cx-padaria-nova"
const STORED_PRINT = { impressoraHost: "10.0.0.5", impressoraPorta: 9100, viasCupom: 3, abrirGaveta: true, imprimirOs: false, chaveFutura: "preservada" }
const USERS = {
  adminA: { role: "ADMIN", scope: "STORE", store: A },
  staffA: { role: "VENDEDOR", scope: "STORE", store: A },
  adminB: { role: "ADMIN", scope: "STORE", store: B },
  assist: { role: "ADMIN", scope: "STORE", store: ASSIST },
  nova: { role: "ADMIN", scope: "STORE", store: NOVA, mustChange: true },
  legacyCashier: { role: "CAIXA", scope: null, store: "pilot-legacy" },
  legacySeller: { role: "VENDEDOR", scope: null, store: "pilot-legacy" },
} as const
type UserKey = keyof typeof USERS
const passwords = Object.fromEntries(Object.keys(USERS).map((k) => [k, secret()])) as Record<UserKey, string>
const email = (k: UserKey) => `cx-${k.toLowerCase()}@pilot.invalid`

test.beforeAll(async () => {
  const printerConfig = (branch: string) => ({
    untouched: "preservado", impressao: STORED_PRINT,
    pdvParams: { garantiaPadraoDias: 45, atalhosRapidos: ["sintetico"], incluirImpostoEstimadoNoPdv: false, moduloControleConsumo: false },
    capabilities: { version: 1, business: { primaryBranch: branch } },
  })
  for (const [id, name, branch, modules] of [
    [A, "Padaria Sintética CX A", "padaria", BASIC_MODULE_ACCESS.modules],
    [B, "Comércio Sintético CX B", "comercio", BASIC_MODULE_ACCESS.modules],
    [ASSIST, "Assistência Sintética CX", "assistencia", [...BASIC_MODULE_ACCESS.modules, "service", "deviceCatalog"]],
    [NOVA, "Padaria Nova CX", "padaria", BASIC_MODULE_ACCESS.modules],
  ] as const) {
    // Upserts: após uma falha o Playwright reinicia o worker e reexecuta este hook.
    const store = { name, cnpj: id === NOVA ? "" : "00.000.000/0001-91", moduleAccess: { version: 1, modules: [...modules] } }
    await db.store.upsert({ where: { id }, create: { id, ...store }, update: store })
    await db.storeSettings.upsert({ where: { storeId: id }, create: { storeId: id, printerConfig: printerConfig(branch) }, update: { printerConfig: printerConfig(branch) } })
  }
  for (const [key, u] of Object.entries(USERS) as Array<[UserKey, (typeof USERS)[UserKey]]>) {
    const data = { email: email(key), name: `Sintético CX ${key}`, role: u.role, lojaId: u.store, accessScope: u.scope,
      password: await bcrypt.hash(passwords[key], 10), mustChangePassword: "mustChange" in u }
    await db.adminUser.upsert({ where: { id: `cx-${key}` }, update: data,
      create: { id: `cx-${key}`, ...data, adminUserStores: { create: [{ storeId: u.store }] } } })
  }
  const weighed = { storeId: A, name: "Queijo Sintético por Peso CX", price: 49.9, stock: 0, metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } }
  await db.produto.upsert({ where: { id: "cx-queijo-kg" }, create: { id: "cx-queijo-kg", ...weighed }, update: weighed })
})
test.afterEach(async () => { for (const ctx of contexts) await ctx.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function loginWith(address: string, value: string, store: string) {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: address, password: value, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: store, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const ctx = await request.newContext({ baseURL, storageState: state })
  contexts.add(ctx)
  expect(!!(await (await ctx.get("/api/auth/session")).json())?.user?.id).toBe(true)
  return ctx
}
const login = (key: UserKey, store: string = USERS[key].store) => loginWith(email(key), passwords[key], store)
const loginOwner = (store: string) => loginWith("owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!, store)

/** Requests de superfícies não liberadas: nada disso pode partir da experiência do cliente. */
const FORBIDDEN_REQUESTS = /\/api\/(print\/raw|ia-mestre|user\/credits|catalogo\/aparelhos|marketplace|contador|whatsapp|vision|product\/(voice|ncm|fiscal))/
async function setupPage(page: Page, actor: APIRequestContext) {
  const cookies = (await actor.storageState()).cookies
  await page.context().addCookies(cookies)
  // No navegador a unidade ativa vem do storage; semeia a mesma loja do login (sem sobrescrever trocas).
  const store = cookies.find((c) => c.name === "assistec-active-store")?.value
  await page.context().addInitScript((id) => {
    try { if (id && !localStorage.getItem("assistec-pro-loja-ativa-v1")) localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* storage indisponível */ }
  }, store)
  // Prévia de impressão: o diálogo do sistema não abre no headless; a janela ainda é criada.
  await page.context().addInitScript(() => { window.print = () => {} })
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => { await dialog.getByRole("button", { name: "Voltar depois" }).click() })
  const forbidden: string[] = []
  page.on("request", (r) => { if (FORBIDDEN_REQUESTS.test(new URL(r.url()).pathname)) forbidden.push(new URL(r.url()).pathname) })
  return forbidden
}
const settingsOf = async (storeId: string) => (await db.storeSettings.findUniqueOrThrow({ where: { storeId } })).printerConfig as Record<string, any>
const sidebar = (page: Page) => page.locator("aside").first()
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}
function productModal(page: Page): Locator {
  return page.locator("div.fixed.inset-0").filter({ has: page.locator('[data-omni-ui-kit="modal-header"]') }).filter({ has: page.getByRole("button", { name: "Salvar produto", exact: true }) })
}
const field = (scope: Locator, label: string) => label === "Preço venda (R$)"
  ? scope.getByLabel(/^Preço venda \(R\$ \/ /)
  : scope.locator(`xpath=.//div[label[normalize-space()="${label}"]]`).locator("input, textarea").first()
async function saveProduct(page: Page) {
  const success = page.getByText("Produto salvo com sucesso.")
  await expect(success).toHaveCount(0)
  await productModal(page).getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(success.first()).toBeVisible()
  await expect(productModal(page)).toHaveCount(0)
}
async function settingsMenu(page: Page) {
  const nav = page.locator(".settings-sidebar-list").first()
  await expect(nav).toBeVisible()
  return (await nav.locator("li").allTextContents()).map((t) => t.trim())
}

test("proprietário preserva visão administrativa, módulos e telas históricas mesmo com padaria ativa", async ({ page }) => {
  const owner = await loginOwner(A)
  const s = await (await owner.get("/api/auth/session")).json()
  expect({ platform: s.user.platformAuthority, scope: s.user.accessScope, stores: s.user.storeAccess }).toEqual({ platform: true, scope: null, stores: "all" })
  expect(MODULES).toHaveLength(19)
  await setupPage(page, owner)
  await page.goto("/dashboard")
  for (const path of ["ia-mestre", "master-console", "unidades", "plataforma"]) await expect(sidebar(page).locator(`a[href="/dashboard/${path}"]`)).toHaveCount(1)
  await expect(sidebar(page).locator('a[href="/dashboard/estoque"]')).toHaveCount(0)
  await page.screenshot({ path: `${out}/cx-owner-dashboard-1440.png`, fullPage: true, animations: "disabled" })
  await page.goto("/dashboard/estoque")
  await expect(page.getByRole("button", { name: /Importar XML NF-e/ })).toBeVisible()
  await expect(page.getByRole("button", { name: /Novo Produto ou Serviço/ })).toBeVisible()
  await page.screenshot({ path: `${out}/cx-owner-estoque-1440.png`, fullPage: true, animations: "disabled" })
  await page.goto("/dashboard/configuracoes?sec=geral")
  const menu = await settingsMenu(page)
  for (const label of ["Geral", "Lojas", "Identidade Fiscal", "IA e Créditos", "Usuários e Permissões", "Segurança"]) expect(menu).toContain(label)
  await expect(page.getByText("Preferências regionais")).toBeVisible()
  await page.goto("/dashboard/configuracoes?sec=vendas")
  for (const card of ["Orçamentos", "Impostos", "Mesas e consumo"]) await expect(page.getByText(card, { exact: true })).toBeVisible()
  await page.goto("/dashboard/configuracoes?sec=pdv")
  await expect(page.getByText("Impressão operacional")).toBeVisible()
  await expect(page.getByLabel("Impressora de comprovante (host/IP)")).toHaveValue("10.0.0.5")
  await expect(page.getByRole("button", { name: /Testar impressão/ })).toBeVisible()
  await page.screenshot({ path: `${out}/cx-owner-config-pdv-1440.png`, fullPage: true, animations: "disabled" })
  await page.goto("/dashboard/relatorios")
  await expect(page.getByText("Roadmap").first()).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/dashboard/configuracoes?sec=geral")
  await page.screenshot({ path: `${out}/cx-owner-config-390.png`, fullPage: true, animations: "disabled" })
})

test("contas internas legadas mantêm papéis e restrições anteriores", async ({ page }) => {
  const cashier = await login("legacyCashier"), seller = await login("legacySeller")
  for (const [ctx, role] of [[cashier, "CAIXA"], [seller, "VENDEDOR"]] as const) {
    const s = await (await ctx.get("/api/auth/session")).json()
    expect({ role: s.user.role, platform: s.user.platformAuthority, scope: s.user.accessScope }).toEqual({ role, platform: false, scope: null })
  }
  for (const route of ["/dashboard/estoque", "/dashboard/configuracoes", "/dashboard/cadastros-v2"]) {
    expect([302, 303, 307, 308]).toContain((await cashier.get(route, { maxRedirects: 0 })).status())
  }
  expect([302, 303, 307, 308]).toContain((await seller.get("/dashboard/configuracoes", { maxRedirects: 0 })).status())
  await setupPage(page, seller)
  await page.goto("/dashboard/estoque")
  // Loja legada: tela histórica, sem a entrada nova de Estoque na navegação.
  await expect(page.getByRole("button", { name: /Importar XML NF-e/ })).toBeVisible()
  await expect(sidebar(page).locator('a[href="/dashboard/estoque"]')).toHaveCount(0)
  await expect(sidebar(page).locator('a[href="/dashboard/configuracoes"]')).toHaveCount(0)
})

test("cliente padaria: navegação, estoque e cadastro pela ficha canônica", async ({ page }) => {
  const actor = await login("adminA")
  const forbidden = await setupPage(page, actor)
  await page.goto("/dashboard")
  await expect(sidebar(page).locator('a[href="/dashboard/estoque"]')).toHaveCount(1)
  for (const path of ["ia-mestre", "operacoes-v3", "catalogo-aparelhos", "marketplace", "whatsapp", "contador", "master-console"]) await expect(page.locator(`a[href="/dashboard/${path}"]`)).toHaveCount(0)
  await page.keyboard.press("Control+k")
  const palette = page.getByRole("dialog")
  await expect(palette.getByText("Estoque", { exact: true })).toBeVisible()
  await expect(palette.getByText("Novo Produto", { exact: true })).toBeVisible()
  await expect(palette).not.toContainText(/Nova OS|IA Mestre|Catálogo de Aparelhos|Marketplace/)
  await page.keyboard.press("Escape")

  await sidebar(page).locator('a[href="/dashboard/estoque"]').click()
  await page.waitForURL(/\/dashboard\/estoque$/)
  await expect(page.getByRole("heading", { name: "Estoque", exact: true })).toBeVisible()
  await expect(page.locator("body")).not.toContainText(/Importar XML|IMEI|Prontos p\/ Marketplace|Anúncio|Classificar com IA/)
  const weighed = page.locator("tbody tr").filter({ hasText: "Queijo Sintético por Peso CX" })
  await expect(weighed.locator("[data-unidade]")).toHaveAttribute("data-unidade", "KG")
  await expect(weighed).toContainText("venda por peso em preparação")
  await expect(weighed.getByRole("button", { name: /Estoque/ })).toBeVisible()

  const name = "Pão de Queijo Sintético CX"
  const toolbar = page.getByPlaceholder("Buscar em produtos…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
  await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
  let editor = productModal(page)
  await expect(editor.getByLabel("Nome", { exact: true })).toBeFocused()
  await expect(editor).not.toContainText(/IMEI|capinhas|películas|compatibilidade com aparelhos/i)
  await field(editor, "Nome").fill(name)
  await field(editor, "Preço venda (R$)").fill("12,50")
  await saveProduct(page)
  const created = await db.produto.findFirstOrThrow({ where: { storeId: A, name } })
  expect({ price: created.price, stock: created.stock }).toEqual({ price: 12.5, stock: 0 })
  expect(await db.produto.count({ where: { storeId: B, name } })).toBe(0)

  await page.getByPlaceholder("Buscar em produtos…").fill(name)
  const row = page.locator("tbody tr").filter({ hasText: name })
  await expect(row.locator("[data-unidade]")).toHaveAttribute("data-unidade", "UN")
  await row.getByRole("button", { name: /Editar/ }).click()
  editor = productModal(page)
  await expect(field(editor, "Preço venda (R$)")).toHaveValue("12,50")
  await field(editor, "Preço venda (R$)").fill("13,00")
  await saveProduct(page)
  const edited = await db.produto.findUniqueOrThrow({ where: { id: created.id } })
  expect({ id: edited.id, price: edited.price, stock: edited.stock }).toEqual({ id: created.id, price: 13, stock: 0 })

  // Atalho "Novo Produto" abre a aba e a ficha esperadas, sem formulário paralelo.
  await page.getByRole("button", { name: "Novo", exact: true }).first().click()
  await page.getByRole("menuitem", { name: /Novo Produto/ }).click()
  await page.waitForURL(/\/dashboard\/cadastros-v2\?aba=produtos/)
  await expect(productModal(page)).toBeVisible()
  await productModal(page).getByRole("button", { name: "Cancelar" }).click()
  await page.screenshot({ path: `${out}/cx-store-cadastro-1440.png`, fullPage: true, animations: "disabled" })
  expect(forbidden).toEqual([])
})

test("cliente padaria: configurações permitidas, patches parciais e campos ocultos preservados", async ({ browser }) => {
  const actor = await login("adminA")
  const context: BrowserContext = await browser.newContext({ baseURL, locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    const vendas = await context.newPage(), pdv = await context.newPage()
    const forbidden = [...await setupPage(vendas, actor), ...await setupPage(pdv, actor)]
    await vendas.goto("/dashboard/configuracoes?sec=geral")
    expect(await settingsMenu(vendas)).toEqual(["Dados da loja", "Aparência", "PDV e impressão", "Vendas e pagamentos", "Equipe", "Segurança da conta"])
    await expect(vendas.getByRole("heading", { name: "Dados da loja" }).first()).toBeVisible()
    await expect(vendas.getByText("Preferências regionais")).toHaveCount(0)
    const ramo = vendas.locator("#ramo-recursos").getByRole("combobox", { name: "Ramo principal" })
    await expect(ramo).toHaveValue("padaria")
    expect(await ramo.locator("option").allTextContents()).not.toContain("Assistência técnica")

    // Aba PDV: rascunho de impressão aberto enquanto a outra aba grava Vendas.
    await pdv.goto("/dashboard/configuracoes?sec=pdv")
    await expect(pdv.getByText("Impressão do cupom")).toBeVisible()
    for (const hidden of [/host\/IP/, /Porta TCP/, /Abrir gaveta/, /Testar impressão/, /Vias do cupom/, /impressão térmica de OS/]) await expect(pdv.locator("body")).not.toContainText(hidden)
    await pdv.getByLabel("Rodapé do cupom").fill("Volte sempre CX")

    await vendas.goto("/dashboard/configuracoes?sec=vendas")
    for (const hidden of ["Orçamentos", "Impostos", "Mesas e consumo"]) await expect(vendas.getByText(hidden, { exact: true })).toHaveCount(0)
    const pix = vendas.getByRole("switch", { name: "Ativar PIX" })
    await expect(pix).toBeChecked()
    await pix.click()
    await vendas.getByRole("button", { name: "Salvar alterações" }).click()
    await expect(vendas.getByText("Vendas atualizadas").first()).toBeVisible()
    let stored = await settingsOf(A)
    expect(stored.pdvParams.formasPagamento.find((f: { id: string }) => f.id === "pix").ativo).toBe(false)
    expect({ garantia: stored.pdvParams.garantiaPadraoDias, atalhos: stored.pdvParams.atalhosRapidos, untouched: stored.untouched, impressao: stored.impressao })
      .toEqual({ garantia: 45, atalhos: ["sintetico"], untouched: "preservado", impressao: STORED_PRINT })

    await pdv.getByRole("button", { name: "Salvar impressão" }).click()
    await expect(pdv.getByText("Impressão salva").first()).toBeVisible()
    stored = await settingsOf(A)
    expect(stored.impressao).toEqual({ ...STORED_PRINT, rodapeCupom: "Volte sempre CX" })
    expect(stored.pdvParams.formasPagamento.find((f: { id: string }) => f.id === "pix").ativo).toBe(false)
    expect(stored.capabilities.business.primaryBranch).toBe("padaria")

    // Ação do leitor: só a própria chave muda.
    await pdv.getByLabel(/Abrir Item Avulso automaticamente/).click()
    await pdv.getByRole("button", { name: "Salvar alterações" }).first().click()
    await expect(pdv.getByText("PDV atualizado").first()).toBeVisible()
    stored = await settingsOf(A)
    expect({ scan: stored.pdvScanUnregisteredAction, impressao: stored.impressao, garantia: stored.pdvParams.garantiaPadraoDias, untouched: stored.untouched })
      .toEqual({ scan: "open_avulso", impressao: { ...STORED_PRINT, rodapeCupom: "Volte sempre CX" }, garantia: 45, untouched: "preservado" })

    // Prévia explícita pelo navegador: nenhuma venda, pagamento, gravação ou ponte TCP.
    const vendasAntes = await db.venda.count({ where: { storeId: A } })
    const [preview] = await Promise.all([pdv.waitForEvent("popup"), pdv.getByRole("button", { name: "Prévia no navegador" }).click()])
    await expect(preview.locator("body")).toContainText("PRÉVIA — sem valor fiscal")
    await expect(preview.locator("body")).toContainText("Volte sempre CX")
    await preview.close()
    expect(await db.venda.count({ where: { storeId: A } })).toBe(vendasAntes)

    // Injeção controlada de falha no PUT: nenhuma confirmação falsa, banco intacto.
    await vendas.route(`**/api/stores/${A}/settings`, (route) => route.request().method() === "PUT"
      ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Falha injetada CX" }) })
      : route.continue())
    await vendas.reload()
    await vendas.getByRole("switch", { name: "Ativar Boleto" }).click()
    await vendas.getByRole("button", { name: "Salvar alterações" }).click()
    await expect(vendas.getByText("Falha injetada CX").first()).toBeVisible()
    await expect(vendas.getByText("Vendas atualizadas")).toHaveCount(0)
    expect((await settingsOf(A)).pdvParams.formasPagamento.find((f: { id: string }) => f.id === "boleto").ativo).toBe(true)
    await vendas.unroute(`**/api/stores/${A}/settings`)
    expect(forbidden).toEqual([])
  } finally { await context.close() }

  // Nova sessão relê o que foi gravado.
  const again = await login("adminA")
  const settings = await (await again.get(`/api/stores/${A}/settings`, { headers: { "x-assistec-loja-id": A } })).json()
  expect(settings.settings.printerConfig.impressao.rodapeCupom).toBe("Volte sempre CX")
})

test("relatórios disponíveis abrem sob STORE; roadmap e destinos negados não aparecem", async ({ page }) => {
  const actor = await login("adminA")
  await setupPage(page, actor)
  await page.goto("/dashboard/relatorios")
  await expect(page.getByRole("heading", { name: "Histórico de Caixa" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Histórico de Vendas" })).toBeVisible()
  await expect(page.locator("main").first()).not.toContainText(/Roadmap|DRE|Curva ABC|Ordens de Serviço|Técnicos|Financeiro|WhatsApp/)
  await page.getByRole("heading", { name: "Histórico de Vendas" }).click()
  await page.waitForURL(/\/dashboard\/vendas-arquivo-geral/)
  await expect(page.locator("body")).not.toContainText("Acesso indisponível")
  await page.goto("/dashboard/relatorios")
  await page.getByRole("heading", { name: "Histórico de Caixa" }).click()
  await page.waitForURL(/\/dashboard\/caixa\/historico/)
  await expect(page.locator("body")).not.toContainText("Acesso indisponível")
  expect((await actor.get(`/api/ops/vendas-list?lojaId=${A}`, { headers: { "x-assistec-loja-id": A } })).status()).toBe(200)
  expect((await actor.get(`/api/ops/vendas-list?lojaId=${B}`, { headers: { "x-assistec-loja-id": B } })).status()).toBe(403)
})

test("negativas: URL, payload e loja B adulterados não concedem acesso", async () => {
  const a = await login("adminA"), b = await login("adminB"), staff = await login("staffA")
  for (const route of ["/dashboard/operacoes-v3", "/dashboard/catalogo-aparelhos", "/dashboard/vendas/mesas", "/dashboard/unidades", "/dashboard/configuracoes-v2"]) {
    expect([302, 303, 307, 308]).toContain((await a.get(route, { maxRedirects: 0 })).status())
  }
  expect((await a.post("/api/print/raw", { headers: { "x-assistec-loja-id": A }, data: { host: "127.0.0.1", port: 9, data: "AA==" } })).status()).toBe(403)
  expect((await a.put(`/api/stores/${A}/settings`, { headers: { "x-assistec-loja-id": A }, data: { moduleAccess: { version: 1, modules: [...MODULES] } } })).status()).toBe(403)
  expect((await a.get(`/api/stores/${B}/settings`, { headers: { "x-assistec-loja-id": B } })).status()).toBe(403)
  expect((await b.put(`/api/stores/${A}/settings`, { headers: { "x-assistec-loja-id": A }, data: { printerConfig: { untouched: "adulterado" } } })).status()).toBe(403)
  expect((await staff.put(`/api/stores/${A}/settings`, { headers: { "x-assistec-loja-id": A }, data: { printerConfig: { untouched: "adulterado" } } })).status()).toBe(403)
  expect((await settingsOf(A)).untouched).toBe("preservado")
  expect([302, 303, 307, 308]).toContain((await staff.get("/dashboard/configuracoes", { maxRedirects: 0 })).status())
  const modules = (await db.store.findUniqueOrThrow({ where: { id: A } })).moduleAccess
  expect(modules).toEqual({ version: 1, modules: [...BASIC_MODULE_ACCESS.modules] })
})

test("assistência STORE explicitamente liberada continua com assistência", async ({ page }) => {
  const actor = await login("assist")
  await setupPage(page, actor)
  expect((await actor.get(`/api/ops/ordens?lojaId=${ASSIST}`, { headers: { "x-assistec-loja-id": ASSIST } })).status()).toBe(200)
  await page.goto("/dashboard")
  await expect(sidebar(page).locator('a[href="/dashboard/operacoes-v3"]')).toHaveCount(1)
  await expect(sidebar(page).locator('a[href="/dashboard/catalogo-aparelhos"]')).toHaveCount(1)
  await page.goto("/dashboard/configuracoes?sec=geral")
  const ramo = page.locator("#ramo-recursos").getByRole("combobox", { name: "Ramo principal" })
  await expect(ramo).toHaveValue("assistencia")
  expect(await ramo.locator("option").allTextContents()).toContain("Assistência técnica")
  await page.goto("/dashboard/configuracoes?sec=vendas")
  await expect(page.getByText("Orçamentos", { exact: true })).toBeVisible()
  await expect(page.getByText("Impostos", { exact: true })).toHaveCount(0)
  await page.goto("/dashboard/cadastros-v2")
  await expect(page.getByRole("button", { name: "Serviços", exact: true })).toBeVisible()
})

test("proprietário prepara a loja; cliente troca a própria senha e encontra os dados", async ({ page, browser }) => {
  const owner = await loginOwner(NOVA)
  await setupPage(page, owner)
  await page.goto("/dashboard/configuracoes?sec=geral")
  await expect(page.getByRole("heading", { name: "Geral" }).first()).toBeVisible()
  await page.getByLabel("CNPJ", { exact: true }).fill("11.222.333/0001-81")
  await page.getByLabel("Telefone", { exact: true }).fill("(11) 98888-1234")
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await expect(page.getByText("Dados da empresa salvos e conferidos para esta unidade.").first()).toBeVisible()
  const prepared = await db.store.findUniqueOrThrow({ where: { id: NOVA } })
  expect({ cnpj: prepared.cnpj, phone: prepared.phone }).toEqual({ cnpj: "11.222.333/0001-81", phone: "(11) 98888-1234" })
  // A preparação pelo proprietário não consome a troca obrigatória da cliente.
  expect((await db.adminUser.findUniqueOrThrow({ where: { id: "cx-nova" } })).mustChangePassword).toBe(true)

  const temporary = await login("nova")
  expect((await (await temporary.get("/api/auth/session")).json()).user.mustChangePassword).toBe(true)
  expect([302, 303, 307, 308]).toContain((await temporary.get(`/dashboard/configuracoes`, { maxRedirects: 0 })).status())
  const next = secret()
  expect((await temporary.post("/api/account/password", { data: { currentPassword: passwords.nova, newPassword: next } })).status()).toBe(200)
  const client = await loginWith(email("nova"), next, NOVA)
  const context = await browser.newContext({ baseURL, locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    const clientPage = await context.newPage()
    const forbidden = await setupPage(clientPage, client)
    await clientPage.goto("/dashboard/configuracoes?sec=geral")
    await expect(clientPage.getByRole("heading", { name: "Dados da loja" }).first()).toBeVisible()
    await expect(clientPage.getByLabel("Telefone", { exact: true })).toHaveValue("(11) 98888-1234")
    await expect(clientPage.getByLabel("CNPJ", { exact: true })).toHaveValue("11.222.333/0001-81")
    expect(await settingsMenu(clientPage)).not.toContain("Lojas")
    await expect(clientPage.getByText("Preferências regionais")).toHaveCount(0)
    expect(forbidden).toEqual([])
  } finally { await context.close() }
})

test("visual: cliente em 1440/1024/390/320 sem overflow, com teclado e menu móvel", async ({ page }) => {
  const actor = await login("adminA")
  await setupPage(page, actor)
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 })
    for (const [path, slug] of [["/dashboard/estoque", "estoque"], ["/dashboard/configuracoes?sec=vendas", "config-vendas"], ["/dashboard/relatorios", "relatorios"]] as const) {
      await page.goto(path)
      await expect(page.locator("main").first()).toBeVisible()
      if (slug === "estoque") await expect(page.getByRole("heading", { name: "Estoque", exact: true })).toBeVisible()
      await noHorizontalOverflow(page)
      await page.screenshot({ path: `${out}/cx-store-${slug}-${width}.png`, fullPage: true, animations: "disabled" })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/dashboard")
  await page.getByRole("button", { name: "Abrir menu de navegação" }).click()
  const nav = page.getByRole("dialog", { name: "Navegação" })
  await expect(nav.getByRole("link", { name: "Estoque", exact: true })).toBeVisible()
  await expect(nav).not.toContainText(/IA Mestre|Catálogo de Aparelhos|Operações|Marketplace/)
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/dashboard/estoque")
  await page.getByPlaceholder("Buscar em produtos…").focus()
  await page.keyboard.type("Queijo")
  await expect(page.locator("tbody tr").filter({ hasText: "Queijo Sintético por Peso CX" })).toBeVisible()
})
