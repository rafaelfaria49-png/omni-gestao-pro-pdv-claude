import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  STORES, USERS, closeDb, field, guardOnboarding, login, openCadastrosProdutos, openNewProduct, readDb,
  saveProductAndConfirm, switchStore,
} from "./support"

/**
 * PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — o PDV Clássico real (build de produção, login
 * NextAuth real, PostgreSQL descartável) vende com internet, perde a conexão, registra duas
 * vendas IDÊNTICAS só no terminal, mostra que nada foi confirmado, o Reenviar offline responde
 * na hora sem fingir envio, e a volta da rede sincroniza sozinha — sem recarregar a página,
 * com UMA venda, UMA baixa de estoque e UM lançamento por identidade. O banco só é LIDO aqui.
 */

test.afterAll(closeDb)

const B = STORES.variedades
const NOME = "Pão offline E2E"
const SKU = "E2E-OFF-001"
const BIPE = "Bipe ou digite o código do produto"
const panel = (page: Page) => page.getByTestId("pdv-sync-panel")
const cartRow = (page: Page): Locator => page.locator("button").filter({ has: page.locator(`[title="${NOME}"]`) })

/**
 * Pós-venda CONFIRMADA abre o diálogo do comprovante ("Agora não" antes de imprimir; "Fechar" depois de
 * "Impressão não enviada" — o job do CI não tem agente de impressão). Fecha-o quando estiver por cima — venda PENDENTE nunca o abre (contrato).
 */
function guardPostSaleDialog(page: Page) {
  void page.addLocatorHandler(
    page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ }),
    async (dialog) => {
      await dialog.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
    },
  )
}

/** Espera o diálogo do comprovante da venda confirmada (abre assíncrono) e o fecha. */
async function fecharPosVenda(page: Page) {
  const dialog = page.getByRole("dialog", { name: /^(Impressão não enviada|Comprovante enviado|Comprovante não fiscal)$/ })
  await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {})
  if (await dialog.isVisible()) await dialog.getByRole("button", { name: /^(Agora não|Fechar)$/ }).first().click()
  await expect(dialog).toHaveCount(0)
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

/** Caixa pela interface real (o servidor abre a sessão; nada semeado no banco). */
async function garantirCaixaAberto(page: Page) {
  const abrir = page.getByRole("button", { name: "Abrir Caixa", exact: true }).first()
  if (!(await abrir.isVisible().catch(() => false))) return
  await abrir.click()
  const dialog = page.getByRole("dialog").filter({ has: page.getByText("Saldo Inicial do Caixa") })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder("0,00").fill("0")
  await dialog.getByPlaceholder("Ex.: Caixa 1 / Nome").fill("Caixa E2E offline")
  await dialog.getByRole("button", { name: "Abrir Caixa", exact: true }).click()
  await expect(page.getByRole("button", { name: "Abrir Caixa", exact: true })).toHaveCount(0, { timeout: 30_000 })
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape")
}

async function venderEmDinheiro(page: Page, bipe: Locator) {
  await bipe.fill(SKU)
  await bipe.press("Enter")
  await expect(cartRow(page)).toHaveCount(1)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // Registra o destino real do F12 (capturado no instante, não 4 s depois).
  await page.evaluate(() => {
    const w = window as unknown as { __f12?: unknown[] }
    w.__f12 = []
    const snap = (fase: string, e: KeyboardEvent) => w.__f12!.push({
      fase, prevented: e.defaultPrevented, repeat: e.repeat,
      overlays: Array.from(document.querySelectorAll("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]")).map((el) => el.getAttribute("role")),
      bipe: (document.querySelector("input[placeholder=\"Bipe ou digite o código do produto\"]") as HTMLInputElement | null)?.value,
    })
    window.addEventListener("keydown", (e) => { if (e.key === "F12") snap("captura", e) }, { capture: true, once: true })
    window.addEventListener("keydown", (e) => { if (e.key === "F12") snap("bolha", e) }, { once: true })
  })
  await page.keyboard.press("F12")
  const modal = page.getByRole("dialog", { name: "Finalizar Pagamento" })
  if (!(await modal.waitFor({ state: "visible", timeout: 4_000 }).then(() => true, () => false))) {
    // Diagnóstico: o motivo da recusa vem em toast efêmero — capturado antes de sumir.
    const motivo = await page.evaluate(() => ({
      toasts: Array.from(document.querySelectorAll("[role=region] li")).map((el) => el.textContent),
      overlays: Array.from(document.querySelectorAll("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]")).map((el) => `${el.getAttribute("role")}:${(el.textContent ?? "").slice(0, 80)}`),
      ativo: document.activeElement?.outerHTML.slice(0, 120),
      f12: (window as unknown as { __f12?: unknown[] }).__f12,
      caixa: document.body.innerText.match(/Caixa (Aberto|Fechado).{0,40}/)?.[0],
      sessao: document.body.innerText.match(/sem referência de sessão.{0,60}/)?.[0] ?? null,
    }))
    throw new Error(`Pagamento não abriu após F12: ${JSON.stringify(motivo)}`)
  }
  await modal.getByRole("button", { name: /^Dinheiro$/i }).click()
  const cashConfirm = modal.getByRole("button", { name: /Confirmar (Dinheiro|valor exato)/i })
  if (await cashConfirm.count()) await cashConfirm.first().click()
  await modal.getByRole("button", { name: "Confirmar Pagamento", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Sim, finalizar" }).click()
  await expect(modal).toHaveCount(0)
}

async function marcarSemReload(page: Page) {
  await page.evaluate(() => { (window as unknown as { __semF5?: string }).__semF5 = "marcado" })
}
async function aindaSemReload(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __semF5?: string }).__semF5)).toBe("marcado")
}

test("Vendas offline ficam só no terminal, o Reenviar é honesto e a volta da rede sincroniza uma vez cada", async ({ browser }) => {
  test.setTimeout(300_000)
  const ctx = await browser.newContext({ locale: "pt-BR", serviceWorkers: "block", viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  await login(page, USERS.admin)
  await switchStore(page, "Variedades Sintética B")
  const db = await readDb()

  await test.step("Produto pela interface", async () => {
    await openCadastrosProdutos(page)
    const modal = await openNewProduct(page)
    await field(modal, "Nome").fill(NOME)
    await field(modal, "SKU").fill(SKU)
    await field(modal, "Categoria").fill("Sintéticos offline")
    await field(modal, "Categoria").press("Enter")
    await field(modal, "Preço venda (R$)").fill("5,00")
    await field(modal, "Estoque inicial").fill("20")
    await saveProductAndConfirm(page)
  })
  const produto = await db.produto.findFirstOrThrow({ where: { storeId: B, sku: SKU } })
  const vendasAntes = await db.venda.count({ where: { storeId: B } })

  const bipe = await abrirPdv(page)
  await garantirCaixaAberto(page)
  await marcarSemReload(page)

  await test.step("T01 — venda online confirmada pelo servidor", async () => {
    await venderEmDinheiro(page, bipe)
    await expect.poll(() => db.venda.count({ where: { storeId: B } }), { timeout: 30_000 }).toBe(vendasAntes + 1)
    await expect.poll(async () => (await db.produto.findUniqueOrThrow({ where: { id: produto.id } })).stock).toBe(19)
    await expect(cartRow(page)).toHaveCount(0)
    await fecharPosVenda(page)
  })

  await test.step("T02/T04 — internet cai: venda registrada SÓ no terminal, nada no servidor", async () => {
    await ctx.setOffline(true)
    await venderEmDinheiro(page, bipe)
    await expect(panel(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId("pdv-sync-total")).toHaveText("1")
    await expect(page.getByTestId("pdv-sync-connectivity")).toHaveText(/Sem internet|Servidor não responde/)
    expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes + 1)
    // Carrinho preservado no PENDING (contrato CORREÇÃO-01), sem reload.
    await expect(cartRow(page)).toHaveCount(1)
    await aindaSemReload(page)
  })

  await test.step("T56/T07/T08 — Reenviar offline responde na hora e não finge envio", async () => {
    await panel(page).getByRole("button", { name: "Reenviar", exact: true }).click()
    await expect(page.getByTestId("pdv-sync-last-run")).toContainText("sem conexão — nada foi enviado", { timeout: 15_000 })
    // Reenviar com falha já expande a lista (o motivo fica visível sem outro clique).
    const detalhes = panel(page).getByRole("button", { name: "Detalhes" })
    if ((await detalhes.getAttribute("aria-expanded")) !== "true") await detalhes.click()
    await expect(detalhes).toHaveAttribute("aria-expanded", "true")
    await expect(page.getByTestId("pdv-sync-row").first()).toContainText("NÃO gravada")
    expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes + 1)
  })

  await test.step("T34 — operador libera o carrinho e registra outra venda IDÊNTICA offline", async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press("F6")
    const cancelar = page.getByRole("dialog", { name: /Cancelar Venda/ })
    await expect(cancelar).toBeVisible()
    await cancelar.getByRole("button", { name: "Cancelar venda", exact: true }).click()
    await expect(page.getByText(/A venda anterior NÃO foi cancelada/)).toBeVisible()
    await expect(cartRow(page)).toHaveCount(0)
    await venderEmDinheiro(page, bipe)
    await expect(page.getByTestId("pdv-sync-total")).toHaveText("2", { timeout: 15_000 })
    const fila = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}").sales ?? [], `assistec-pro-ops-v1-${B}`) as Array<{ syncPending?: boolean; clientSaleId?: string }>
    const pendentes = fila.filter((s) => s.syncPending === true)
    expect(pendentes).toHaveLength(2)
    expect(new Set(pendentes.map((s) => s.clientSaleId)).size).toBe(2)
    expect(await db.venda.count({ where: { storeId: B } })).toBe(vendasAntes + 1)
    await aindaSemReload(page)
  })

  await test.step("T03/T05/T10/T11 — rede volta sem recarregar: cada venda entra UMA vez", async () => {
    await ctx.setOffline(false)
    await expect.poll(() => db.venda.count({ where: { storeId: B } }), { timeout: 90_000 }).toBe(vendasAntes + 3)
    await expect(page.getByTestId("pdv-sync-total")).toHaveCount(0, { timeout: 60_000 })
    await aindaSemReload(page)
    const vendas = await db.venda.findMany({ where: { storeId: B, clientSaleId: { not: null } }, select: { clientSaleId: true } })
    expect(new Set(vendas.map((v) => v.clientSaleId)).size).toBe(vendas.length)
    expect((await db.produto.findUniqueOrThrow({ where: { id: produto.id } })).stock).toBe(17)
    // Uma movimentação de estoque por venda confirmada — nenhum replay duplicou baixa.
    expect(await db.movimentacaoEstoque.count({ where: { storeId: B, produtoId: produto.id, origem: "pdv" } })).toBe(3)
  })

  await ctx.close()
})
