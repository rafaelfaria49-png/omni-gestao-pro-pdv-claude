import { expect, test, type Page, type Route } from "@playwright/test"
import {
  STORES, USERS, capabilitiesOf, closeDb, evidence, field, login, logoutViaSeguranca, openCadastrosProdutos,
  openGeral, openNewProduct, productModal, readDb, rowOf, saveProductAndConfirm, searchProduct,
} from "./support"

const A = STORES.padaria
test.afterAll(closeDb)

async function catalogCounts(storeId: string) {
  const db = await readDb()
  const [produtos, categorias, marcas, categoriasProduto] = await Promise.all([
    db.produto.count({ where: { storeId } }), db.categoriaCadastro.count({ where: { storeId } }),
    db.marcaCadastro.count({ where: { storeId } }), db.categoriaProduto.count({ where: { storeId } }),
  ])
  return { produtos, categorias, marcas, categoriasProduto }
}

/** Primeira gravação de produto via Server Action contendo `marker` falha na rede. */
async function failNextProductSave(page: Page, marker: string) {
  let failed = false
  const handler = async (route: Route) => {
    const request = route.request()
    if (!failed && request.method() === "POST" && request.headers()["next-action"] && (request.postData() ?? "").includes(marker)) {
      failed = true
      return route.abort("connectionreset")
    }
    return route.fallback()
  }
  await page.route("**/dashboard/cadastros-v2**", handler)
  return { failed: () => failed, restore: () => page.unroute("**/dashboard/cadastros-v2**", handler) }
}

test("Padaria: ramo, cadastro, edição e nova sessão com persistência real", async ({ page }) => {
  const zero = { produtos: 0, categorias: 0, marcas: 0, categoriasProduto: 0 }
  expect(await catalogCounts(A)).toEqual(zero)

  await test.step("A–B. Login real e editor oficial em Configurações → Geral", async () => {
    await login(page, USERS.admin)
    const card = await openGeral(page)
    await expect(card.getByRole("heading", { name: "Ramo e recursos" })).toBeVisible()
  })

  await test.step("C. Padaria salva somente após confirmação do servidor", async () => {
    const card = page.locator("#ramo-recursos")
    await card.getByRole("combobox", { name: "Ramo principal" }).selectOption("padaria")
    await expect(card.getByRole("checkbox", { name: /Produtos por peso/ })).toBeChecked()
    for (const name of [/Assistência técnica/, /Compatibilidade com aparelhos/, /Acessórios para aparelhos/]) {
      await expect(card.getByRole("checkbox", { name })).not.toBeChecked()
    }
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let putSeen = false
    await page.route(`**/api/stores/${A}/settings`, async (route) => {
      if (route.request().method() !== "PUT") return route.fallback()
      putSeen = true
      const response = await route.fetch()
      await held
      await route.fulfill({ response })
    })
    await card.getByRole("button", { name: "Salvar ramo e recursos" }).click()
    await expect.poll(() => putSeen).toBe(true)
    await expect.poll(async () => (await capabilitiesOf(A))?.business).toMatchObject({ primaryBranch: "padaria" })
    await page.waitForTimeout(1_000)
    await expect(page.getByText("Ramo e recursos salvos")).toHaveCount(0)
    release()
    await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
    await page.unroute(`**/api/stores/${A}/settings`)
    // Patch dedicado: só o ramo escolhido, sem overrides inventados.
    expect(await capabilitiesOf(A)).toEqual({ version: 1, business: { primaryBranch: "padaria" } })
  })

  await test.step("D. Recarregar relê o ramo do servidor", async () => {
    await page.reload()
    const card = page.locator("#ramo-recursos")
    await expect(card.getByRole("combobox", { name: "Ramo principal" })).toHaveValue("padaria")
    await expect(card.getByText("Sugestão do ramo")).toHaveCount(5)
    await page.screenshot({ path: evidence("padaria-configuracoes-1440.png"), fullPage: true })
  })

  await test.step("E–F. Cadastros HUB pelo menu, apresentação da padaria e atalho oficial", async () => {
    await openCadastrosProdutos(page)
    await expect(page.getByText("Cadastros: Padaria / Confeitaria")).toBeVisible()
    for (const tab of ["Técnicos", "Equipamentos"]) await expect(page.getByRole("button", { name: tab, exact: true })).toHaveCount(0)
    // Nenhum editor de ramo duplicado dentro do Cadastros.
    await expect(page.getByRole("combobox", { name: "Ramo principal" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Salvar ramo e recursos" })).toHaveCount(0)
    await page.getByRole("link", { name: "Configurar ramo e recursos" }).click()
    await page.waitForURL(/\/dashboard\/configuracoes\?sec=geral#ramo-recursos$/)
    await expect(page.locator("#ramo-recursos").getByRole("combobox", { name: "Ramo principal" })).toHaveValue("padaria")
    await page.goBack()
    await page.waitForURL(/cadastros-v2/)
    await page.getByRole("button", { name: "Produtos", exact: true }).click()
    expect(await catalogCounts(A)).toEqual(zero)
  })

  await test.step("G. Produto unitário: falha preserva digitação; sucesso só após gravação", async () => {
    const modal = await openNewProduct(page)
    await expect(field(modal, "Nome")).toHaveAttribute("placeholder", "Ex.: Pão francês")
    const body = await modal.innerText()
    expect(body).not.toMatch(/capinhas|películas|modelo compatível|compatibilidade com aparelhos|É um acessório/i)
    await expect(modal.getByText("Garantia (dias)")).toBeHidden()
    await modal.getByText("Informações complementares", { exact: true }).click()
    await expect(modal.getByText("NCM", { exact: true })).toBeHidden()
    await expect(modal.getByRole("combobox", { name: "Forma de venda" })).toHaveValue("unidade")
    await field(modal, "Nome").fill("Pão sintético E2E")
    await field(modal, "SKU").fill("E2E-PAO-001")
    const categoria = field(modal, "Categoria")
    await categoria.fill("Pães sintéticos")
    await categoria.press("Enter")
    await expect(categoria).toHaveValue("Pães sintéticos")
    await field(modal, "Fornecedor").fill("Moinho Sintético")
    await field(modal, "Custo (R$)").fill("0,50")
    await field(modal, "Preço venda (R$)").fill("1,20")
    await field(modal, "Descrição").fill("Pão de teste isolado")
    const outage = await failNextProductSave(page, "Pão sintético E2E")
    await modal.getByRole("button", { name: "Salvar produto", exact: true }).click()
    await expect.poll(outage.failed).toBe(true)
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível confirmar o salvamento" })).toBeVisible()
    await expect(page.getByText("Produto salvo com sucesso.")).toHaveCount(0)
    await expect(field(modal, "Nome")).toHaveValue("Pão sintético E2E")
    await expect(field(modal, "Preço venda (R$)")).toHaveValue("1,20")
    expect((await catalogCounts(A)).produtos).toBe(0)
    await outage.restore()
    await modal.getByRole("button", { name: "Verificar cadastro na loja" }).click()
    await expect(modal.getByText(/Nenhum produto encontrado nesta consulta/)).toBeVisible()
    await expect(field(modal, "Nome")).toHaveValue("Pão sintético E2E")
    await modal.getByRole("button", { name: "Cancelar" }).click()
    const retry = await openNewProduct(page)
    await field(retry, "Nome").fill("Pão sintético E2E")
    await field(retry, "SKU").fill("E2E-PAO-001")
    await field(retry, "Categoria").fill("Pães sintéticos")
    await field(retry, "Categoria").press("Enter")
    await retry.getByText("Informações complementares", { exact: true }).click()
    await field(retry, "Fornecedor").fill("Moinho Sintético")
    await field(retry, "Descrição").fill("Pão de teste isolado")
    await field(retry, "Custo (R$)").fill("0,50")
    await field(retry, "Preço venda (R$)").fill("1,20")
    await saveProductAndConfirm(page)
    await expect(productModal(page)).toHaveCount(0)
    const saved = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-PAO-001" } })
    expect(saved).toMatchObject({ name: "Pão sintético E2E", category: "Pães sintéticos", supplierName: "Moinho Sintético", price: 1.2, precoCusto: 0.5, stock: 0 })
    const metadata = saved.metadata as Record<string, any>
    expect(metadata.atributos).toMatchObject({ descricao: "Pão de teste isolado" })
    for (const key of ["comercial", "catalogoAparelhos", "acessorios", "cadastroRecursos"]) expect(metadata).not.toHaveProperty(key)
    expect(metadata.atributos).not.toHaveProperty("modeloCompativel")
  })

  await test.step("G'. Rejeição real (SKU duplicado) mantém os dados e não grava", async () => {
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Pão duplicado sintético")
    await field(modal, "SKU").fill("E2E-PAO-001")
    await field(modal, "Preço venda (R$)").fill("2,00")
    await modal.getByRole("button", { name: "Salvar produto", exact: true }).click()
    await expect(page.getByText(/já|duplic|existe/i).first()).toBeVisible()
    await expect(field(modal, "Nome")).toHaveValue("Pão duplicado sintético")
    expect(await (await readDb()).produto.count({ where: { storeId: A, name: "Pão duplicado sintético" } })).toBe(0)
    await modal.getByRole("button", { name: "Cancelar" }).click()
  })

  await test.step("Dupla submissão não duplica cadastro", async () => {
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Bolo sintético dupla submissão")
    await field(modal, "Preço venda (R$)").fill("25,00")
    await expect(page.getByText("Produto salvo com sucesso.")).toHaveCount(0)
    await modal.getByRole("button", { name: "Salvar produto", exact: true }).dblclick()
    await expect(page.getByText("Produto salvo com sucesso.").first()).toBeVisible()
    await page.waitForTimeout(2_000)
    expect(await (await readDb()).produto.count({ where: { storeId: A, name: "Bolo sintético dupla submissão" } })).toBe(1)
  })

  await test.step("H. Listagem, busca, reabertura e edição", async () => {
    await searchProduct(page, "Pão sintético")
    const row = rowOf(page, "Pão sintético E2E")
    await expect(row).toHaveCount(1)
    await expect(rowOf(page, "Bolo sintético dupla submissão")).toHaveCount(0)
    await row.getByRole("button", { name: /Editar/ }).click()
    const modal = productModal(page)
    await expect(field(modal, "Nome")).toHaveValue("Pão sintético E2E")
    await expect(field(modal, "SKU")).toHaveValue("E2E-PAO-001")
    await expect(field(modal, "Preço venda (R$)")).toHaveValue("1,2")
    const before = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-PAO-001" } })
    await field(modal, "Preço venda (R$)").fill("1,35")
    await saveProductAndConfirm(page)
    const after = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-PAO-001" } })
    expect(after.id).toBe(before.id)
    expect(after).toMatchObject({ price: 1.35, precoCusto: 0.5, stock: 0, name: "Pão sintético E2E", category: "Pães sintéticos" })
    expect((after.metadata as Record<string, any>).atributos.descricao).toBe("Pão de teste isolado")
    expect(await (await readDb()).produto.count({ where: { storeId: A, sku: "E2E-PAO-001" } })).toBe(1)
    await page.screenshot({ path: evidence("padaria-produtos-1440.png"), fullPage: true })
  })

  await test.step("I–J. Encerrar sessão, autenticar de novo e conferir no servidor", async () => {
    await logoutViaSeguranca(page)
    await login(page, USERS.admin)
    const card = await openGeral(page)
    await expect(card.getByRole("combobox", { name: "Ramo principal" })).toHaveValue("padaria")
    await expect(card.getByRole("checkbox", { name: /Produtos por peso/ })).toBeChecked()
    await openCadastrosProdutos(page)
    await searchProduct(page, "Pão sintético E2E")
    await expect(rowOf(page, "Pão sintético E2E")).toContainText("1.35")
    expect((await capabilitiesOf(A))?.business).toMatchObject({ primaryBranch: "padaria" })
  })
})

test("Produto por peso: somente preparação, preservado ao reabrir e editar", async ({ page }) => {
  await login(page, USERS.admin)
  await openCadastrosProdutos(page)

  await test.step("Saldo inicial incompatível continua recusado pelo servidor", async () => {
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Granola sintética com saldo")
    await modal.getByRole("combobox", { name: "Forma de venda" }).selectOption("peso")
    await field(modal, "Estoque inicial").fill("5")
    await field(modal, "Preço venda (R$)").fill("30,00")
    const save = page.waitForResponse((res) => res.request().method() === "POST" && !!res.request().headers()["next-action"] &&
      (res.request().postData() ?? "").includes("Granola sintética com saldo"))
    await modal.getByRole("button", { name: "Salvar produto", exact: true }).click()
    expect((await save).ok()).toBe(true)
    // Recusa de domínio do ProductWriteService, não falha genérica nem requisição pendente.
    await expect(page.getByText("Produto por peso começa sem saldo. Depois de salvar, registre a entrada em kg (até 3 casas) em Movimentar estoque.").first()).toBeVisible()
    await expect(field(modal, "Nome")).toHaveValue("Granola sintética com saldo")
    await expect(page.getByText("Produto salvo com sucesso.")).toHaveCount(0)
    expect(await (await readDb()).produto.count({ where: { storeId: A, name: "Granola sintética com saldo" } })).toBe(0)
    await modal.getByRole("button", { name: "Cancelar" }).click()
  })

  await test.step("Declaração por KG com saldo zero e aviso de preparação", async () => {
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Pão de queijo sintético kg")
    await field(modal, "SKU").fill("E2E-KG-001")
    await modal.getByRole("combobox", { name: "Forma de venda" }).selectOption("peso")
    await expect(modal.getByRole("combobox", { name: "Unidade comercial e base do preço" })).toHaveValue("KG")
    await expect(modal.getByText(/Venda bloqueada até a integração de quantidade e estoque/)).toBeVisible()
    await expect(field(modal, "Estoque inicial")).toHaveValue("0")
    await field(modal, "Custo (R$)").fill("9,00")
    await field(modal, "Preço venda (R$)").fill("18,90")
    await saveProductAndConfirm(page)
    const saved = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-KG-001" } })
    expect(saved).toMatchObject({ price: 18.9, precoCusto: 9, stock: 0 })
    expect((saved.metadata as Record<string, any>).comercial).toEqual({ version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" })
  })

  await test.step("Reabrir não reinterpreta unidade; editar campo comum preserva a declaração", async () => {
    await searchProduct(page, "E2E-KG-001")
    await rowOf(page, "Pão de queijo sintético kg").getByRole("button", { name: /Editar/ }).click()
    const modal = productModal(page)
    await expect(modal.getByRole("combobox", { name: "Forma de venda" })).toHaveValue("peso")
    await expect(modal.getByRole("combobox", { name: "Forma de venda" })).toBeDisabled()
    await expect(modal.getByRole("combobox", { name: "Unidade comercial e base do preço" })).toBeDisabled()
    await expect(modal.getByText(/Venda bloqueada até a integração/)).toBeVisible()
    await field(modal, "Nome").fill("Pão de queijo sintético kg (editado)")
    await saveProductAndConfirm(page)
    const saved = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-KG-001" } })
    expect(saved).toMatchObject({ name: "Pão de queijo sintético kg (editado)", price: 18.9, precoCusto: 9, stock: 0 })
    expect((saved.metadata as Record<string, any>).comercial).toEqual({ version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" })
    const ledger = await (await readDb()).movimentacaoEstoque.count({ where: { storeId: A, produtoId: saved.id } })
    expect(ledger).toBe(0)
  })
})
