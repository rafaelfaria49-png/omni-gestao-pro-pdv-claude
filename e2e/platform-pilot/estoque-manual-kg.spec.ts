import { test, expect, request, type APIRequestContext, type Locator, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { writeFile, mkdir } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../lib/auth/access-policy"

/**
 * ESTOQUE-MANUAL-KG-001 / PADARIA-ESTOQUE-KG-A01-STORE-RELEASE-001 — entrada manual de
 * estoque em KG pela ficha canônica, nas duas experiências:
 * - STORE: conta ADMIN de padaria (pacote básico) no Cadastros/Estoque do cliente;
 * - A01: responsável interno (plataforma) pela Gestão de Produtos histórica, que encaminha
 *   o produto por peso para a mesma ficha (o formulário histórico truncaria o saldo).
 * NextAuth real, build de produção e banco descartável da suíte. Toda escrita passa pela
 * aplicação; o banco só é lido para conferir produto, depósito e livro. Venda por peso NÃO
 * é exercitada (segue bloqueada).
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()

const STORE = "kg-padaria-a"
const STORE_B = "kg-padaria-b"
const USER = { id: "kg-admin-a", email: "kg-admin-a@pilot.invalid", password: "aA1!" + randomBytes(18).toString("hex") }
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const PAO = { id: "kg-pao-frances", name: "Pão Francês Sintético KG" }
const QUEIJO = { id: "kg-a01-queijo", name: "Queijo Sintético A01 KG" }
const BOLO = { id: "kg-a01-bolo-un", name: "Bolo Sintético A01 UN" }
const PAO_B = { id: "kg-pao-loja-b", name: "Pão Sintético Loja B KG" }

test.beforeAll(async () => {
  for (const [id, name] of [[STORE, "Padaria Sintética KG"], [STORE_B, "Padaria Sintética KG B"]] as const) {
    const store = { name, cnpj: "00.000.000/0001-91", moduleAccess: { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } }
    await db.store.upsert({ where: { id }, create: { id, ...store }, update: store })
    const printerConfig = { capabilities: { version: 1, business: { primaryBranch: "padaria" } } }
    await db.storeSettings.upsert({ where: { storeId: id }, create: { storeId: id, printerConfig }, update: { printerConfig } })
  }
  const data = { email: USER.email, name: "Sintético KG Admin", role: "ADMIN" as const, lojaId: STORE, accessScope: "STORE",
    password: await bcrypt.hash(USER.password, 10), mustChangePassword: false }
  await db.adminUser.upsert({ where: { id: USER.id }, update: data, create: { id: USER.id, ...data, adminUserStores: { create: [{ storeId: STORE }] } } })
  // Produtos nascem como o cadastro real cria: sem saldo, sem movimentação.
  for (const p of [{ ...PAO, storeId: STORE, metadata: KG }, { ...QUEIJO, storeId: STORE, metadata: KG },
    { ...BOLO, storeId: STORE, metadata: {} }, { ...PAO_B, storeId: STORE_B, metadata: KG }]) {
    await db.produto.upsert({ where: { id: p.id }, create: { id: p.id, storeId: p.storeId, name: p.name, price: 18.9, stock: 0, metadata: p.metadata }, update: {} })
  }
})
test.afterEach(async () => { for (const ctx of contexts) await ctx.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function loginWith(email: string, password: string, store: string) {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: store, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const ctx = await request.newContext({ baseURL, storageState: state })
  contexts.add(ctx)
  return ctx
}
async function login() {
  const ctx = await loginWith(USER.email, USER.password, STORE)
  const session = await (await ctx.get("/api/auth/session")).json()
  expect(session?.user?.id).toBe(USER.id)
  expect((await db.adminUser.findUniqueOrThrow({ where: { id: USER.id }, select: { accessScope: true } })).accessScope).toBe("STORE")
  return ctx
}
/** A01: responsável interno legado (sem escopo STORE) criado pelo runner da suíte. */
async function loginA01() {
  const ctx = await loginWith("owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!, STORE)
  const session = await (await ctx.get("/api/auth/session")).json()
  expect(session?.user?.id).toBe("pilot-owner")
  expect((await db.adminUser.findUniqueOrThrow({ where: { id: "pilot-owner" }, select: { accessScope: true } })).accessScope).toBeNull()
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

async function abrirFicha(page: Page, name: string) {
  await page.goto("/dashboard/cadastros-v2?aba=produtos")
  await page.getByPlaceholder("Buscar em produtos…").fill(name)
  await page.locator("tbody tr").filter({ hasText: name }).getByRole("button", { name: /Editar/ }).click()
  const editor = ficha(page)
  await expect(editor).toBeVisible()
  return editor
}

async function entrar(page: Page, editor: Locator, quantidade: string, saldoEsperado: string, opts?: { dblclick?: boolean }) {
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  const mov = movimentacao(page)
  await expect(mov.getByRole("button", { name: "Ajuste" })).toHaveCount(0)
  await mov.getByLabel("Quantidade a entrar (kg) *").fill(quantidade)
  await expect(mov.getByText(`${saldoEsperado} kg`).first()).toBeVisible()
  const registrar = mov.getByRole("button", { name: "Registrar entrada" })
  if (opts?.dblclick) await registrar.dblclick()
  else await registrar.click()
  await expect(mov).toHaveCount(0)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue(saldoEsperado)
  await expect(editor.getByText(`Movimentação registrada. Saldo atual: ${saldoEsperado} KG.`)).toBeVisible()
}

async function snapshot(id: string) {
  const [produto, depositos, livro] = await Promise.all([
    db.produto.findUniqueOrThrow({ where: { id }, select: { stock: true, price: true, metadata: true } }),
    db.produtoDeposito.findMany({ where: { produtoId: id }, select: { storeId: true, quantidade: true } }),
    db.movimentacaoEstoque.findMany({ where: { produtoId: id }, orderBy: { createdAt: "asc" },
      select: { storeId: true, tipo: true, origem: true, quantidade: true, estoqueAntes: true, estoqueDepois: true, usuario: true } }),
  ])
  return { produto, depositos, livro }
}
const semUsuario = (livro: Awaited<ReturnType<typeof snapshot>>["livro"]) => livro.map(({ usuario: _u, ...m }) => m)
const ENTRADAS_12750 = (storeId: string) => [
  { storeId, tipo: "entrada", origem: "manual", quantidade: 10.5, estoqueAntes: 0, estoqueDepois: 10.5 },
  { storeId, tipo: "entrada", origem: "manual", quantidade: 2.25, estoqueAntes: 10.5, estoqueDepois: 12.75 },
]

test("STORE padaria: 0,000 + 10,500 + 2,250 = 12,750 kg no banco, no histórico, na lista e na ficha reaberta", async ({ page }) => {
  await setupPage(page, await login())
  let editor = await abrirFicha(page, PAO.name)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue("0,000")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveAttribute("data-unidade", "KG")

  // Separador ambíguo e gramas fracionados são recusados na tela; nada chega ao servidor.
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  let mov = movimentacao(page)
  for (const [valor, motivo] of [["10.500", /Use vírgula para os decimais/], ["10,5001", /no máximo 3 casas/]] as const) {
    await mov.getByLabel("Quantidade a entrar (kg) *").fill(valor)
    await mov.getByRole("button", { name: "Registrar entrada" }).click()
    await expect(mov.getByRole("alert")).toHaveText(motivo)
  }
  expect((await snapshot(PAO.id)).livro).toHaveLength(0)
  await mov.getByRole("button", { name: "Fechar" }).first().click()

  await entrar(page, editor, "10,500", "10,500")
  // Duplo clique: uma única movimentação.
  await entrar(page, editor, "2,250", "12,750", { dblclick: true })

  const db1 = await snapshot(PAO.id)
  expect(db1.produto.stock).toBe(12.75)
  expect(db1.produto.metadata).toEqual(KG)
  expect(db1.depositos).toEqual([{ storeId: STORE, quantidade: 12.75 }])
  expect(semUsuario(db1.livro)).toEqual(ENTRADAS_12750(STORE))
  expect(db1.livro.every((m) => !!m.usuario)).toBe(true)

  // Edição cadastral pela ficha não envia nem altera saldo.
  await editor.getByLabel(/^Preço venda \(R\$ \/ /).fill("21,90")
  await editor.getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(page.getByText("Produto salvo com sucesso.").first()).toBeVisible()
  await expect(ficha(page)).toHaveCount(0)
  const db2 = await snapshot(PAO.id)
  expect({ price: db2.produto.price, stock: db2.produto.stock }).toEqual({ price: 21.9, stock: 12.75 })
  expect(db2.livro).toHaveLength(2)

  // Reabertura em página nova: a lista e a ficha releem do servidor.
  await page.reload()
  await page.goto("/dashboard/estoque")
  await page.getByPlaceholder("Buscar em produtos…").fill(PAO.name)
  await expect(page.locator("tbody tr").filter({ hasText: PAO.name })).toContainText("12,750 kg")
  editor = await abrirFicha(page, PAO.name)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue("12,750")
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  mov = movimentacao(page)
  await expect(mov.locator("[data-saldo-atual]")).toHaveText("12,750")
  await mov.getByRole("button", { name: "Histórico" }).click()
  await expect(mov.locator("[data-mov-qtd]")).toHaveText(["+2,250", "+10,500"])
  await expect(mov.locator("[data-mov-saldo]")).toHaveText(["10,500→12,750", "0,000→10,500"])

  await mkdir(out, { recursive: true })
  await page.screenshot({ path: `${out}/estoque-manual-kg-historico.png` })
  await writeFile(`${out}/estoque-manual-kg.json`, JSON.stringify({
    account: { scope: "STORE", role: "ADMIN", store: STORE }, product: PAO.name, unit: "KG",
    entries: ["10,500", "2,250"], produtoStock: db2.produto.stock, depositos: db1.depositos.map((d) => d.quantidade),
    ledger: db1.livro.map((m) => ({ quantidade: m.quantidade, estoqueAntes: m.estoqueAntes, estoqueDepois: m.estoqueDepois })),
    cadastralEditKeptStock: true, reopenedFicha: "12,750", salePath: "not exercised (venda por peso bloqueada)", productionWrites: 0,
  }, null, 2))
})

test("STORE: produto de outra loja não abre pela ficha nem recebe entrada", async ({ page }) => {
  await setupPage(page, await login())
  await page.goto(`/dashboard/cadastros-v2?aba=produtos&produto=${PAO_B.id}`)
  await expect(page.getByText("Produto não encontrado nesta loja.").first()).toBeVisible()
  await expect(ficha(page)).toHaveCount(0)
  const b = await snapshot(PAO_B.id)
  expect({ stock: b.produto.stock, livro: b.livro.length, depositos: b.depositos.length }).toEqual({ stock: 0, livro: 0, depositos: 0 })
})

test("A01: Gestão de Produtos histórica encaminha KG para a ficha canônica; 10,500 + 2,250 = 12,750 kg", async ({ page }) => {
  const a01 = await loginA01()
  await setupPage(page, a01)
  await page.goto("/dashboard/estoque")
  await page.getByPlaceholder("Buscar por nome, código ou IMEI...").first().fill(QUEIJO.name)
  const linha = page.locator("tbody tr").filter({ hasText: QUEIJO.name })
  await expect(linha).toContainText("0,000 kg")

  // O formulário histórico (inteiro, `stock` absoluto) não abre para produto por peso.
  const legacyPatches: string[] = []
  page.on("request", (r) => { if (r.method() === "PATCH" && r.url().includes("/api/produtos/")) legacyPatches.push(r.url()) })
  await linha.getByRole("button", { name: `Abrir ficha de ${QUEIJO.name} no Cadastros (produto por peso)` }).click()
  await expect(page).toHaveURL(/\/dashboard\/cadastros-v2\?aba=produtos$/)
  const editor = ficha(page)
  await expect(editor).toBeVisible()
  await expect(page.getByRole("dialog", { name: "Editar Item" })).toHaveCount(0)
  await expect(editor.getByRole("textbox", { name: "Estoque atual" })).toHaveValue("0,000")
  await expect(editor.locator("#produto-estoque-unidade")).toHaveAttribute("data-unidade", "KG")

  // Falha de rede na primeira tentativa: erro visível, nada gravado.
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const r = route.request(), data = r.postData() ?? ""
    if (r.method() === "POST" && r.headers()["next-action"] && data.includes('"quantidade":10.5')) return route.abort("failed")
    return route.fallback()
  })
  await editor.getByRole("button", { name: "Movimentar estoque" }).click()
  const mov = movimentacao(page)
  await mov.getByLabel("Quantidade a entrar (kg) *").fill("10,500")
  await mov.getByRole("button", { name: "Registrar entrada" }).click()
  await expect(mov.getByRole("alert")).toContainText("Não foi possível confirmar a entrada")
  await page.unroute("**/dashboard/cadastros-v2**")
  expect((await snapshot(QUEIJO.id)).livro).toHaveLength(0)
  await mov.getByRole("button", { name: "Fechar" }).first().click()

  await entrar(page, editor, "10,500", "10,500")
  await entrar(page, editor, "2,250", "12,750")
  const db1 = await snapshot(QUEIJO.id)
  expect(db1.produto.stock).toBe(12.75)
  expect(db1.depositos).toEqual([{ storeId: STORE, quantidade: 12.75 }])
  expect(semUsuario(db1.livro)).toEqual(ENTRADAS_12750(STORE))

  // Edição cadastral A01 pela ficha preserva o saldo.
  await editor.getByLabel(/^Preço venda \(R\$ \/ /).fill("54,90")
  await editor.getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(page.getByText("Produto salvo com sucesso.").first()).toBeVisible()
  const db2 = await snapshot(QUEIJO.id)
  expect({ price: db2.produto.price, stock: db2.produto.stock, livro: db2.livro.length }).toEqual({ price: 54.9, stock: 12.75, livro: 2 })

  // Volta à tela histórica após recarregar: saldo exato em kg, sem truncar.
  await page.reload()
  await page.goto("/dashboard/estoque")
  await page.getByPlaceholder("Buscar por nome, código ou IMEI...").first().fill(QUEIJO.name)
  await expect(page.locator("tbody tr").filter({ hasText: QUEIJO.name })).toContainText("12,750 kg")
  expect(legacyPatches).toEqual([])

  // Defesa no servidor: o ajuste REST histórico não alcança KG nem aceita fração.
  const kgPatch = await a01.patch(`/api/produtos/${QUEIJO.id}`, { headers: { "x-assistec-loja-id": STORE }, data: { name: QUEIJO.name, stock: 12 } })
  expect(kgPatch.status()).toBe(409)
  expect((await kgPatch.json()).error).toMatch(/Registre a entrada em kg pela ficha de Cadastros/)
  const fracPatch = await a01.patch(`/api/produtos/${BOLO.id}`, { headers: { "x-assistec-loja-id": STORE }, data: { stock: 2.5 } })
  expect(fracPatch.status()).toBe(400)
  const db3 = await snapshot(QUEIJO.id)
  expect({ stock: db3.produto.stock, livro: db3.livro.length }).toEqual({ stock: 12.75, livro: 2 })

  await mkdir(out, { recursive: true })
  await page.screenshot({ path: `${out}/estoque-manual-kg-a01-lista.png` })
  await writeFile(`${out}/estoque-manual-kg-a01.json`, JSON.stringify({
    account: { scope: "PLATFORM (legado interno)", store: STORE }, entry: "Gestão de Produtos histórica → ficha canônica",
    product: QUEIJO.name, entries: ["10,500", "2,250"], produtoStock: db3.produto.stock, depositos: db1.depositos.map((d) => d.quantidade),
    ledger: db1.livro.map((m) => ({ quantidade: m.quantidade, estoqueAntes: m.estoqueAntes, estoqueDepois: m.estoqueDepois })),
    legacyPatchesForKg: legacyPatches.length, restKgAdjust: kgPatch.status(), restFractionalUn: fracPatch.status(), productionWrites: 0,
  }, null, 2))
})

test("A01: produto UN continua no formulário histórico; preço não move saldo e ajuste inteiro passa pelo livro", async ({ page }) => {
  await setupPage(page, await loginA01())
  const abrir = async () => {
    await page.goto("/dashboard/estoque")
    await page.getByPlaceholder("Buscar por nome, código ou IMEI...").first().fill(BOLO.name)
    await page.locator("tbody tr").filter({ hasText: BOLO.name }).getByRole("button", { name: `Editar ${BOLO.name}` }).click()
    const dialog = page.getByRole("dialog", { name: "Editar Item" })
    await expect(dialog).toBeVisible()
    return dialog
  }
  const salvar = async (dialog: Locator) => {
    const res = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes(`/api/produtos/${BOLO.id}`))
    await dialog.getByRole("button", { name: "Salvar Alterações" }).click()
    expect((await res).status()).toBe(200)
  }

  let dialog = await abrir()
  await dialog.getByRole("tab", { name: "Controle" }).click()
  await dialog.locator("#estoqueAtual").fill("4")
  await salvar(dialog)
  let b = await snapshot(BOLO.id)
  expect(b.produto.stock).toBe(4)
  expect(b.livro.map((m) => ({ tipo: m.tipo, estoqueAntes: m.estoqueAntes, estoqueDepois: m.estoqueDepois }))).toEqual([{ tipo: "ajuste", estoqueAntes: 0, estoqueDepois: 4 }])

  dialog = await abrir()
  await dialog.locator("#precoVenda").fill("12.5")
  await salvar(dialog)
  b = await snapshot(BOLO.id)
  expect({ price: b.produto.price, stock: b.produto.stock, livro: b.livro.length }).toEqual({ price: 12.5, stock: 4, livro: 1 })
  // Saldo UN segue inteiro, sem unidade de peso (o id sintético contém "kg").
  await expect(page.locator("tbody tr").filter({ hasText: BOLO.name })).not.toContainText(/\d kg/)
})

test("PDV Clássico: produto KG com saldo recebe orientação de peso, não de estoque, e não entra no carrinho", async ({ page }) => {
  await setupPage(page, await login())
  expect((await snapshot(PAO.id)).produto.stock).toBe(12.75)
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
  expect((await snapshot(PAO.id)).produto.stock).toBe(12.75)
})
