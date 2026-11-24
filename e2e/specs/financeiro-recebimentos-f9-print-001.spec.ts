import { expect, test, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { dismissFirstAccessWizardIfPresent } from "../helpers"
import { bancoDescartavel, capturarImpressao, cupomEmMidiaPrint, definirLayout, impressos, lojaAtiva, type Hist } from "../fixtures/recebimentos-qa"

/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — app real (build local, NextAuth real).
 *
 * Só PostgreSQL LOCAL DESCARTÁVEL (`fin_receb_f9_qa*`) com massa sintética. Prova pelo
 * BANCO (ledger do título, movimentações) e pelo CUPOM montado para impressão
 * (`#recibo-print-mount`), com captura em mídia de impressão.
 */

/** Foto do cupom como a impressora o veria (só o recibo em mídia `print`). */
async function fotoDoCupom(page: Page, html: string, nome: string) {
  await page.evaluate((inner) => {
    const el = document.createElement("div")
    el.id = "e2e-cupom-preview"
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#fff;padding:8px;width:302px;overflow:auto"
    el.innerHTML = inner
    document.body.appendChild(el)
  }, html)
  await page.locator("#e2e-cupom-preview").screenshot({ path: test.info().outputPath(nome) })
  await page.evaluate(() => document.getElementById("e2e-cupom-preview")?.remove())
}

async function abrirAReceber(page: Page) {
  await page.goto("/dashboard/financeiro-v2")
  await dismissFirstAccessWizardIfPresent(page)
  await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({ timeout: 45_000 })
  await page.getByRole("tab", { name: /A receber/i }).click()
  await expect(page.getByText("Contas a Receber", { exact: true })).toBeVisible()
}

test.describe.configure({ mode: "serial" })
// O teste do HUB troca a bobina para 58 mm; o padrão da loja QA é 80 mm.
test.afterAll(async () => {
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  try {
    await definirLayout(prisma, "000-qa-fin-f9", "classic", "80mm")
  } finally {
    await prisma.$disconnect()
  }
})
// O service worker do PWA intercepta /api/* e as respostas deixam de ser observáveis pela página.
test.use({ serviceWorkers: "block" })

test("Financeiro HUB — parcial com comprovante real, lote por cliente numa operação e 2ª via sem nova baixa", async ({ page }) => {
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const respostas: string[] = []
  const consoleMsgs: string[] = []
  page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") consoleMsgs.push(msg.text().slice(0, 300)) })
  page.on("pageerror", (e) => consoleMsgs.push("pageerror: " + e.message.slice(0, 300)))
  page.on("requestfailed", (r) => { if (r.url().includes("/api/")) consoleMsgs.push(`requestfailed ${r.method()} ${r.url()} ${r.failure()?.errorText}`) })
  page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) consoleMsgs.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })
  page.on("response", async (r) => {
    if (!/\/api\/financeiro\/(receber-lote|recibo-recebimento)/.test(r.url())) return
    respostas.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()} ${(await r.text().catch(() => "")).slice(0, 300)}`)
  })
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = Date.now().toString(36)
  try {
    // A loja ativa precisa existir ANTES do HUB montar (o HUB lê a unidade uma vez na carga).
    await page.goto("/dashboard")
    await dismissFirstAccessWizardIfPresent(page)
    const storeId = await lojaAtiva(page)
    const cli = await prisma.cliente.create({ data: { storeId, name: `Cliente HUB ${m}`, phone: "11977776666" } })
    const mk = (n: number, valor: number) =>
      prisma.contaReceberTitulo.create({
        data: {
          storeId, localKey: `receber:e2e:${m}:${n}`, descricao: `Crediário E2E ${m} #${n}`, cliente: cli.name,
          valor, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
        },
      })
    const [t1, t2, t3] = [await mk(1, 180), await mk(2, 60), await mk(3, 40)]

    // ── 1. Parcial 131,82 de 180,00 pelo botão Receber da linha ─────────────────
    await abrirAReceber(page)
    await capturarImpressao(page)
    const linha = page.getByRole("row", { name: new RegExp(`Crediário E2E ${m} #1`) })
    await linha.getByRole("button", { name: "Receber" }).click()
    const modal = page.getByRole("dialog", { name: /Receber conta/ })
    await expect(modal.getByText("Desconto")).toHaveCount(0) // controles sem persistência removidos
    await expect(modal.getByText("Carteira destino")).toHaveCount(0)
    await modal.getByRole("switch", { name: "Baixa parcial" }).click()
    await modal.getByLabel("Valor recebido agora").fill("131,82")
    const confirmar = modal.getByRole("button", { name: "Confirmar recebimento" })
    await expect(confirmar).toBeDisabled() // forma obrigatória
    await modal.getByRole("combobox", { name: /Forma de recebimento/ }).click()
    await page.getByRole("option", { name: "PIX" }).click()
    await confirmar.dblclick() // clique duplo: uma baixa só
    await expect(modal.getByText("Recebimento confirmado")).toBeVisible()
    await expect(modal.getByText(/abatido — resta R\$\s?48,18/)).toBeVisible()
    await expect(modal.getByRole("button", { name: "Concluir sem imprimir" })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("1-hub-sucesso-parcial.png") })
    await modal.getByRole("button", { name: /^Imprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(1)
    const cupom = (await impressos(page))[0]!
    for (const t of ["COMPROVANTE NÃO FISCAL", cli.name, "PIX", "131,82", "48,18"]) expect(cupom).toContain(t)
    for (const fixo of ["Banco Inter", "plena quitação"]) expect(cupom).not.toContain(fixo)
    await fotoDoCupom(page, cupom, "2-hub-cupom-parcial.png")
    await modal.getByRole("button", { name: /Reimprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(2)

    let h1 = ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t1.id } })).payload as { historico: Hist }).historico
    expect(h1).toHaveLength(1)
    expect(h1[0]).toMatchObject({ tipo: "pagamento", valor: 131.82, formaPagamento: "pix" })
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId, referenciaId: t1.id } })).toBe(1)
    await modal.getByRole("button", { name: /^Concluir$/ }).click()

    // ── 2. Receber de cliente: títulos marcados numa operação ────────────────────
    await page.getByRole("button", { name: "Receber de cliente" }).click()
    const rc = page.getByRole("dialog", { name: /Receber de cliente/ })
    await rc.getByRole("button", { name: new RegExp(cli.name) }).click()
    await rc.getByLabel(`Selecionar Crediário E2E ${m} #2`).click()
    await rc.getByLabel(`Selecionar Crediário E2E ${m} #3`).click()
    await rc.getByRole("combobox", { name: /Forma de pagamento/ }).click()
    await page.getByRole("option", { name: "Dinheiro" }).click()
    await rc.getByRole("button", { name: /Receber selecionados/ }).click()
    await expect(rc.getByText("Recebimento confirmado")).toBeVisible()
    await expect(rc.getByText(/2 títulos de/)).toBeVisible()
    await expect(rc.getByText(/Saldo devedor do cliente nesta loja/)).toContainText("48,18")
    await rc.getByRole("button", { name: /^Imprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(3)
    await fotoDoCupom(page, (await impressos(page))[2]!, "3-hub-cupom-lote.png")
    const [r2, r3] = await Promise.all([t2, t3].map((t) => prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })))
    const l2 = (r2!.payload as { historico: Hist }).historico
    const l3 = (r3!.payload as { historico: Hist }).historico
    expect(l2).toHaveLength(1)
    expect(l3).toHaveLength(1)
    expect(l2[0]!.loteId).toBeTruthy()
    expect(l2[0]!.loteId).toBe(l3[0]!.loteId) // UMA operação
    await rc.getByRole("button", { name: /^Concluir$/ }).click()

    // ── 3. 2ª via a partir do registro original, sem nova baixa ──────────────────
    const movAntes = await prisma.movimentacaoFinanceira.count({ where: { storeId } })
    await page.getByRole("row", { name: new RegExp(`Crediário E2E ${m} #3`) }).getByRole("button", { name: "Comprovantes de recebimento" }).click()
    const sv = page.getByRole("dialog", { name: /Comprovantes de recebimento/ })
    await sv.getByRole("button", { name: /Reimprimir/ }).first().click()
    await expect.poll(async () => (await impressos(page)).length).toBe(4)
    const via = (await impressos(page))[3]!
    expect(via).toContain("2ª VIA — REIMPRESSÃO")
    expect(via).toContain("2 títulos recebidos") // consolidado da operação
    await fotoDoCupom(page, via, "4-hub-cupom-2via.png")
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId } })).toBe(movAntes)
    h1 = ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t1.id } })).payload as { historico: Hist }).historico
    expect(h1).toHaveLength(1)
  } finally {
    const toasts = await page.locator("[data-sonner-toast]").allTextContents().catch(() => [])
    const alertas = await page.getByRole("alert").allTextContents().catch(() => [])
    console.log(["[respostas-api]", ...respostas, "[toasts]", ...toasts, "[alertas]", ...alertas, "[console]", ...consoleMsgs].join("\n"))
    await prisma.$disconnect()
  }
})

test("PDV Classic — F9 lista devedores, busca por telefone, recebe uma vez e oferece comprovante", async ({ page }) => {
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = Date.now().toString(36)
  try {
    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)
    const storeId = await lojaAtiva(page)
    const aberta = await prisma.sessaoCaixa.findFirst({ where: { storeId, status: "ABERTA" } })
    if (!aberta) await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA E2E", status: "ABERTA" } })
    const cli = await prisma.cliente.create({ data: { storeId, name: `Cliente PDV ${m}`, phone: `1196${m.slice(-7).replace(/\D/g, "1").padEnd(7, "1")}` } })
    const t = await prisma.contaReceberTitulo.create({
      data: {
        storeId, localKey: `receber:e2e-pdv:${m}`, descricao: `Venda a prazo ${m}`, cliente: cli.name,
        valor: 75, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
      },
    })

    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)
    // Terminal: o PDV pede um terminal por computador antes do caixa.
    const usar = page.getByRole("button", { name: "Usar", exact: true }).first()
    await usar.waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined)
    if (await usar.isVisible().catch(() => false)) await usar.click()
    await expect(page.getByText("Selecionar Terminal")).toHaveCount(0, { timeout: 20_000 })
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await page.screenshot({ path: test.info().outputPath("5a-pdv-apos-terminal.png") })
    await capturarImpressao(page)
    // O caixa vem do servidor; F9 reconsulta a sessão quando o estado local ainda não chegou.
    const dialog = page.getByRole("dialog", { name: /Receber conta/ })
    await expect.poll(async () => {
      await page.locator("body").press("F9")
      return dialog.isVisible()
    }, { timeout: 45_000, intervals: [1_000, 2_000, 3_000] }).toBe(true)

    await expect(dialog.getByText("Clientes com contas em aberto")).toBeVisible()
    await expect(dialog.getByRole("button", { name: new RegExp(cli.name) })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("5-pdv-f9-lista-inicial.png") })

    // Busca real (POST /api/clientes/search) pelo telefone.
    const busca = page.waitForRequest((r) => r.url().endsWith("/api/clientes/search") && r.method() === "POST")
    await dialog.getByLabel(/Cliente \(nome, telefone ou CPF\)/).fill(cli.phone!.slice(-6))
    expect((await busca).postDataJSON()).toEqual({ q: cli.phone!.slice(-6) })
    await dialog.getByRole("button", { name: new RegExp(cli.name) }).click()
    await dialog.getByLabel(`Selecionar Venda a prazo ${m}`).click()
    await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
    await dialog.getByRole("button", { name: /Gravar R\$/ }).dblclick()
    await expect(dialog.getByText("Recebimento confirmado")).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Concluir sem imprimir|Concluir/ })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("6-pdv-sucesso.png") })
    await dialog.getByRole("button", { name: /Imprimir comprovante|Reimprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBeGreaterThanOrEqual(1)
    const cupom = (await impressos(page)).at(-1)!
    for (const tx of ["COMPROVANTE NÃO FISCAL", cli.name, "75,00", "quitado"]) expect(cupom).toContain(tx)
    await fotoDoCupom(page, cupom, "7-pdv-cupom.png")

    const titulo = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })
    const hist = (titulo.payload as { historico: Hist }).historico
    expect(titulo.status).toBe("pago")
    expect(hist).toHaveLength(1)
    expect(await prisma.caixaOperacao.count({ where: { storeId, tipo: "recebimento_cr", payload: { path: ["itens", "0", "localKey"], equals: t.localKey! } } })).toBe(1)
  } finally {
    await prisma.$disconnect()
  }
})

test("Financeiro HUB — integral, lote de 3 numa operação, tela de sucesso após a recarga, estorno e cupom 58 mm", async ({ page }) => {
  test.setTimeout(180_000)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = `hub${Date.now().toString(36)}`
  const ledger = async (id: string) => ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id } })).payload as { historico: Hist }).historico
  try {
    await page.goto("/dashboard")
    await dismissFirstAccessWizardIfPresent(page)
    const storeId = await lojaAtiva(page)
    // Bobina 58 mm na config da loja (o HUB imprime com a bobina real da unidade).
    const atual = await prisma.storeSettings.findUnique({ where: { storeId } })
    const base = (atual?.printerConfig && typeof atual.printerConfig === "object" ? atual.printerConfig : {}) as Record<string, unknown>
    const impressao = (base.impressao && typeof base.impressao === "object" ? base.impressao : {}) as Record<string, unknown>
    const printerConfig = { ...base, impressao: { ...impressao, bobinaTamanho: "58mm" } }
    await prisma.storeSettings.upsert({ where: { storeId }, update: { printerConfig }, create: { storeId, printerConfig } })

    const cli = await prisma.cliente.create({ data: { storeId, name: `Cliente Integral ${m}`, phone: "11933332222" } })
    const mk = (n: number, valor: number) =>
      prisma.contaReceberTitulo.create({
        data: {
          storeId, localKey: `receber:e2e-hub2:${m}:${n}`, descricao: `Parcela ${m} #${n}`, cliente: cli.name,
          valor, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
        },
      })
    const [t1, t2, t3, t4, t5] = [await mk(1, 90), await mk(2, 10), await mk(3, 20), await mk(4, 30), await mk(5, 50)]
    const linha = (n: number) => page.getByRole("row", { name: new RegExp(`Parcela ${m} #${n}\\b`) })

    await abrirAReceber(page)
    await capturarImpressao(page)

    // ── 1. Integral (sem parcial), Cartão de débito ───────────────────────────────
    await linha(1).getByRole("button", { name: "Receber" }).click()
    const modal = page.getByRole("dialog", { name: /Receber conta/ })
    await modal.getByRole("combobox", { name: /Forma de recebimento/ }).click()
    await page.getByRole("option", { name: "Cartão de débito" }).click()
    // A recarga silenciosa da lista vem DEPOIS da confirmação; a tela de sucesso precisa sobreviver a ela.
    const recarga = page.waitForResponse(
      (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/financeiro/receber",
      { timeout: 30_000 },
    )
    await modal.getByRole("button", { name: "Confirmar recebimento" }).click()
    await expect(modal.getByText("Recebimento confirmado")).toBeVisible()
    expect((await recarga).status()).toBe(200)
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await expect(modal.getByText("Recebimento confirmado")).toBeVisible()
    const h1 = await ledger(t1.id)
    expect(h1).toHaveLength(1)
    expect(h1[0]).toMatchObject({ tipo: "liquidacao", valor: 90, formaPagamento: "debito" })
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t1.id } })).status).toBe("pago")
    await modal.getByRole("button", { name: /^Imprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(1)
    const cupom1 = (await impressos(page))[0]!
    for (const tx of ["COMPROVANTE NÃO FISCAL", "Loja QA Recebimentos F9", cli.name, "Cartão de débito", "90,00", "quitado"]) expect(cupom1).toContain(tx)
    expect(cupom1).toMatch(/size: 58mm \d+mm/)
    const r58 = await cupomEmMidiaPrint(page, cupom1, "hub-integral-cupom-58mm.pdf")
    test.info().annotations.push({ type: "cupom-pdf", description: `${r58.larguraMm.toFixed(1)}mm, ${r58.paginas} página(s), estouro ${r58.estouro}px` })
    expect(Math.abs(r58.larguraMm - 58)).toBeLessThan(1)
    expect(r58.estouro).toBeLessThanOrEqual(0)
    expect(r58.paginas).toBe(1)
    await modal.getByRole("button", { name: /^Concluir$/ }).click()

    // ── 2. Lote de 3 títulos do cliente numa operação (clique duplo = uma operação) ─
    await page.getByRole("button", { name: "Receber de cliente" }).click()
    const rc = page.getByRole("dialog", { name: /Receber de cliente/ })
    await rc.getByRole("button", { name: new RegExp(cli.name) }).click()
    for (const n of [2, 3, 4]) await rc.getByLabel(`Selecionar Parcela ${m} #${n}`).click()
    await rc.getByRole("combobox", { name: /Forma de pagamento/ }).click()
    await page.getByRole("option", { name: "PIX" }).click()
    await rc.getByRole("button", { name: /Receber selecionados/ }).dblclick()
    await expect(rc.getByText("Recebimento confirmado")).toBeVisible()
    await expect(rc.getByText(/3 títulos de/)).toBeVisible()
    await page.waitForLoadState("networkidle").catch(() => undefined)
    await expect(rc.getByText("Recebimento confirmado")).toBeVisible()
    const lotes = await Promise.all([t2, t3, t4].map((t) => ledger(t.id)))
    for (const h of lotes) expect(h).toHaveLength(1)
    expect(new Set(lotes.map((h) => h[0]!.loteId)).size).toBe(1)
    expect(lotes.map((h) => h[0]!.valor)).toEqual([10, 20, 30])
    expect(lotes.every((h) => h[0]!.formaPagamento === "pix")).toBe(true)
    await rc.getByRole("button", { name: /^Imprimir comprovante/ }).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(2)
    const cupomLote = (await impressos(page))[1]!
    for (const tx of ["3 títulos recebidos", "60,00", "PIX", `Parcela ${m} #2`, `Parcela ${m} #4`]) expect(cupomLote).toContain(tx)
    await rc.getByRole("button", { name: /^Concluir$/ }).click()

    // ── 3. Parcial e ESTORNO: a 2ª via do pagamento estornado fica bloqueada ──────
    await linha(5).getByRole("button", { name: "Receber" }).click()
    await modal.getByRole("switch", { name: "Baixa parcial" }).click()
    await modal.getByLabel("Valor recebido agora").fill("20,00")
    await modal.getByRole("combobox", { name: /Forma de recebimento/ }).click()
    await page.getByRole("option", { name: "Dinheiro" }).click()
    await modal.getByRole("button", { name: "Confirmar recebimento" }).click()
    await expect(modal.getByText("Recebimento confirmado")).toBeVisible()
    await modal.getByRole("button", { name: /^Concluir/ }).click()
    await linha(5).getByRole("button", { name: "Estornar" }).click()
    const est = page.getByRole("dialog", { name: /Estornar recebimento/ })
    await est.getByRole("button", { name: "Confirmar estorno" }).click()
    await expect(est).toBeHidden()
    const h5 = await ledger(t5.id)
    expect(h5.map((e) => e.tipo)).toEqual(["pagamento", "estorno_pagamento"])
    expect(h5[1]!.refHistoricoIndex).toBe(0)
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t5.id } })).status).toBe("pendente")
    const segundaVia = await page.request.get(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(t5.localKey!)}&index=0`, {
      headers: { "x-assistec-loja-id": storeId },
    })
    expect(segundaVia.status()).toBe(409)
    await linha(5).getByRole("button", { name: "Comprovantes de recebimento" }).click()
    const sv = page.getByRole("dialog", { name: /Comprovantes de recebimento/ })
    await expect(sv.getByText(/estornado/)).toBeVisible()
    await expect(sv.getByRole("button", { name: /Reimprimir/ }).first()).toBeDisabled()
    expect((await impressos(page)).length).toBe(2)
  } finally {
    await prisma.$disconnect()
  }
})
