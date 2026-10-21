import { expect, test } from "@playwright/test"
import {
  STORES, USERS, capabilitiesOf, closeDb, field, login, openCadastrosProdutos, openGeral, openNewProduct,
  productModal, readDb, rowOf, saveProductAndConfirm, searchProduct, switchStore,
} from "./support"

test.afterAll(closeDb)
const A = STORES.padaria
const B = STORES.variedades

test("Operador sem Configurações não altera ramo; cadastro e loja continuam verificados no servidor", async ({ page }) => {
  const capsBefore = await capabilitiesOf(B)
  await login(page, USERS.operador)

  await test.step("Interface: sem editor de ramo e sem atalho de configuração", async () => {
    await page.goto("/dashboard/configuracoes?sec=geral")
    await expect(page).toHaveURL(/\/dashboard\?access=denied/)
    await openCadastrosProdutos(page)
    await expect(page.getByText("Cadastros: Variedades / Brinquedos")).toBeVisible()
    await expect(page.getByRole("link", { name: "Configurar ramo e recursos" })).toHaveCount(0)
  })

  await test.step("Servidor: PUT de ramo recusado e nada gravado", async () => {
    const res = await page.request.put(`/api/stores/${B}/settings`, {
      data: { printerConfig: { capabilities: { version: 1, business: { primaryBranch: "padaria" } } } },
    })
    expect(res.status()).toBe(403)
    expect(await capabilitiesOf(B)).toEqual(capsBefore)
  })

  await test.step("Servidor: outra loja recusada em configuração, busca e escrita por ID", async () => {
    expect((await page.request.get(`/api/stores/${A}/settings`)).status()).toBe(403)
    expect((await page.request.get("/api/produtos?q=Pão", { headers: { "x-assistec-loja-id": A } })).status()).toBe(403)
    const target = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: A, sku: "E2E-PAO-001" } })
    const foreignHeader = await page.request.patch(`/api/produtos/${target.id}`, { headers: { "x-assistec-loja-id": A }, data: { price: 99 } })
    expect(foreignHeader.status()).toBe(403)
    const ownHeader = await page.request.patch(`/api/produtos/${target.id}`, { headers: { "x-assistec-loja-id": B }, data: { price: 99 } })
    expect(ownHeader.status()).toBe(404) // sem oráculo: produto de outra loja = inexistente
    const own = await page.request.get("/api/produtos?q=Pão", { headers: { "x-assistec-loja-id": B } })
    expect(own.status()).toBe(200)
    expect(((await own.json()) as { produtos: Array<{ storeId: string }> }).produtos.every((item) => item.storeId === B)).toBe(true)
    const unchanged = await (await readDb()).produto.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.price).toBe(target.price)
    expect(unchanged.updatedAt.toISOString()).toBe(target.updatedAt.toISOString())
  })

  await test.step("Cadastro autorizado na própria loja continua funcionando", async () => {
    await page.goto("/dashboard/cadastros-v2")
    await page.getByRole("button", { name: "Produtos", exact: true }).click()
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill("Brinquedo sintético do operador")
    await field(modal, "Preço venda (R$)").fill("12,00")
    await saveProductAndConfirm(page)
    expect(await (await readDb()).produto.count({ where: { storeId: B, name: "Brinquedo sintético do operador" } })).toBe(1)
  })
})

test("Papel sem Cadastros é recusado pelo servidor mesmo na própria loja", async ({ page }) => {
  await login(page, USERS.caixa)
  const read = await page.request.get("/api/produtos?q=", { headers: { "x-assistec-loja-id": B } })
  expect(read.status()).toBe(403)
  const write = await page.request.patch("/api/produtos/e2e-b-legado", { headers: { "x-assistec-loja-id": B }, data: { price: 1 } })
  expect(write.status()).toBe(403)
  expect((await (await readDb()).produto.findUniqueOrThrow({ where: { id: "e2e-b-legado" } })).price).toBe(32.5)
})

test("Multiloja: produtos e ramo de A não aparecem em B; resposta atrasada de A não hidrata B", async ({ page }) => {
  await login(page, USERS.admin)
  await switchStore(page, "Padaria Sintética A")

  await test.step("GET atrasado de A chega depois da troca para B", async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let heldRequests = 0
    const settled: Promise<unknown>[] = []
    await page.route(`**/api/stores/${A}/settings`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback()
      heldRequests += 1
      const done = (async () => {
        const response = await route.fetch()
        await held
        // Se o cliente já descartou a requisição, o fulfill falha: também é isolamento.
        await route.fulfill({ response }).catch(() => {})
      })()
      settled.push(done)
      await done
    })
    await page.goto("/dashboard/configuracoes?sec=lojas")
    await expect.poll(() => heldRequests).toBeGreaterThan(0)
    const cardB = page.locator("div[role=button]").filter({ hasText: "Variedades Sintética B" })
    await cardB.getByRole("button", { name: "Gerenciar" }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBe(B)
    await page.getByRole("button", { name: /^Geral/ }).first().click()
    const ramo = page.locator("#ramo-recursos").getByRole("combobox", { name: "Ramo principal" })
    await expect(ramo).toHaveValue("variedades")
    release()
    await Promise.all(settled)
    await page.waitForTimeout(1_500)
    await expect(ramo).toHaveValue("variedades")
    await expect(page.locator("#ramo-recursos").getByRole("checkbox", { name: /Grade comercial/ })).toBeChecked()
    await page.unroute(`**/api/stores/${A}/settings`)
  })

  await test.step("Listagem e busca de B não exibem produtos de A", async () => {
    await openCadastrosProdutos(page)
    await expect(page.getByText("Cadastros: Variedades / Brinquedos")).toBeVisible()
    await searchProduct(page, "Pão sintético")
    await expect(page.getByText("Nenhum produto corresponde aos filtros e busca ativos. Ajuste os termos.")).toBeVisible()
    await searchProduct(page, "Capa sintética legado B")
    await expect(rowOf(page, "Capa sintética legado B")).toHaveCount(1)
  })

  await test.step("Mudar o ramo não altera layout do PDV, preços, saldos nem histórico", async () => {
    const db = await readDb()
    const settingsBefore = await db.storeSettings.findUniqueOrThrow({ where: { storeId: B } })
    const productsBefore = await db.produto.findMany({ where: { storeId: B }, orderBy: { id: "asc" } })
    const ledgerBefore = await db.movimentacaoEstoque.count({ where: { storeId: B } })
    const card = await openGeral(page)
    await card.getByRole("combobox", { name: "Ramo principal" }).selectOption("moda")
    await card.getByRole("button", { name: "Salvar ramo e recursos" }).click()
    await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
    const settingsAfter = await db.storeSettings.findUniqueOrThrow({ where: { storeId: B } })
    const before = settingsBefore.printerConfig as Record<string, any>
    const after = settingsAfter.printerConfig as Record<string, any>
    expect(after.capabilities.business.primaryBranch).toBe("moda")
    expect(after.capabilities.overrides).toEqual(before.capabilities.overrides)
    expect({ ...after, capabilities: undefined }).toEqual({ ...before, capabilities: undefined })
    const productsAfter = await db.produto.findMany({ where: { storeId: B }, orderBy: { id: "asc" } })
    expect(productsAfter.map(({ id, price, precoCusto, stock, metadata, updatedAt }) => ({ id, price, precoCusto, stock, metadata, updatedAt })))
      .toEqual(productsBefore.map(({ id, price, precoCusto, stock, metadata, updatedAt }) => ({ id, price, precoCusto, stock, metadata, updatedAt })))
    expect(await db.movimentacaoEstoque.count({ where: { storeId: B } })).toBe(ledgerBefore)
    // Restaura o ramo da loja mista pelo mesmo editor.
    await card.getByRole("combobox", { name: "Ramo principal" }).selectOption("variedades")
    await card.getByRole("button", { name: "Salvar ramo e recursos" }).click()
    await expect.poll(async () => (await capabilitiesOf(B))?.business).toMatchObject({ primaryBranch: "variedades" })
  })

  await test.step("A continua com seu ramo e produtos", async () => {
    expect((await capabilitiesOf(A))?.business).toMatchObject({ primaryBranch: "padaria" })
    expect(await (await readDb()).produto.count({ where: { storeId: A, sku: "E2E-PAO-001" } })).toBe(1)
    await expect(productModal(page)).toHaveCount(0)
  })
})
