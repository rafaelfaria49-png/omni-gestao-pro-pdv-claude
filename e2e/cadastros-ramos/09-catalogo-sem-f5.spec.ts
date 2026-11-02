import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  STORES, USERS, closeDb, field, guardOnboarding, login, openCadastrosProdutos, openNewProduct, productModal, readDb,
  rowOf, saveProductAndConfirm, searchProduct, switchStore,
} from "./support"

/**
 * PDV-CADASTROS-SYNC-AUTOMATICO-001 — prova de "sem F5": o PDV Clássico aberto recebe
 * edições de cadastro feitas em outra aba e em outro aparelho (contexto de navegador
 * separado, com sessão própria), inclusive depois de ficar offline, sem recarregar a
 * página, sem perder o carrinho e sem gravar venda. Toda escrita passa pela aplicação.
 */

test.afterAll(closeDb)

const B = STORES.variedades
const NOME = "Fone sincronizado E2E"
const BIPE = "Bipe ou digite o código do produto"
const panel = (page: Page) => page.getByTestId("pdv-catalog-divergences")
/** A linha do carrinho (não o painel): botão da grade com a descrição do item. */
const cartRow = (page: Page): Locator => page.locator("button").filter({ has: page.locator(`[title="${NOME}"]`) })

async function editarProduto(page: Page, busca: string, patch: { preco?: string; sku?: string }) {
  await searchProduct(page, busca)
  await rowOf(page, NOME).getByRole("button", { name: /Editar/ }).click()
  const modal = productModal(page)
  await expect(field(modal, "Nome")).toHaveValue(NOME)
  if (patch.preco) await field(modal, "Preço venda (R$)").fill(patch.preco)
  if (patch.sku) await field(modal, "SKU").fill(patch.sku)
  await saveProductAndConfirm(page)
}

/** Entra no PDV desta loja passando pelo seletor de terminal (contexto novo não tem terminal salvo). */
async function abrirPdv(page: Page) {
  guardOnboarding(page)
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

async function marcarSemReload(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __semF5?: string }).__semF5 = "marcado"
  })
}

async function aindaSemReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __semF5?: string }).__semF5)).toBe("marcado")
}

test("Cadastro editado em outra aba e em outro aparelho chega ao PDV aberto sem F5", async ({ browser }) => {
  test.setTimeout(240_000)
  const caixa = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  const cadastros = await caixa.newPage()
  await login(cadastros, USERS.admin)
  await switchStore(cadastros, "Variedades Sintética B")
  const db = await readDb()
  const vendasAntes = await db.venda.count({ where: { storeId: B } })

  await test.step("Cadastro inicial pela interface", async () => {
    await openCadastrosProdutos(cadastros)
    const modal = await openNewProduct(cadastros)
    await field(modal, "Nome").fill(NOME)
    await field(modal, "SKU").fill("E2E-SYNC-001")
    await field(modal, "Categoria").fill("Sintéticos sync")
    await field(modal, "Categoria").press("Enter")
    await field(modal, "Preço venda (R$)").fill("10,00")
    await field(modal, "Estoque inicial").fill("5")
    await saveProductAndConfirm(cadastros)
  })
  const produto = await db.produto.findFirstOrThrow({ where: { storeId: B, sku: "E2E-SYNC-001" } })

  const pdv = await caixa.newPage()
  // DIAG temporário (CI 41479634312): quem dispara a navegação dura do PDV no offline.
  const diag: string[] = []
  const t0 = Date.now()
  const dlog = (s: string) => diag.push(`+${Date.now() - t0}ms ${s}`)
  await pdv.addInitScript(() => {
    const orig = window.fetch
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      try {
        const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        if (h.get("rsc") || h.get("next-action") || h.get("next-router-prefetch")) {
          console.log(`[diag-rsc] ${String(input instanceof Request ? input.url : input)} action=${h.get("next-action")} prefetch=${h.get("next-router-prefetch")} online=${navigator.onLine}\n${new Error().stack}`)
        }
      } catch { /* diag */ }
      return orig.call(window, input, init)
    } as typeof fetch
    for (const ev of ["online", "offline", "pagehide", "beforeunload"]) {
      window.addEventListener(ev, () => console.log(`[diag-ev] ${ev} online=${navigator.onLine}`))
    }
  })
  pdv.on("console", (m) => dlog(`console.${m.type()} ${m.text().slice(0, 1500)}`))
  pdv.on("framenavigated", (f) => { if (f === pdv.mainFrame()) dlog(`framenavigated ${f.url()}`) })
  pdv.on("request", (r) => { if (r.isNavigationRequest()) dlog(`navrequest ${r.url()}`) })
  await test.step("PDV aberto com o item no carrinho", async () => {
    const bipe = await abrirPdv(pdv)
    await marcarSemReload(pdv)
    await bipe.fill("E2E-SYNC-001")
    await bipe.press("Enter")
    await expect(cartRow(pdv)).toHaveCount(1)
    await expect(cartRow(pdv).locator('[title="E2E-SYNC-001"]')).toBeVisible()
    await expect(panel(pdv)).toHaveCount(0)
  })

  await test.step("Outra aba: SKU e preço editados → PDV reaponta a linha e pede revisão, sem F5", async () => {
    await cadastros.bringToFront()
    await editarProduto(cadastros, "E2E-SYNC-001", { preco: "12,50", sku: "E2E-SYNC-002" })
    await expect(panel(pdv)).toBeVisible({ timeout: 15_000 })
    await expect(panel(pdv).getByRole("button", { name: /Usar R\$\s?12,50/ })).toBeVisible()
    // Mesmo Produto.id: a linha passa a usar o SKU novo sozinha (sem impacto comercial).
    await expect(cartRow(pdv)).toHaveCount(1)
    await expect(cartRow(pdv).locator('[title="E2E-SYNC-002"]')).toBeVisible()
    await aindaSemReload(pdv)
    expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes)
  })

  await test.step("Revisão explícita aplica o preço novo na linha", async () => {
    await pdv.bringToFront()
    await panel(pdv).getByRole("button", { name: /Usar R\$\s?12,50/ }).click()
    await expect(panel(pdv)).toHaveCount(0)
    await expect(cartRow(pdv)).toContainText("12,50")
    await aindaSemReload(pdv)
  })

  const outroAparelho = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  const remoto = await outroAparelho.newPage()
  await login(remoto, USERS.admin)
  await switchStore(remoto, "Variedades Sintética B")
  await openCadastrosProdutos(remoto)

  await test.step("Outro aparelho: preço editado → PDV detecta pela versão do catálogo, sem F5", async () => {
    await editarProduto(remoto, "E2E-SYNC-002", { preco: "14,00" })
    await expect(panel(pdv).getByRole("button", { name: /Usar R\$\s?14,00/ })).toBeVisible({ timeout: 50_000 })
    await aindaSemReload(pdv)
    await panel(pdv).getByRole("button", { name: /Manter R\$\s?12,50/ }).click()
    await expect(panel(pdv)).toHaveCount(0)
    await expect(cartRow(pdv)).toContainText("12,50")
  })

  await test.step("Offline: edição remota chega quando a rede volta, carrinho preservado", async () => {
    try {
    dlog("== setOffline(true)")
    await caixa.setOffline(true)
    await editarProduto(remoto, "E2E-SYNC-002", { preco: "15,00" })
    dlog("== setOffline(false)")
    await caixa.setOffline(false)
    await expect(panel(pdv).getByRole("button", { name: /Usar R\$\s?15,00/ })).toBeVisible({ timeout: 50_000 })
    } finally {
      console.log(`[diag 09]\n${diag.join("\n")}`)
    }
    await expect(cartRow(pdv)).toHaveCount(1)
    await expect(cartRow(pdv)).toContainText("12,50")
    await aindaSemReload(pdv)
  })

  // Identidade imutável: o mesmo Produto.id atravessou todas as edições; nenhuma venda criada.
  const depois = await db.produto.findUniqueOrThrow({ where: { id: produto.id } })
  expect(depois).toMatchObject({ storeId: B, sku: "E2E-SYNC-002", price: 15 })
  expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes)

  await outroAparelho.close()
  await caixa.close()
})
