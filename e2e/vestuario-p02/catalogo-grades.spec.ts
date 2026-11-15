import path from "node:path"
import { expect, test, type Browser, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"

/**
 * OMNI-VESTUARIO-P02 — jornadas reais no navegador (build de produção, NextAuth real, PostgreSQL
 * descartável). Toda escrita passa pela aplicação; o banco só é LIDO para conferir.
 */
const STORE_A = "e2e-vest-a"
const STORE_B = "e2e-vest-b"
const STORE_OFF = "e2e-vest-off"
const LOJA_KEY = "assistec-pro-loja-ativa-v1"
const USERS = {
  dono: { email: "dono@e2e-vestuario.invalid", pw: "VESTUARIO_P02_E2E_PW_DONO" },
  lojaB: { email: "gerente-b@e2e-vestuario.invalid", pw: "VESTUARIO_P02_E2E_PW_LOJA_B" },
} as const
const shot = (name: string) => path.join(__dirname, "../../test-results/vestuario-p02-e2e/screens", name)

let db: PrismaClient | null = null
async function readDb(): Promise<PrismaClient> {
  if (db) return db
  const url = process.env.VESTUARIO_P02_E2E_DATABASE_URL ?? ""
  if (!url.includes("vest_p02_e2e") || !/127\.0\.0\.1|localhost/.test(url)) throw new Error("VESTUARIO_E2E_DATABASE_REQUIRED")
  db = new PrismaClient({ datasourceUrl: url })
  return db
}
test.afterAll(async () => { await db?.$disconnect() })

async function newPage(browser: Browser, store: string, viewport = { width: 1440, height: 1000 }): Promise<Page> {
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport, timezoneId: "America/Sao_Paulo" })
  await ctx.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem("e2e-store-set")) { localStorage.setItem(k, v); sessionStorage.setItem("e2e-store-set", "1") } } catch { /* */ } }, [LOJA_KEY, store] as const)
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

async function switchStore(page: Page, store: string) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [LOJA_KEY, store] as const)
}

async function abrirGrades(page: Page) {
  await page.goto("/dashboard/cadastros-v2?aba=grades")
  await expect(page.getByText("Cadastro de grades e variações (cor × tamanho)")).toBeVisible({ timeout: 60_000 })
}

async function noHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(r.sw, `overflow horizontal: ${r.sw} > ${r.w}`).toBeLessThanOrEqual(r.w + 1)
}

test("loja habilitada: grades, cores, produto com grade, variações em rascunho e P01 preservada", async ({ browser }) => {
  const page = await newPage(browser, STORE_A)
  await login(page, "dono")
  await abrirGrades(page)
  await expect(page.getByRole("button", { name: "Grades e variações" })).toBeVisible()

  // Grades personalizáveis
  await page.getByRole("button", { name: "Grades de tamanho" }).click()
  await page.getByPlaceholder("Ex.: Adulto, Jeans, Calçados").fill("Adulto")
  await page.getByPlaceholder("PP, P, M, G, GG, XG").fill("P, M, G, GG")
  await page.getByRole("button", { name: "Criar grade" }).click()
  await expect(page.getByRole("textbox", { name: "Rótulo do tamanho GG" })).toBeVisible()
  await page.getByPlaceholder("Ex.: Adulto, Jeans, Calçados").fill("Calçados")
  await page.getByPlaceholder("PP, P, M, G, GG, XG").fill("38, 39, 40, 41, 42")
  await page.getByRole("button", { name: "Criar grade" }).click()
  await expect(page.getByRole("textbox", { name: "Rótulo do tamanho 42" })).toBeVisible()
  // Reordenar: GG sobe uma posição
  await page.getByRole("button", { name: "Subir GG" }).click()
  await expect.poll(async () => (await (await readDb()).vestuarioTamanho.findMany({ where: { storeId: STORE_A, grade: { nome: "Adulto" } }, orderBy: { ordem: "asc" }, select: { rotulo: true } })).map((t) => t.rotulo).join(",")).toBe("P,M,GG,G")

  // Cores personalizáveis
  await page.getByRole("button", { name: "Cores", exact: true }).click()
  for (const [nome, hex] of [["Preto", "#000000"], ["Branco", "#FFFFFF"], ["Azul", ""]]) {
    await page.getByPlaceholder("Ex.: Azul Marinho, Estampado").fill(nome)
    await page.getByPlaceholder("#RRGGBB ou vazio").fill(hex)
    await page.getByRole("button", { name: "Criar cor" }).click()
    await expect(page.getByRole("textbox", { name: `Nome da cor ${nome}` })).toBeVisible()
  }
  await page.getByRole("textbox", { name: "Nome da cor Azul" }).fill("Azul Royal")
  await page.getByRole("button", { name: "Salvar", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Nome da cor Azul Royal" })).toBeVisible()
  // duplicidade normalizada
  await page.getByPlaceholder("Ex.: Azul Marinho, Estampado").fill("  preto ")
  await page.getByRole("button", { name: "Criar cor" }).click()
  await expect(page.getByText("Já existe um cadastro com esse nome nesta loja.")).toBeVisible()

  // Produto com grade: somente as combinações escolhidas
  await page.getByRole("button", { name: "Produtos com grade" }).click()
  await page.getByRole("button", { name: "Novo produto com grade" }).click()
  const dlg = page.getByRole("dialog", { name: "Novo produto com grade" })
  await dlg.getByPlaceholder("Ex.: Camiseta básica").fill("Camiseta E2E")
  await dlg.getByPlaceholder("0,00").first().fill("49,90")
  await dlg.locator("select").selectOption({ label: "Adulto (P, M, GG, G)" })
  for (const c of ["Preto", "Branco", "Azul Royal"]) await dlg.getByRole("button", { name: c }).click()
  await dlg.getByRole("checkbox", { name: "Azul Royal GG" }).uncheck()
  await dlg.getByRole("checkbox", { name: "Branco P" }).uncheck()
  await expect(dlg.getByText("10 combinação(ões) nova(s) selecionada(s)")).toBeVisible()
  await page.screenshot({ path: shot("01-matriz-desktop.png"), fullPage: false })
  await dlg.getByRole("button", { name: "Criar produto com grade" }).click()
  const edit = page.getByRole("dialog", { name: "Camiseta E2E" })
  await expect(edit.getByText("Variações cadastradas")).toBeVisible()

  const d = await readDb()
  const pai = await d.produto.findFirstOrThrow({ where: { storeId: STORE_A, name: "Camiseta E2E" } })
  expect(pai.stock).toBe(0)
  expect(pai.metadata).toMatchObject({ vestuario: { contract: "omni.vestuario.catalog", mode: "COM_GRADE" } })
  const vs = await d.vestuarioVariante.findMany({ where: { storeId: STORE_A, produtoId: pai.id } })
  expect(vs).toHaveLength(10)
  expect(vs.every((v) => v.barcodeInterno === null && v.sku === null)).toBe(true) // nada fabricado
  expect(await d.movimentacaoEstoque.count({ where: { produtoId: pai.id } })).toBe(0)

  // SKU da variação; colisão com produto legado simples é recusada sem gravar
  await edit.getByRole("textbox", { name: "SKU de Preto / P" }).fill("cam-e2e-preto-p")
  await edit.getByRole("button", { name: "Salvar", exact: true }).first().click()
  await expect.poll(async () => (await d.vestuarioVariante.findFirst({ where: { storeId: STORE_A, produtoId: pai.id, sku: "CAM-E2E-PRETO-P" } }))?.id ?? null).not.toBeNull()
  await edit.getByRole("textbox", { name: "SKU de Preto / M" }).fill("legado-e2e")
  await edit.getByRole("button", { name: "Salvar", exact: true }).first().click()
  await expect(page.getByText(/já é usado por um produto desta loja/)).toBeVisible()
  expect(await d.vestuarioVariante.count({ where: { storeId: STORE_A, sku: "LEGADO-E2E" } })).toBe(0)
  await edit.getByRole("textbox", { name: "SKU de Preto / M" }).fill("")

  // Desativar variação (não apaga)
  const linhaAzulP = edit.getByRole("row", { name: /Azul Royal \/ P/ })
  await linhaAzulP.getByRole("button", { name: "Desativar" }).click()
  await expect(linhaAzulP.getByText("Inativa")).toBeVisible()
  expect(await d.vestuarioVariante.count({ where: { storeId: STORE_A, produtoId: pai.id } })).toBe(10)
  await expect(edit.getByText("Fase de etiquetas").first()).toBeVisible()
  await page.screenshot({ path: shot("02-variacoes-desktop.png"), fullPage: false })
  await edit.getByRole("button", { name: "Fechar", exact: true }).click()

  // Tamanho em uso não é renomeável (UI desabilita; banco garante)
  await page.getByRole("button", { name: "Grades de tamanho" }).click()
  await expect(page.getByRole("textbox", { name: "Rótulo do tamanho P" }).first()).toBeDisabled()

  // Modalidade no Cadastro de Produtos
  await page.goto("/dashboard/cadastros-v2?aba=produtos")
  // P01 na UI legada: o pai com grade aparece na lista, mas estoque por produto é recusado.
  await page.getByRole("row", { name: /Camiseta E2E/ }).getByRole("button", { name: "Estoque" }).click()
  await expect(page.getByText(/Estoque por cor e tamanho ainda não disponível/).first()).toBeVisible()
  await page.screenshot({ path: shot("05-p01-estoque-recusado.png"), fullPage: false })
  await page.keyboard.press("Escape")
  await page.goto("/dashboard/cadastros-v2?aba=produtos")
  // O status do catálogo chega assíncrono; a modalidade só é oferecida depois dele (antes, abre o simples).
  await expect(page.getByRole("button", { name: "Grades e variações" })).toBeVisible()
  // Barra da lista (não o "Novo" do topo do app).
  await page.getByText(/^\d+ produtos?$/).locator("..").getByRole("button", { name: "Novo", exact: true }).click()
  const escolha = page.getByRole("dialog", { name: "Novo produto" })
  await expect(escolha.getByText("Produto simples")).toBeVisible()
  await escolha.getByText("Produto com grade").click()
  await expect(page.getByRole("dialog", { name: "Novo produto com grade" })).toBeVisible()
  await page.getByRole("dialog", { name: "Novo produto com grade" }).getByRole("button", { name: "Fechar", exact: true }).click()

  // Legado intocado
  const leg = await d.produto.findUniqueOrThrow({ where: { id: "e2e-vest-legado" } })
  expect(leg.stock).toBe(4)
  expect(await d.vestuarioProdutoGrade.count({ where: { produtoId: leg.id } })).toBe(0)

  // Troca de loja: B não enxerga nada de A
  await switchStore(page, STORE_B)
  await abrirGrades(page)
  await page.getByRole("button", { name: "Cores", exact: true }).click()
  await expect(page.getByText("Nenhuma cor cadastrada nesta loja.")).toBeVisible()
  await page.getByRole("button", { name: "Produtos com grade" }).click()
  await expect(page.getByText("Nenhum produto com grade nesta loja.")).toBeVisible()
  await expect(page.getByText("Camiseta E2E")).toHaveCount(0)

  // Loja fora da allowlist: a aba não existe
  await switchStore(page, STORE_OFF)
  await page.goto("/dashboard/cadastros-v2?aba=grades")
  await expect(page.getByRole("button", { name: "Clientes" }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("button", { name: "Grades e variações" })).toHaveCount(0)
  await expect(page.getByText("Cadastro de grades e variações (cor × tamanho)")).toHaveCount(0)
})

test("usuário só da loja B não vê o catálogo de A", async ({ browser }) => {
  const page = await newPage(browser, STORE_B)
  await login(page, "lojaB")
  await abrirGrades(page)
  await page.getByRole("button", { name: "Grades de tamanho" }).click()
  await expect(page.getByText("Nenhuma grade cadastrada nesta loja.")).toBeVisible()
  // forçar a loja A no navegador não dá acesso: o servidor não autoriza a loja para esta sessão
  await switchStore(page, STORE_A)
  await page.goto("/dashboard/cadastros-v2?aba=grades")
  await page.waitForTimeout(3000)
  await expect(page.getByText("Adulto")).toHaveCount(0)
  await expect(page.getByText("Camiseta E2E")).toHaveCount(0)
})

test("mobile: grades e editor cabem na tela sem rolagem horizontal", async ({ browser }) => {
  const page = await newPage(browser, STORE_A, { width: 390, height: 844 })
  await login(page, "dono")
  await abrirGrades(page)
  await noHorizontalOverflow(page)
  await page.getByRole("button", { name: "Produtos com grade" }).click()
  await page.getByRole("button", { name: "Abrir", exact: true }).first().click()
  await expect(page.getByText("Variações cadastradas")).toBeVisible()
  await noHorizontalOverflow(page)
  await page.screenshot({ path: shot("03-editor-mobile.png"), fullPage: false })
  await page.getByRole("button", { name: "Fechar", exact: true }).click()
  await page.getByRole("button", { name: "Cores", exact: true }).click()
  await noHorizontalOverflow(page)
  await page.screenshot({ path: shot("04-cores-mobile.png"), fullPage: false })
})
