import { expect, test } from "@playwright/test"
import {
  STORES, USERS, capabilitiesOf, closeDb, field, login, openCadastrosProdutos, openGeral, openNewProduct,
  productModal, readDb, rowOf, saveProductAndConfirm, searchProduct, switchStore,
} from "./support"

test.afterAll(closeDb)

const metadataOf = async (id: string) => (await (await readDb()).produto.findUniqueOrThrow({ where: { id } })).metadata as Record<string, any>


test("Variedades: peso e grade combinados sem mudar ramo nem ativar aparelhos", async ({ page }) => {
  const B = STORES.variedades
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  const card = await openGeral(page)
  await expect(card.getByRole("combobox", { name: "Ramo principal" })).toHaveValue("variedades")
  await card.getByRole("checkbox", { name: /Produtos por peso/ }).check()
  await card.getByRole("checkbox", { name: /Grade comercial/ }).check()
  await card.getByRole("button", { name: "Salvar ramo e recursos" }).click()
  await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
  const caps = await capabilitiesOf(B)
  expect(caps).toMatchObject({ version: 1, business: { primaryBranch: "variedades" }, overrides: { "catalog.weight": true, "catalog.variants": true } })
  for (const key of ["service.technical", "catalog.deviceCompatibility", "pdv.accessoryModelColor"]) expect(caps?.overrides).not.toHaveProperty(key)
  await page.reload()
  for (const name of [/Assistência técnica/, /Compatibilidade com aparelhos/, /Acessórios para aparelhos/]) {
    await expect(page.locator("#ramo-recursos").getByRole("checkbox", { name })).not.toBeChecked()
  }
  const settings = await (await readDb()).storeSettings.findUniqueOrThrow({ where: { storeId: B } })
  expect(settings.printerConfig).toMatchObject({ pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] } })

  await openCadastrosProdutos(page)
  await expect(page.getByText("Cadastros: Variedades / Brinquedos")).toBeVisible()
  const modal = await openNewProduct(page)
  await expect(modal.getByRole("combobox", { name: "Forma de venda" })).toBeVisible()
  expect(await modal.innerText()).not.toMatch(/Recursos aplicáveis|Modelo compatível|É um acessório/i)
  await field(modal, "Nome").fill("Camiseta sintética grade")
  await modal.getByText(/Planejar grade para este produto/).click()
  await field(modal, "Preço venda (R$)").fill("49,90")
  await saveProductAndConfirm(page)
  const product = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: B, name: "Camiseta sintética grade" } })
  expect((product.metadata as Record<string, any>).comercial).toEqual({ version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN", gradePlanejada: true })
  expect(product.stock).toBe(0)
})

test("Campos ocultos: editar campo comum preserva vínculos, overrides false, garantia e fiscal", async ({ page }) => {
  const before = await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-b-legado" } })
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  await openCadastrosProdutos(page)
  await searchProduct(page, "E2E-B-LEG")

  await test.step("Reabrir e fechar sem salvar não grava nada", async () => {
    await rowOf(page, "Capa sintética legado B").getByRole("button", { name: /Editar/ }).click()
    const modal = productModal(page)
    await expect(field(modal, "Nome")).toHaveValue("Capa sintética legado B")
    expect(await modal.innerText()).not.toMatch(/Modelo compatível|Compatibilidade com aparelhos|É um acessório/i)
    await modal.getByRole("button", { name: "Cancelar" }).click()
    const reopened = await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-b-legado" } })
    expect(reopened.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
    expect(reopened.metadata).toEqual(before.metadata)
  })

  await test.step("Patch parcial do preço com seções ocultas", async () => {
    await rowOf(page, "Capa sintética legado B").getByRole("button", { name: /Editar/ }).click()
    const modal = productModal(page)
    await field(modal, "Preço venda (R$)").fill("32,50")
    await saveProductAndConfirm(page)
    const after = await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-b-legado" } })
    const prev = before.metadata as Record<string, any>
    const next = after.metadata as Record<string, any>
    expect(after).toMatchObject({ price: 32.5, precoCusto: 12, stock: 7, warrantyDays: 90, sku: "E2E-B-LEG", category: "Sintéticos" })
    expect(next.catalogoAparelhos).toEqual(prev.catalogoAparelhos)
    expect(next.acessorios).toEqual(prev.acessorios)
    expect(next.cadastroRecursos).toEqual({ compatibilidade: true, acessorios: false })
    expect(next.atributos).toMatchObject({ modeloCompativel: "Modelo Sintético X", descricao: "Descrição sintética original", tags: ["sintetico"] })
    expect(next.fiscal).toMatchObject({ ncm: "39269090" })
    expect(next.chaveNaoEnviada).toEqual({ origem: "fixture" })
    expect(next).not.toHaveProperty("comercial")
  })
})

test("Assistência legada: recursos pertinentes e vínculos preservados sem gravar configuração", async ({ page }) => {
  const C = STORES.assistencia
  const before = await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-c-legado" } })
  await login(page, USERS.admin)
  await switchStore(page, "Assistência Sintética C")
  const card = await openGeral(page)
  await expect(card.getByRole("combobox", { name: "Ramo principal" })).toHaveValue("assistencia")
  for (const name of [/Assistência técnica/, /Compatibilidade com aparelhos/, /Acessórios para aparelhos/]) {
    await expect(card.getByRole("checkbox", { name })).toBeChecked()
  }
  await expect(card.getByRole("checkbox", { name: /Produtos por peso/ })).not.toBeChecked()

  await openCadastrosProdutos(page)
  await expect(page.getByText("Cadastros: Assistência técnica")).toBeVisible()
  for (const tab of ["Técnicos", "Equipamentos"]) await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Produtos", exact: true }).click()
  await searchProduct(page, "E2E-C-LEG")
  await rowOf(page, "Capa sintética legado C").getByRole("button", { name: /Editar/ }).click()
  const modal = productModal(page)
  await expect(modal.getByLabel("Modelo compatível")).toHaveValue("Modelo Sintético X")
  await field(modal, "Nome").fill("Capa sintética legado C revisada")
  await saveProductAndConfirm(page)
  const after = await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-c-legado" } })
  const prev = before.metadata as Record<string, any>
  const next = after.metadata as Record<string, any>
  expect(after).toMatchObject({ name: "Capa sintética legado C revisada", price: 40, precoCusto: 15, stock: 3, warrantyDays: 90 })
  expect(next.catalogoAparelhos?.deviceModelKeys).toEqual(prev.catalogoAparelhos.deviceModelKeys)
  expect(next.acessorios).toMatchObject({ tipo: "capinha", exigeModelo: true, exigeCor: true })
  expect(next.atributos).toMatchObject({ modeloCompativel: "Modelo Sintético X" })
  expect(next.fiscal).toMatchObject({ ncm: "39269090" })
  expect(next.chaveNaoEnviada).toEqual({ origem: "fixture" })
  // Leitura e edição de produto não reclassificam a loja legada.
  expect(await capabilitiesOf(C)).toBeNull()
})

test("Acessórios: compatibilidade e acessórios sem assistência técnica", async ({ page }) => {
  const D = STORES.acessorios
  await login(page, USERS.admin)
  await switchStore(page, "Acessórios Sintéticos D")
  const card = await openGeral(page)
  await card.getByRole("combobox", { name: "Ramo principal" }).selectOption("acessorios")
  await expect(card.getByRole("checkbox", { name: /Assistência técnica/ })).not.toBeChecked()
  await expect(card.getByRole("checkbox", { name: /Compatibilidade com aparelhos/ })).toBeChecked()
  await expect(card.getByRole("checkbox", { name: /Acessórios para aparelhos/ })).toBeChecked()
  await card.getByRole("button", { name: "Salvar ramo e recursos" }).click()
  await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
  expect(await capabilitiesOf(D)).toEqual({ version: 1, business: { primaryBranch: "acessorios" } })

  await openCadastrosProdutos(page)
  for (const tab of ["Técnicos", "Equipamentos"]) await expect(page.getByRole("button", { name: tab, exact: true })).toHaveCount(0)

  await test.step("Alterar só a aplicação de acessório não grava a de compatibilidade", async () => {
    const before = await metadataOf("e2e-d-legado")
    await searchProduct(page, "E2E-D-LEG")
    await rowOf(page, "Película sintética legado D").getByRole("button", { name: /Editar/ }).click()
    const modal = productModal(page)
    await expect(modal.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" })).toBeChecked()
    await modal.getByRole("checkbox", { name: "É um acessório para aparelhos" }).check()
    await saveProductAndConfirm(page)
    const after = await metadataOf("e2e-d-legado")
    expect(after.cadastroRecursos).toEqual({ acessorios: true })
    expect(after.atributos).toMatchObject({ modeloCompativel: before.atributos.modeloCompativel })
    expect(after.fiscal).toMatchObject({ ncm: "39199090" })
  })

  await test.step("Novo acessório com compatibilidade explícita", async () => {
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Capinha sintética D")
    await modal.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" }).check()
    await modal.getByRole("checkbox", { name: "É um acessório para aparelhos" }).check()
    await modal.getByLabel("Modelo compatível").fill("Modelo Sintético D1")
    await field(modal, "Preço venda (R$)").fill("15,00")
    await saveProductAndConfirm(page)
    const created = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: D, name: "Capinha sintética D" } })
    const metadata = created.metadata as Record<string, any>
    expect(metadata.cadastroRecursos).toEqual({ compatibilidade: true, acessorios: true })
    expect(metadata.atributos).toMatchObject({ modeloCompativel: "Modelo Sintético D1" })
  })
})
