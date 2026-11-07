import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../../lib/auth/access-policy"

/**
 * PADARIA-GO-LIVE-FASTTRACK-002 — cliente padaria, pacote básico, conta STORE, NextAuth real, build de
 * produção (`next start`) e PG descartável 55443. Loja nova a cada execução. Sem credencial produtiva.
 * Cobre o que a suíte do piloto não cobre: venda UN PELA TELA do PDV, comprovante pelo navegador e
 * fechamento de caixa pela tela (com o PIN de supervisor sintético semeado por seed-golive.mjs).
 */
const base = "http://localhost:3000"
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:55443/platform_pilot_isolated"
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/golive"
const RUN = randomBytes(3).toString("hex")
const STORE = `golive-${RUN}`
const pw = () => "aA1!" + randomBytes(18).toString("hex")
const DONO = { id: `golive-dono-${RUN}`, email: `dono-${RUN}@pilot.invalid`, password: pw() }
const CAIXA = { id: `golive-caixa-${RUN}`, email: `caixa-${RUN}@pilot.invalid`, password: pw() }
const UN = { sku: `GL-UN-${RUN}`, name: `Pão de Queijo UN ${RUN}` }
const KG = { id: `golive-kg-${RUN}`, name: `Pão Francês KG ${RUN}` }
const contexts = new Set<APIRequestContext>()
let outside: Record<string, number>

async function outsideCounts() {
  const not = { storeId: { not: STORE } }
  const [vendas, sessoes, movs, produtos] = await Promise.all([db.venda.count({ where: not }), db.sessaoCaixa.count({ where: not }),
    db.movimentacaoEstoque.count({ where: not }), db.produto.count({ where: not })])
  return { vendas, sessoes, movs, produtos }
}

test.beforeAll(async () => {
  const [{ port }] = await db.$queryRawUnsafe<{ port: number }[]>("SELECT inet_server_port() AS port")
  expect(Number(port)).toBe(55443)
  outside = await outsideCounts()
  // GOLIVE_NUMBERING_CODE=1 simula o provisionamento do código de numeração (Gestão de Unidades → Numeração de venda),
  // exigido pelo writer v2; sem ele o v2 recusa (SALE_NUMBERING_NOT_CONFIGURED) e o v1 colide com VDA-AAAA-NNNN de outras lojas.
  const codigoNumeracaoVenda = process.env.GOLIVE_NUMBERING_CODE === "1" ? ("P" + RUN).toUpperCase().slice(0, 8) : null
  await db.store.create({ data: { id: STORE, name: `Padaria Go-Live ${RUN}`, cnpj: "00.000.000/0001-55", codigoNumeracaoVenda, moduleAccess: { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } } })
  await db.storeSettings.create({ data: { storeId: STORE, printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } } })
  for (const [u, role] of [[DONO, "ADMIN"], [CAIXA, "CAIXA"]] as const) {
    await db.adminUser.create({ data: { id: u.id, email: u.email, name: `Sintético ${role} ${RUN}`, role, lojaId: STORE, accessScope: "STORE",
      password: await bcrypt.hash(u.password, 10), mustChangePassword: false, adminUserStores: { create: [{ storeId: STORE }] } } })
  }
  // Produto por peso nasce como o cadastro real cria (sem saldo); só serve para a negativa do PDV.
  await db.produto.create({ data: { id: KG.id, storeId: STORE, name: KG.name, price: 18.9, stock: 0, metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } } })
})
test.afterEach(async () => { for (const c of contexts) await c.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function apiLogin(u: { email: string; password: string }) {
  const initial = await request.newContext({ baseURL: base })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: u.email, password: u.password, callbackUrl: base + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState(); await initial.dispose()
  state.cookies.push({ name: "assistec-active-store", value: STORE, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  const ctx = await request.newContext({ baseURL: base, storageState: state }); contexts.add(ctx)
  expect((await (await ctx.get("/api/auth/session")).json())?.user?.email).toBe(u.email)
  return ctx
}
async function preparePage(page: Page) {
  await page.context().addInitScript((id) => { try { localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* */ } }, STORE)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => { await d.getByRole("button", { name: "Voltar depois" }).click() })
}
const H = { "x-assistec-loja-id": STORE, origin: base }

test("dono: login pelo formulário, menu do pacote básico, sem superfícies administrativas", async ({ page }) => {
  await preparePage(page)
  await page.context().addCookies([{ name: "assistec-active-store", value: STORE, domain: "localhost", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" }])
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(DONO.email)
  await page.getByLabel("Senha", { exact: true }).evaluate((node, secret) => {
    const input = node as HTMLInputElement
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, secret)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, DONO.password)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  const session = await (await page.request.get("/api/auth/session")).json()
  expect({ id: session.user.id, platform: session.user.platformAuthority }).toEqual({ id: DONO.id, platform: false })
  const nav = page.getByRole("navigation").first()
  await expect(nav).toBeVisible()
  await expect(nav).not.toContainText(/IA Mestre|WhatsApp|Marketplace|Contador|Operações|Financeiro|Master|Plataforma/)
  await mkdir(out, { recursive: true }); await page.screenshot({ path: `${out}/01-dono-dashboard.png`, fullPage: true })
  await writeFile(`${out}/01-dono-menu.aria.txt`, await nav.ariaSnapshot())
  // superfícies administrativas e de impressão direta negadas no servidor
  const dono = await apiLogin(DONO)
  expect((await dono.get("/api/admin/supervisor-pin", { headers: H })).status()).toBeGreaterThanOrEqual(401)
  expect((await dono.post("/api/print/raw", { headers: H, data: { host: "127.0.0.1", port: 9, data: "AA==" } })).status()).toBe(403)
  // cadastro de produto UN pelo writer do app; read-back no banco
  const created = await dono.post("/api/produtos", { headers: H, data: { name: UN.name, sku: UN.sku, stock: 10, price: 4.5, precoCusto: 1.5 } })
  expect(created.status()).toBe(201)
  const p = await db.produto.findFirstOrThrow({ where: { storeId: STORE, sku: UN.sku } })
  expect({ stock: p.stock, price: p.price }).toEqual({ stock: 10, price: 4.5 })
})

test("caixa: terminal, abertura, venda UN pela tela, comprovante pelo navegador, fechamento com PIN", async ({ page }) => {
  const caixa = await apiLogin(CAIXA)
  await page.context().addCookies((await caixa.storageState()).cookies)
  await preparePage(page)
  await page.context().addInitScript(() => { (window as unknown as { __prints: number }).__prints = 0; window.print = () => { (window as unknown as { __prints: number }).__prints++ } })
  const rawPrint: number[] = []
  page.on("response", (r) => { if (r.url().includes("/api/print/raw")) rawPrint.push(r.status()) })
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const abrir = page.getByRole("button", { name: "Abrir Caixa" }).first()
  await usar.or(semTerminal).or(abrir).first().waitFor()
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  // abertura pela tela
  await abrir.click()
  const abertura = page.getByRole("dialog", { name: "Abertura de Caixa" })
  await abertura.getByRole("button", { name: "R$ 50" }).click()
  await abertura.getByRole("button", { name: "Abrir Caixa" }).click()
  await expect(abertura).toBeHidden()
  await expect(page.getByText(/Caixa Aberto/).first()).toBeVisible()
  const sessao = await db.sessaoCaixa.findFirstOrThrow({ where: { storeId: STORE, status: "ABERTA" } })
  expect(sessao.saldoInicial).toBe(50)
  // produto por peso: PDV recusa, sem prometer balança
  const bipe = page.getByRole("textbox", { name: "Código / Bipe ENTER" })
  await bipe.fill(KG.id); await bipe.press("Enter")
  await expect(page.getByText("Venda por peso ainda não liberada").first()).toBeVisible()
  await expect(page.getByText("Nenhum item bipado")).toBeVisible()
  await expect(page.getByText(/Ler balança/)).toHaveCount(0)
  // venda UN: 2 × R$ 4,50 em dinheiro
  await page.getByRole("textbox", { name: "Quantidade F4" }).fill("2")
  await bipe.fill(UN.sku); await bipe.press("Enter")
  await expect(page.getByRole("button", { name: new RegExp(`${UN.sku}.*R\\$ 9,00`) })).toBeVisible()
  await page.getByRole("button", { name: "Finalizar Venda F1" }).click()
  const pag = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  await pag.getByRole("button", { name: "Dinheiro" }).click()
  await pag.getByRole("button", { name: /^Confirmar (Dinheiro|valor exato)/ }).click()
  await pag.getByRole("button", { name: "Confirmar Pagamento" }).click()
  await page.getByRole("alertdialog", { name: "Finalizar venda?" }).getByRole("button", { name: "Sim, finalizar" }).click()
  const comp = page.getByRole("dialog", { name: "Comprovante não fiscal" })
  await expect(comp).toBeVisible()
  const venda = await expect.poll(async () => db.venda.findFirst({ where: { storeId: STORE } }), { timeout: 20_000 }).not.toBeNull().then(() => db.venda.findFirstOrThrow({ where: { storeId: STORE } }))
  expect(venda.total).toBe(9)
  const prod = await db.produto.findFirstOrThrow({ where: { storeId: STORE, sku: UN.sku } })
  expect(prod.stock).toBe(8)
  expect(await db.movimentacaoEstoque.count({ where: { storeId: STORE, produtoId: prod.id } })).toBeGreaterThanOrEqual(2)
  // comprovante: a térmica é negada ao pacote básico; o navegador imprime o mesmo conteúdo
  await comp.getByRole("button", { name: "Imprimir agora" }).click()
  const falha = page.getByRole("dialog", { name: "Impressão não enviada" })
  await expect(falha).toBeVisible()
  await expect(falha.getByRole("alert")).toContainText("Sem permissão")
  const popupP = page.waitForEvent("popup")
  await falha.getByRole("button", { name: "Abrir impressão do navegador" }).click()
  const popup = await popupP
  await expect.poll(() => popup.evaluate(() => (window as unknown as { __prints?: number }).__prints ?? 0)).toBe(1)
  const html = (await popup.content()).replace(/ |&nbsp;/g, " ") // Intl pt-BR separa "R$" com NBSP
  for (const s of ["NÃO É DOCUMENTO FISCAL", UN.name, "R$ 9,00", "Dinheiro"]) expect(html).toContain(s)
  await mkdir(out, { recursive: true }); await writeFile(`${out}/02-comprovante.html`, html)
  await popup.screenshot({ path: `${out}/02-comprovante.png`, fullPage: true })
  expect(rawPrint).toEqual([403])
  await page.getByRole("dialog", { name: "Comprovante enviado" }).getByRole("button", { name: "Fechar" }).first().click()
  // fechamento pela tela: resumo protegido por PIN de supervisor
  await page.getByRole("button", { name: "Resumo do Caixa" }).click()
  const gate = page.getByRole("dialog", { name: /protegido/ })
  await gate.getByPlaceholder("PIN").fill(process.env.GOLIVE_SUPERVISOR_PIN!)
  await gate.getByRole("button", { name: "Autorizar" }).click()
  await page.getByRole("button", { name: "Fechar Caixa" }).first().click()
  const fech = page.getByRole("dialog", { name: "Fechamento de Caixa" })
  await expect(fech.getByRole("complementary", { name: "Contagem da gaveta" }).getByText(/R\$\s59,00/).first()).toBeVisible() // 50 abertura + 9 venda
  await fech.getByRole("spinbutton", { name: "Dinheiro contado na gaveta" }).fill("59")
  await fech.getByRole("button", { name: "Confirmar Fechamento" }).click()
  const extra = page.getByRole("alertdialog")
  if (await extra.isVisible({ timeout: 3000 }).catch(() => false)) await extra.getByRole("button").last().click()
  await expect.poll(async () => (await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })).status, { timeout: 20_000 }).toBe("FECHADA")
  const closed = await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })
  expect(closed.saldoContado).toBe(59)
  expect((closed.payload as { totalVendasServer?: number } | null)?.totalVendasServer).toBe(9)
  await page.screenshot({ path: `${out}/03-pos-fechamento.png`, fullPage: true })
})

test("isolamento: nada fora da loja da padaria mudou", async () => {
  expect(await outsideCounts()).toEqual(outside)
})
