import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { PrismaClient } from "../../generated/prisma"

/*
 * OMNI-SAAS-VENDAS-SIMPLES-LANDING-COMERCIAL-001 — página comercial /gestao-lojas.
 * Jornada real: Visitante → página → pedido de teste registrado → confirmação verdadeira
 * → plataforma provisiona → login → troca de senha → sistema. Banco descartável do CI.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()
const password = (key: string) => process.env[`PILOT_PASSWORD_${key.toUpperCase()}`]!
/** Cada teste usa uma "origem" própria para não dividir o limite por origem com os demais. */
const origem = () => `198.51.100.${Math.floor(Math.random() * 250) + 2}, 10.0.0.1`

async function loginCredentials(email: string, value: string, store = "pilot-a") {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: value, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: store, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const context = await request.newContext({ baseURL, storageState: state })
  contexts.add(context)
  return context
}
const login = (key: string, store?: string) => loginCredentials(`${key.toLowerCase()}@pilot.invalid`, password(key), store)
async function setupPage(page: Page, actor: APIRequestContext) {
  await page.context().addCookies((await actor.storageState()).cookies)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => { await d.getByRole("button", { name: "Voltar depois" }).click() })
}
async function preencherPedido(page: Page, dados: { nome: string; loja: string; email: string; whatsapp: string; ramo: string }) {
  const form = page.locator("#solicitar form")
  await form.getByLabel("Seu nome").fill(dados.nome)
  await form.getByLabel("Nome da loja").fill(dados.loja)
  await form.getByLabel("Email").fill(dados.email)
  await form.getByLabel("WhatsApp com DDD").fill(dados.whatsapp)
  await form.getByLabel("Tipo de loja").selectOption(dados.ramo)
  await form.getByRole("checkbox").check()
}
test.afterEach(async () => { for (const c of contexts) await c.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

test("página comercial é pública, honesta e responsiva em 375/768/1440", async ({ page }) => {
  const r = await page.goto("/gestao-lojas")
  expect(r?.status()).toBe(200)
  await expect(page).toHaveURL(baseURL + "/gestao-lojas")
  await expect(page.getByRole("heading", { level: 1, name: "O balcão da sua loja, organizado." })).toBeVisible()
  await expect(page).toHaveTitle(/vendas, caixa e estoque/i)
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/\/gestao-lojas$/)
  expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(/\/gestao-lojas\/opengraph-image/)

  // Sem aprovação: nenhum preço proposto, nenhum download, nenhum número fictício.
  const corpo = await page.locator("body").innerText()
  expect(corpo).not.toMatch(/39,90|69,90|99,90|teste grátis|créditos IA|depoimento|\+\s?\d+ (lojas|clientes)/i)
  await expect(page.getByText("Download ainda não liberado")).toBeVisible()
  expect(await page.locator('a[href$=".exe"], a[href*="download"]').count()).toBe(0)

  // Toda âncora interna tem destino; todo link de página responde.
  for (const href of await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    expect(await page.locator(href).count(), href).toBe(1)
  }
  for (const href of ["/login", "/privacy"]) expect((await page.request.get(href)).status(), href).toBe(200)
  expect((await page.request.get("/gestao-lojas/opengraph-image")).headers()["content-type"]).toContain("image/png")
  await expect(page.getByRole("banner").getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login")

  // Capturas reais do sistema carregadas.
  const imagens = page.locator("main img")
  for (let i = 0; i < await imagens.count(); i++) {
    const img = imagens.nth(i); await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((n) => (n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }

  // Teclado: o primeiro Tab mostra "Pular para o conteúdo".
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused()

  for (const [width, height] of [[375, 812], [768, 1024], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await page.goto("/gestao-lojas")
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `rolagem horizontal em ${width}px`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${out}/gestao-lojas-${width}.png`, fullPage: true, animations: "disabled" })
  }
})

test("pedido de teste: erros claros, registro real, repetição sem duplicar, leitura só da plataforma", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": origem() })
  await page.goto("/gestao-lojas#solicitar")
  const form = page.locator("#solicitar form")
  await form.getByRole("button", { name: "Enviar pedido de teste" }).click()
  await expect(form.getByText("Informe seu nome.")).toBeVisible()
  await expect(form.getByText("É preciso concordar com o uso dos dados para o contato.")).toBeVisible()
  await expect(form.getByLabel("Seu nome")).toBeFocused()

  const email = `lead-${randomBytes(4).toString("hex")}@pilot.invalid`
  await preencherPedido(page, { nome: "Visitante Sintético", loja: "Variedades Sintética", email, whatsapp: "(11) 90000-0001", ramo: "variedades" })
  await form.getByRole("button", { name: "Enviar pedido de teste" }).click()
  await expect(page.getByRole("heading", { name: "Pedido de teste recebido" })).toBeFocused()
  const protocolo = (await page.getByTestId("protocolo").innerText()).trim()
  expect(protocolo).toMatch(/^GL-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
  await expect(page.locator("#solicitar")).toContainText("O acesso ainda não foi criado")
  await expect(page.locator("#solicitar")).not.toContainText(/conta criada|teste iniciado/i)
  await page.locator("#solicitar").screenshot({ path: `${out}/gestao-lojas-confirmacao.png`, animations: "disabled" })

  const row = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { protocolo } })
  expect({ email: row.email, aberto: row.emailAberto, status: row.status, ramo: row.ramo, whatsapp: row.whatsapp }).toEqual({ email, aberto: email, status: "recebida", ramo: "variedades", whatsapp: "11900000001" })
  expect(row.consentimentoEm).toBeInstanceOf(Date)
  expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/)
  expect(JSON.stringify(row)).not.toContain("198.51.100")
  expect(await db.store.count({ where: { name: "Variedades Sintética" } })).toBe(0) // pedido não cria loja
  expect(await db.adminUser.count({ where: { email } })).toBe(0) // nem conta

  // Repetição (outro envio, mesmo email em maiúsculas): mesmo protocolo, nenhuma linha nova.
  await page.getByRole("button", { name: "Enviar outro pedido" }).click()
  await expect(page.locator("#solicitar form").getByLabel("Seu nome")).toHaveValue("")
  await preencherPedido(page, { nome: "Visitante Sintético", loja: "Variedades Sintética", email: email.toUpperCase(), whatsapp: "11900000001", ramo: "variedades" })
  await page.locator("#solicitar form").getByRole("button", { name: "Enviar pedido de teste" }).click()
  await expect(page.getByRole("heading", { name: "Seu pedido já estava registrado" })).toBeVisible()
  expect((await page.getByTestId("protocolo").innerText()).trim()).toBe(protocolo)
  expect(await db.solicitacaoTesteComercial.count({ where: { email } })).toBe(1)

  // Leitura e mudança de status: só a plataforma.
  const anon = await request.newContext({ baseURL }); contexts.add(anon)
  expect((await anon.get("/api/platform/solicitacoes-teste")).status()).toBe(403)
  const lojaA = await login("adminA")
  expect((await lojaA.get("/api/platform/solicitacoes-teste")).status()).toBe(403)
  expect((await lojaA.patch("/api/platform/solicitacoes-teste", { data: { id: row.id, status: "descartada" } })).status()).toBe(403)
  expect((await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("recebida")
  const owner = await login("owner")
  const lista = await owner.get("/api/platform/solicitacoes-teste")
  expect(lista.status()).toBe(200)
  expect(JSON.stringify(await lista.json())).toContain(protocolo)
  expect(JSON.stringify(await lista.json())).not.toContain("ipHash")
})

test("pedido de teste falha fechado: campos extras, isca e limite por origem", async () => {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.77" } }); contexts.add(api)
  const base = { nome: "Robô Sintético", nomeLoja: "Loja Robô", whatsapp: "11900000002", ramo: "comercio", consentimento: true }
  expect((await api.post("/api/comercial/solicitacoes-teste", { data: { ...base, email: "x1@pilot.invalid", status: "provisionada" } })).status()).toBe(400)
  expect((await api.post("/api/comercial/solicitacoes-teste", { data: { ...base, email: "x2@pilot.invalid", site: "http://spam" } })).status()).toBe(400)
  expect((await api.post("/api/comercial/solicitacoes-teste", { headers: { "content-type": "application/json" }, data: "não é json" })).status()).toBe(400)
  const statuses: number[] = []
  for (let i = 0; i < 7; i++) statuses.push((await api.post("/api/comercial/solicitacoes-teste", { data: { ...base, email: `rl${i}-${randomBytes(3).toString("hex")}@pilot.invalid` } })).status())
  expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201])
  expect(statuses.slice(5)).toEqual([429, 429])
  expect(await db.solicitacaoTesteComercial.count({ where: { nomeLoja: "Loja Robô" } })).toBe(5)
})

test("jornada: pedido → plataforma provisiona com os dados do pedido → login → troca de senha → sistema", async ({ page, browser }) => {
  const email = `jornada-${randomBytes(4).toString("hex")}@pilot.invalid`
  const visitante = await browser.newContext({ baseURL, serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": origem() } })
  const vp = await visitante.newPage()
  await vp.goto("/gestao-lojas#solicitar")
  await preencherPedido(vp, { nome: "Dona Sintética", loja: "Acessórios Jornada Sintética", email, whatsapp: "11900000003", ramo: "acessorios" })
  await vp.locator("#solicitar form").getByRole("button", { name: "Enviar pedido de teste" }).click()
  await expect(vp.getByRole("heading", { name: "Pedido de teste recebido" })).toBeVisible()
  const protocolo = (await vp.getByTestId("protocolo").innerText()).trim()
  await visitante.close()

  // A plataforma opera a partir de uma unidade própria com cadastro básico COMPLETO.
  // Assim o assistente de primeiro acesso (que remonta o painel e zera formulários) não
  // depende de quais specs rodaram antes e deixaram `pilot-a` completa ou incompleta.
  const sede = "gl-plataforma-" + randomBytes(3).toString("hex")
  await db.store.create({ data: { id: sede, name: "Sede Plataforma Sintética", cnpj: "00.000.000/0000-00", phone: "1130000000", address: { rua: "Rua Sintética", numero: "1", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01000-000" } } })
  await db.storeSettings.create({ data: { storeId: sede, contactEmail: "sede@pilot.invalid", contactWhatsapp: "11900000000", contactWhatsappDono: "11900000000", printerConfig: { capabilities: { version: 1, business: { primaryBranch: "comercio" } } } } })
  const owner = await login("owner", sede)
  await setupPage(page, owner)
  await page.context().addInitScript((id) => { try { localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* */ } }, sede)
  await page.goto("/dashboard/plataforma")
  const item = page.locator(`[data-protocolo="${protocolo}"]`)
  await expect(item).toContainText("Acessórios Jornada Sintética")
  await item.getByRole("button", { name: "Usar no provisionamento" }).click()
  await expect(page.getByLabel("Email de acesso")).toHaveValue(email)
  await expect(page.getByLabel("Nome da loja")).toHaveValue("Acessórios Jornada Sintética")
  await expect(page.getByLabel("Ramo principal")).toHaveValue("acessorios")
  await page.screenshot({ path: `${out}/gestao-lojas-plataforma.png`, fullPage: true, animations: "disabled" })
  await expect(page.getByLabel("Email de acesso")).toHaveValue(email)
  await page.getByRole("button", { name: "Provisionar cliente" }).click()
  const senha = page.getByLabel("Senha temporária individual")
  await expect(senha).not.toHaveValue("")
  const temporaria = await senha.inputValue()
  await item.getByRole("button", { name: "Marcar acesso liberado" }).click()
  await expect(item).toHaveCount(0)
  const row = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { protocolo } })
  expect({ status: row.status, aberto: row.emailAberto }).toEqual({ status: "provisionada", aberto: null })

  const user = await db.adminUser.findUniqueOrThrow({ where: { email }, select: { lojaId: true, role: true, accessScope: true, mustChangePassword: true } })
  expect({ role: user.role, scope: user.accessScope, troca: user.mustChangePassword }).toEqual({ role: "ADMIN", scope: "STORE", troca: true })
  const cliente = await loginCredentials(email, temporaria, user.lojaId!)
  expect(new URL((await cliente.get("/dashboard")).url()).pathname).toBe("/conta/seguranca")
  const nova = "aA1!" + randomBytes(18).toString("hex")
  expect((await cliente.post("/api/account/password", { data: { currentPassword: temporaria, newPassword: nova } })).status()).toBe(200)
  const dentro = await loginCredentials(email, nova, user.lojaId!)
  const painel = await dentro.get("/dashboard")
  expect(painel.status()).toBe(200)
  expect(new URL(painel.url()).pathname).toBe("/dashboard")
  // Cliente novo não enxerga os pedidos comerciais de outras lojas.
  expect((await dentro.get("/api/platform/solicitacoes-teste")).status()).toBe(403)
})
