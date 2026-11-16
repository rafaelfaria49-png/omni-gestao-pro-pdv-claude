import path from "node:path"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"

/**
 * OMNI-APARELHOS-ENDTOEND-001 — jornadas reais no navegador (build de produção, NextAuth real,
 * PostgreSQL descartável). Toda escrita passa pela aplicação; o banco só é LIDO para conferir.
 */
const STORE = "e2e-apa-loja"
const STORE_OFF = "e2e-apa-sem-recurso"
const CLIENTE = "Cliente Aparelho E2E"
const USERS = {
  dono: { email: "dono@e2e-aparelhos.invalid", pw: "APARELHOS_E2E_PW_DONO" },
  gerente: { email: "gerente@e2e-aparelhos.invalid", pw: "APARELHOS_E2E_PW_GERENTE" },
  vendedor: { email: "vendedor@e2e-aparelhos.invalid", pw: "APARELHOS_E2E_PW_VENDEDOR" },
  caixa: { email: "caixa@e2e-aparelhos.invalid", pw: "APARELHOS_E2E_PW_CAIXA" },
} as const
const shot = (name: string) => path.join(__dirname, "../../test-results/aparelhos-e2e/screens", name)

function luhn(body14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) { let d = Number(body14[i]); if ((14 - i) % 2 === 1) { d *= 2; if (d > 9) d -= 9 } sum += d }
  return body14 + String((10 - (sum % 10)) % 10)
}
const IMEI_A = luhn("35467812345601")
const IMEI_B = luhn("35467812345602")
const IMEI_COMPRA = luhn("35467812345603")

let db: PrismaClient | null = null
async function readDb(): Promise<PrismaClient> {
  if (db) return db
  const url = process.env.APARELHOS_E2E_DATABASE_URL ?? ""
  if (!url.includes("aparelhos_e2e") || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("APARELHOS_E2E_DATABASE_REQUIRED")
  db = new PrismaClient({ datasourceUrl: url })
  return db
}
test.afterAll(async () => { await db?.$disconnect() })

async function newPage(browser: Browser, viewport = { width: 1440, height: 1000 }): Promise<Page> {
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport, timezoneId: "America/Sao_Paulo" })
  const page = await ctx.newPage()
  void page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (d) => { await d.getByRole("button", { name: /^Voltar depois$/i }).click() })
  return page
}

async function login(page: Page, who: keyof typeof USERS) {
  const u = USERS[who]
  const pw = process.env[u.pw]
  if (!pw) throw new Error(`${u.pw} ausente`)
  await page.goto("/login")
  await page.getByLabel("Email").fill(u.email)
  await page.getByRole("textbox", { name: "Senha" }).evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input as HTMLInputElement, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }, pw)
  await Promise.all([page.waitForURL(/\/dashboard(\/|\?|$)/), page.getByRole("button", { name: "Entrar" }).click()])
}

async function abrirHub(page: Page) {
  await page.goto("/dashboard/cadastros-v2?aba=aparelhos")
  await expect(page.getByRole("heading", { name: "Aparelhos", exact: true })).toBeVisible({ timeout: 60_000 })
}

async function api(page: Page, method: string, pathName: string, body?: unknown, storeId = STORE) {
  const res = await page.request.fetch(`/api/aparelhos${pathName}`, { method, headers: { "x-assistec-loja-id": storeId, "content-type": "application/json" }, data: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status(), json: await res.json().catch(() => null) as Record<string, unknown> | null }
}

async function abrirPdvComCaixa(page: Page) {
  void page.addLocatorHandler(page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ }), async (d) => {
    await d.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
  })
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const bipe = page.getByPlaceholder("Bipe ou digite o código do produto")
  await usar.or(semTerminal).or(bipe).first().waitFor({ timeout: 60_000 })
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await expect(bipe).toBeVisible({ timeout: 60_000 })
  const abrir = page.getByRole("button", { name: "Abrir Caixa", exact: true }).first()
  if (await abrir.isVisible().catch(() => false)) {
    await abrir.click()
    const dialog = page.getByRole("dialog").filter({ has: page.getByText("Saldo Inicial do Caixa") })
    await dialog.getByPlaceholder("0,00").fill("0")
    await dialog.getByPlaceholder("Ex.: Caixa 1 / Nome").fill("Caixa aparelhos E2E")
    await dialog.getByRole("button", { name: "Abrir Caixa", exact: true }).click()
    await expect(page.getByRole("button", { name: "Abrir Caixa", exact: true })).toHaveCount(0, { timeout: 30_000 })
    if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
  }
  return bipe
}

async function semRolagemHorizontal(page: Page) {
  // Mede depois da carga (dados e fontes): a largura final é o que o usuário vê.
  await page.waitForLoadState("networkidle").catch(() => {})
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), { timeout: 15_000 }).toBe(true).catch(() => {})
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const culpados = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > vw + 1 && getComputedStyle(el).position !== "fixed" })
      .slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} right=${Math.round(el.getBoundingClientRect().right)}`)
    return { ok: document.documentElement.scrollWidth <= vw + 1, scrollWidth: document.documentElement.scrollWidth, vw, culpados }
  })
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true })
}

async function fecharComprovante(page: Page) {
  const c = page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal|Cupom \/ Recibo Não Fiscal)$/ })
  if (await c.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false)) {
    // O handler automático do PDV pode fechar primeiro: clique tolerante + espera o diálogo sumir.
    await c.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click({ timeout: 5_000 }).catch(() => {})
  }
  await expect(c).toHaveCount(0, { timeout: 15_000 })
}

test("01 HUB — cadastra com IMEI, confere, libera e mostra indicadores reais", async ({ browser }) => {
  const page = await newPage(browser)
  await login(page, "dono")
  await abrirHub(page)
  await expect(page.getByText("Em estoque")).toBeVisible()
  await page.screenshot({ path: shot("01-hub-visao-geral-vazia-desktop.png"), fullPage: true })

  await page.getByRole("button", { name: "Cadastrar aparelho" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Cadastrar aparelho" })
  await expect(dialog).toBeVisible()
  await dialog.locator("#apa-marca").fill("Apple")
  await dialog.locator("#apa-modelo").fill("iPhone 14")
  await dialog.locator("#apa-arm").fill("128 GB")
  await dialog.locator("#apa-cor").fill("Preto")
  // 04 — IMEI inválido aparece na hora, sem enviar.
  await dialog.locator("#apa-imei1").fill(IMEI_A.slice(0, 14) + String((Number(IMEI_A[14]) + 1) % 10))
  await expect(dialog.getByText(/Dígito verificador do IMEI não confere/)).toBeVisible()
  await dialog.locator("#apa-imei1").fill(IMEI_A)
  await expect(dialog.getByText(/^Válido — /)).toBeVisible()
  await dialog.locator("#apa-custo").fill("3200")
  await dialog.locator("#apa-preco").fill("4999")
  await dialog.getByRole("button", { name: "+ 6 meses" }).click()
  await dialog.getByRole("radio", { name: "Tela: Aprovado" }).click()
  await dialog.getByRole("radio", { name: "Liga e desliga: Aprovado" }).click()
  await dialog.getByLabel(/Liberar para venda agora/).check()
  await dialog.locator("#apa-conf").fill("Consulta manual QA no portal oficial")
  await dialog.screenshot({ path: shot("02-hub-cadastro-dialog-desktop.png") })
  await dialog.getByRole("button", { name: "Cadastrar aparelho" }).click()
  await expect(page.getByText(/cadastrado e disponível para venda/)).toBeVisible()
  const ficha = page.getByRole("dialog").filter({ hasText: "Linha do tempo" })
  await expect(ficha.getByText("Disponível").first()).toBeVisible()
  await ficha.screenshot({ path: shot("03-hub-ficha-desktop.png") })
  await page.keyboard.press("Escape")

  const d = await readDb()
  const unit = await d.aparelhoFisico.findFirstOrThrow({ where: { storeId: STORE, imei1: IMEI_A } })
  expect([unit.status, unit.propriedade, unit.custoTotal, unit.garantiaContratualDias]).toEqual(["disponivel", "loja", 3200, 180])
  expect((await d.produto.findUniqueOrThrow({ where: { id: unit.produtoId } })).stock).toBe(1)
  expect(await d.movimentacaoEstoque.count({ where: { storeId: STORE, produtoId: unit.produtoId, origem: "aparelho", tipo: "entrada" } })).toBe(1)

  // 2ª unidade do MESMO modelo pela API real (custo diferente) — usada no PDV Clássico.
  const b = await api(page, "POST", "", { marca: "Apple", modelo: "iPhone 14", armazenamento: "128 GB", cor: "Azul", condicao: "seminovo", imei1: IMEI_B, custoAquisicao: 3000, precoVenda: 4799, garantiaContratualDias: 90 })
  expect(b.status).toBe(200)
  const idB = (b.json!.aparelho as { id: string }).id
  expect((await api(page, "POST", `/${idB}/acao`, { acao: "conferencia", resultado: "sem_restricao", fonte: "QA" })).status).toBe(200)
  expect((await api(page, "POST", `/${idB}/acao`, { acao: "liberar" })).status).toBe(200)
  // 05 — duplicado recusado pela API.
  expect((await api(page, "POST", "", { marca: "Apple", modelo: "iPhone 14", condicao: "seminovo", imei1: IMEI_B })).json).toMatchObject({ code: "IMEI_DUPLICADO" })

  await page.reload()
  await expect(page.getByRole("heading", { name: "Aparelhos", exact: true })).toBeVisible()
  await expect(page.getByText("Em estoque").locator("xpath=..")).toContainText("2")
  await page.getByRole("button", { name: "Aparelhos", exact: true }).last().click()
  await page.getByLabel("Buscar aparelhos").fill(IMEI_A.slice(-6))
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await page.getByLabel("Buscar aparelhos").fill("")
  await expect(page.locator("tbody tr")).toHaveCount(2)
  await page.screenshot({ path: shot("04-hub-lista-desktop.png"), fullPage: true })
  await semRolagemHorizontal(page)
  await page.context().close()

  const mobile = await newPage(browser, { width: 390, height: 844 })
  await login(mobile, "dono")
  await abrirHub(mobile)
  await semRolagemHorizontal(mobile)
  await mobile.screenshot({ path: shot("05-hub-visao-geral-mobile.png"), fullPage: true })
  await mobile.context().close()
})

test("02 Compra de cliente — vendedor registra, ele mesmo não aprova, gerente aprova; sem estoque antes", async ({ browser }) => {
  const vend = await newPage(browser)
  await login(vend, "vendedor")
  await abrirHub(vend)
  await vend.getByRole("button", { name: "Comprar de cliente" }).first().click()
  const w = vend.getByRole("dialog", { name: "Comprar aparelho de cliente" })
  await w.locator("#cc-nome").fill("Maria Vendedora Sintética")
  await w.locator("#cc-doc").fill("529.982.247-25")
  await w.getByRole("button", { name: "Continuar" }).click()
  await w.locator("#cc-marca").fill("Samsung")
  await w.locator("#cc-modelo").fill("Galaxy S22")
  await w.locator("#cc-arm").fill("256 GB")
  await w.locator("#cc-imei1").fill(IMEI_COMPRA)
  await w.locator("#cc-preco").fill("2799")
  await w.getByRole("button", { name: "Continuar" }).click()
  await w.locator("#cc-valor").fill("2100")
  await w.getByRole("button", { name: "Continuar" }).click()
  await expect(w.getByText("Maria Vendedora Sintética")).toBeVisible()
  await w.screenshot({ path: shot("06-compra-revisao-desktop.png") })
  await w.getByRole("button", { name: "Registrar compra" }).click()
  await expect(w.getByText(/Protocolo AQ-\d{4}-\d{4} registrado/)).toBeVisible()
  await w.getByRole("button", { name: "Concluir" }).click()

  const d = await readDb()
  const aq = await d.aparelhoAquisicao.findFirstOrThrow({ where: { storeId: STORE }, include: { aparelhos: true } })
  expect([aq.status, aq.valorTotal, aq.vendedorDocMascarado]).toEqual(["aguardando_aprovacao", 2100, "***.982.247-**"])
  expect(aq.aparelhos[0]!.propriedade).toBe("aguardando_aquisicao")
  expect(await d.movimentacaoEstoque.count({ where: { storeId: STORE, documento: aq.aparelhos[0]!.codigoInterno } })).toBe(0)
  // 43 — vendedor não vê custo; não aprova.
  expect((await api(vend, "POST", `/aquisicoes/${aq.id}`, { decisao: "aprovar" })).status).toBe(403)
  const lista = await api(vend, "GET", "?pageSize=50")
  expect((lista.json!.itens as Array<{ custoTotal: unknown }>).every((i) => i.custoTotal === null)).toBe(true)
  await vend.context().close()

  const ger = await newPage(browser)
  await login(ger, "gerente")
  await abrirHub(ger)
  await ger.getByRole("button", { name: /Compras de cliente/ }).click()
  await ger.screenshot({ path: shot("07-compras-pendentes-desktop.png"), fullPage: true })
  await ger.getByRole("button", { name: "Aprovar" }).click()
  await expect(ger.getByText(/Compra aprovada/)).toBeVisible()
  await expect.poll(async () => (await d.aparelhoAquisicao.findUniqueOrThrow({ where: { id: aq.id } })).status).toBe("confirmada")
  await ger.context().close()
})

test("03 Venda Completa — cliente obrigatório, unidade pelo IMEI, garantia 6 meses, documentos", async ({ browser }) => {
  const page = await newPage(browser)
  await login(page, "caixa")
  // 42/43 — caixa não acessa o HUB nem custo.
  expect((await api(page, "GET", "")).status).toBe(403)
  const venda = await api(page, "GET", "/venda?q=")
  expect(venda.status).toBe(200)
  expect((venda.json!.itens as Array<{ custoTotal: unknown; imei1: string }>).every((i) => i.custoTotal === null && i.imei1.includes("•"))).toBe(true)

  await abrirPdvComCaixa(page)
  await page.goto("/dashboard/vendas/venda-completa")
  const customerInput = page.getByPlaceholder("Nome, CPF ou telefone… [F2]")
  await expect(customerInput).toBeVisible({ timeout: 60_000 })
  await customerInput.fill("Cliente Aparelho")
  await page.getByRole("button", { name: new RegExp(CLIENTE) }).first().click()
  await expect(page.getByText(CLIENTE, { exact: true }).first()).toBeVisible()

  await page.getByRole("button", { name: "Adicionar aparelho" }).click()
  const dlg = page.getByRole("dialog", { name: "Adicionar aparelho" })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel("IMEI, final do IMEI ou modelo").fill(IMEI_A)
  await dlg.getByLabel("IMEI, final do IMEI ou modelo").press("Enter")
  await expect(dlg.getByRole("button", { name: "+ 6 meses" })).toBeVisible()
  await dlg.getByRole("button", { name: "+ 6 meses" }).click()
  await expect(dlg.getByText(/Legal\s*90 dias/)).toBeVisible()
  await dlg.screenshot({ path: shot("08-venda-aparelho-dialog-desktop.png") })
  // 35 — prévia RASCUNHO antes da confirmação.
  const [previa] = await Promise.all([page.waitForEvent("popup"), dlg.getByRole("button", { name: /Prévia do termo/ }).click()])
  await expect(previa.getByText(/RASCUNHO — prévia sem validade/)).toBeVisible()
  await previa.close()
  await dlg.getByRole("button", { name: "Incluir na venda" }).click()
  await expect(dlg).toHaveCount(0)
  await expect(page.getByText("Garantia dos aparelhos")).toBeVisible()
  await page.screenshot({ path: shot("09-venda-completa-carrinho-desktop.png"), fullPage: true })
  const d = await readDb()
  const unit = await d.aparelhoFisico.findFirstOrThrow({ where: { storeId: STORE, imei1: IMEI_A } })
  expect(unit.status).toBe("reservado")

  await page.getByRole("button", { name: /Finalizar Venda/i }).click()
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: /^PIX$/i }).click()
  await modal.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await fecharComprovante(page)

  const docs = page.getByRole("dialog", { name: "Documentos do aparelho" })
  await expect(docs).toBeVisible({ timeout: 60_000 })
  await expect(docs.getByText(/GAR-\d{4}-\d{5}/)).toBeVisible()
  const [termo] = await Promise.all([page.waitForEvent("popup"), docs.getByRole("button", { name: "Garantia A4" }).click()])
  await expect(termo.getByRole("heading", { name: /Termo de garantia GAR-/ })).toBeVisible()
  await expect(termo.getByText("Cobertura total até")).toBeVisible()
  await termo.screenshot({ path: shot("10-termo-garantia-a4.png"), fullPage: true })
  await termo.close()
  const [cupom] = await Promise.all([page.waitForEvent("popup"), docs.getByRole("button", { name: "Comprovante 80 mm" }).click()])
  await expect(cupom.getByText("Comprovante de venda")).toBeVisible()
  expect(await cupom.evaluate(() => document.getElementById("page-size")?.textContent ?? "")).toMatch(/size: 80mm \d+mm/)
  await cupom.screenshot({ path: shot("11-comprovante-80mm.png"), fullPage: true })
  await cupom.close()

  const av = await d.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: unit.id } })
  expect([av.status, av.legalDias, av.contratualDias, av.clienteId]).toEqual(["ativa", 90, 180, "e2e-apa-cliente"])
  expect((await d.aparelhoFisico.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("vendido")
  const doc = await d.aparelhoDocumento.findFirstOrThrow({ where: { aparelhoVendaId: av.id, tipo: "termo_garantia", formato: "a4" } })
  expect(doc.emissoes).toBe(1)
  await page.context().close()

  // 46 — Venda Completa no celular: sem rolagem horizontal.
  const mobile = await newPage(browser, { width: 390, height: 844 })
  await login(mobile, "caixa")
  await mobile.goto("/dashboard/vendas/venda-completa")
  // O layout pode montar mais de uma instância do campo (responsivo); vale a visível.
  await expect(mobile.getByPlaceholder("Nome, CPF ou telefone… [F2]").locator("visible=true").first()).toBeVisible({ timeout: 60_000 })
  await mobile.screenshot({ path: shot("12-venda-completa-mobile.png"), fullPage: true })
  await semRolagemHorizontal(mobile)
  await mobile.context().close()
})

test("04 PDV Clássico — IMEI bipado abre a unidade; sem cliente bloqueia; com cliente vende", async ({ browser }) => {
  const page = await newPage(browser)
  await login(page, "caixa")
  const bipe = await abrirPdvComCaixa(page)
  await bipe.fill(IMEI_B)
  await bipe.press("Enter")
  const dlg = page.getByRole("dialog", { name: "Adicionar aparelho" })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByText(/exige cliente identificado/)).toBeVisible()
  await expect(dlg.getByRole("button", { name: "Incluir na venda" })).toBeDisabled()
  await dlg.screenshot({ path: shot("13-pdv-classico-sem-cliente.png") })
  await dlg.getByRole("button", { name: "Cancelar" }).click()

  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.press("F2")
  const picker = page.getByRole("dialog", { name: /(Selecionar|Pesquisar) Cliente/i })
  await picker.getByPlaceholder("Nome, CPF/CNPJ ou telefone…").fill("Cliente Aparelho")
  await picker.getByRole("button", { name: new RegExp(CLIENTE) }).click()
  await expect(picker).toHaveCount(0)

  await bipe.fill(IMEI_B)
  await bipe.press("Enter")
  await expect(dlg).toBeVisible()
  await expect(dlg.getByRole("button", { name: "Incluir na venda" })).toBeEnabled()
  await dlg.getByRole("button", { name: "Incluir na venda" }).click()
  await expect(dlg).toHaveCount(0)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.press("F12")
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: /^PIX$/i }).click()
  await modal.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await fecharComprovante(page)
  await expect(page.getByRole("dialog", { name: "Documentos do aparelho" })).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: shot("14-pdv-classico-documentos.png") })

  const d = await readDb()
  const unit = await d.aparelhoFisico.findFirstOrThrow({ where: { storeId: STORE, imei1: IMEI_B } })
  const av = await d.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: unit.id } })
  expect([unit.status, av.contratualDias, av.legalDias]).toEqual(["vendido", 90, 90])
  expect((await d.produto.findUniqueOrThrow({ where: { id: unit.produtoId } })).stock).toBe(0)
  await page.context().close()
})

test("05 Isolamento — loja sem o recurso não mostra a aba nem responde a API", async ({ browser }) => {
  const page = await newPage(browser)
  await login(page, "dono")
  const r = await api(page, "GET", "", undefined, STORE_OFF)
  expect(r.status).toBe(403)
  expect(r.json).toMatchObject({ code: "RECURSO_DESATIVADO" })
  const unitA = await (await readDb()).aparelhoFisico.findFirstOrThrow({ where: { storeId: STORE, imei1: IMEI_A } })
  expect((await api(page, "GET", `/${unitA.id}`, undefined, STORE_OFF)).status).toBe(403)
  await page.context().close()
})
