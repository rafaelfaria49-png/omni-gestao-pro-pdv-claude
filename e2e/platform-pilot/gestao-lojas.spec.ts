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

test("página comercial é pública, honesta, interativa e responsiva em 320/375/390/768/1024/1440", async ({ page }) => {
  const r = await page.goto("/gestao-lojas")
  expect(r?.status()).toBe(200)
  await expect(page).toHaveURL(baseURL + "/gestao-lojas")
  await expect(page.getByRole("heading", { level: 1, name: /O balcão da sua loja/i })).toBeVisible()
  await expect(page).toHaveTitle(/vendas, caixa e estoque/i)
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/\/gestao-lojas$/)
  expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(/\/gestao-lojas\/opengraph-image/)

  // Oferta única autorizada presente; propostas antigas, downloads diretos e prova social inventada ausentes.
  const corpo = await page.locator("body").innerText()
  expect(corpo).toContain("69,90")
  expect(corpo).toMatch(/até 2/i)
  expect(corpo).toMatch(/7 dias/i)
  expect(corpo).not.toMatch(/39,90|99,90|Comércio Plus|créditos IA|depoimento|\+\s?\d+ (lojas|clientes)/i)
  // Canal único para computador/Windows: /baixar (sem link direto para .exe).
  await expect(page.locator('main a[href="/baixar"]')).toBeVisible()
  expect(await page.locator('a[href$=".exe"], a[href*="download"], a[download]').count()).toBe(0)

  // Toda âncora interna tem destino; todo link de página responde.
  for (const href of await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    expect(await page.locator(href).count(), href).toBe(1)
  }
  for (const href of ["/login", "/privacy", "/baixar"]) expect((await page.request.get(href)).status(), href).toBe(200)
  expect((await page.request.get("/gestao-lojas/opengraph-image")).headers()["content-type"]).toContain("image/png")
  await expect(page.getByRole("banner").getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/login")

  // Capturas reais e logos carregadas sem imagem quebrada.
  const imagens = page.locator("img:visible")
  for (let i = 0; i < await imagens.count(); i++) {
    const img = imagens.nth(i); await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((n) => (n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }

  // Vitrine interativa em abas + ampliação acessível (Lightbox com Escape).
  const tabEstoque = page.getByRole("tab", { name: /Produtos e Estoque/i })
  await tabEstoque.click()
  await expect(tabEstoque).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: /Produtos organizados e estoque atualizado/i })).toBeVisible()
  await page.getByRole("button", { name: "Ampliar captura", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // Teclado: o primeiro Tab mostra "Pular para o conteúdo".
  await page.goto("/gestao-lojas")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused()

  // Responsividade real nas 6 larguras obrigatórias (sem rolagem horizontal) + menu mobile.
  for (const [width, height] of [[320, 640], [375, 812], [390, 844], [768, 1024], [1024, 900], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await page.goto("/gestao-lojas")
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `rolagem horizontal em ${width}px`).toBeLessThanOrEqual(0)
    if (width === 390) {
      const toggle = page.getByRole("button", { name: "Abrir menu" })
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(page.locator("#gl-mobile-drawer")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.locator("#gl-mobile-drawer")).toBeHidden()
    }
    if (width === 375 || width === 768 || width === 1440) {
      await page.screenshot({ path: `${out}/gestao-lojas-${width}.png`, fullPage: true, animations: "disabled" })
    }
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
  await expect(page.getByText(`Ligado ao pedido ${protocolo}`)).toBeVisible()
  await page.getByRole("button", { name: "Provisionar cliente" }).click()
  const senha = page.getByLabel("Senha temporária individual")
  await expect(senha).not.toHaveValue("")
  const temporaria = await senha.inputValue()
  // O pedido fecha sozinho ao provisionar, com a loja e o usuário criados no histórico.
  await expect(page.getByText(`Pedido ${protocolo} marcado como acesso liberado.`)).toBeVisible()
  await expect(item).toHaveCount(0)
  const instrucoes = await page.getByLabel("Instruções de entrada para o cliente (sem a senha)").inputValue()
  expect(instrucoes).toContain(`${baseURL}/login`)
  expect(instrucoes).toContain(email)
  expect(instrucoes).not.toContain(temporaria)

  const user = await db.adminUser.findUniqueOrThrow({ where: { email }, select: { id: true, lojaId: true, role: true, accessScope: true, mustChangePassword: true } })
  const row = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { protocolo } })
  expect({ status: row.status, aberto: row.emailAberto }).toEqual({ status: "provisionada", aberto: null })
  expect((row.historico as Array<Record<string, unknown>>).at(-1)).toMatchObject({ evento: "provisionada", storeId: user.lojaId, userId: user.id })

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

test("provisionamento ligado ao pedido é atômico: corrida, pedido encerrado, marcação manual e sem pedido", async () => {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": origem() } }); contexts.add(api)
  const tag = randomBytes(3).toString("hex")
  const pedir = async (n: string) => {
    const r = await api.post("/api/comercial/solicitacoes-teste", { data: { nome: "Corrida Sintética", nomeLoja: `Corrida ${n} ${tag}`, email: `corrida-${n}-${tag}@pilot.invalid`, whatsapp: "11900000004", ramo: "comercio", consentimento: true } })
    expect(r.status()).toBe(201)
    return db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { protocolo: (await r.json()).protocolo } })
  }
  const owner = await login("owner")
  const conta = (email: string, storeName: string, solicitacaoId?: string) => ({ storeName, name: "Dono Sintético", email, branch: "comercio", ...(solicitacaoId ? { solicitacaoId } : {}) })

  // Loja local não provisiona, nem ligando a um pedido; o pedido continua aberto.
  const p1 = await pedir("1")
  const local = await login("adminA")
  expect((await local.post("/api/platform/provision", { data: conta(`x-${tag}@pilot.invalid`, `Local ${tag}`, p1.id) })).status()).toBe(403)
  expect((await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: p1.id } })).status).toBe("recebida")

  // Email diferente do pedido: o servidor recusa ligar, nada é criado e o pedido segue aberto.
  const outroEmail = `outro-${tag}@pilot.invalid`
  expect((await owner.post("/api/platform/provision", { data: conta(outroEmail, `Outro ${tag}`, p1.id) })).status()).toBe(400)
  expect(await db.adminUser.count({ where: { email: outroEmail } })).toBe(0)
  expect((await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: p1.id } })).status).toBe("recebida")

  // Dois operadores no MESMO pedido ao mesmo tempo: uma conta só, um vínculo só.
  const nomeLoja = `Corrida Loja ${tag}`
  const emailPedido = `corrida-1-${tag}@pilot.invalid`
  const rs = await Promise.all([0, 1].map(() => owner.post("/api/platform/provision", { data: conta(emailPedido, nomeLoja, p1.id) })))
  expect(rs.map((r) => r.status()).sort()).toEqual([201, 409])
  expect(await db.store.count({ where: { name: nomeLoja } })).toBe(1)
  const criado = await db.adminUser.findUniqueOrThrow({ where: { email: emailPedido }, select: { id: true, lojaId: true } })
  const fechado = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: p1.id } })
  expect({ status: fechado.status, aberto: fechado.emailAberto }).toEqual({ status: "provisionada", aberto: null })
  const eventos = (fechado.historico as Array<Record<string, unknown>>).filter((h) => h.evento === "provisionada")
  expect(eventos).toHaveLength(1)
  expect(eventos[0]).toMatchObject({ storeId: criado.lojaId, userId: criado.id })

  // Pedido descartado: nada é criado.
  const p2 = await pedir("2")
  expect((await owner.patch("/api/platform/solicitacoes-teste", { data: { id: p2.id, status: "descartada" } })).status()).toBe(200)
  const r2 = await owner.post("/api/platform/provision", { data: conta(`corrida-2-${tag}@pilot.invalid`, `Descartado ${tag}`, p2.id) })
  expect(r2.status()).toBe(409)
  expect(await db.store.count({ where: { name: `Descartado ${tag}` } })).toBe(0)
  expect(await db.adminUser.count({ where: { email: `corrida-2-${tag}@pilot.invalid` } })).toBe(0)

  // Marcação manual ("Marcar acesso liberado") segue funcionando, sem vínculo inventado.
  const p3 = await pedir("3")
  expect((await owner.patch("/api/platform/solicitacoes-teste", { data: { id: p3.id, status: "provisionada" } })).status()).toBe(200)
  const manual = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: p3.id } })
  expect(manual.status).toBe("provisionada")
  expect((manual.historico as Array<Record<string, unknown>>).at(-1)).not.toHaveProperty("storeId")

  // Provisionamento manual, sem pedido, continua igual.
  const semPedido = await owner.post("/api/platform/provision", { data: conta(`sem-${tag}@pilot.invalid`, `Sem pedido ${tag}`) })
  expect(semPedido.status()).toBe(201)
  expect(await semPedido.json()).not.toHaveProperty("solicitacao")
  expect(await db.adminUser.findUniqueOrThrow({ where: { email: `sem-${tag}@pilot.invalid` }, select: { mustChangePassword: true, accessScope: true } })).toEqual({ mustChangePassword: true, accessScope: "STORE" })
})
