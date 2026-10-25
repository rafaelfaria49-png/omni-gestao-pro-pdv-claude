import { test, expect, request, type APIRequestContext, type Locator, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../lib/auth/access-policy"

/**
 * Categoria explícita e feedback de estoque na ficha canônica de produto, na
 * experiência do cliente (STORE padaria com pacote básico) e na visão interna.
 * Banco descartável da suíte, NextAuth real, build de produção + next start.
 * Toda escrita passa pela aplicação; o banco só é lido para conferir persistência.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()
const secret = () => "aA1!" + randomBytes(18).toString("hex")

const A = "cc-padaria-a", B = "cc-padaria-b"
const USERS = {
  adminA: { role: "ADMIN", store: A },
  adminB: { role: "ADMIN", store: B },
  caixaA: { role: "CAIXA", store: A },
} as const
type UserKey = keyof typeof USERS
const passwords = Object.fromEntries(Object.keys(USERS).map((k) => [k, secret()])) as Record<UserKey, string>
const email = (k: UserKey) => `cc-${k.toLowerCase()}@pilot.invalid`
const PRODUCTS = {
  un: { id: "cc-bolo-un", name: "Bolo Sintético CC por unidade", metadata: {} },
  kg: { id: "cc-queijo-kg", name: "Queijo Sintético CC por peso", metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } },
  invalid: { id: "cc-invalido", name: "Produto Sintético CC declaração inválida", metadata: { comercial: { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } } },
} as const

test.beforeAll(async () => {
  // Upserts: após uma falha o Playwright reinicia o worker e reexecuta este hook.
  for (const [id, name] of [[A, "Padaria Sintética CC A"], [B, "Padaria Sintética CC B"]] as const) {
    const store = { name, cnpj: "00.000.000/0001-91", moduleAccess: { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } }
    await db.store.upsert({ where: { id }, create: { id, ...store }, update: store })
    const printerConfig = { capabilities: { version: 1, business: { primaryBranch: "padaria" } } }
    await db.storeSettings.upsert({ where: { storeId: id }, create: { storeId: id, printerConfig }, update: { printerConfig } })
  }
  for (const [key, u] of Object.entries(USERS) as Array<[UserKey, (typeof USERS)[UserKey]]>) {
    const data = { email: email(key), name: `Sintético CC ${key}`, role: u.role, lojaId: u.store, accessScope: "STORE",
      password: await bcrypt.hash(passwords[key], 10), mustChangePassword: false }
    await db.adminUser.upsert({ where: { id: `cc-${key}` }, update: data,
      create: { id: `cc-${key}`, ...data, adminUserStores: { create: [{ storeId: u.store }] } } })
  }
  for (const p of Object.values(PRODUCTS)) {
    const data = { storeId: A, name: p.name, price: 10, stock: 0, metadata: p.metadata }
    await db.produto.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: {} })
  }
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
const login = (key: UserKey) => loginWith(email(key), passwords[key], USERS[key].store)
const loginOwner = (store: string) => loginWith("owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!, store)

async function setupPage(page: Page, actor: APIRequestContext) {
  const cookies = (await actor.storageState()).cookies
  await page.context().clearCookies()
  await page.context().addCookies(cookies)
  const store = cookies.find((c) => c.name === "assistec-active-store")?.value
  await page.context().addInitScript((id) => {
    try { if (id) localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* storage indisponível */ }
  }, store)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => { await dialog.getByRole("button", { name: "Voltar depois" }).click() })
}
async function openProdutos(page: Page) {
  await page.goto("/dashboard/cadastros-v2?aba=produtos")
  await expect(page.getByPlaceholder("Buscar em produtos…")).toBeVisible()
}
/**
 * Raiz da ficha por estrutura/texto (CSS), não por papel acessível: com a janela
 * "Nova categoria" aberta o Radix marca a ficha como aria-hidden e `getByRole` não a vê.
 */
function productModal(page: Page): Locator {
  return page.locator("div.fixed.inset-0")
    .filter({ has: page.locator('[data-omni-ui-kit="modal-header"]') })
    .filter({ has: page.locator("button", { hasText: /^\s*Salvar produto\s*$/ }) })
    .filter({ has: page.locator("#produto-categoria") })
}
const field = (scope: Locator, label: string) => label === "Preço venda (R$)"
  ? scope.getByLabel(/^Preço venda \(R\$ \/ /)
  : scope.locator(`xpath=.//div[label[normalize-space()="${label}"]]`).locator("input, textarea").first()
async function openNew(page: Page) {
  const toolbar = page.getByPlaceholder("Buscar em produtos…").locator("xpath=ancestor::div[contains(@class,'mb-4')][1]")
  await toolbar.getByRole("button", { name: "Novo", exact: true }).click()
  const editor = productModal(page)
  await expect(editor.getByLabel("Nome", { exact: true })).toBeFocused()
  return editor
}
async function openExisting(page: Page, name: string) {
  await page.getByPlaceholder("Buscar em produtos…").fill(name)
  const row = page.locator("tbody tr").filter({ hasText: name })
  await row.getByRole("button", { name: /Editar/ }).click()
  const editor = productModal(page)
  await expect(editor).toBeVisible()
  return { editor, row }
}
async function saveProduct(page: Page) {
  const success = page.getByText("Produto salvo com sucesso.")
  await expect(success).toHaveCount(0)
  await productModal(page).getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(success.first()).toBeVisible()
  await expect(productModal(page)).toHaveCount(0)
}
const categoryDialog = (page: Page) => page.getByRole("dialog", { name: "Nova categoria" })
const categoryCount = (storeId: string, name: string) =>
  db.categoriaCadastro.count({ where: { storeId, name: { equals: name, mode: "insensitive" } } })
/** POSTs de Server Action do writer de categoria (args: storeId + { name, type: "produto" }). */
function categoryWrites(page: Page, name: string) {
  const seen: string[] = []
  page.on("request", (r) => {
    const data = r.postData() ?? ""
    if (r.method() === "POST" && r.headers()["next-action"] && data.includes('"type":"produto"') && data.toLowerCase().includes(name.toLowerCase())) seen.push(data)
  })
  return seen
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

test("cliente: Nova categoria explícita, sem duplicar, selecionada e disponível em nova sessão; B não vê", async ({ page, browser }) => {
  await setupPage(page, await login("adminA"))
  await openProdutos(page)
  const name = "Pães Sintéticos CC"
  const writes = categoryWrites(page, name)
  let editor = await openNew(page)
  await field(editor, "Nome").fill("Pão sintético CC com categoria")
  await field(editor, "Preço venda (R$)").fill("2,50")

  // Texto digitado + Enter/saída do campo não grava nem vira categoria.
  // Por id: com a janela aberta o Radix marca a ficha como aria-hidden e o papel some da árvore.
  const categoria = editor.locator("#produto-categoria")
  await expect(categoria).toHaveAccessibleName("Categoria")
  await categoria.fill(name)
  await categoria.press("Enter")
  await categoria.press("Tab")
  await expect(categoria).toHaveValue("")
  await expect(editor.getByText(`"${name}" não está na lista desta loja.`, { exact: false })).toBeVisible()
  expect(await categoryCount(A, name)).toBe(0)
  expect(writes).toHaveLength(0)

  // Foco/teclado: o botão é alcançável e abre a janela com o texto pendente.
  const novaCategoria = editor.getByRole("button", { name: "Nova categoria", exact: true })
  await expect(novaCategoria).toBeFocused()
  await page.keyboard.press("Enter")
  let dialog = categoryDialog(page)
  await expect(dialog).toBeVisible()
  const nameInput = dialog.getByRole("textbox", { name: "Nome da categoria" })
  await expect(nameInput).toBeFocused()
  await expect(nameInput).toHaveValue(name)

  // Duplo clique no mesmo tick: uma única gravação.
  let release!: () => void
  const held = new Promise<void>((done) => { release = done })
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const r = route.request(), data = r.postData() ?? ""
    if (r.method() !== "POST" || !r.headers()["next-action"] || !data.includes('"type":"produto"') || !data.includes(name)) return route.fallback()
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
  })
  await dialog.getByRole("button", { name: "Salvar categoria" }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect.poll(() => categoryCount(A, name)).toBe(1)
  // Gravado no servidor, ainda sem resposta: nada é anunciado nem selecionado.
  await expect(page.getByText(`Categoria "${name}" salva nesta loja e selecionada.`)).toHaveCount(0)
  await expect(categoria).toHaveValue("")
  release()
  await expect(dialog).toHaveCount(0)
  await page.unroute("**/dashboard/cadastros-v2**")
  await expect(categoria).toHaveValue(name)
  await expect(editor.getByText(`Categoria "${name}" salva nesta loja e selecionada.`)).toBeVisible()
  await expect(novaCategoria).toBeFocused()
  expect(writes).toHaveLength(1)
  await expect(field(editor, "Nome")).toHaveValue("Pão sintético CC com categoria")
  await saveProduct(page)
  const saved = await db.produto.findFirstOrThrow({ where: { storeId: A, name: "Pão sintético CC com categoria" } })
  expect(saved.category).toBe(name)
  expect(await db.categoriaCadastro.findMany({ where: { storeId: A, name }, select: { type: true, active: true } })).toEqual([{ type: "produto", active: true }])

  // Variação de caixa/espaços nas pontas reutiliza o registro canônico.
  editor = await openNew(page)
  await editor.getByRole("button", { name: "Nova categoria", exact: true }).click()
  dialog = categoryDialog(page)
  await dialog.getByRole("textbox", { name: "Nome da categoria" }).fill("  pães sintéticos cc  ")
  await dialog.getByRole("button", { name: "Salvar categoria" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(editor.getByRole("textbox", { name: "Categoria", exact: true })).toHaveValue(name)
  expect(await categoryCount(A, name)).toBe(1)
  await editor.getByRole("button", { name: "Cancelar" }).click()

  // Nova sessão: a categoria segue na lista da loja A.
  const fresh = await browser.newContext({ baseURL, locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    const again = await fresh.newPage()
    await setupPage(again, await login("adminA"))
    await openProdutos(again)
    const reopened = (await openExisting(again, "Pão sintético CC com categoria")).editor
    await expect(reopened.getByRole("textbox", { name: "Categoria", exact: true })).toHaveValue(name)
    const second = await openNewInFresh(again, reopened)
    await second.getByRole("textbox", { name: "Categoria", exact: true }).fill("sintéticos cc")
    await expect(second.getByRole("button", { name, exact: true })).toBeVisible()
    await second.getByRole("button", { name: "Cancelar" }).click()
  } finally { await fresh.close() }

  // Loja B não enxerga a categoria de A.
  const other = await browser.newContext({ baseURL, locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    const pageB = await other.newPage()
    await setupPage(pageB, await login("adminB"))
    await openProdutos(pageB)
    const editorB = await openNew(pageB)
    await editorB.getByRole("textbox", { name: "Categoria", exact: true }).fill("sintéticos cc")
    await expect(editorB.getByText("Nenhuma categoria encontrada.")).toBeVisible()
    await expect(editorB.getByRole("button", { name, exact: true })).toHaveCount(0)
    expect(await categoryCount(B, name)).toBe(0)
    await editorB.getByRole("button", { name: "Cancelar" }).click()
  } finally { await other.close() }
})

async function openNewInFresh(page: Page, current: Locator) {
  await current.getByRole("button", { name: "Cancelar" }).click()
  await page.getByPlaceholder("Buscar em produtos…").fill("")
  return openNew(page)
}

test("cliente: cancelar preserva o rascunho; falha do writer não cria categoria fictícia", async ({ page }) => {
  await setupPage(page, await login("adminA"))
  await openProdutos(page)
  const editor = await openNew(page)
  await field(editor, "Nome").fill("Rascunho CC preservado")
  await field(editor, "Preço venda (R$)").fill("3,10")
  await editor.getByRole("button", { name: "Nova categoria", exact: true }).click()
  let dialog = categoryDialog(page)
  await dialog.getByRole("textbox", { name: "Nome da categoria" }).fill("Cancelada CC")
  await dialog.getByRole("button", { name: "Cancelar" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(field(editor, "Nome")).toHaveValue("Rascunho CC preservado")
  await expect(field(editor, "Preço venda (R$)")).toHaveValue("3,10")
  expect(await categoryCount(A, "Cancelada CC")).toBe(0)

  // Falha de rede antes do servidor: erro na janela, nenhuma seleção, nada gravado.
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const r = route.request(), data = r.postData() ?? ""
    if (r.method() === "POST" && r.headers()["next-action"] && data.includes("Falha CC")) return route.abort("failed")
    return route.fallback()
  })
  await editor.getByRole("button", { name: "Nova categoria", exact: true }).click()
  dialog = categoryDialog(page)
  await dialog.getByRole("textbox", { name: "Nome da categoria" }).fill("Falha CC")
  await dialog.getByRole("button", { name: "Salvar categoria" }).click()
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível confirmar a criação da categoria")
  await expect(dialog.getByRole("textbox", { name: "Nome da categoria" })).toHaveValue("Falha CC")
  await page.unroute("**/dashboard/cadastros-v2**")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(editor.getByRole("textbox", { name: "Categoria", exact: true })).toHaveValue("")
  await expect(editor.getByText(/salva nesta loja e selecionada/)).toHaveCount(0)
  expect(await categoryCount(A, "Falha CC")).toBe(0)
  await saveProduct(page)
  const saved = await db.produto.findFirstOrThrow({ where: { storeId: A, name: "Rascunho CC preservado" } })
  expect({ price: saved.price, category: saved.category ?? "" }).toEqual({ price: 3.1, category: "" })
})

test("permissão insuficiente: loja adulterada e sessão sem Cadastros são recusadas pelo servidor", async ({ page }) => {
  await setupPage(page, await login("adminB"))
  await openProdutos(page)
  const editor = await openNew(page)
  // Mesma janela, mas o storeId enviado à Server Action é trocado para a loja A.
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const r = route.request(), data = r.postData() ?? ""
    if (r.method() === "POST" && r.headers()["next-action"] && data.includes("Invasora CC")) return route.continue({ postData: data.split(`"${B}"`).join(`"${A}"`) })
    return route.fallback()
  })
  await editor.getByRole("button", { name: "Nova categoria", exact: true }).click()
  const dialog = categoryDialog(page)
  await dialog.getByRole("textbox", { name: "Nome da categoria" }).fill("Invasora CC")
  await dialog.getByRole("button", { name: "Salvar categoria" }).click()
  await expect(dialog.getByRole("alert")).toContainText("Não foi possível confirmar a criação da categoria")
  await page.unroute("**/dashboard/cadastros-v2**")
  expect(await categoryCount(A, "Invasora CC")).toBe(0)
  expect(await categoryCount(B, "Invasora CC")).toBe(0)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await editor.getByRole("button", { name: "Cancelar" }).click()

  // CAIXA da loja A não tem Cadastros: a página que hospeda a ficha (e suas Server Actions) é negada.
  const caixa = await login("caixaA")
  expect([302, 303, 307, 308]).toContain((await caixa.get("/dashboard/cadastros-v2?aba=produtos", { maxRedirects: 0 })).status())
  expect(await categoryCount(A, "Invasora CC")).toBe(0)
})

test("estoque UN: movimentação pelo writer canônico, ficha e lista releem; salvar a ficha não move saldo", async ({ page }) => {
  await setupPage(page, await login("adminA"))
  await openProdutos(page)
  const { editor, row } = await openExisting(page, PRODUCTS.un.name)
  await expect(field(editor, "Estoque atual")).toHaveValue("0")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveAttribute("data-unidade", "UN")
  await expect(editor.locator("[data-estoque-bloqueio]")).toHaveCount(0)
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  // Aberto pela ficha, o modal fica dentro do container da ficha: o mais interno é o dele.
  const movement = page.locator("div.fixed.inset-0").filter({ has: page.getByRole("heading", { name: "Movimentação de estoque" }) }).last()
  await expect(movement.getByRole("button", { name: "Entrada", exact: true })).toBeVisible()
  const quantidade = movement.locator('xpath=.//div[label[contains(normalize-space(),"Quantidade a entrar")]]').locator("input")

  // Falha de rede: erro visível, nenhum sucesso, nada gravado.
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const r = route.request(), data = r.postData() ?? ""
    if (r.method() === "POST" && r.headers()["next-action"] && data.includes('"quantidade":3')) return route.abort("failed")
    return route.fallback()
  })
  await quantidade.fill("3")
  await movement.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(movement.getByRole("alert")).toContainText("Não foi possível confirmar a entrada")
  await expect(movement.getByRole("status")).toHaveCount(0)
  await page.unroute("**/dashboard/cadastros-v2**")
  expect(await db.movimentacaoEstoque.count({ where: { storeId: A, produtoId: PRODUCTS.un.id } })).toBe(0)
  expect((await db.produto.findUniqueOrThrow({ where: { id: PRODUCTS.un.id } })).stock).toBe(0)

  await quantidade.fill("5")
  await movement.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(movement).toHaveCount(0)
  await expect(editor.getByText("Movimentação registrada. Saldo atual: 5 UN.")).toBeVisible()
  await expect(field(editor, "Estoque atual")).toHaveValue("5")
  expect((await db.produto.findUniqueOrThrow({ where: { id: PRODUCTS.un.id } })).stock).toBe(5)
  expect(await db.movimentacaoEstoque.count({ where: { storeId: A, produtoId: PRODUCTS.un.id } })).toBe(1)

  // Salvar outros dados da ficha não envia nem altera saldo.
  await field(editor, "Preço venda (R$)").fill("11,00")
  await saveProduct(page)
  const after = await db.produto.findUniqueOrThrow({ where: { id: PRODUCTS.un.id } })
  expect({ price: after.price, stock: after.stock }).toEqual({ price: 11, stock: 5 })
  expect(await db.movimentacaoEstoque.count({ where: { storeId: A, produtoId: PRODUCTS.un.id } })).toBe(1)
  // A ficha reaberta vem da linha relida pela lista: o saldo novo prova a releitura.
  await expect(row).toBeVisible()
  const reopened = (await openExisting(page, PRODUCTS.un.name)).editor
  await expect(field(reopened, "Estoque atual")).toHaveValue("5")
  await reopened.getByRole("button", { name: "Cancelar" }).click()
})

test("estoque bloqueado: KG em preparação e declaração inválida explicam o motivo e não gravam", async ({ page }) => {
  await setupPage(page, await login("adminA"))
  await openProdutos(page)
  const writes: string[] = []
  page.on("request", (r) => { const d = r.postData() ?? ""; if (r.method() === "POST" && r.headers()["next-action"] && /"(quantidade|novoSaldo)"/.test(d)) writes.push(d) })

  let { editor, row } = await openExisting(page, PRODUCTS.kg.name)
  const move = editor.getByRole("button", { name: "Movimentar estoque" })
  await expect(move).toBeDisabled()
  const reason = editor.locator('[data-estoque-bloqueio="peso_em_preparacao"]')
  await expect(reason).toBeVisible()
  await expect(reason).toContainText("Movimentação indisponível: venda por peso em preparação.")
  await expect(move).toHaveAttribute("aria-describedby", "produto-estoque-bloqueio")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveText("KG")
  await expect(editor).not.toContainText("Use Movimentar estoque para entrada")
  await move.click({ force: true })
  await expect(page.getByRole("heading", { name: "Movimentação de estoque" })).toHaveCount(0)
  await editor.getByRole("button", { name: "Cancelar" }).click()
  // Pela lista: o modal mostra o motivo e não oferece Entrada/Ajuste.
  await row.getByRole("button", { name: /Estoque/ }).click()
  const movement = page.locator("div.fixed.inset-0").filter({ has: page.getByRole("heading", { name: "Movimentação de estoque" }) })
  await expect(movement.locator('[data-estoque-bloqueio="peso_em_preparacao"]')).toBeVisible()
  await expect(movement.getByRole("button", { name: "Entrada", exact: true })).toHaveCount(0)
  await expect(movement.getByRole("button", { name: "Ajuste", exact: true })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await page.goto("/dashboard/cadastros-v2?aba=produtos")

  ;({ editor } = await openExisting(page, PRODUCTS.invalid.name))
  await expect(editor.getByRole("button", { name: "Movimentar estoque" })).toBeDisabled()
  const invalid = editor.locator('[data-estoque-bloqueio="declaracao_invalida"]')
  await expect(invalid).toContainText("Movimentação indisponível: declaração comercial inválida.")
  await expect(invalid).not.toContainText("peso em preparação")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveText("unidade a revisar")
  await editor.getByRole("button", { name: "Cancelar" }).click()

  expect(writes).toEqual([])
  expect(await db.movimentacaoEstoque.count({ where: { storeId: A, produtoId: { in: [PRODUCTS.kg.id, PRODUCTS.invalid.id] } } })).toBe(0)
  const stocks = await db.produto.findMany({ where: { id: { in: [PRODUCTS.kg.id, PRODUCTS.invalid.id] } }, select: { stock: true, metadata: true } })
  expect(stocks.map((p) => p.stock)).toEqual([0, 0])
  expect(stocks.map((p) => p.metadata)).toEqual(expect.arrayContaining([PRODUCTS.kg.metadata, PRODUCTS.invalid.metadata]))
})

test("visão interna (proprietário/A01) preservada: sem botão novo, criação histórica continua", async ({ page }) => {
  await setupPage(page, await loginOwner(A))
  await openProdutos(page)
  const editor = await openNew(page)
  await expect(editor.getByRole("button", { name: "Nova categoria", exact: true })).toHaveCount(0)
  await field(editor, "Nome").fill("Produto interno CC")
  const categoria = editor.getByRole("textbox", { name: "Categoria", exact: true })
  await categoria.fill("Interna CC")
  await categoria.press("Enter")
  await expect(categoria).toHaveValue("Interna CC")
  await expect.poll(() => categoryCount(A, "Interna CC")).toBe(1)
  await editor.getByRole("button", { name: "Cancelar" }).click()
})

test("visual: 320/390/1440 com foco e sem recorte nas janelas de categoria e estoque", async ({ page }) => {
  await setupPage(page, await login("adminA"))
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 640]] as const) {
    await page.setViewportSize({ width, height })
    await openProdutos(page)
    const editor = await openNew(page)
    const button = editor.getByRole("button", { name: "Nova categoria", exact: true })
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeVisible()
    const input = await editor.getByRole("textbox", { name: "Categoria", exact: true }).boundingBox()
    const box = await button.boundingBox()
    expect(input && box && box.x + box.width <= width && input.x >= 0).toBeTruthy()
    // Sem sobreposição: campo e botão não se cruzam (lado a lado ou empilhados).
    expect(box!.x >= input!.x + input!.width - 1 || box!.y >= input!.y + input!.height - 1).toBe(true)
    await noHorizontalOverflow(page)
    await button.click()
    const dialog = categoryDialog(page)
    await expect(dialog.getByRole("textbox", { name: "Nome da categoria" })).toBeFocused()
    const d = await dialog.boundingBox()
    expect(d && d.x >= 0 && d.x + d.width <= width && d.y >= 0 && d.y + d.height <= height).toBeTruthy()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused()
    await page.screenshot({ path: `${out}/cc-nova-categoria-${width}.png`, animations: "disabled" })
    await page.keyboard.press("Escape")
    await expect(button).toBeFocused()
    await editor.getByRole("button", { name: "Cancelar" }).click()

    const { editor: kg } = await openExisting(page, PRODUCTS.kg.name)
    const reason = kg.locator('[data-estoque-bloqueio="peso_em_preparacao"]')
    await reason.scrollIntoViewIfNeeded()
    await expect(reason).toBeVisible()
    const r = await reason.boundingBox()
    expect(r && r.x >= 0 && r.x + r.width <= width).toBeTruthy()
    await noHorizontalOverflow(page)
    await page.screenshot({ path: `${out}/cc-estoque-kg-${width}.png`, animations: "disabled" })
    await kg.getByRole("button", { name: "Cancelar" }).click()
    await page.getByPlaceholder("Buscar em produtos…").fill("")
  }
})
