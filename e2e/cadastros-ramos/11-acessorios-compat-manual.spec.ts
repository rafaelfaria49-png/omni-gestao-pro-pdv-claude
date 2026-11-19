import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  STORES, USERS, closeDb, field, guardOnboarding, login, openCadastrosProdutos, openGeral, openNewProduct,
  productModal, readDb, rowOf, saveProductAndConfirm, searchProduct, switchStore,
} from "./support"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — jornada real (build de produção, NextAuth real,
 * PostgreSQL descartável): cadastrar um lançamento ausente do catálogo (ZG47 — nome sintético; o Moto G47 real entrou no catálogo global em 2026), editá-lo, evitar
 * duplicidade, decidir equivalências de película só na loja, vincular a película e capinha, vender
 * no PDV com o modelo novo e desativá-lo sem perder o histórico. Toda escrita passa pela aplicação;
 * o banco só é LIDO aqui. Contas: A01 = admin PLATFORM; STORE = operador/caixa da loja B.
 */

test.afterAll(closeDb)

const D = STORES.acessorios
const B = STORES.variedades
const MARCA = "Marca Sintética E2E"
const ZG47 = `${MARCA} ZG47`
const PEL = { nome: "Película E2E ZG47", sku: "E2E-PEL-ZG47" }
const CAP = { nome: "Capinha E2E ZG47", sku: "E2E-CAP-ZG47" }
const BIPE = "Bipe ou digite o código do produto"

const busca = (page: Page) => page.getByLabel("Buscar aparelho por modelo, alias ou marca")
const card = (page: Page, modelKey: string) => page.locator(`[data-testid="catalogo-resultado"][data-model-key="${modelKey}"]`)

async function abrirCatalogo(page: Page) {
  await page.goto("/dashboard/catalogo-aparelhos")
  await expect(page.getByRole("heading", { name: "Compat", exact: true })).toBeVisible()
}

/** COMPAT-PROFISSIONAL-001: a consulta de películas e a gestão de modelos ficam em abas do HUB. */
async function abrirPeliculas(page: Page) {
  await page.getByRole("navigation", { name: "Áreas do Compat" }).getByRole("button", { name: /Compatibilidade de Películas/ }).click()
  await page.getByRole("tab", { name: "Consultar" }).click()
  await expect(busca(page)).toBeVisible()
}

async function abrirModelos(page: Page) {
  await page.getByRole("navigation", { name: "Áreas do Compat" }).getByRole("button", { name: /Catálogo e ajustes/ }).click()
  await page.getByRole("tab", { name: "Modelos" }).click()
  await expect(page.getByRole("region", { name: "Modelos cadastrados pela loja" })).toBeVisible()
}

async function pesquisar(page: Page, q: string) {
  const input = busca(page)
  await input.fill("")
  await input.fill(q)
}

async function cadastrarModelo(page: Page, opts: { marca: string; nome?: string; apelidos?: string }) {
  const dialog = page.getByRole("dialog", { name: "Cadastrar novo modelo" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Marca comercial").fill(opts.marca)
  if (opts.nome !== undefined) await dialog.getByLabel("Nome comercial do modelo").fill(opts.nome)
  if (opts.apelidos) await dialog.getByLabel("Apelidos (opcional)").fill(opts.apelidos)
  await dialog.getByRole("button", { name: "Cadastrar modelo" }).click()
  return dialog
}

async function modeloDb(brandKey: string, nameKey: string) {
  return (await readDb()).catalogoAparelhoLojaModelo.findFirst({ where: { storeId: D, brandKey, nameKey } })
}

async function metadataOf(sku: string) {
  const p = await (await readDb()).produto.findFirstOrThrow({ where: { storeId: D, sku } })
  return { produto: p, meta: (p.metadata ?? {}) as Record<string, any> }
}

async function abrirProduto(page: Page, sku: string, nome: string): Promise<Locator> {
  await openCadastrosProdutos(page)
  await searchProduct(page, sku)
  await rowOf(page, nome).getByRole("button", { name: /Editar/ }).click()
  const modal = productModal(page)
  await expect(modal).toBeVisible()
  return modal
}

function guardPostSaleDialog(page: Page) {
  void page.addLocatorHandler(
    page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ }),
    async (dialog) => {
      await dialog.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
    },
  )
}

test("ZG47: cadastro manual, compatibilidades por loja e venda no PDV", async ({ page, browser }) => {
  test.setTimeout(600_000)
  await login(page, USERS.admin)
  await switchStore(page, "Acessórios Sintéticos D")
  const db = await readDb()

  await test.step("Loja D no ramo Acessórios (idempotente)", async () => {
    const geral = await openGeral(page)
    const ramo = geral.getByRole("combobox", { name: "Ramo principal" })
    if ((await ramo.inputValue()) !== "acessorios") {
      await ramo.selectOption("acessorios")
      await geral.getByRole("button", { name: "Salvar ramo e recursos" }).click()
      await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
    }
  })

  const globalA05 = "samsung_galaxy_a05"
  let g47Key = ""

  await test.step("1–3. ZG47 não existe; cadastrar; aparece na busca na hora e após reload", async () => {
    await abrirCatalogo(page)
    await pesquisar(page, "ZG47")
    const vazio = page.getByRole("button", { name: "Cadastrar novo modelo “ZG47”" })
    await expect(vazio).toBeVisible()
    await vazio.click()
    const dialog = await cadastrarModelo(page, { marca: MARCA })
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => modeloDb("MARCA SINTETICA E2E", "ZG47")).toBeTruthy()
    const row = await modeloDb("MARCA SINTETICA E2E", "ZG47")
    g47Key = row!.modelKey
    expect(g47Key).toMatch(/^manual_/)
    await expect(card(page, g47Key)).toContainText(ZG47)
    await expect(card(page, g47Key)).toContainText("Cadastro da loja")
    await page.reload()
    await pesquisar(page, "ZG47")
    await expect(card(page, g47Key)).toBeVisible()
  })

  await test.step("4. editar apelido; buscar pelo apelido", async () => {
    await abrirModelos(page)
    const painel = page.getByRole("region", { name: "Modelos cadastrados pela loja" })
    await painel.getByRole("button", { name: "Editar ZG47" }).click()
    const dialog = page.getByRole("dialog", { name: "Editar modelo da loja" })
    await dialog.getByLabel("Apelidos (opcional)").fill("XZG47E2E")
    await dialog.getByRole("button", { name: "Salvar alterações" }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await modeloDb("MARCA SINTETICA E2E", "ZG47"))?.aliases).toEqual(["XZG47E2E"])
    await abrirPeliculas(page)
    await pesquisar(page, "XZG47E2E")
    await expect(card(page, g47Key)).toBeVisible()
  })

  await test.step("5–6. duplicidade na mesma marca recusada; mesmo nome em outra marca aceito", async () => {
    await abrirModelos(page)
    const painel = page.getByRole("region", { name: "Modelos cadastrados pela loja" })
    await painel.getByRole("button", { name: "Cadastrar novo modelo" }).click()
    const dialog = await cadastrarModelo(page, { marca: "marca sintetica e2e", nome: "zg47" })
    await expect(dialog.getByRole("alert")).toContainText("já está cadastrado nesta loja")
    await dialog.getByRole("button", { name: "Cancelar" }).click()
    await painel.getByRole("button", { name: "Cadastrar novo modelo" }).click()
    await expect(await cadastrarModelo(page, { marca: "Outra Marca E2E", nome: "ZG47" })).toHaveCount(0)
    await expect.poll(() => db.catalogoAparelhoLojaModelo.count({ where: { storeId: D, nameKey: "ZG47" } })).toBe(2)
  })

  await test.step("7/11–12. película equivalente manual + supressão de relação global, só nesta loja", async () => {
    await abrirPeliculas(page)
    await pesquisar(page, "ZG47")
    await card(page, g47Key).getByRole("button", { name: "Adicionar película equivalente" }).click()
    const dialog = page.getByRole("dialog", { name: "Adicionar película equivalente" })
    await dialog.getByLabel("Modelo que usa a mesma película").fill("Galaxy A05")
    await dialog.locator("button").filter({ has: page.getByText("Samsung Galaxy A05", { exact: true }) }).first().click()
    await dialog.getByRole("button", { name: "Adicionar", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const manual = card(page, g47Key).locator('[data-testid="catalogo-grupo"][data-group-key^="loja_manual"]')
    await expect(manual).toContainText("Compatibilidade informada pela loja")
    await expect(manual).toContainText("Samsung Galaxy A05")
    await expect(manual).toContainText("não é confirmação do fabricante")

    await pesquisar(page, "Samsung Galaxy A05")
    const a05 = card(page, globalA05)
    await expect(a05.locator('[data-group-key^="loja_manual"]')).toContainText("ZG47")
    const globalGroup = a05.locator('[data-testid="catalogo-grupo"]:not([data-group-key^="loja_manual"])').first()
    const remover = globalGroup.getByRole("button", { name: /desta equivalência nesta loja$/ }).first()
    const label = (await remover.getAttribute("aria-label")) ?? ""
    const removido = label.replace(/^Remover /, "").replace(/ desta equivalência nesta loja$/, "")
    await remover.click()
    await expect(a05.getByText(/Removidos por esta loja/)).toBeVisible()
    await expect(a05.getByRole("button", { name: `Restaurar ${removido}` })).toBeVisible()
    await expect.poll(() => db.catalogoAparelhoLojaCompat.count({ where: { storeId: D, acao: "suprimir" } })).toBe(1)

    // reabrir (reload): a decisão continua
    await page.reload()
    await pesquisar(page, "Samsung Galaxy A05")
    await expect(card(page, globalA05).getByRole("button", { name: `Restaurar ${removido}` })).toBeVisible()
    // restaurar devolve ao catálogo global
    await card(page, globalA05).getByRole("button", { name: `Restaurar ${removido}` }).click()
    await expect.poll(() => db.catalogoAparelhoLojaCompat.count({ where: { storeId: D, acao: "suprimir" } })).toBe(0)
    // nenhuma decisão vazou para outra loja
    expect(await db.catalogoAparelhoLojaCompat.count({ where: { storeId: { not: D } } })).toBe(0)
  })

  let g48Key = ""
  await test.step("7–8. película: vincular ZG47, criar G48 sem sair do produto, reabrir e remover ZG47", async () => {
    await openCadastrosProdutos(page)
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill(PEL.nome)
    await field(modal, "SKU").fill(PEL.sku)
    await field(modal, "Preço venda (R$)").fill("25,00")
    await field(modal, "Estoque inicial").fill("10")
    await modal.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" }).check()
    await modal.getByRole("checkbox", { name: "É um acessório para aparelhos" }).check()
    const buscaCompat = modal.getByLabel("Buscar aparelho / modelo")
    await buscaCompat.fill("ZG47")
    await modal.locator("button").filter({ hasText: ZG47 }).filter({ hasText: "cadastro da loja" }).first().click()
    await buscaCompat.fill("G48 E2E")
    await page.getByRole("button", { name: "Cadastrar novo modelo “G48 E2E”" }).click()
    await expect(await cadastrarModelo(page, { marca: MARCA })).toHaveCount(0)
    const vinculados = modal.getByLabel("Modelos vinculados", { exact: true })
    await expect(vinculados).toContainText(ZG47)
    await expect(vinculados).toContainText(`${MARCA} G48 E2E`)
    await modal.getByRole("checkbox", { name: /Configuração de acessórios/ }).check()
    await modal.getByRole("combobox", { name: /^Tipo/ }).selectOption("pelicula")
    await modal.getByRole("combobox", { name: "Modelo do aparelho na venda" }).selectOption("obrigatorio")
    await saveProductAndConfirm(page)

    g48Key = (await modeloDb("MARCA SINTETICA E2E", "G48 E2E"))!.modelKey
    const { meta, produto } = await metadataOf(PEL.sku)
    expect(meta.catalogoAparelhos.deviceModelKeys).toEqual([g47Key, g48Key])
    expect(meta.acessorios).toMatchObject({ tipo: "pelicula", exigeModelo: true })
    expect(produto.stock).toBe(10)

    const movAntes = await db.movimentacaoEstoque.count({ where: { storeId: D, produtoId: produto.id } })
    const reaberto = await abrirProduto(page, PEL.sku, PEL.nome)
    const lista = reaberto.getByLabel("Modelos vinculados", { exact: true })
    // nomes legíveis resolvidos do catálogo da loja (não a chave técnica)
    await expect(lista).toContainText(ZG47)
    await expect(lista).not.toContainText("manual_")
    await reaberto.getByRole("button", { name: `Remover ${ZG47}` }).click()
    await saveProductAndConfirm(page)
    const after = await metadataOf(PEL.sku)
    expect(after.meta.catalogoAparelhos.deviceModelKeys).toEqual([g48Key])
    // 22. salvar compatibilidade não mexe em estoque/preço
    expect(after.produto.stock).toBe(10)
    expect(after.produto.price).toBe(25)
    expect(await db.movimentacaoEstoque.count({ where: { storeId: D, produtoId: produto.id } })).toBe(movAntes)
  })

  await test.step("9–10. capinha: vincular e remover ZG47 sem afetar a película", async () => {
    await openCadastrosProdutos(page)
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill(CAP.nome)
    await field(modal, "SKU").fill(CAP.sku)
    await field(modal, "Preço venda (R$)").fill("30,00")
    await field(modal, "Estoque inicial").fill("4")
    await modal.getByRole("checkbox", { name: "Possui compatibilidade com aparelhos" }).check()
    await modal.getByRole("checkbox", { name: "É um acessório para aparelhos" }).check()
    await modal.getByLabel("Buscar aparelho / modelo").fill("ZG47")
    await modal.locator("button").filter({ hasText: ZG47 }).filter({ hasText: "cadastro da loja" }).first().click()
    await modal.getByRole("checkbox", { name: /Configuração de acessórios/ }).check()
    await modal.getByRole("combobox", { name: /^Tipo/ }).selectOption("capinha")
    await modal.getByRole("combobox", { name: "Modelo do aparelho na venda" }).selectOption("obrigatorio")
    await saveProductAndConfirm(page)
    expect((await metadataOf(CAP.sku)).meta.catalogoAparelhos.deviceModelKeys).toEqual([g47Key])

    const reaberto = await abrirProduto(page, CAP.sku, CAP.nome)
    await reaberto.getByRole("button", { name: `Remover ${ZG47}` }).click()
    await saveProductAndConfirm(page)
    expect((await metadataOf(CAP.sku)).meta.catalogoAparelhos).toBeUndefined()
    // película intacta (relações independentes por produto/tipo)
    expect((await metadataOf(PEL.sku)).meta.catalogoAparelhos.deviceModelKeys).toEqual([g48Key])
  })

  let g47B = ""
  await test.step("16–18. STORE autorizado grava na própria loja; sem permissão e loja cruzada recusados", async () => {
    const op = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", baseURL: test.info().project.use.baseURL })
    const opPage = await op.newPage()
    await login(opPage, USERS.operador)
    const criarB = await opPage.request.post("/api/catalogo/aparelhos/modelos", {
      headers: { "x-assistec-loja-id": B }, data: { brand: MARCA, name: "ZG47" },
    })
    expect(criarB.status()).toBe(201)
    g47B = (await criarB.json()).modelo.modelKey
    expect(g47B).not.toBe(g47Key)
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: B } })).toBe(1)
    // loja B não enxerga nem altera a loja D
    expect((await opPage.request.get(`/api/catalogo/aparelhos/search?q=ZG47`, { headers: { "x-assistec-loja-id": D } })).status()).toBe(403)
    expect((await opPage.request.post("/api/catalogo/aparelhos/modelos", { headers: { "x-assistec-loja-id": D }, data: { brand: "X", name: "Invasão" } })).status()).toBe(403)
    const rowD = await modeloDb("MARCA SINTETICA E2E", "ZG47")
    expect((await opPage.request.patch(`/api/catalogo/aparelhos/modelos/${rowD!.id}`, { headers: { "x-assistec-loja-id": B }, data: { version: rowD!.version, name: "Hack" } })).status()).toBe(404)
    const buscaB = await (await opPage.request.get(`/api/catalogo/aparelhos/search?q=ZG47`, { headers: { "x-assistec-loja-id": B } })).json()
    const chavesB = buscaB.results.map((r: { modelKey: string }) => r.modelKey)
    expect(chavesB).toContain(g47B)
    expect(chavesB).not.toContain(g47Key)
    await op.close()

    const cx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", baseURL: test.info().project.use.baseURL })
    const cxPage = await cx.newPage()
    await login(cxPage, USERS.caixa)
    const negado = await cxPage.request.post("/api/catalogo/aparelhos/modelos", { headers: { "x-assistec-loja-id": B }, data: { brand: MARCA, name: "G50" } })
    expect(negado.status()).toBe(403)
    expect((await negado.json()).error).toMatch(/gerente ou administrador/i)
    await cx.close()
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: B } })).toBe(1)
    expect((await modeloDb("MARCA SINTETICA E2E", "ZG47"))?.name).toBe("ZG47")
  })

  await test.step("19. catálogo global e modelos legados preservados", async () => {
    await abrirCatalogo(page)
    await pesquisar(page, "Samsung Galaxy A05")
    await expect(card(page, globalA05)).toBeVisible()
    const legado = await db.produto.findUniqueOrThrow({ where: { id: "e2e-b-legado" } })
    expect((legado.metadata as Record<string, any>).catalogoAparelhos.deviceModelKeys).toEqual(["modelo-sintetico-x"])
  })

  /*
   * PDV na loja B (que já tem vendas do spec 10). Motivo: defeito PRÉ-EXISTENTE fora deste GOAL —
   * `nextSaleId` numera `VDA-AAAA-NNNN` por loja a partir do histórico local, mas o servidor exige
   * `pedidoId` único entre lojas (`pedido-id-de-outra-loja`, fail-closed). A 1ª venda de outra loja
   * colidiria com `VDA-AAAA-0001` da loja B. Vender em B mantém a prova independente da ordem.
   */
  const PEL_B = { nome: "Película E2E PDV B", sku: "E2E-PEL-PDV-B" }
  await test.step("13–14. PDV: selecionar ZG47 da loja, cadastrar modelo novo sem mexer no carrinho, vender", async () => {
    await switchStore(page, "Variedades Sintética B")
    const geral = await openGeral(page)
    const acessorios = geral.getByRole("checkbox", { name: /Acessórios para aparelhos/ })
    if (!(await acessorios.isChecked())) {
      await acessorios.check()
      await geral.getByRole("button", { name: "Salvar ramo e recursos" }).click()
      await expect(page.getByText("Ramo e recursos salvos").first()).toBeVisible()
    }
    await openCadastrosProdutos(page)
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill(PEL_B.nome)
    await field(modal, "SKU").fill(PEL_B.sku)
    await field(modal, "Preço venda (R$)").fill("25,00")
    await field(modal, "Estoque inicial").fill("10")
    await modal.getByRole("checkbox", { name: "É um acessório para aparelhos" }).check()
    await modal.getByRole("checkbox", { name: /Configuração de acessórios/ }).check()
    await modal.getByRole("combobox", { name: /^Tipo/ }).selectOption("pelicula")
    await modal.getByRole("combobox", { name: "Modelo do aparelho na venda" }).selectOption("obrigatorio")
    await saveProductAndConfirm(page)
    const produtoB = await db.produto.findFirstOrThrow({ where: { storeId: B, sku: PEL_B.sku } })

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
    const abrir = page.getByRole("button", { name: "Abrir Caixa", exact: true }).first()
    if (await abrir.isVisible().catch(() => false)) {
      await abrir.click()
      const cx = page.getByRole("dialog").filter({ has: page.getByText("Saldo Inicial do Caixa") })
      await cx.getByPlaceholder("0,00").fill("0")
      await cx.getByPlaceholder("Ex.: Caixa 1 / Nome").fill("Caixa E2E acessórios")
      await cx.getByRole("button", { name: "Abrir Caixa", exact: true }).click()
      await expect(page.getByRole("button", { name: "Abrir Caixa", exact: true })).toHaveCount(0, { timeout: 30_000 })
      if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
    }

    const vendasAntes = await db.venda.count({ where: { storeId: B } })
    await bipe.fill(PEL_B.sku)
    await bipe.press("Enter")
    const acessorio = page.getByRole("dialog", { name: "Configurar acessório" })
    await expect(acessorio).toBeVisible()

    // modelo inexistente: cadastrar pelo PDV (fica selecionado; carrinho intocado)
    await acessorio.getByLabel("Modelo do aparelho").fill("G49 PDV")
    await acessorio.getByRole("button", { name: "Cadastrar novo modelo “G49 PDV”" }).click()
    await expect(await cadastrarModelo(page, { marca: MARCA })).toHaveCount(0)
    await expect(acessorio).toContainText(`${MARCA} G49 PDV`)
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: B, nameKey: "G49 PDV" } })).toBe(1)
    expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes)
    // trocar para o ZG47 (busca mostra o modelo manual DESTA loja, não o da loja D)
    await acessorio.getByRole("button", { name: "Trocar modelo" }).click()
    // COMPAT-BUSCA-MODELOS-NATURAL-001: "iPhone" mostra o iPhone 7 já na 1ª página, separado do 7 Plus,
    // e oferece "Mostrar mais" em vez de cortar a lista em silêncio.
    await acessorio.getByLabel("Modelo do aparelho").fill("iPhone")
    await expect(acessorio.locator("button").filter({ has: page.getByText("Apple iPhone 7", { exact: true }) })).toHaveCount(1)
    await expect(acessorio.locator("button").filter({ has: page.getByText("Apple iPhone 7 Plus", { exact: true }) })).toHaveCount(1)
    await expect(acessorio.getByRole("button", { name: "Mostrar mais" })).toBeVisible()
    await acessorio.getByLabel("Modelo do aparelho").fill("ZG47")
    await expect(acessorio.locator("button").filter({ hasText: ZG47 }).filter({ hasText: "cadastro da loja" })).toHaveCount(1)
    await acessorio.locator("button").filter({ hasText: ZG47 }).filter({ hasText: "cadastro da loja" }).click()
    await acessorio.getByRole("button", { name: "Adicionar ao carrinho" }).click()
    await expect(acessorio).toHaveCount(0)

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press("F12")
    const pagamento = page.getByRole("dialog", { name: "Finalizar Pagamento" })
    await expect(pagamento).toBeVisible()
    await pagamento.getByRole("button", { name: /^Dinheiro$/i }).click()
    const cash = pagamento.getByRole("button", { name: /Confirmar (Dinheiro|valor exato)/i })
    if (await cash.count()) await cash.first().click()
    await pagamento.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
    await expect(pagamento).toHaveCount(0)

    await expect.poll(() => db.venda.count({ where: { storeId: B } }), { timeout: 30_000 }).toBe(vendasAntes + 1)
    const venda = await db.venda.findFirstOrThrow({ where: { storeId: B }, orderBy: { at: "desc" } })
    const lines = ((venda.payload ?? {}) as { lines?: Array<Record<string, any>> }).lines ?? []
    const line = lines.find((l) => l.accessorySelection?.deviceModelKey === g47B)
    expect(line?.accessorySelection).toMatchObject({ version: 1, deviceModelKey: g47B, deviceBrand: MARCA, deviceModelName: ZG47 })
    // contrato financeiro e estoque inalterados pela seleção/cadastro do modelo
    expect(Number(venda.total)).toBe(25)
    await expect.poll(async () => (await db.produto.findUniqueOrThrow({ where: { id: produtoB.id } })).stock).toBe(9)
  })

  await test.step("20. desativar ZG47: some da busca; venda e vínculos preservados", async () => {
    await abrirCatalogo(page)
    await abrirModelos(page)
    const painel = page.getByRole("region", { name: "Modelos cadastrados pela loja" })
    const linha = painel.locator("li").filter({ hasText: ZG47 })
    await linha.getByRole("button", { name: "Desativar" }).click()
    await expect(linha.getByText("desativado")).toBeVisible()
    await abrirPeliculas(page)
    await pesquisar(page, "ZG47")
    await expect(card(page, g47B)).toHaveCount(0)
    expect(await db.catalogoAparelhoLojaModelo.findFirst({ where: { storeId: B, modelKey: g47B } })).toMatchObject({ active: false })
    const venda = await db.venda.findFirstOrThrow({ where: { storeId: B }, orderBy: { at: "desc" } })
    expect(JSON.stringify(venda.payload)).toContain(g47B)
    expect(JSON.stringify(venda.payload)).toContain(ZG47)
    // a loja D não foi afetada pela desativação na loja B
    expect((await modeloDb("MARCA SINTETICA E2E", "ZG47"))?.active).toBe(true)
  })
})

/**
 * COMPAT-BUSCA-MODELOS-NATURAL-001 — bug de produção: "iPhone" listava 11, 12, 13… e o iPhone 7 sumia
 * (ordem alfabética + corte silencioso em 20). Prova a ordem natural, a paginação sem perdas e o cadastro
 * de nome de um caractere ("7") reaproveitando o modelo existente.
 */
test("Busca natural de modelos, paginação e cadastro de nome de 1 caractere", async ({ page }) => {
  test.setTimeout(300_000)
  await login(page, USERS.admin)
  await switchStore(page, "Acessórios Sintéticos D")
  const db = await readDb()
  const H = { "x-assistec-loja-id": D }
  type Pagina = { results: Array<{ modelKey: string; matchType: string }>; total: number; hasMore: boolean; nextOffset: number | null }
  const pagina = async (q: string, offset = 0, limit = 20): Promise<Pagina> => {
    const r = await page.request.get(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`, { headers: H })
    expect(r.status()).toBe(200)
    return r.json()
  }
  const todas = async (q: string, limit = 20) => {
    const out: string[] = []
    let offset: number | null = 0
    let total = 0
    for (let i = 0; offset !== null && i < 100; i++) {
      const p: Pagina = await pagina(q, offset, limit)
      out.push(...p.results.map((x) => x.modelKey))
      total = p.total
      offset = p.nextOffset
    }
    return { out, total }
  }

  await test.step("API: iPhone 7 na 1ª página; 7 × 7 Plus; família 12; Moto G em ordem natural; páginas sem perda", async () => {
    const p1 = await pagina("iPhone")
    const k1 = p1.results.map((r) => r.modelKey)
    expect(k1).toContain("apple_iphone_7")
    expect(k1.indexOf("apple_iphone_7")).toBeLessThan(k1.indexOf("apple_iphone_7_plus"))
    expect(k1.indexOf("apple_iphone_8_plus")).toBeLessThan(k1.indexOf("apple_iphone_x"))
    expect(k1.indexOf("apple_iphone_xs")).toBeLessThan(k1.indexOf("apple_iphone_11"))
    expect(p1.hasMore).toBe(true)

    const sete = (await pagina("iPhone 7")).results
    expect(sete[0]).toMatchObject({ modelKey: "apple_iphone_7", matchType: "exact" })
    expect(sete[1].modelKey).toBe("apple_iphone_7_plus")
    expect((await pagina("iPhone 12")).results.slice(0, 4).map((r) => r.modelKey)).toEqual([
      "apple_iphone_12", "apple_iphone_12_mini", "apple_iphone_12_pro", "apple_iphone_12_pro_max",
    ])

    const moto = (await todas("Moto G")).out
    expect(moto.indexOf("motorola_moto_g7")).toBeGreaterThanOrEqual(0)
    expect(moto.indexOf("motorola_moto_g7")).toBeLessThan(moto.indexOf("motorola_moto_g47"))
    expect(moto.indexOf("motorola_moto_g47")).toBeLessThan(moto.indexOf("motorola_moto_g77"))
    const galaxy = (await todas("Galaxy S")).out
    expect(galaxy.indexOf("samsung_galaxy_s21")).toBeLessThan(galaxy.indexOf("samsung_galaxy_s26"))

    for (const q of ["iPhone", "Galaxy A", "Redmi"]) {
      const em7 = await todas(q, 7)
      const em20 = await todas(q, 20)
      expect(em7.out, q).toEqual(em20.out)
      expect(new Set(em20.out).size, q).toBe(em20.out.length)
      expect(em20.out.length, q).toBe(em20.total)
    }
  })

  await test.step('Compat Películas: iPhone 7 visível e "Mostrar mais aparelhos" traz o iPhone 8', async () => {
    await abrirCatalogo(page)
    await abrirPeliculas(page)
    await pesquisar(page, "iPhone")
    await expect(card(page, "apple_iphone_7")).toBeVisible()
    await expect(card(page, "apple_iphone_7_plus")).toBeVisible()
    await expect(card(page, "apple_iphone_8")).toHaveCount(0)
    await page.getByRole("button", { name: "Mostrar mais aparelhos" }).click()
    await expect(card(page, "apple_iphone_8")).toBeVisible()
    await expect(card(page, "apple_iphone_7")).toHaveCount(1)
  })

  await test.step("Cadastro: iPhone + 7 oferece usar o Apple iPhone 7 existente (sem gravar)", async () => {
    await abrirModelos(page)
    const painel = page.getByRole("region", { name: "Modelos cadastrados pela loja" })
    const antes = await db.catalogoAparelhoLojaModelo.count({ where: { storeId: D } })
    await painel.getByRole("button", { name: "Cadastrar novo modelo" }).click()
    const dialog = page.getByRole("dialog", { name: "Cadastrar novo modelo" })
    await dialog.getByLabel("Fabricante").fill("Apple")
    await dialog.getByLabel("Marca comercial").fill("iPhone")
    await dialog.getByLabel("Nome comercial do modelo").fill("7")
    await expect(dialog.getByRole("button", { name: "Cadastrar modelo" })).toBeEnabled()
    const usar = dialog.getByRole("button", { name: "Usar modelo existente: Apple iPhone 7", exact: true })
    await expect(usar).toBeVisible()
    await usar.click()
    await expect(dialog).toHaveCount(0)
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: D } })).toBe(antes)

    // insistir em gravar: o servidor recusa e oferece o existente
    const dup = await page.request.post("/api/catalogo/aparelhos/modelos", { headers: H, data: { manufacturer: "Apple", brand: "iPhone", name: "7" } })
    expect(dup.status()).toBe(409)
    expect((await dup.json()).existing).toMatchObject({ modelKey: "apple_iphone_7", source: "global" })
  })

  await test.step('Cadastro: nome de 1 caractere em marca própria grava; repetido é bloqueado; "-" é inválido', async () => {
    const painel = page.getByRole("region", { name: "Modelos cadastrados pela loja" })
    await painel.getByRole("button", { name: "Cadastrar novo modelo" }).click()
    await expect(await cadastrarModelo(page, { marca: MARCA, nome: "Z" })).toHaveCount(0)
    await expect.poll(() => modeloDb("MARCA SINTETICA E2E", "Z")).toBeTruthy()
    await painel.getByRole("button", { name: "Cadastrar novo modelo" }).click()
    const dialog = await cadastrarModelo(page, { marca: MARCA, nome: "z" })
    await expect(dialog.getByRole("alert")).toContainText("já está cadastrado nesta loja")
    await dialog.getByRole("button", { name: "Cancelar" }).click()
    expect(await db.catalogoAparelhoLojaModelo.count({ where: { storeId: D, nameKey: "Z" } })).toBe(1)
    const invalido = await page.request.post("/api/catalogo/aparelhos/modelos", { headers: H, data: { brand: MARCA, name: "-" } })
    expect(invalido.status()).toBe(400)
  })
})
