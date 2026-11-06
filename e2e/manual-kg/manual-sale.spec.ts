import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { PrismaClient, type Prisma } from "../../generated/prisma"
const baseURL = "http://localhost:31479", database = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
if (process.env.MANUAL_KG_E2E_ORIGIN !== baseURL || process.env.DATABASE_URL !== database) throw Error("KG_E2E_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database }), STORE = process.env.MANUAL_KG_E2E_STORE!, RUN = process.env.MANUAL_KG_E2E_RUN!
const H = { "x-assistec-loja-id": STORE }
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const actors = new Set<APIRequestContext>()
test.beforeEach(async ({ page }) => { page.on("pageerror", (error) => process.stderr.write("KG_BROWSER_ERROR: " + error.stack + "\n")) })

test.afterEach(async () => { for (const ctx of actors) await ctx.dispose(); actors.clear() })
test.afterAll(() => db.$disconnect())
async function login(actor: string) {
 const ctx = await request.newContext({ baseURL })
 const csrf = await (await ctx.get("/api/auth/csrf")).json()
 await ctx.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: actor + "-" + RUN + "@kg.invalid", password: process.env.MANUAL_KG_E2E_PASSWORD!, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
 const state = await ctx.storageState(); await ctx.dispose()
 state.cookies.push({ name: "assistec-active-store", value: STORE, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
 const auth = await request.newContext({ baseURL, storageState: state }); actors.add(auth)
 expect((await (await auth.get("/api/auth/session")).json())?.user?.id).toBe(STORE + "-" + actor)
 return auth
}
async function product(unit: "KG" | "UN" = "KG", stock = 10) {
 const id = STORE + "-" + randomUUID()
 return db.produto.create({ data: { id, storeId: STORE, sku: "S" + randomUUID().replaceAll("-", "").slice(0, 10), name: "Pão Francês sintético " + id.slice(-5), price: unit === "KG" ? 20 : 3, stock, metadata: unit === "KG" ? KG : {} } })
}
async function setup(page: Page, actor: APIRequestContext, quick = false) {
 await page.context().addCookies((await actor.storageState()).cookies)
 await page.context().addInitScript((store) => localStorage.setItem("assistec-pro-loja-ativa-v1", store), STORE)
 await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dialog) => { await dialog.getByRole("button", { name: "Voltar depois" }).click() })
 await page.goto("/dashboard/vendas" + (quick ? "?modo=rapido" : "?modo=normal"))
 return enterTerminal(page)
}
async function enterTerminal(page: Page) {
 const usar = page.getByRole("button", { name: "Usar", exact: true }).first(), without = page.getByText("Continuar sem terminal")
 const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
 await usar.or(without).or(bipe).first().waitFor()
 // O runner semeia a sessão de caixa SEM terminal; a sessão é por terminal (F-01 002A). Escolher
 // um PDV qualquer tornava o resultado dependente da ordem entre o clique e a reconciliação do
 // caixa ("Caixa Fechado" no PDV sem sessão). Coerente com o fixture: continuar sem terminal.
 if (await without.isVisible()) await without.click(); else if (await usar.isVisible()) await usar.click()
 await expect(bipe).toBeVisible()
 await expect(page.getByRole("button", { name: "Resumo do Caixa" })).toBeVisible()
 return bipe
}
async function addKg(page: Page, code: string, weight?: string) {
 const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
 await bipe.fill(code); await bipe.press("Enter")
 const dialog = page.getByRole("dialog", { name: "Venda por peso", exact: true })
 await expect(dialog).toBeVisible()
 await expect(dialog.getByRole("button", { name: /Ler balança/ })).toHaveCount(0)
 if (weight !== undefined) await dialog.getByLabel("Peso (kg)").fill(weight)
 return dialog
}
async function payCash(page: Page) {
 await page.getByRole("button", { name: /Finalizar Venda/ }).first().click()
 const payment = page.getByRole("dialog", { name: "Finalizar Pagamento" })
 await expect(payment).toBeVisible()
 await payment.getByRole("button", { name: /^Dinheiro$/ }).click()
 const exact = payment.getByRole("button", { name: /Confirmar valor exato/ })
 if (await exact.isVisible()) await exact.click()
 await payment.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
 const confirm = page.getByRole("alertdialog", { name: "Finalizar venda?" })
 await expect(confirm).toBeVisible(); await confirm.getByRole("button", { name: "Sim, finalizar" }).click()
}
for (const [actor, quick, weight] of [["admin", false, "0,350"], ["a01", false, "1,250"], ["cashier", true, "0,350"]] as const) {
 test(actor + " authenticated Classic " + (quick ? "quick" : "normal") + " manual KG with weight edit and reload", async ({ page }) => {
  const p = await product(), auth = await login(actor)
  await setup(page, auth, quick)
  const dialog = await addKg(page, p.sku!, "0,3501")
  await expect(dialog).toContainText("no máximo 3 casas")
  await dialog.getByLabel("Peso (kg)").fill("0,351")
  const q = Number(weight.replace(",", ".")), total = q * 20
  await expect(dialog).toContainText("Total do item: R$ 7,02")
  await dialog.getByRole("button", { name: "Adicionar ao carrinho" }).click()
  await expect(dialog).toBeHidden()
  if (quick) await page.keyboard.press("F4")
  else await page.getByRole("button", { name: "F4 Alt. Qtd", exact: true }).click()
  const edit = page.getByRole("dialog", { name: "Alterar peso (kg)" })
  await expect(edit).toBeVisible(); await expect(edit.getByLabel("Peso (kg)")).toHaveValue("0,351")
  await edit.getByLabel("Peso (kg)").fill(weight)
  await edit.getByRole("button", { name: /Aplicar|Confirmar/ }).click()
  await expect(edit).toBeHidden()
  await payCash(page)
  await expect.poll(async () => db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(1)
  const item = await db.itemVenda.findFirstOrThrow({ where: { inventoryId: p.id }, include: { venda: true } })
  expect(String(item.quantidadeKg)).toBe(String(q))
  expect(item.quantidade).toBeNull()
  expect(item).toMatchObject({ precoUnitario: 20, lineTotal: total })
  expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe((10000 - q * 1000) / 1000)
  expect(await db.produtoDeposito.findMany({ where: { produtoId: p.id } })).toMatchObject([{ quantidade: (10000 - q * 1000) / 1000 }])
  expect(await db.movimentacaoEstoque.findMany({ where: { produtoId: p.id } })).toMatchObject([{ quantidade: -q }])
  await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/" + actor + "-sale.png", fullPage: true })
  await page.reload()
  const read = await auth.get("/api/ops/vendas-list", { headers: H })
  expect(read.ok()).toBe(true)
  expect(JSON.stringify(await read.json())).toContain(item.venda.pedidoId)
 })
}
test("authenticated cancel restores exact KG once; returns blocked; cross-store and Caixa Seguro remain protected", async ({ page }) => {
 const auth = await login("admin"), p = await product()
 const sale = { id: "KG-E2E-" + randomUUID(), manualKgSale: "classic-manual-kg-v1", sessaoId: STORE + "-cash", total: 7,
  lines: [{ inventoryId: p.id, name: p.name, quantity: .35, unitPrice: 20, lineTotal: 7 }], paymentBreakdown: { dinheiro: 7 } }
 const create = await auth.post("/api/ops/venda-persist", { headers: H, data: { sale } }); expect(create.status()).toBe(200)
 const dev = await auth.post("/api/ops/devolucao", { headers: H, data: { localId: "kg-dev-" + randomUUID(), vendaLocalId: sale.id, tipo: "somente_estoque", itens: [{ inventoryId: p.id, quantidade: 1 }] } })
 expect(dev.status()).toBe(409)
 expect((await dev.json()).code).toBe("DEVOLUCAO_KG_BLOQUEADA")
 const pre =await auth.post("/api/vendas/" + sale.id + "/cancelar", { headers: H, data: { motivo: "Teste sintético" } }); expect(pre.status()).toBe(403)
 const approval = await auth.post("/api/auth/admin", { headers: { ...H, Origin: baseURL }, data: { pin: process.env.MANUAL_KG_E2E_PIN, action: "estornar_venda", resource: sale.id } }); expect(approval.status()).toBe(200)
 const cancel = await auth.post("/api/vendas/" + sale.id + "/cancelar", { headers: H, data: { motivo: "Teste sintético" } }); expect(cancel.status()).toBe(200)
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10)
 expect(await db.movimentacaoEstoque.findMany({ where: { produtoId: p.id }, orderBy: { createdAt: "asc" } })).toMatchObject([{ quantidade: -.35 }, { quantidade: .35 }])
 const retry = await auth.post("/api/vendas/" + sale.id + "/cancelar", { headers: H, data: { motivo: "Teste sintético" } }); expect(retry.status()).toBe(409)
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10)
 const other = structuredClone(sale); other.id = "KG-OTHER-" + randomUUID(); other.lines[0].inventoryId = STORE + "-other"
 expect((await auth.post("/api/ops/venda-persist", { headers: H, data: { sale: other } })).status()).toBe(409)
 expect((await auth.post("/api/ops/caixa/fechar", { headers: H, data: { sessaoId: STORE + "-cash", saldoContado: 0 } })).status()).toBe(403)
 const cashier = await login("cashier")
 expect((await cashier.post("/api/auth/store-admin-reauth", { headers: H, data: { password: process.env.MANUAL_KG_E2E_PASSWORD, sessaoId: STORE + "-cash" } })).status()).toBe(403)
 await setup(page, cashier)
 await page.getByRole("button", { name: "Resumo do Caixa" }).click()
 const gate = page.getByRole("dialog", { name: /protegido/ })
 await expect(gate).toContainText("Somente a administradora da loja")
 await expect(gate.locator("input")).toHaveCount(0)
})

test("lost response keeps stable sale identity and reload safely reconciles exactly once", async ({ page }) => {
 const p = await product(), auth = await login("admin")
 await setup(page, auth)
 const dialog = await addKg(page, p.sku!, "0,350")
 await dialog.getByRole("button", { name: "Adicionar ao carrinho" }).click()
 const attempts: Array<{ sale: { id: string; lines: unknown[]; manualKgSale: string } }> = []
 let correctedAfterCommit = false
 await page.route("**/api/ops/venda-persist**", async (route) => {
  if (route.request().method() !== "POST" || new URL(route.request().url()).pathname !== "/api/ops/venda-persist") return route.fallback()
  attempts.push(route.request().postDataJSON())
  const response = await route.fetch()
  expect(response.ok(), await response.text()).toBe(true)
  if (!correctedAfterCommit) {
   const item = await db.itemVenda.findFirstOrThrow({ where: { inventoryId: p.id }, include: { venda: true } })
   const result = await auth.post("/api/vendas/" + item.venda.pedidoId + "/corrigir-itens", { headers: H, data: { commandId: randomUUID(), expectedRevision: 0, motivo: "Peso confirmado após resposta perdida", supervisorPin: process.env.MANUAL_KG_E2E_PIN, itens: [{ id: item.id, inventoryId: p.id, nome: item.nome, quantidade: .3, precoUnitario: item.precoUnitario }] } })
   expect(result.status()).toBe(200); correctedAfterCommit = true
  }
  await route.abort("failed")
 })
 await payCash(page)
 await expect.poll(async () => db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(1)
 const pending = page.getByRole("status").filter({ hasText: "pendência(s) de sincronização" })
 await expect(pending).toBeVisible()
 expect(new Set(attempts.map((a) => a.sale.id)).size).toBe(1)
 expect(attempts[0].sale.manualKgSale).toBe("classic-manual-kg-v1")
 const retry = await auth.post("/api/ops/venda-persist", { headers: H, data: attempts[0] })
 expect(retry.status()).toBe(200); expect((await retry.json()).replayed).toBe(true)
 await page.unroute("**/api/ops/venda-persist**")
 // #326: a verificação automática por clientSaleId pode reconciliar antes do clique manual;
 // os dois caminhos precisam terminar no MESMO estado (uma venda, uma baixa, snapshot corrigido).
 const reenviar = pending.getByRole("button", { name: "Reenviar", exact: true })
 if (await reenviar.isVisible().catch(() => false)) await reenviar.click({ timeout: 5000 }).catch(() => undefined)
 await expect(pending).toBeHidden()
 await page.reload()
 await enterTerminal(page)
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9.7)
 expect(await db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(1)
 expect(await db.movimentacaoEstoque.count({ where: { produtoId: p.id } })).toBe(2)
 await expect.poll(async () => page.evaluate((id) => { for (const key of Object.keys(localStorage)) { try { const data = JSON.parse(localStorage.getItem(key) || "null"); const sale = data?.sales?.find((item: { lines: Array<{ inventoryId: string }> }) => item.lines?.some((line) => line.inventoryId === id)); if (sale) return { total: sale.total, quantity: sale.lines[0].quantity, revision: sale.manualKgRevision } } catch {} } return null }, p.id)).toEqual({ total: 6, quantity: .3, revision: 1 })
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/network-recovery.png", fullPage: true })
})

test("Caixa Seguro retains STORE password reauthentication and A01 supervisor PIN", async ({ page }) => {
 const admin = await login("admin")
 await setup(page, admin)
 await page.getByRole("button", { name: "Resumo do Caixa" }).click()
 const gate = page.getByRole("dialog", { name: /protegido/ })
 await expect(gate.getByLabel("Senha da administradora")).toBeVisible()
 await expect(gate.getByPlaceholder("PIN")).toHaveCount(0)
 await gate.getByLabel("Senha da administradora").fill("wrong-synthetic-password")
 await gate.getByRole("button", { name: "Liberar" }).click()
 await expect(gate.getByText("Senha incorreta.")).toBeVisible()
 await gate.getByLabel("Senha da administradora").fill(process.env.MANUAL_KG_E2E_PASSWORD!)
 await gate.getByRole("button", { name: "Liberar" }).click()
 await expect(gate).toBeHidden()
 await expect(page.getByText("Saldo Atual")).toBeVisible()
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/caixa-seguro-store.png", fullPage: true })
 await setup(page, await login("a01"))
 await page.getByRole("button", { name: "Resumo do Caixa" }).click()
 await expect(gate.getByPlaceholder("PIN")).toBeVisible()
 await expect(gate.getByLabel("Senha da administradora")).toHaveCount(0)
})

test("mobile manual KG dialog preserves labels, precision, total and visible actions", async ({ page }) => {
 const p = await product(), auth = await login("admin")
 await page.setViewportSize({ width: 390, height: 844 })
 await setup(page, auth)
 const dialog = await addKg(page, p.sku!, "0.350")
 await expect(dialog).toContainText("Use vírgula")
 await dialog.getByLabel("Peso (kg)").fill("0,350")
 await expect(dialog).toContainText("Total do item: R$ 7,00")
 const box = await dialog.boundingBox()
 expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.width).toBeLessThanOrEqual(390)
 await expect(dialog.getByRole("button", { name: "Adicionar ao carrinho" })).toBeInViewport()
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/mobile-weight.png", fullPage: true })
 expect(await db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(0)
})

test("mixed KG and UN cart keeps UN integer and persists both with exact payment", async ({ page }) => {
 const kg = await product(), un = await product("UN"), auth = await login("admin")
 await setup(page, auth)
 const weight = await addKg(page, kg.sku!, "0,350")
 await weight.getByRole("button", { name: "Adicionar ao carrinho" }).click()
 await expect(weight).toBeHidden()
 const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
 await bipe.fill(un.sku!); await bipe.press("Enter")
 await page.getByRole("button", { name: "F4 Alt. Qtd", exact: true }).click()
 const edit = page.getByRole("dialog", { name: "Alterar Quantidade (F4)" })
 await edit.getByLabel("Quantidade", { exact: true }).fill("1,5")
 await edit.getByRole("button", { name: "Aplicar", exact: true }).click()
 await expect(edit).toBeVisible()
 await edit.getByLabel("Quantidade", { exact: true }).fill("2")
 await edit.getByRole("button", { name: "Aplicar", exact: true }).click()
 await expect(edit).toBeHidden()
 await payCash(page)
 await expect.poll(async () => db.itemVenda.count({ where: { inventoryId: { in: [kg.id, un.id] } } })).toBe(2)
 const items = await db.itemVenda.findMany({ where: { inventoryId: { in: [kg.id, un.id] } } })
 expect(String(items.find((i) => i.inventoryId === kg.id)?.quantidadeKg)).toBe("0.35")
 expect(items.find((i) => i.inventoryId === kg.id)).toMatchObject({ quantidade: null, lineTotal: 7 })
 expect(items.find((i) => i.inventoryId === un.id)).toMatchObject({ quantidade: 2, lineTotal: 6 })
 expect((await db.produto.findUniqueOrThrow({ where: { id: un.id } })).stock).toBe(8)
 const sale = await db.venda.findUniqueOrThrow({ where: { id: items[0].vendaId } })
 expect(sale.total).toBe(13)
})

test("authenticated Workspace corrects only KG weight, survives lost acknowledgement, blocks return UI and cancels the corrected amount", async ({ page }) => {
 const auth = await login("admin"), p = await product()
 const sale = { id: "KG-CORR-" + randomUUID(), manualKgSale: "classic-manual-kg-v1", sessaoId: STORE + "-cash", total: 7,
  lines: [{ inventoryId: p.id, name: p.name, quantity: .35, unitPrice: 20, lineTotal: 7 }], paymentBreakdown: { dinheiro: 7 } }
 expect((await auth.post("/api/ops/venda-persist", { headers: H, data: { sale } })).status()).toBe(200)
 const before = await (await auth.get("/api/vendas/" + sale.id + "?full=1", { headers: H })).json()
 const item = before.venda.itens[0]
 const command = { commandId: randomUUID(), expectedRevision: 0, expectedTotal: 7, motivo: "Peso confirmado sintético", supervisorPin: process.env.MANUAL_KG_E2E_PIN, itens: [{ id: item.id, inventoryId: p.id, nome: p.name, quantidade: .3, precoUnitario: 20 }] }
 const cashier = await login("cashier")
 expect((await cashier.post("/api/vendas/" + sale.id + "/corrigir-itens", { headers: H, data: command })).status()).toBe(403)
 expect((await auth.post("/api/vendas/" + sale.id + "/corrigir-itens", { headers: { "x-assistec-loja-id": "kg-sale-b" }, data: command })).status()).not.toBe(200)
 expect((await auth.post("/api/vendas/" + sale.id + "/corrigir", { headers: H, data: { motivo: "Teste sintético", supervisorPin: process.env.MANUAL_KG_E2E_PIN, novaFormaPagamento: { aPrazo: 7 } } })).status()).toBe(409)
 await setup(page, auth)
 await page.goto("/dashboard/vendas-arquivo-geral")
 const searched = page.waitForResponse((response) => { const url = new URL(response.url()); return url.pathname === "/api/vendas/historico" && url.searchParams.get("q") === sale.id && response.status() === 200 })
 await page.getByPlaceholder("Buscar por cupom, cliente, produto/SKU ou ID da venda…").fill(sale.id)
 await searched
 const row = page.getByRole("row").filter({ hasText: sale.id })
 await expect(row).toHaveCount(1)
 await row.locator('button[aria-haspopup="menu"]').click()
 await page.getByRole("menuitem", { name: "Workspace · Corrigir" }).click()
 const workspace = page.getByRole("dialog", { name: /Workspace da Venda/ })
 await expect(workspace).toBeVisible()
 await workspace.getByRole("tab", { name: /Produtos/ }).click()
 await workspace.getByRole("button", { name: "Editar produtos" }).click()
 const weight = workspace.getByLabel("Peso corrigido (kg)")
 await weight.fill("0.3501")
 await expect(workspace.getByRole("button", { name: "Pré-visualizar correção" })).toBeDisabled()
 await weight.fill("0.300")
 await expect(workspace.getByRole("button", { name: "Trocar produto" })).toBeDisabled()
 await workspace.getByRole("button", { name: "Pré-visualizar correção" }).click()
 await workspace.getByPlaceholder("Descreva o motivo (obrigatório)…").fill("Peso confirmado sintético")
 await workspace.getByPlaceholder("PIN numérico").fill(process.env.MANUAL_KG_E2E_PIN!)
 let committed = false
 await page.route("**/corrigir-itens", async (route) => { const response = await route.fetch(); expect(response.status()).toBe(200); committed = true; await route.abort("failed") })
 await workspace.getByRole("button", { name: "Aplicar correção", exact: true }).click()
 await expect.poll(async () => (await db.venda.findUniqueOrThrow({ where: { pedidoId: sale.id } })).total).toBe(6)
 expect(committed).toBe(true)
 await page.unroute("**/corrigir-itens")
 await expect(workspace.getByRole("button", { name: "Aplicar correção", exact: true })).toBeEnabled()
 await workspace.getByRole("button", { name: "Aplicar correção", exact: true }).click()
 await expect(workspace.getByRole("button", { name: "Editar produtos" })).toBeVisible()
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9.7)
 expect(await db.movimentacaoEstoque.count({ where: { produtoId: p.id } })).toBe(2)
 expect(await db.movimentacaoFinanceira.findMany({ where: { referenciaId: sale.id } })).toMatchObject([{ valor: 6 }])
 await page.reload()
 await expect.poll(async () => page.evaluate((id) => { for (const key of Object.keys(localStorage)) { try { const data = JSON.parse(localStorage.getItem(key) || "null"); const sale = data?.sales?.find((item: { id: string }) => item.id === id); if (sale) return { total: sale.total, quantity: sale.lines[0].quantity, revision: sale.manualKgRevision } } catch {} } return null }, sale.id)).toEqual({ total: 6, quantity: .3, revision: 1 })
 await row.locator('button[aria-haspopup="menu"]').click()
 await page.getByRole("menuitem", { name: "Workspace · Corrigir" }).click()
 await workspace.getByRole("tab", { name: /Produtos/ }).click()
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/corrected-weight.png", fullPage: true })
 await page.keyboard.press("Escape")
 await row.locator('button[aria-haspopup="menu"]').click()
 await page.getByRole("menuitem", { name: "Troca / Devolução" }).click()
 await expect(page.getByRole("alert").filter({ hasText: "Devolução parcial e troca de venda KG indisponíveis" })).toBeVisible()
 await expect(page.getByRole("button", { name: "Confirmar Devolução", exact: true })).toBeDisabled()
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/return-blocked.png", fullPage: true })
 const approval = await auth.post("/api/auth/admin", { headers: { ...H, Origin: baseURL }, data: { pin: process.env.MANUAL_KG_E2E_PIN, action: "estornar_venda", resource: sale.id } })
 expect(approval.status()).toBe(200)
 expect((await auth.post("/api/vendas/" + sale.id + "/cancelar", { headers: H, data: { motivo: "Cancelamento sintético após correção" } })).status()).toBe(200)
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10)
 expect(await db.movimentacaoFinanceira.findMany({ where: { referenciaId: sale.id, tipo: "saida" } })).toMatchObject([{ valor: 6 }])
})

test("estimated KG surcharge is computed from store settings and paid exactly through Classic", async ({ page }) => {
 const settings = await db.storeSettings.findUniqueOrThrow({ where: { storeId: STORE } }), config = settings.printerConfig as Record<string, unknown>
 const auth = await login("a01"), p = await product()
 await db.storeSettings.update({ where: { storeId: STORE }, data: { printerConfig: { ...config, pdvParams: { ...(config.pdvParams as object), incluirImpostoEstimadoNoPdv: true, aliquotaImpostoEstimadoPdv: 20 } } } })
 try {
  await setup(page, auth)
  const dialog = await addKg(page, p.sku!, "0,350")
  await dialog.getByRole("button", { name: "Adicionar ao carrinho" }).click()
  await payCash(page)
  await expect.poll(async () => db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(1)
  const item = await db.itemVenda.findFirstOrThrow({ where: { inventoryId: p.id }, include: { venda: true } })
  expect(item.venda.total).toBe(8.4)
  expect((item.venda.payload as Record<string, unknown>).manualKgTax).toMatchObject({ ratePercent: 20, baseCents: 700, taxCents: 140 })
  expect(await db.movimentacaoFinanceira.findMany({ where: { referenciaId: item.venda.pedidoId } })).toMatchObject([{ valor: 8.4 }])
 } finally { await db.storeSettings.update({ where: { storeId: STORE }, data: { printerConfig: config as Prisma.InputJsonValue } }) }
})

test("integral KG cancellation keeps receivables and consumed customer credit atomic", async () => {
 const auth = await login("admin")
 for (const mode of ["aPrazo", "creditoVale"] as const) {
  const p = await product(), id = "KG-CANCEL-" + randomUUID(), cpf = "12345678909"
  let credit: { id: string } | undefined
  if (mode === "creditoVale") credit = await db.clienteCredito.create({ data: { storeId: STORE, clienteDoc: cpf, clienteNome: "Cliente sintético", valorOriginal: 7, saldoAtual: 7 } })
  const sale = { id, manualKgSale: "classic-manual-kg-v1", sessaoId: STORE + "-cash", total: 7, customerName: "Cliente sintético", customerCpf: cpf,
   aPrazoConfig: mode === "aPrazo" ? { parcelas: 2, primeiroVencimento: "29/11/2026", intervalDias: 30 } : undefined,
   lines: [{ inventoryId: p.id, name: p.name, quantity: .35, unitPrice: 20, lineTotal: 7 }], paymentBreakdown: { [mode]: 7 } }
  const created = await auth.post("/api/ops/venda-persist", { headers: H, data: { sale } }); expect(created.status()).toBe(200)
  expect((await auth.post("/api/auth/admin", { headers: { ...H, Origin: baseURL }, data: { pin: process.env.MANUAL_KG_E2E_PIN, action: "estornar_venda", resource: id } })).status()).toBe(200)
  const outcomes = await Promise.all([1, 2].map(() => auth.post("/api/vendas/" + id + "/cancelar", { headers: H, data: { motivo: "Cancelamento integral sintético" } })))
  expect(outcomes.map((r) => r.status()).sort()).toEqual([200, 409])
  expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(10)
  expect(await db.movimentacaoEstoque.count({ where: { produtoId: p.id, origem: "cancelamento_pdv" } })).toBe(1)
  if (credit) expect((await db.clienteCredito.findUniqueOrThrow({ where: { id: credit.id } })).saldoAtual).toBe(7)
  else {
   const titles = await db.contaReceberTitulo.findMany({ where: { storeId: STORE, localKey: { startsWith: "pdv-aprazo-" + id } } })
   expect(titles).toHaveLength(2); expect(titles.every((t) => t.status === "cancelado")).toBe(true)
  }
 }
})

test("PR322 visor streams stay read-only while KG uses only the operator-confirmed weight", async ({ page }) => {
 test.skip(!existsSync("components/dashboard/vendas/pdv-scale-visor.tsx"), "Executed only in the isolated integration with PR322")
 const auth = await login("admin"), p = await product()
 await page.addInitScript(() => {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const state = { sends: 0, closes: 0, send: (_frame: string) => {} }
  const port = { readable: null as ReadableStream<Uint8Array> | null, async open() { port.readable = new ReadableStream({ start(value) { controller = value }, cancel() {} }) }, async close() { state.closes++; port.readable = null } }
  state.send = (frame) => { state.sends++; controller.enqueue(new TextEncoder().encode(frame)) }
  Object.defineProperty(navigator, "serial", { configurable: true, value: Object.assign(new EventTarget(), { async requestPort() { return port } }) })
  ;(window as unknown as { __kgVisor: typeof state }).__kgVisor = state
 })
 await setup(page, auth)
 const visor = page.getByTestId("pdv-scale-visor")
 await expect(visor).toBeVisible()
 await visor.getByLabel("Protocolo da balança").selectOption("and-hvg-stream")
 await visor.getByRole("button", { name: "Conectar balança" }).click()
 await page.evaluate(() => (window as unknown as { __kgVisor: { send: (frame: string) => void } }).__kgVisor.send("ST,+0009.999 kg\r\n"))
 await expect(visor.getByLabel("Peso recebido da balança")).toHaveText("9,999 kg")
 expect(await db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(0)
 const dialog = await addKg(page, p.sku!)
 await expect(dialog.getByLabel("Peso (kg)")).toHaveValue("")
 await dialog.getByLabel("Peso (kg)").fill("0,350")
 await page.evaluate(() => (window as unknown as { __kgVisor: { send: (frame: string) => void } }).__kgVisor.send("ST,+0008.888 kg\r\n"))
 await expect(dialog.getByLabel("Peso (kg)")).toHaveValue("0,350")
 await expect(dialog).toContainText("Total do item: R$ 7,00")
 await page.screenshot({ animations: "disabled", path: "test-results/manual-kg/pr322-independent-weight.png", fullPage: true })
 await dialog.getByRole("button", { name: "Adicionar ao carrinho" }).click()
 await payCash(page)
 await expect.poll(async () => db.itemVenda.count({ where: { inventoryId: p.id } })).toBe(1)
 const item = await db.itemVenda.findFirstOrThrow({ where: { inventoryId: p.id } })
 expect(String(item.quantidadeKg)).toBe("0.35")
 expect(item.lineTotal).toBe(7)
 expect((await db.produto.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(9.65)
 // Page lifecycle closes the simulated session; explicit disconnect is covered by PR322 contract tests.
})

test("authenticated F8: UN exchange in a KG store issues credit, a KG sale spends it, and the KG sale stays non-returnable", async () => {
 const auth = await login("admin"), un = await product("UN", 10), kg = await product("KG", 10), cpf = "52998224725"
 const origem = { id: "F8-UN-" + randomUUID(), sessaoId: STORE + "-cash", total: 6, customerName: "Cliente sintético", customerCpf: cpf,
  lines: [{ inventoryId: un.sku!, name: un.name, quantity: 2, unitPrice: 3, lineTotal: 6 }], paymentBreakdown: { dinheiro: 6 } }
 expect((await auth.post("/api/ops/venda-persist", { headers: H, data: { sale: origem } })).status()).toBe(200)
 const troca = { localId: "f8-kg-" + randomUUID(), vendaLocalId: origem.id, tipo: "troca", clienteNome: "Cliente sintético", clienteDoc: cpf, sessaoId: STORE + "-cash", itens: [{ inventoryId: un.sku, quantidade: 1 }] }
 const [first, replay] = await Promise.all([1, 2].map(() => auth.post("/api/ops/devolucao", { headers: H, data: troca })))
 expect([first.status(), replay.status()]).toEqual([200, 200])
 expect((await first.json()).creditoEmitido).toBe(3)
 expect(await db.devolucaoVenda.count({ where: { storeId: STORE, localId: troca.localId } })).toBe(1)
 expect((await db.produto.findUniqueOrThrow({ where: { id: un.id } })).stock).toBe(9)
 const nova = { id: "F8-KG-" + randomUUID(), manualKgSale: "classic-manual-kg-v1", sessaoId: STORE + "-cash", total: 3, customerName: "Cliente sintético", customerCpf: cpf,
  lines: [{ inventoryId: kg.id, name: kg.name, quantity: .15, unitPrice: 20, lineTotal: 3 }], paymentBreakdown: { creditoVale: 3 } }
 expect((await auth.post("/api/ops/venda-persist", { headers: H, data: { sale: nova } })).status()).toBe(200)
 expect((await db.produto.findUniqueOrThrow({ where: { id: kg.id } })).stock).toBe(9.85)
 expect((await db.clienteCredito.aggregate({ where: { storeId: STORE, clienteDoc: cpf, status: "ativo" }, _sum: { saldoAtual: true } }))._sum.saldoAtual ?? 0).toBe(0)
 const blocked = await auth.post("/api/ops/devolucao", { headers: H, data: { ...troca, localId: "f8-kg-" + randomUUID(), vendaLocalId: nova.id, tipo: "vale_credito", itens: [{ inventoryId: kg.id, quantidade: 1 }] } })
 expect(blocked.status()).toBe(409)
 expect((await blocked.json()).code).toBe("DEVOLUCAO_KG_BLOQUEADA")
 const eleg = await (await auth.get("/api/ops/devolucao/elegibilidade?q=" + encodeURIComponent(nova.id), { headers: H })).json()
 expect(eleg.vendas[0].lines[0]).toMatchObject({ quantity: .15, bloqueioDevolucao: expect.stringMatching(/KG/) })
 expect((await db.produto.findUniqueOrThrow({ where: { id: kg.id } })).stock).toBe(9.85)
})
