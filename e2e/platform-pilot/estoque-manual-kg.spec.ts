import { test, expect, request, type APIRequestContext, type Locator, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { writeFile, mkdir } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../lib/auth/access-policy"

/**
 * ESTOQUE-MANUAL-KG-001 — entrada manual de estoque em KG pela ficha canônica,
 * com conta STORE de padaria (pacote básico), NextAuth real, build de produção e
 * banco descartável da suíte. Toda escrita passa pela aplicação; o banco só é
 * lido para conferir produto, depósito e livro. Venda por peso NÃO é exercitada.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()

const STORE = "kg-padaria-a"
const USER = { id: "kg-admin-a", email: "kg-admin-a@pilot.invalid", password: "aA1!" + randomBytes(18).toString("hex") }
const PAO = { id: "kg-pao-frances", name: "Pão Francês Sintético KG" }
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }

test.beforeAll(async () => {
  const store = { name: "Padaria Sintética KG", cnpj: "00.000.000/0001-91", moduleAccess: { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } }
  await db.store.upsert({ where: { id: STORE }, create: { id: STORE, ...store }, update: store })
  const printerConfig = { capabilities: { version: 1, business: { primaryBranch: "padaria" } } }
  await db.storeSettings.upsert({ where: { storeId: STORE }, create: { storeId: STORE, printerConfig }, update: { printerConfig } })
  const data = { email: USER.email, name: "Sintético KG Admin", role: "ADMIN" as const, lojaId: STORE, accessScope: "STORE",
    password: await bcrypt.hash(USER.password, 10), mustChangePassword: false }
  await db.adminUser.upsert({ where: { id: USER.id }, update: data, create: { id: USER.id, ...data, adminUserStores: { create: [{ storeId: STORE }] } } })
  // Produto nasce como o cadastro real cria produto por peso: sem saldo, sem movimentação.
  await db.produto.upsert({ where: { id: PAO.id }, create: { id: PAO.id, storeId: STORE, name: PAO.name, price: 18.9, stock: 0, metadata: KG }, update: {} })
})
test.afterEach(async () => { for (const ctx of contexts) await ctx.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function login() {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: USER.email, password: USER.password, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: STORE, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const ctx = await request.newContext({ baseURL, storageState: state })
  contexts.add(ctx)
  const session = await (await ctx.get("/api/auth/session")).json()
  expect(session?.user?.id).toBe(USER.id)
  expect((await db.adminUser.findUniqueOrThrow({ where: { id: USER.id }, select: { accessScope: true } })).accessScope).toBe("STORE")
  return ctx
}

async function setupPage(page: Page, actor: APIRequestContext) {
  await page.context().clearCookies()
  await page.context().addCookies((await actor.storageState()).cookies)
  await page.context().addInitScript((id) => {
    try { localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* storage indisponível */ }
  }, STORE)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => { await dialog.getByRole("button", { name: "Voltar depois" }).click() })
}

function ficha(page: Page): Locator {
  return page.locator("div.fixed.inset-0")
    .filter({ has: page.locator('[data-omni-ui-kit="modal-header"]') })
    .filter({ has: page.locator("button", { hasText: /^\s*Salvar produto\s*$/ }) })
}
/** O modal de movimentação é renderizado dentro da ficha: o overlay mais interno é o dele. */
function movimentacao(page: Page): Locator {
  return page.locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: "Movimentação de estoque" }) })
    .filter({ hasNot: page.locator("button", { hasText: /^\s*Salvar produto\s*$/ }) })
}

async function abrirFicha(page: Page) {
  await page.goto("/dashboard/cadastros-v2?aba=produtos")
  await page.getByPlaceholder("Buscar em produtos…").fill(PAO.name)
  await page.locator("tbody tr").filter({ hasText: PAO.name }).getByRole("button", { name: /Editar/ }).click()
  const editor = ficha(page)
  await expect(editor).toBeVisible()
  return editor
}

async function entrar(page: Page, editor: Locator, quantidade: string, saldoEsperado: string) {
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  const mov = movimentacao(page)
  await expect(mov.getByRole("button", { name: "Ajuste" })).toHaveCount(0)
  await mov.getByLabel("Quantidade a entrar (kg) *").fill(quantidade)
  await expect(mov.getByText(`${saldoEsperado} kg`).first()).toBeVisible()
  await mov.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(mov).toHaveCount(0)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue(saldoEsperado)
  await expect(editor.getByText(`Movimentação registrada. Saldo atual: ${saldoEsperado} KG.`)).toBeVisible()
}

async function snapshot() {
  const [produto, depositos, livro] = await Promise.all([
    db.produto.findUniqueOrThrow({ where: { id: PAO.id }, select: { stock: true, metadata: true } }),
    db.produtoDeposito.findMany({ where: { produtoId: PAO.id }, select: { storeId: true, quantidade: true } }),
    db.movimentacaoEstoque.findMany({ where: { produtoId: PAO.id }, orderBy: { createdAt: "asc" },
      select: { storeId: true, tipo: true, origem: true, quantidade: true, estoqueAntes: true, estoqueDepois: true, usuario: true } }),
  ])
  return { produto, depositos, livro }
}

test("STORE padaria: 2,500 kg + 0,750 kg = 3,250 kg no banco, no histórico e na ficha reaberta", async ({ page }) => {
  await setupPage(page, await login())
  let editor = await abrirFicha(page)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue("0,000")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveAttribute("data-unidade", "KG")

  // Separador ambíguo é recusado na tela; nada chega ao servidor.
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  let mov = movimentacao(page)
  await mov.getByLabel("Quantidade a entrar (kg) *").fill("2.500")
  await mov.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(mov.getByRole("alert")).toHaveText(/Use vírgula para os decimais/)
  expect((await snapshot()).livro).toHaveLength(0)
  await mov.getByRole("button", { name: "Fechar" }).first().click()

  await entrar(page, editor, "2,500", "2,500")
  await entrar(page, editor, "0,750", "3,250")

  const db1 = await snapshot()
  expect(db1.produto.stock).toBe(3.25)
  expect(db1.produto.metadata).toEqual(KG)
  expect(db1.depositos).toEqual([{ storeId: STORE, quantidade: 3.25 }])
  expect(db1.livro.map(({ usuario: _u, ...m }) => m)).toEqual([
    { storeId: STORE, tipo: "entrada", origem: "manual", quantidade: 2.5, estoqueAntes: 0, estoqueDepois: 2.5 },
    { storeId: STORE, tipo: "entrada", origem: "manual", quantidade: 0.75, estoqueAntes: 2.5, estoqueDepois: 3.25 },
  ])
  expect(db1.livro.every((m) => !!m.usuario)).toBe(true)

  // Reabertura em página nova: a ficha relê do servidor.
  await page.reload()
  editor = await abrirFicha(page)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue("3,250")
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  mov = movimentacao(page)
  await expect(mov.locator("[data-saldo-atual]")).toHaveText("3,250")
  await mov.getByRole("button", { name: "Histórico" }).click()
  await expect(mov.locator("[data-mov-qtd]")).toHaveText(["+0,750", "+2,500"])
  await expect(mov.locator("[data-mov-saldo]")).toHaveText(["2,500→3,250", "0,000→2,500"])

  await mkdir(out, { recursive: true })
  await page.screenshot({ path: `${out}/estoque-manual-kg-historico.png` })
  await writeFile(`${out}/estoque-manual-kg.json`, JSON.stringify({
    account: { scope: "STORE", role: "ADMIN", store: STORE }, product: PAO.name, unit: "KG",
    entries: ["2,500", "0,750"], produtoStock: db1.produto.stock, depositos: db1.depositos.map((d) => d.quantidade),
    ledger: db1.livro.map((m) => ({ quantidade: m.quantidade, estoqueAntes: m.estoqueAntes, estoqueDepois: m.estoqueDepois })),
    reopenedFicha: "3,250", salePath: "not exercised (venda por peso bloqueada)", productionWrites: 0,
  }, null, 2))
})

test("PDV Clássico: produto KG com saldo recebe orientação de peso, não de estoque, e não entra no carrinho", async ({ page }) => {
  await setupPage(page, await login())
  await page.goto("/dashboard/vendas")
  const semTerminal = page.getByText("Continuar sem terminal")
  const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
  await expect(semTerminal.or(bipe)).toBeVisible()
  if (await semTerminal.isVisible()) await semTerminal.click()
  await bipe.fill(PAO.id)
  await bipe.press("Enter")
  // O toast também é anunciado na região aria-live: dois nós com o mesmo texto.
  await expect(page.getByText("Venda por peso ainda não liberada").first()).toBeVisible()
  await expect(page.getByText(`${PAO.name} é vendido por kg e ainda não pode ser registrado no PDV.`, { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/sem saldo no estoque/)).toHaveCount(0)
  await expect(page.getByText("Nenhum item bipado")).toBeVisible()
  await page.screenshot({ path: `${out}/estoque-manual-kg-pdv.png` })
  expect(await db.venda.count({ where: { storeId: STORE } })).toBe(0)
  expect(await db.movimentacaoEstoque.count({ where: { produtoId: PAO.id, tipo: "saida" } })).toBe(0)
})
