import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { mkdir } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { localFixtureDatasource } from "../../lib/db/datasource-policy.mjs"

/*
 * Capturas REAIS do sistema para a página /gestao-lojas (public/gestao-lojas/*.png).
 * Roda só sob demanda (GESTAO_LOJAS_CAPTURAS=1) no harness do piloto: banco descartável,
 * NextAuth real, `next start`. Loja, produtos, clientes e vendas são fictícios e criados aqui.
 * Nenhum dado de loja real ou da RAFACELL aparece nas imagens.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = process.env.PILOT_TEST_DATABASE_URL!
test.skip(process.env.GESTAO_LOJAS_CAPTURAS !== "1", "capturas só sob demanda")
if (process.env.GESTAO_LOJAS_CAPTURAS === "1" && process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const destino = "test-results/platform-pilot/gestao-lojas-capturas"
const STORE = "exemplo-variedades"
const H = { "x-assistec-loja-id": STORE }
const ADMIN = { email: "dona@loja-exemplo.invalid", password: "aA1!" + randomBytes(16).toString("hex") }

const PRODUTOS = [
  ["Caderno 10 matérias", "7890000000011", 24.9, 10.5, 32, "Papelaria"],
  ["Caneta esferográfica azul", "7890000000028", 2.5, 0.8, 140, "Papelaria"],
  ["Cabo USB-C 1 m", "7890000000035", 29.9, 9.9, 18, "Acessórios"],
  ["Capa de silicone A15", "7890000000042", 34.9, 8, 3, "Acessórios"],
  ["Fone de ouvido com fio", "7890000000059", 39.9, 14, 12, "Acessórios"],
  ["Carregador turbo 20W", "7890000000066", 59.9, 22, 9, "Acessórios"],
  ["Garrafa térmica 500 ml", "7890000000073", 44.9, 18, 2, "Utilidades"],
  ["Película de vidro A15", "7890000000080", 19.9, 3, 45, "Acessórios"],
  ["Pilha AA (par)", "7890000000097", 9.9, 4.2, 60, "Utilidades"],
  ["Mochila escolar", "7890000000103", 119.9, 55, 6, "Papelaria"],
] as const

const CLIENTES = [
  ["Mariana Alves", "11987650001", "mariana@exemplo.invalid"],
  ["João Pereira", "11987650002", "joao@exemplo.invalid"],
  ["Carla Souza", "11987650003", null],
  ["Roberto Lima", "11987650004", "roberto@exemplo.invalid"],
  ["Patrícia Gomes", "11987650005", null],
  ["Lucas Martins", "11987650006", "lucas@exemplo.invalid"],
] as const

let db: PrismaClient
const contexts = new Set<APIRequestContext>()
test.beforeAll(async () => {
  db = new PrismaClient({ datasourceUrl: localFixtureDatasource(database) })
  await mkdir(destino, { recursive: true })
  await db.store.create({ data: { id: STORE, name: "Loja Exemplo Variedades", cnpj: "00.000.000/0000-00", phone: "1130000000", address: { rua: "Rua Exemplo", numero: "100", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01000-000" }, profile: "VARIEDADES", moduleAccess: { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings"] } } })
  await db.storeSettings.create({ data: { storeId: STORE, contactEmail: "contato@loja-exemplo.invalid", contactWhatsapp: "11900000000", contactWhatsappDono: "11900000000", printerConfig: { pdvMainLayout: "classic", capabilities: { version: 1, business: { primaryBranch: "variedades" } } } } })
  await db.adminUser.create({ data: { email: ADMIN.email, name: "Dona Exemplo", role: "ADMIN", lojaId: STORE, accessScope: "STORE", password: await bcrypt.hash(ADMIN.password, 10), mustChangePassword: false, adminUserStores: { create: [{ storeId: STORE }] } } })
  await db.cliente.createMany({ data: CLIENTES.map(([name, phone, email], i) => ({ id: `exemplo-cliente-${i}`, storeId: STORE, name, phone, email })) })
})
test.afterEach(async () => { for (const c of contexts) await c.dispose(); contexts.clear() })
test.afterAll(async () => { await db?.$disconnect() })

async function login(): Promise<APIRequestContext> {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: ADMIN.email, password: ADMIN.password, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState(); await initial.dispose()
  state.cookies.push({ name: "assistec-active-store", value: STORE, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  const ctx = await request.newContext({ baseURL, storageState: state }); contexts.add(ctx)
  return ctx
}
async function entrar(page: Page, actor: APIRequestContext) {
  await page.context().addCookies((await actor.storageState()).cookies)
  await page.context().addInitScript((id) => { try { localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* */ } }, STORE)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => { await d.getByRole("button", { name: "Voltar depois" }).click() })
}
const foto = (page: Page, nome: string) => page.screenshot({ path: `${destino}/${nome}.png`, animations: "disabled" })

test("capturas reais com dados fictícios", async ({ page }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const admin = await login()
  for (const [name, barcode, price, precoCusto, stock, category] of PRODUTOS) {
    const r = await admin.post("/api/produtos", { headers: H, data: { name, sku: barcode, barcode, stock, price, precoCusto, category } })
    expect(r.status(), name).toBe(201)
  }
  // Caixa aberto e algumas vendas fictícias, para o resumo do caixa ter conteúdo real.
  const opening = await admin.post("/api/ops/caixa/abrir", { headers: H, data: { saldoInicial: 100 } })
  expect(opening.status()).toBe(200)
  const { sessaoId } = await opening.json()
  const vendas: Array<[number, number, Record<string, number>, string | null]> = [[0, 2, { pix: 49.8 }, "exemplo-cliente-0"], [2, 1, { dinheiro: 29.9 }, null], [5, 1, { cartaoCredito: 59.9 }, "exemplo-cliente-1"], [1, 4, { dinheiro: 10 }, null], [4, 1, { cartaoDebito: 39.9 }, "exemplo-cliente-3"], [7, 2, { pix: 39.8 }, null]]
  for (const [i, q, pay, clienteId] of vendas) {
    const [name, sku, price] = PRODUTOS[i]
    const sale = { id: "VDA-EXEMPLO-" + randomBytes(5).toString("hex"), at: new Date().toISOString(), total: Math.round(price * q * 100) / 100, sessaoId, clienteId,
      lines: [{ inventoryId: sku, name, quantity: q, unitPrice: price, lineTotal: Math.round(price * q * 100) / 100 }], paymentBreakdown: pay }
    expect((await admin.post("/api/ops/venda-persist", { headers: H, data: { sale } })).status(), name).toBe(200)
  }

  await entrar(page, admin)
  // PDV com três itens no carrinho.
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const busca = page.getByPlaceholder("Bipe ou digite o código do produto")
  await usar.or(semTerminal).or(busca).first().waitFor()
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await busca.waitFor()
  for (const code of ["7890000000011", "7890000000028", "7890000000028", "7890000000028", "7890000000035"]) {
    await busca.fill(code); await busca.press("Enter"); await page.waitForTimeout(400)
  }
  await page.waitForTimeout(800)
  // Recorte do PDV sem o menu lateral: no hero a tela precisa ser legível.
  await page.screenshot({ path: `${destino}/pdv.png`, animations: "disabled", clip: { x: 224, y: 160, width: 1216, height: 480 } })

  // Resumo do caixa aberto no PDV (abertura, entradas, sangria, suprimento, fechamento).
  const resumo = page.getByRole("button", { name: "Resumo do Caixa" })
  await resumo.click()
  const gate = page.getByRole("dialog", { name: /protegido/ })
  await gate.or(page.getByText("Saldo Atual")).first().waitFor()
  if (await gate.isVisible()) { await gate.getByLabel("Senha da administradora").fill(ADMIN.password); await gate.getByRole("button", { name: "Liberar" }).click(); await expect(gate).toBeHidden() }
  await expect(page.getByText("Saldo Atual")).toBeVisible()
  await page.waitForTimeout(600)
  // Fechamento conferido por forma de pagamento (o que a página promete na seção de caixa).
  await page.getByRole("button", { name: "Fechar Caixa" }).click()
  const fechamento = page.getByRole("dialog").last()
  await fechamento.waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${destino}/caixa-full.png`, animations: "disabled" })
  const box = (await fechamento.boundingBox())!
  await page.screenshot({ path: `${destino}/caixa.png`, animations: "disabled", clip: { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: Math.min(1440, box.width + 48), height: Math.min(900 - Math.max(0, box.y - 24), box.height + 48) } })

  await page.goto("/dashboard/estoque")
  await expect(page.getByText("Mochila escolar").first()).toBeVisible()
  await page.waitForTimeout(600)
  await foto(page, "estoque")

  await page.goto("/dashboard/clientes")
  await expect(page.getByText("Mariana Alves").first()).toBeVisible()
  await page.waitForTimeout(600)
  await foto(page, "clientes")
})
