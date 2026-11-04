import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  STORES, USERS, closeDb, field, guardOnboarding, login, openCadastrosProdutos, openNewProduct, readDb,
  saveProductAndConfirm, switchStore,
} from "./support"

/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — PDV Clássico real (build de produção, login
 * NextAuth real, PostgreSQL descartável). Vende 2 unidades, F8 abre Troca/Devolução, a busca
 * pelo SKU acha a venda NO SERVIDOR, o bipe do SKU novo entra no mini-carrinho e a troca cobra
 * só a diferença. No banco: UMA devolução, vale criado e consumido, NENHUMA saída financeira de
 * devolução, estoque de volta/baixado uma vez. Segunda abertura mostra o devolvível restante e
 * o Reembolso em dinheiro bloqueado. Dados 100% sintéticos; o banco só é LIDO aqui.
 */

test.afterAll(closeDb)

const B = STORES.variedades
const P = { nome: "Camiseta P troca E2E", sku: "E2E-F8-P", preco: "10,00" }
const G = { nome: "Camiseta G troca E2E", sku: "E2E-F8-G", preco: "15,00" }
const CPF = "52998224725" // CPF sintético de documentação
const BIPE = "Bipe ou digite o código do produto"
const cartRow = (page: Page, nome: string): Locator => page.locator("button").filter({ has: page.locator(`[title="${nome}"]`) })

function guardPostSaleDialog(page: Page) {
  void page.addLocatorHandler(
    page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ }),
    async (dialog) => {
      await dialog.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
    },
  )
}

async function abrirPdv(page: Page) {
  guardOnboarding(page)
  guardPostSaleDialog(page)
  await page.goto("/dashboard/vendas")
  const usar = page.getByRole("button", { name: "Usar" }).first()
  const semTerminal = page.getByText("Continuar sem terminal")
  const bipe = page.getByPlaceholder(BIPE)
  await usar.or(semTerminal).or(bipe).first().waitFor({ timeout: 60_000 })
  if (await usar.isVisible()) await usar.click()
  else if (await semTerminal.isVisible()) await semTerminal.click()
  await expect(bipe).toBeVisible({ timeout: 60_000 })
  return bipe
}

async function garantirCaixaAberto(page: Page) {
  const abrir = page.getByRole("button", { name: "Abrir Caixa", exact: true }).first()
  if (!(await abrir.isVisible().catch(() => false))) return
  await abrir.click()
  const dialog = page.getByRole("dialog").filter({ has: page.getByText("Saldo Inicial do Caixa") })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("0,00").fill("0")
  await dialog.getByPlaceholder("Ex.: Caixa 1 / Nome").fill("Caixa E2E troca")
  await dialog.getByRole("button", { name: "Abrir Caixa", exact: true }).click()
  await expect(page.getByRole("button", { name: "Abrir Caixa", exact: true })).toHaveCount(0, { timeout: 30_000 })
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
}

async function venderDuasEmDinheiro(page: Page, bipe: Locator) {
  for (let i = 0; i < 2; i++) {
    await bipe.fill(P.sku)
    await bipe.press("Enter")
  }
  // O Clássico cria uma linha por bipe (pushCartLine): não pressupor agrupamento.
  // Prova a identidade e as 2 unidades pelas linhas do produto P (nenhum outro item).
  await expect(cartRow(page, P.nome)).toHaveCount(2)
  await expect(page.locator(`[title="${G.nome}"]`)).toHaveCount(0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press("F12")
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  await expect(modal).toBeVisible({ timeout: 10_000 })
  await modal.getByRole("button", { name: /^Dinheiro$/i }).click()
  const cashConfirm = modal.getByRole("button", { name: /Confirmar (Dinheiro|valor exato)/i })
  if (await cashConfirm.count()) await cashConfirm.first().click()
  await modal.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await expect(modal).toHaveCount(0)
}

/**
 * Venda confirmada abre o diálogo do comprovante (assíncrono). Com ele aberto o PDV
 * ignora atalhos (contrato do Clássico) — fecha antes do F8, como o spec 10.
 */
async function fecharPosVenda(page: Page) {
  const dialog = page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ })
  await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {})
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
  await expect(dialog).toHaveCount(0)
}

async function abrirTrocaPorF8(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press("F8")
  const dialog = page.getByRole("dialog", { name: /Troca \/ Devolução/ })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  return dialog
}

async function buscarPorSku(dialog: Locator) {
  const busca = dialog.getByLabel("Venda, cliente ou código de barras do produto")
  await busca.fill(P.sku)
  await busca.press("Enter")
  await expect(dialog.getByText(/Disponível:/)).toBeVisible({ timeout: 20_000 })
}

test("F8 no Clássico: troca imediata com diferença positiva, vale consumido e sem saída fictícia", async ({ browser }) => {
  test.setTimeout(300_000)
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  const db = await readDb()

  await test.step("Produtos pela interface", async () => {
    for (const p of [P, G]) {
      await openCadastrosProdutos(page)
      const modal = await openNewProduct(page)
      await field(modal, "Nome").fill(p.nome)
      await field(modal, "SKU").fill(p.sku)
      await field(modal, "Categoria").fill("Sintéticos troca")
      await field(modal, "Categoria").press("Enter")
      await field(modal, "Preço venda (R$)").fill(p.preco)
      await field(modal, "Estoque inicial").fill("10")
      await saveProductAndConfirm(page)
    }
  })
  const prodP = await db.produto.findFirstOrThrow({ where: { storeId: B, sku: P.sku } })
  const prodG = await db.produto.findFirstOrThrow({ where: { storeId: B, sku: G.sku } })

  const bipe = await abrirPdv(page)
  await garantirCaixaAberto(page)

  let origem = ""
  await test.step("Venda de origem confirmada no servidor (2 × P)", async () => {
    const antes = await db.venda.count({ where: { storeId: B } })
    await venderDuasEmDinheiro(page, bipe)
    await expect.poll(() => db.venda.count({ where: { storeId: B } }), { timeout: 30_000 }).toBe(antes + 1)
    const vendaOrigem = await db.venda.findFirstOrThrow({
      where: { storeId: B, itens: { some: { nome: P.nome } } },
      orderBy: { at: "desc" },
      include: { itens: true },
    })
    origem = vendaOrigem.pedidoId
    // Uma venda de origem: 2 unidades do produto P, R$20, independente de 1 ou 2 linhas.
    expect(await db.venda.count({ where: { storeId: B, itens: { some: { nome: P.nome } } } })).toBe(1)
    expect(vendaOrigem.itens.every((i) => i.inventoryId === prodP.id)).toBe(true)
    expect(vendaOrigem.itens.reduce((s, i) => s + i.quantidade, 0)).toBe(2)
    expect(vendaOrigem.itens.reduce((s, i) => s + i.lineTotal, 0)).toBe(20)
    expect(vendaOrigem.total).toBe(20)
    await expect.poll(async () => (await db.produto.findUniqueOrThrow({ where: { id: prodP.id } })).stock).toBe(8)
    await fecharPosVenda(page)
  })

  await test.step("F8 abre o painel; busca pelo SKU acha a venda no servidor; bipe do novo item", async () => {
    const dialog = await abrirTrocaPorF8(page)
    await buscarPorSku(dialog)
    await expect(dialog.getByText(origem)).toBeVisible()
    await expect(dialog.getByText(/Vendido: 2 · Devolvido: 0 · Disponível:/)).toBeVisible()
    await dialog.getByPlaceholder("Somente números").fill(CPF)
    await dialog.getByPlaceholder("Nome completo").fill("Cliente Sintético E2E")
    await dialog.getByRole("button", { name: "Troca Imediata" }).click()
    await dialog.getByRole("button", { name: `Devolver mais uma unidade de ${P.nome}` }).click()
    await expect(dialog.getByRole("button", { name: "Finalizar Troca Imediata" })).toBeDisabled() // ainda sem item novo
    const novo = dialog.getByLabel("Bipe ou busca do novo produto")
    await novo.fill(G.sku)
    await novo.press("Enter")
    await expect(dialog.getByText(G.nome).first()).toBeVisible()
    // Reembolso bloqueado por política; sobra/dinheiro não aparece.
    await expect(dialog.getByRole("button", { name: "Reembolso (bloqueado)" })).toBeDisabled()
    await expect(dialog.getByText("Devolver dinheiro")).toHaveCount(0)
    await dialog.getByRole("button", { name: "Finalizar Troca Imediata" }).click()
    await expect(page.getByRole("dialog", { name: /Comprovante — Troca/i })).toBeVisible({ timeout: 30_000 })
  })

  await test.step("Banco: uma devolução, vale gerado e consumido, sem saída financeira de devolução", async () => {
    await expect.poll(() => db.devolucaoVenda.count({ where: { storeId: B, vendaLocalId: origem } }), { timeout: 30_000 }).toBe(1)
    const dev = await db.devolucaoVenda.findFirstOrThrow({ where: { storeId: B, vendaLocalId: origem } })
    expect(dev).toMatchObject({ tipo: "troca", valorTotal: 10, creditoEmitido: 10, clienteDoc: CPF })
    expect(await db.movimentacaoFinanceira.count({ where: { storeId: B, origem: "devolucao_pdv" } })).toBe(0)
    await expect.poll(async () => (await db.produto.findUniqueOrThrow({ where: { id: prodG.id } })).stock, { timeout: 30_000 }).toBe(9)
    expect((await db.produto.findUniqueOrThrow({ where: { id: prodP.id } })).stock).toBe(9)
    const credito = await db.clienteCredito.findFirstOrThrow({ where: { storeId: B, devolucaoId: dev.id } })
    expect(credito.saldoAtual).toBe(0)
    expect(await db.usoCreditoCliente.count({ where: { creditoId: credito.id } })).toBe(1)
    expect((await db.venda.findFirstOrThrow({ where: { pedidoId: origem } })).status).toBe("parcialmente_devolvida")
  })

  await test.step("Reabrir F8: devolvível restante = 1 (agregado do servidor)", async () => {
    const comprovante = page.getByRole("dialog", { name: /Comprovante — Troca/i })
    await comprovante.getByRole("button", { name: "Fechar" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog", { name: /Troca \/ Devolução/ })).toHaveCount(0)
    const dialog = await abrirTrocaPorF8(page)
    await buscarPorSku(dialog)
    await expect(dialog.getByText(/Vendido: 2 · Devolvido: 1 · Disponível:/)).toBeVisible()
  })

  await ctx.close()
})
