import { test, expect, request, type APIRequestContext, type Page } from "@playwright/test"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma"
import { BASIC_MODULE_ACCESS } from "../../lib/auth/access-policy"

/**
 * Caixa Seguro na experiência STORE — GOAL PADARIA-STORE-ADMIN-CASH-AUTH-001.
 *
 * Pela TELA, com NextAuth real e build de produção: a ADMIN da loja abre o resumo e fecha
 * o caixa com a senha da própria conta; o CAIXA da loja não recebe campo nenhum e é
 * recusado no servidor; a conta interna legada continua no PIN de supervisor. Loja e
 * contas sintéticas criadas aqui; senhas só em memória.
 */
const baseURL = process.env.PILOT_BASE_URL!
const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.PILOT_TEST_DATABASE_URL !== database || process.env.CI !== "true") throw new Error("PILOT_ISOLATION_REQUIRED")
const db = new PrismaClient({ datasourceUrl: database })
const out = "test-results/platform-pilot"
const contexts = new Set<APIRequestContext>()
const RUN = randomBytes(3).toString("hex")
const STORE = `cs-padaria-${RUN}`
const secret = () => "aA1!" + randomBytes(18).toString("hex")
const ADMIN = { id: `cs-admin-${RUN}`, email: `cs-admin-${RUN}@pilot.invalid`, password: secret() }
const CAIXA = { id: `cs-caixa-${RUN}`, email: `cs-caixa-${RUN}@pilot.invalid`, password: secret() }
const H = { "x-assistec-loja-id": STORE }

test.beforeAll(async () => {
  await db.store.create({ data: { id: STORE, name: `Padaria Caixa Seguro ${RUN}`, cnpj: "00.000.000/0001-77", moduleAccess: { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } } })
  await db.storeSettings.create({ data: { storeId: STORE, printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } } })
  for (const [u, role] of [[ADMIN, "ADMIN"], [CAIXA, "CAIXA"]] as const) {
    await db.adminUser.create({ data: { id: u.id, email: u.email, name: `Sintético ${role} ${RUN}`, role, lojaId: STORE, accessScope: "STORE",
      password: await bcrypt.hash(u.password, 10), mustChangePassword: false, adminUserStores: { create: [{ storeId: STORE }] } } })
  }
})
test.afterEach(async () => { for (const c of contexts) await c.dispose(); contexts.clear() })
test.afterAll(async () => { await db.$disconnect() })

async function login(u: { email: string; password: string }) {
  const initial = await request.newContext({ baseURL })
  const csrf = await (await initial.get("/api/auth/csrf")).json()
  await initial.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email: u.email, password: u.password, callbackUrl: baseURL + "/dashboard" }, maxRedirects: 0 })
  const state = await initial.storageState(); await initial.dispose()
  state.cookies.push({ name: "assistec-active-store", value: STORE, domain: new URL(baseURL).hostname, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" })
  const ctx = await request.newContext({ baseURL, storageState: state }); contexts.add(ctx)
  expect((await (await ctx.get("/api/auth/session")).json())?.user?.email).toBe(u.email)
  return ctx
}

/** Leva a sessão da API para a página, entra no PDV desta loja e garante caixa aberto pela tela. */
async function pdvComCaixaAberto(page: Page, actor: APIRequestContext) {
  await page.context().addCookies((await actor.storageState()).cookies)
  await page.context().addInitScript((id) => { try { localStorage.setItem("assistec-pro-loja-ativa-v1", id) } catch { /* */ } }, STORE)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => { await d.getByRole("button", { name: "Voltar depois" }).click() })
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const abrir = page.getByRole("button", { name: "Abrir Caixa" }).first()
  const resumo = page.getByRole("button", { name: "Resumo do Caixa" })
  await usar.or(semTerminal).or(abrir).or(resumo).first().waitFor()
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await abrir.or(resumo).first().waitFor()
  if (await abrir.isVisible()) {
    await abrir.click()
    const abertura = page.getByRole("dialog", { name: "Abertura de Caixa" })
    await abertura.getByRole("button", { name: "R$ 50" }).click()
    await abertura.getByRole("button", { name: "Abrir Caixa" }).click()
    await expect(abertura).toBeHidden()
  }
  await expect(resumo).toBeVisible()
}

test("ADMIN STORE abre o resumo e fecha o caixa com a senha da própria conta", async ({ page }) => {
  const admin = await login(ADMIN)
  await pdvComCaixaAberto(page, admin)
  const sessao = await db.sessaoCaixa.findFirstOrThrow({ where: { storeId: STORE, status: "ABERTA" } })

  // Sem aprovação, o servidor recusa fechar mesmo para a ADMIN.
  expect((await admin.post("/api/ops/caixa/fechar", { headers: H, data: { sessaoId: sessao.id, saldoContado: 50 } })).status()).toBe(403)

  await page.getByRole("button", { name: "Resumo do Caixa" }).click()
  const gate = page.getByRole("dialog", { name: /protegido/ })
  await expect(gate.getByPlaceholder("PIN")).toHaveCount(0)
  await expect(gate).not.toContainText(/PIN|supervisor/i)
  const campo = gate.getByLabel("Senha da administradora")
  await campo.fill("senha-errada-sintetica")
  await gate.getByRole("button", { name: "Liberar" }).click()
  await expect(gate.getByText("Senha incorreta.")).toBeVisible()
  await expect(campo).toHaveValue("")
  await page.screenshot({ path: `${out}/caixa-seguro-senha-errada.png`, fullPage: true, animations: "disabled" })

  await campo.fill(ADMIN.password)
  await gate.getByRole("button", { name: "Liberar" }).click()
  await expect(gate).toBeHidden()
  await expect(page.getByText("Saldo Atual")).toBeVisible()
  await page.screenshot({ path: `${out}/caixa-seguro-resumo-liberado.png`, fullPage: true, animations: "disabled" })

  // Aprovação expirada/revogada: a sangria é recusada no servidor, desfeita no caixa local
  // e NUNCA reenviada depois — nem quando a ADMIN aprova de novo (fila não pega carona).
  const sangrias = () => db.caixaOperacao.count({ where: { storeId: STORE, sessaoId: sessao.id, tipo: "sangria" } })
  const sangria = async (valor: string, motivo: string) => {
    await page.getByRole("button", { name: "Sangria", exact: true }).click()
    const op = page.getByRole("dialog", { name: "Sangria de Caixa" })
    await op.getByPlaceholder("0,00").fill(valor)
    await op.getByPlaceholder(/retirada/).fill(motivo)
    await op.getByRole("button", { name: "Confirmar Sangria" }).click()
  }
  await page.evaluate(() => fetch("/api/auth/store-admin-reauth", { method: "DELETE", credentials: "include" }))
  await sangria("7", "Sangria sintética sem aprovação")
  await expect(page.getByText("Sangria não registrada").first()).toBeVisible()
  await expect(page.getByText("Saldo Atual")).toHaveCount(0)
  await page.getByRole("button", { name: "Resumo do Caixa" }).click()
  await gate.getByLabel("Senha da administradora").fill(ADMIN.password)
  await gate.getByRole("button", { name: "Liberar" }).click()
  await expect(page.getByText("Saldo Atual")).toBeVisible()
  expect(await sangrias()).toBe(0)
  await sangria("7", "Sangria sintética aprovada")
  await expect(page.getByText("Sangria registrada").first()).toBeVisible()
  await expect.poll(sangrias).toBe(1)
  // Atravessa um ciclo do reenvio automático (30 s) com a aprovação válida: a sangria
  // recusada antes não pode reaparecer.
  await page.waitForTimeout(32_000)
  expect(await sangrias()).toBe(1)

  await page.getByRole("button", { name: "Fechar Caixa" }).first().click()
  const fech = page.getByRole("dialog", { name: "Fechamento de Caixa" })
  await fech.getByRole("spinbutton", { name: "Dinheiro contado na gaveta" }).fill("43")
  await fech.getByRole("button", { name: "Confirmar Fechamento" }).click()
  const extra = page.getByRole("alertdialog")
  if (await extra.isVisible({ timeout: 3000 }).catch(() => false)) await extra.getByRole("button").last().click()
  await expect.poll(async () => (await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })).status, { timeout: 20_000 }).toBe("FECHADA")
  expect((await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })).saldoContado).toBe(43)
  await page.screenshot({ path: `${out}/caixa-seguro-fechado.png`, fullPage: true, animations: "disabled" })

  const trilha = await db.logsAuditoria.findMany({ where: { source: "api/auth/store-admin-reauth", userLabel: ADMIN.id }, select: { action: true, metadata: true, detail: true } })
  expect(trilha.map((t) => t.action).sort()).toEqual(["CAIXA_SEGURO_ADMIN_LOJA_AUTORIZADO", "CAIXA_SEGURO_ADMIN_LOJA_AUTORIZADO", "CAIXA_SEGURO_ADMIN_LOJA_RECUSADO"])
  expect(JSON.stringify(trilha)).not.toContain(ADMIN.password)
  expect(JSON.stringify(trilha)).not.toContain("senha-errada-sintetica")
})

test("CAIXA STORE não vê campo de senha nem PIN e o servidor recusa fechar", async ({ page }) => {
  const caixa = await login(CAIXA)
  await pdvComCaixaAberto(page, caixa)
  const sessao = await db.sessaoCaixa.findFirstOrThrow({ where: { storeId: STORE, status: "ABERTA" } })
  await page.getByRole("button", { name: "Resumo do Caixa" }).click()
  const gate = page.getByRole("dialog", { name: /protegido/ })
  await expect(gate).toContainText("Somente a administradora da loja")
  await expect(gate.locator("input")).toHaveCount(0)
  await expect(gate).not.toContainText(/PIN/)
  await page.screenshot({ path: `${out}/caixa-seguro-funcionario.png`, fullPage: true, animations: "disabled" })
  await gate.getByRole("button", { name: "Entendi" }).click()
  await expect(page.getByText("Saldo Atual")).toHaveCount(0)
  expect((await caixa.post("/api/ops/caixa/fechar", { headers: H, data: { sessaoId: sessao.id, saldoContado: 50 } })).status()).toBe(403)
  expect((await caixa.post("/api/auth/store-admin-reauth", { headers: H, data: { password: CAIXA.password, sessaoId: sessao.id } })).status()).toBe(403)
  expect((await db.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })).status).toBe("ABERTA")
})

test("conta interna legada continua no PIN de supervisor", async ({ page }) => {
  const owner = await login({ email: "owner@pilot.invalid", password: process.env.PILOT_PASSWORD_OWNER! })
  await pdvComCaixaAberto(page, owner)
  await page.getByRole("button", { name: "Resumo do Caixa" }).click()
  const gate = page.getByRole("dialog", { name: /protegido/ })
  await expect(gate.getByPlaceholder("PIN")).toBeVisible()
  await expect(gate.getByLabel("Senha da administradora")).toHaveCount(0)
})
