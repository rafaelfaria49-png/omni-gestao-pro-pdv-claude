import { expect, test, type Page } from "@playwright/test"
import {
  STORES, USERS, closeDb, field, login, logoutViaSeguranca, openCadastrosProdutos,
  openNewProduct, productModal, readDb, rowOf, saveProductAndConfirm, searchProduct, switchStore,
} from "./support"

test.afterAll(closeDb)
const A = STORES.padaria
const BARCODE = "7894900011517"

async function bakery(page: Page) {
  await login(page, USERS.admin)
  await switchStore(page, "Padaria Sintética A")
  await openCadastrosProdutos(page)
}

async function reopen(page: Page, name: string) {
  await searchProduct(page, name)
  await rowOf(page, name).getByRole("button", { name: /Editar/ }).click()
  return productModal(page)
}

test("Cadastro manual sem SKU/EAN: categoria pela UI, edição e nova sessão", async ({ page }) => {
  await bakery(page)
  const name = "Manual 08 pão sem códigos"
  const modal = await openNewProduct(page)
  await expect(modal.getByLabel("Nome", { exact: true })).toBeFocused()
  await field(modal, "Nome").fill(name)
  await field(modal, "Categoria").fill("Manual 08 Pães do balcão")
  await field(modal, "Categoria").press("Enter")
  await expect(field(modal, "Categoria")).toHaveValue("Manual 08 Pães do balcão")
  await field(modal, "Preço venda (R$)").fill("1,23")
  await saveProductAndConfirm(page)
  const db = await readDb()
  const saved = await db.produto.findFirstOrThrow({ where: { storeId: A, name } })
  expect(saved).toMatchObject({ sku: null, barcode: null, price: 1.23, precoCusto: 0, stock: 0, category: "Manual 08 Pães do balcão" })
  expect(await db.categoriaCadastro.count({ where: { storeId: A, name: "Manual 08 Pães do balcão" } })).toBe(1)
  let editor = await reopen(page, name)
  await expect(field(editor, "SKU")).toHaveValue("")
  await expect(field(editor, "Código de barras")).toHaveValue("")
  await expect(field(editor, "Preço venda (R$)")).toHaveValue("1,23")
  await expect(editor.getByText("Garantia (dias)")).toBeHidden()
  await field(editor, "Preço venda (R$)").fill("1,35")
  await saveProductAndConfirm(page)
  await expect(rowOf(page, name)).not.toContainText("100.0%")
  await logoutViaSeguranca(page)
  await login(page, USERS.admin)
  await openCadastrosProdutos(page)
  editor = await reopen(page, name)
  await expect(field(editor, "Preço venda (R$)")).toHaveValue("1,35")
  const after = await db.produto.findUniqueOrThrow({ where: { id: saved.id } })
  expect(after).toMatchObject({ sku: null, barcode: null, price: 1.35, stock: 0 })
  await editor.getByRole("button", { name: "Cancelar" }).click()
})

test("Embalados e cadastro consecutivo: confirmação, códigos opcionais e duplicidade por loja", async ({ page }) => {
  await bakery(page)
  const name = "Manual 08 embalado primeiro"
  let editor = await openNewProduct(page)
  await field(editor, "Nome").fill(name)
  await field(editor, "SKU").fill("MANUAL-08-EMBALADO")
  await field(editor, "Código de barras").pressSequentially(BARCODE)
  await field(editor, "Código de barras").press("Enter")
  expect(await (await readDb()).produto.count({ where: { storeId: A, name } })).toBe(0)
  await field(editor, "Preço venda (R$)").fill("1.234,56")
  await field(editor, "Custo (R$)").fill("234,56")
  await field(editor, "Estoque inicial").fill("2")
  await editor.getByText("Informações complementares", { exact: true }).click()
  await field(editor, "Marca").fill("Manual 08 Marca")
  await field(editor, "Marca").press("Enter")
  await field(editor, "Fornecedor").fill("Fornecedor sintético 08")
  await field(editor, "Garantia (dias)").fill("30")
  await field(editor, "Descrição").fill("Descrição do primeiro embalado")
  await editor.getByText("Dados fiscais do produto", { exact: true }).click()
  await field(editor, "NCM").fill("39269090")
  let seen = 0
  let release!: () => void
  const held = new Promise<void>((done) => { release = done })
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const request = route.request(), data = request.postData() ?? ""
    if (request.method() !== "POST" || !request.headers()["next-action"] || !data.includes(name) || !data.includes('"nome"')) return route.fallback()
    seen += 1
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
  })
  await editor.getByRole("button", { name: "Salvar e cadastrar outro" }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect.poll(async () => (await (await readDb()).produto.count({ where: { storeId: A, name } }))).toBe(1)
  expect(seen).toBe(1)
  await expect(field(editor, "Nome")).toHaveValue(name)
  await expect(page.getByText("Produto salvo com sucesso.")).toHaveCount(0)
  release()
  await expect(page.getByText(name + " foi salvo. Preencha o próximo produto.")).toBeVisible()
  await page.unroute("**/dashboard/cadastros-v2**")
  editor = productModal(page)
  await expect(field(editor, "Nome")).toHaveValue("")
  await expect(editor.getByLabel("Nome", { exact: true })).toBeFocused()
  for (const label of ["SKU", "Código de barras", "Preço venda (R$)", "Custo (R$)", "Marca", "Fornecedor", "Garantia (dias)", "Descrição", "NCM"]) await expect(field(editor, label)).toHaveValue("")
  await expect(field(editor, "Estoque inicial")).toHaveValue("0")
  await field(editor, "Nome").fill("Manual 08 segundo distinto")
  await field(editor, "Preço venda (R$)").fill("0")
  await expect(page.getByText("Produto salvo com sucesso.")).toHaveCount(0)
  await saveProductAndConfirm(page)
  const db = await readDb()
  const first = await db.produto.findFirstOrThrow({ where: { storeId: A, name } })
  const second = await db.produto.findFirstOrThrow({ where: { storeId: A, name: "Manual 08 segundo distinto" } })
  expect(first).toMatchObject({ barcode: BARCODE, price: 1234.56, precoCusto: 234.56, stock: 2 })
  expect(second.id).not.toBe(first.id)
  expect(second).toMatchObject({ sku: null, barcode: null, stock: 0, price: 0, precoCusto: 0, warrantyDays: 0, supplierName: "", brand: "" })
  expect(second.metadata).not.toMatchObject({ atributos: { descricao: "Descrição do primeiro embalado" } })
  // Reabrir com seções recolhidas e editar só preço preserva seus campos completos.
  editor = await reopen(page, name)
  await expect(field(editor, "Garantia (dias)")).toBeHidden()
  await field(editor, "Preço venda (R$)").fill("1.235,00")
  await saveProductAndConfirm(page)
  const updated = await db.produto.findUniqueOrThrow({ where: { id: first.id } })
  expect(updated.metadata).toEqual(first.metadata)
  expect(updated).toMatchObject({ barcode: BARCODE, warrantyDays: 30, supplierName: first.supplierName, brand: first.brand, stock: 2, precoCusto: 234.56 })
  editor = await openNewProduct(page)
  await field(editor, "Nome").fill("Manual 08 duplicado recusado")
  await field(editor, "Código de barras").fill(BARCODE)
  await editor.getByRole("button", { name: "Salvar produto", exact: true }).click()
  await expect(editor.getByRole("alert")).toContainText(/já|duplic|existe/i)
  await expect(field(editor, "Nome")).toHaveValue("Manual 08 duplicado recusado")
  expect(await db.produto.count({ where: { storeId: A, barcode: BARCODE } })).toBe(1)
  await editor.getByRole("button", { name: "Cancelar" }).click()
  await switchStore(page, "Variedades Sintética B")
  await openCadastrosProdutos(page)
  await searchProduct(page, name)
  await expect(rowOf(page, name)).toHaveCount(0)
  editor = await openNewProduct(page)
  await field(editor, "Nome").fill("Manual 08 mesmo código outra loja")
  await field(editor, "Código de barras").fill(BARCODE)
  await field(editor, "Preço venda (R$)").fill("9,99")
  await saveProductAndConfirm(page)
  expect(await db.produto.count({ where: { barcode: BARCODE, storeId: { in: [A, STORES.variedades] } } })).toBe(2)
})

test("Base por G persiste sem conversão, saldo fracionado ou desbloqueio de operação", async ({ page }) => {
  await bakery(page)
  let editor = await openNewProduct(page)
  const name = "Manual 08 produto declarado por G"
  await field(editor, "Nome").fill(name)
  await editor.getByRole("combobox", { name: "Forma de venda" }).selectOption("peso")
  await editor.getByRole("combobox", { name: "Unidade comercial e base do preço" }).selectOption("G")
  await expect(editor.getByLabel("Preço venda (R$ / G)", { exact: true })).toBeVisible()
  await expect(editor.getByLabel("Custo (R$ / G)", { exact: true })).toBeVisible()
  await editor.getByLabel("Preço venda (R$ / G)", { exact: true }).fill("1,23")
  await editor.getByLabel("Custo (R$ / G)", { exact: true }).fill("0,50")
  await expect(editor.getByText(/Venda bloqueada até a integração/)).toBeVisible()
  await saveProductAndConfirm(page)
  const db = await readDb()
  const saved = await db.produto.findFirstOrThrow({ where: { storeId: A, name } })
  expect(saved).toMatchObject({ price: 1.23, precoCusto: 0.5, stock: 0 })
  expect(saved.metadata).toMatchObject({ comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } })
  expect(await db.movimentacaoEstoque.count({ where: { storeId: A, produtoId: saved.id } })).toBe(0)
  editor = await reopen(page, name)
  await expect(editor.getByRole("combobox", { name: "Unidade comercial e base do preço" })).toHaveValue("G")
  await expect(editor.getByRole("combobox", { name: "Unidade comercial e base do preço" })).toBeDisabled()
  await expect(editor.getByRole("button", { name: "Movimentar estoque" })).toBeDisabled()
  await expect(editor.getByLabel("Preço venda (R$ / G)", { exact: true })).toHaveValue("1,23")
})

test("Valores inválidos mantêm o texto; vazio e zero não simulam preço ou saldo", async ({ page }) => {
  await bakery(page)
  const editor = await openNewProduct(page), name = "Manual 08 número inválido"
  await field(editor, "Nome").fill(name)
  let writes = 0
  page.on("request", (request) => { if (request.method() === "POST" && request.headers()["next-action"] && (request.postData() ?? "").includes(name)) writes += 1 })
  for (const raw of ["abc", "NaN", "Infinity", "-1", "1,234", "1.23,45", "1e2"]) {
    await field(editor, "Preço venda (R$)").fill(raw)
    await editor.getByRole("button", { name: "Salvar e cadastrar outro" }).click()
    await expect(editor.getByRole("alert")).toContainText("Preço inválido")
    await expect(field(editor, "Preço venda (R$)")).toHaveValue(raw)
    await expect(field(editor, "Nome")).toHaveValue(name)
  }
  await field(editor, "Preço venda (R$)").fill("")
  for (const raw of ["0,350", "1.5", "-1", "NaN", "Infinity"]) {
    await field(editor, "Estoque inicial").fill(raw)
    await editor.getByRole("button", { name: "Salvar produto", exact: true }).click()
    await expect(editor.getByRole("alert")).toContainText("Estoque inicial inválido")
    await expect(field(editor, "Estoque inicial")).toHaveValue(raw)
  }
  expect(writes).toBe(0)
  await field(editor, "Estoque inicial").fill("")
  await field(editor, "Custo (R$)").fill("0")
  await saveProductAndConfirm(page)
  const saved = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, name } })
  expect(saved).toMatchObject({ price: 0, precoCusto: 0, stock: 0 })
  await searchProduct(page, name)
  await expect(rowOf(page, name)).toContainText("Incompleto")
})

test("Resposta perdida após commit real: consulta canônica sem segunda submissão", async ({ page }) => {
  await bakery(page)
  const editor = await openNewProduct(page), name = "Manual 08 resposta perdida após commit"
  await field(editor, "Nome").fill(name)
  await field(editor, "Preço venda (R$)").fill("8,50")
  let writes = 0
  await page.route("**/dashboard/cadastros-v2**", async (route) => {
    const request = route.request(), data = request.postData() ?? ""
    if (request.method() !== "POST" || !request.headers()["next-action"] || !data.includes(name) || !data.includes('"nome"')) return route.fallback()
    writes += 1
    await route.fetch() // Writer e commit reais; só a entrega da resposta é interrompida.
    await route.abort("connectionreset")
  })
  await editor.getByRole("button", { name: "Salvar e cadastrar outro" }).click()
  await expect(editor.getByRole("alert")).toContainText("pode ter sido gravado")
  await expect(field(editor, "Nome")).toHaveValue(name)
  await expect(field(editor, "Preço venda (R$)")).toHaveValue("8,50")
  await expect(editor.getByRole("button", { name: "Salvar produto", exact: true })).toBeDisabled()
  await editor.getByRole("button", { name: "Verificar cadastro na loja" }).click()
  await expect(editor.getByText(/Consulta na loja encontrou:/)).toContainText(name)
  expect(writes).toBe(1)
  expect(await (await readDb()).produto.count({ where: { storeId: A, name } })).toBe(1)
  await page.unroute("**/dashboard/cadastros-v2**")
  await editor.getByRole("button", { name: "Cancelar" }).click()
  await reopen(page, name)
  await expect(field(productModal(page), "Preço venda (R$)")).toHaveValue("8,5")
})
