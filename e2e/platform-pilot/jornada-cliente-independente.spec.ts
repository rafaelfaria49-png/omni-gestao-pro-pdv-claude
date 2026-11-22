import { test, expect, request, type APIRequestContext } from "@playwright/test"
import { randomBytes } from "node:crypto"
import { PrismaClient } from "../../generated/prisma"

/*
 * OMNI-SAAS-LANCAMENTO-COMERCIAL-PILOTO-001 — primeiro cliente, ponta a ponta, com um
 * SEGUNDO cliente independente tentando ler e gravar na loja do primeiro.
 *
 * landing (pedido) → plataforma provisiona ligada ao pedido → login → troca de senha
 * → assistente de primeiro acesso ("Voltar depois" vale para a aba, #344) → produto UN
 * com estoque → Caixa → venda → baixa de estoque → fechamento pela ADMIN → relatório
 * (tela e PDF) → dados do comprovante. Banco descartável do CI; nada fora dele.
 * Impressão física (POS-80/spooler) NÃO é coberta aqui — só o conteúdo que vai ao papel.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const contexts = new Set<APIRequestContext>()
const out = "test-results/platform-pilot"
const origem = () => `198.51.100.${Math.floor(Math.random() * 250) + 2}, 10.0.0.2`
const h = (storeId: string) => ({ "x-assistec-loja-id": storeId })
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })

test.use({ trace: "off", video: "off" })
test.afterEach(async () => { for (const c of contexts) await c.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function entrar(email: string, senha: string, store: string) {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: senha, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState()
  state.cookies.push({ name: "assistec-active-store", value: store, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  await initial.dispose()
  const ctx = await request.newContext({ baseURL, storageState: state })
  contexts.add(ctx)
  expect(!!(await (await ctx.get("/api/auth/session")).json())?.user?.id, `sessão de ${email}`).toBe(true)
  return ctx
}

/** Pedido real pela API pública da landing (mesmo writer do formulário). */
async function pedir(tag: string, nomeLoja: string) {
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": origem() } }); contexts.add(api)
  const email = `cliente-${tag}-${randomBytes(4).toString("hex")}@pilot.invalid`
  const r = await api.post("/api/comercial/solicitacoes-teste", { data: { nome: `Responsável ${tag} Sintético`, nomeLoja, email, whatsapp: "11900000009", ramo: "comercio", consentimento: true } })
  expect(r.status()).toBe(201)
  const { protocolo } = await r.json()
  const pedido = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { protocolo } })
  return { email, pedido }
}

/** Plataforma aprova o pedido provisionando a conta ligada a ele; cliente troca a senha. */
async function provisionarETrocarSenha(owner: APIRequestContext, nomeLoja: string, email: string, solicitacaoId: string) {
  const r = await owner.post("/api/platform/provision", { data: { storeName: nomeLoja, name: "Responsável Sintético", email, branch: "comercio", solicitacaoId } })
  expect(r.status()).toBe(201)
  const criado = await r.json() as { store: { id: string }; user: { id: string }; temporaryPassword: string }
  const temporario = await entrar(email, criado.temporaryPassword, criado.store.id)
  // Antes da troca: nenhum dado da loja, só a tela de segurança.
  expect(new URL((await temporario.get("/dashboard")).url()).pathname).toBe("/conta/seguranca")
  expect((await temporario.get(`/api/ops/vendas-list?lojaId=${criado.store.id}`, { headers: h(criado.store.id) })).status()).toBeGreaterThanOrEqual(401)
  const nova = "aA1!" + randomBytes(18).toString("hex")
  expect((await temporario.post("/api/account/password", { data: { currentPassword: criado.temporaryPassword, newPassword: nova } })).status()).toBe(200)
  expect(!!(await (await temporario.get("/api/auth/session")).json())?.user).toBe(false) // sessão temporária revogada
  return { storeId: criado.store.id, userId: criado.user.id, senha: nova }
}

test("primeiro cliente independente: pedido → aprovação → loja → senha → assistente → produto → Caixa → venda → relatório; segundo cliente não alcança o primeiro", async ({ browser }) => {
  test.setTimeout(300_000)
  const tag = randomBytes(3).toString("hex")
  const lojaA = `Comércio Jornada A ${tag}`, lojaB = `Comércio Jornada B ${tag}`
  const a = await pedir("a", lojaA), b = await pedir("b", lojaB)
  // Pedido não cria loja nem conta.
  expect(await db.store.count({ where: { name: { in: [lojaA, lojaB] } } })).toBe(0)
  expect(await db.adminUser.count({ where: { email: { in: [a.email, b.email] } } })).toBe(0)

  const owner = await entrar("owner@pilot.invalid", process.env.PILOT_PASSWORD_OWNER!, "pilot-a")
  const A = await provisionarETrocarSenha(owner, lojaA, a.email, a.pedido.id)
  const B = await provisionarETrocarSenha(owner, lojaB, b.email, b.pedido.id)
  expect(A.storeId).not.toBe(B.storeId)
  for (const [p, c] of [[a.pedido.id, A], [b.pedido.id, B]] as const) {
    const row = await db.solicitacaoTesteComercial.findUniqueOrThrow({ where: { id: p } })
    expect(row.status).toBe("provisionada")
    expect((row.historico as Array<Record<string, unknown>>).at(-1)).toMatchObject({ evento: "provisionada", storeId: c.storeId, userId: c.userId })
  }
  const userA = await db.adminUser.findUniqueOrThrow({ where: { id: A.userId }, include: { adminUserStores: { select: { storeId: true } } } })
  expect({ role: userA.role, scope: userA.accessScope, lojas: userA.adminUserStores.map((s) => s.storeId) }).toEqual({ role: "ADMIN", scope: "STORE", lojas: [A.storeId] })

  const ca = await entrar(a.email, A.senha, A.storeId)
  const cb = await entrar(b.email, B.senha, B.storeId)

  // Assistente de primeiro acesso: aparece para a loja nova e "Voltar depois" sobrevive à recarga (#344).
  const navA = await browser.newContext({ baseURL, serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  try {
    await navA.addCookies((await ca.storageState()).cookies)
    const page = await navA.newPage()
    await page.goto("/dashboard")
    const assistente = page.getByRole("dialog", { name: /Boas-vindas/i })
    await expect(assistente).toBeVisible()
    await assistente.getByRole("button", { name: "Voltar depois" }).click()
    await expect(assistente).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("button", { name: "Retomar configuração inicial" })).toBeVisible()
    await expect(page.getByRole("dialog", { name: /Boas-vindas/i })).toHaveCount(0)
    await page.goto("/dashboard/vendas")
    await expect(page.getByRole("dialog", { name: /Boas-vindas/i })).toHaveCount(0)
    await page.screenshot({ path: `${out}/jornada-independente-pdv.png`, fullPage: true, animations: "disabled" })
  } finally { await navA.close() }

  // Produto UN com estoque, pela API do cadastro.
  const sku = `JORNADA-${tag}`.toUpperCase()
  const nomeProduto = `Produto Jornada A ${tag}`
  expect((await ca.post("/api/produtos", { headers: h(A.storeId), data: { name: nomeProduto, sku, stock: 5, price: 12.5, precoCusto: 4 } })).status()).toBe(201)
  const produto = await db.produto.findFirstOrThrow({ where: { storeId: A.storeId, sku } })
  expect(produto.stock).toBe(5)

  // Negativas ANTES da venda: B não cria, não lê e não move estoque na loja de A.
  expect((await cb.post("/api/produtos", { headers: h(A.storeId), data: { name: "Ataque B", sku: `ATK-${tag}`, stock: 1, price: 1 } })).status()).toBe(403)
  expect(await db.produto.count({ where: { storeId: A.storeId, sku: `ATK-${tag}` } })).toBe(0)
  expect((await cb.get(`/api/ops/inventory?lojaId=${A.storeId}`, { headers: h(A.storeId) })).status()).toBe(403)
  expect((await cb.post("/api/ops/caixa/abrir", { headers: h(A.storeId), data: { saldoInicial: 1 } })).status()).toBe(403)

  // Caixa e venda da loja A.
  const abertura = await ca.post("/api/ops/caixa/abrir", { headers: h(A.storeId), data: { saldoInicial: 10 } })
  expect(abertura.status()).toBe(200)
  const { sessaoId } = await abertura.json()
  const venda = { id: "VDA-JORNADA-" + randomBytes(6).toString("hex"), at: new Date().toISOString(), total: 25, sessaoId,
    lines: [{ inventoryId: sku, name: nomeProduto, quantity: 2, unitPrice: 12.5, lineTotal: 25 }], paymentBreakdown: { dinheiro: 25 } }
  // B tenta gravar a venda de A na loja de A e na própria loja (sessão de caixa alheia).
  expect((await cb.post("/api/ops/venda-persist", { headers: h(A.storeId), data: { sale: venda } })).status()).toBe(403)
  expect((await ca.post("/api/ops/venda-persist", { headers: h(A.storeId), data: { sale: venda } })).status()).toBe(200)
  expect((await db.produto.findUniqueOrThrow({ where: { id: produto.id } })).stock).toBe(3)
  const gravada = await db.venda.findFirstOrThrow({ where: { storeId: A.storeId, pedidoId: venda.id } })
  expect(gravada.total).toBe(25)
  expect(await db.venda.count({ where: { pedidoId: venda.id } })).toBe(1)

  // Comprovante: o conteúdo que vai ao papel é da loja certa; B não lê.
  const comprovante = await ca.get(`/api/vendas/${encodeURIComponent(venda.id)}?full=1`, { headers: h(A.storeId) })
  expect(comprovante.status()).toBe(200)
  expect(JSON.stringify(await comprovante.json())).toContain(nomeProduto)
  for (const loja of [A.storeId, B.storeId]) {
    const r = await cb.get(`/api/vendas/${encodeURIComponent(venda.id)}?full=1`, { headers: h(loja) })
    expect(r.status(), `B lendo a venda de A via ${loja === A.storeId ? "loja A" : "própria loja"}`).toBeGreaterThanOrEqual(403)
    expect(await r.text()).not.toContain(nomeProduto)
  }
  expect((await cb.get(`/api/ops/vendas-list?lojaId=${A.storeId}`, { headers: h(A.storeId) })).status()).toBe(403)

  // Fechamento: só a ADMIN, com reautenticação da própria senha; B não fecha o caixa de A.
  expect((await cb.post("/api/auth/store-admin-reauth", { headers: h(A.storeId), data: { password: B.senha, sessaoId } })).status()).toBe(403)
  expect((await cb.post("/api/ops/caixa/fechar", { headers: h(A.storeId), data: { sessaoId, saldoContado: 35 } })).status()).toBe(403)
  expect((await ca.post("/api/auth/store-admin-reauth", { headers: h(A.storeId), data: { password: A.senha, sessaoId } })).status()).toBe(200)
  expect((await ca.post("/api/ops/caixa/fechar", { headers: h(A.storeId), data: { sessaoId, saldoContado: 35 } })).status()).toBe(200)
  const sessao = await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessaoId } })
  expect({ status: sessao.status, loja: sessao.storeId, vendas: (sessao.payload as { totalVendasServer: number }).totalVendasServer }).toEqual({ status: "FECHADA", loja: A.storeId, vendas: 25 })

  // Relatório de produtos: A vê a venda (tela e PDF); B não vê A, nem pela própria loja nem pedindo a de A.
  const periodo = `from=${hoje()}&to=${hoje()}`
  const relA = await ca.get(`/api/dashboard/relatorios/produtos?${periodo}`, { headers: h(A.storeId) })
  expect(relA.status()).toBe(200)
  expect(JSON.stringify(await relA.json())).toContain(nomeProduto)
  const pdf = await ca.get(`/api/dashboard/relatorios/produtos?${periodo}&format=pdf`, { headers: h(A.storeId) })
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()["content-type"]).toContain("application/pdf")
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-")
  const relB = await cb.get(`/api/dashboard/relatorios/produtos?${periodo}`, { headers: h(B.storeId) })
  expect(relB.status()).toBe(200)
  expect(JSON.stringify(await relB.json())).not.toContain(nomeProduto)
  expect((await cb.get(`/api/dashboard/relatorios/produtos?${periodo}`, { headers: h(A.storeId) })).status()).toBe(403)
  expect((await cb.get(`/api/dashboard/relatorios/produtos?${periodo}&storeId=${A.storeId}`, { headers: h(B.storeId) })).status()).toBe(403)

  // Nenhuma tentativa de B deixou rastro na loja de A; B continua sem nada.
  expect(await db.venda.count({ where: { storeId: A.storeId } })).toBe(1)
  expect(await db.venda.count({ where: { storeId: B.storeId } })).toBe(0)
  expect(await db.produto.count({ where: { storeId: B.storeId } })).toBe(0)
  expect(await db.sessaoCaixa.count({ where: { storeId: B.storeId } })).toBe(0)
  // Cliente não lê a caixa comercial da plataforma.
  expect((await ca.get("/api/platform/solicitacoes-teste")).status()).toBe(403)
})
