import { expect, test, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { dismissFirstAccessWizardIfPresent, ensureCaixaAberto } from "../helpers"
import { bancoDescartavel, capturarImpressao, definirLayout, impressos, lojaAtiva, type Hist } from "../fixtures/recebimentos-qa"

/**
 * FINANCEIRO-F9-ESTORNO-ACEITE-FINAL-002 — lacunas de TELA da integração #384 + #341.
 *
 * App real (build local, NextAuth real), PostgreSQL LOCAL DESCARTÁVEL `fin_receb_f9_qa*`,
 * massa sintética. Cobre o que a suíte PG não cobria pela interface:
 *  - recebimento parcial 100 + 50 num título de 300 feito NO PDV (rota real do F9);
 *  - estorno do 2º pagamento pelo Financeiro HUB (tela), com compensação no Caixa;
 *  - 2ª via: bloqueada para o pagamento estornado, liberada para o que segue válido;
 *  - Fechamento de Caixa pela tela (PIN de supervisor sintético, contagem, confirmação);
 *  - estorno recusado depois do caixa fechado;
 *  - Relatório Geral pela tela, conferido contra a API e contra o banco;
 *  - recuperação de terminal ocupado por outro computador ("Assumir").
 */

const LOJA = "000-qa-fin-f9"
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Metric = { key: string; label: string; value: number | null }
type Section = { key: string; title: string; metrics: Metric[]; rows?: Array<Record<string, unknown>> }
type Report = { sections?: Section[]; rows: Array<Record<string, unknown>>; total: number }

/** Entra no PDV num terminal: "Usar"/"Continuar" quando livre; "Assumir" (supervisor) quando ocupado. */
async function entrarNoTerminal(page: Page, opts: { esperarOcupado?: boolean } = {}) {
  const titulo = page.getByText("Selecionar Terminal", { exact: true })
  const busca = page.getByPlaceholder(/Código \/ Bipe|Buscar produto|Digite produto|código/i)
  await expect(titulo.or(busca).first()).toBeVisible({ timeout: 45_000 })
  if (!(await titulo.isVisible().catch(() => false))) {
    expect(opts.esperarOcupado ?? false, "esperava o seletor com terminal ocupado").toBe(false)
    return "direto" as const
  }
  const livre = page.getByRole("button", { name: /^(Usar|Continuar)$/ }).first()
  const ocupado = page.getByRole("button", { name: "Em uso", exact: true }).first()
  await expect(livre.or(ocupado).first()).toBeVisible({ timeout: 20_000 })
  if (!opts.esperarOcupado && (await livre.isVisible().catch(() => false))) {
    await livre.click()
    await expect(titulo).toHaveCount(0, { timeout: 20_000 })
    return "livre" as const
  }
  await expect(ocupado).toBeVisible()
  await expect(ocupado).toBeDisabled()
  await page.getByRole("button", { name: /Assumir/ }).first().click()
  const confirma = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: /Assumir/ }).last()
  await confirma.getByRole("button", { name: /Assumir/ }).last().click()
  await expect(page.getByText("Terminal assumido").first()).toBeVisible({ timeout: 15_000 })
  await expect(titulo).toHaveCount(0, { timeout: 20_000 })
  return "assumido" as const
}

async function abrirAReceber(page: Page) {
  await page.goto("/dashboard/financeiro-v2")
  await dismissFirstAccessWizardIfPresent(page)
  await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({ timeout: 45_000 })
  await page.getByRole("tab", { name: /A receber/i }).click()
  await expect(page.getByText("Contas a Receber", { exact: true })).toBeVisible()
}

async function relatorioGeral(page: Page, storeId: string, extra: Record<string, string> = {}): Promise<Report> {
  const q = new URLSearchParams({ from: hojeSP(), to: hojeSP(), pageSize: "100", ...extra })
  const r = await page.request.get(`/api/dashboard/relatorios/geral?${q}`, { headers: { "x-assistec-loja-id": storeId } })
  expect(r.status(), await r.text()).toBe(200)
  return (await r.json()) as Report
}
const metrica = (rep: Report, label: RegExp) => {
  for (const s of rep.sections ?? []) for (const m of s.metrics) if (label.test(m.label)) return { secao: s.title, ...m }
  return null
}

test.describe.configure({ mode: "serial" })
test.use({ serviceWorkers: "block" })

let terminalDoTeste1: string | null = null

test("Aceite 002 — PDV 100 + 50, estorno do 2º pelo HUB, 2ª via, Fechamento de Caixa e Relatório Geral pela tela", async ({ page }) => {
  test.setTimeout(300_000)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const pin = (process.env.E2E_SUPERVISOR_PIN ?? "").trim()
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = `ac2${Date.now().toString(36)}`
  const ledger = async (id: string) => ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id } })).payload as { historico: Hist }).historico
  try {
    // Sessão de caixa NOVA e só deste teste: fecha (no banco descartável) as que sobraram de execuções anteriores.
    await definirLayout(prisma, LOJA, "classic", "80mm")
    await prisma.sessaoCaixa.updateMany({ where: { storeId: LOJA, status: "ABERTA" }, data: { status: "FECHADA", fechadaEm: new Date() } })

    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)
    const storeId = await lojaAtiva(page)
    expect(storeId).toBe(LOJA)
    await entrarNoTerminal(page)
    // A barra do caixa resolve a sessão no servidor; só então dá para decidir se abre.
    await expect(page.getByText(/Caixa (Aberto|Fechado)/).first()).toBeVisible({ timeout: 30_000 })
    await ensureCaixaAberto(page)
    const sessao = await prisma.sessaoCaixa.findFirstOrThrow({ where: { storeId, status: "ABERTA" }, orderBy: { abertaEm: "desc" } })
    expect(sessao.saldoInicial).toBe(0)
    terminalDoTeste1 = sessao.terminalId

    const antes = await relatorioGeral(page, storeId)

    // ── Massa: título de 300 e recebimentos 100 + 50 em dinheiro pela rota do PDV (F9) ──
    const cli = await prisma.cliente.create({ data: { storeId, name: `Cliente Aceite ${m}`, phone: "11955554444" } })
    const t = await prisma.contaReceberTitulo.create({
      data: {
        storeId, localKey: `receber:e2e-aceite:${m}`, descricao: `Crediário Aceite ${m}`, cliente: cli.name,
        valor: 300, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
      },
    })
    for (const [valor, n] of [[100, 1], [50, 2]] as const) {
      const r = await page.request.post("/api/pdv/receber-conta", {
        headers: { "x-assistec-loja-id": storeId },
        data: { op: "parcial", localKey: t.localKey, valor, formaPagamento: "dinheiro", sessaoId: sessao.id, idempotencyKey: `e2e-aceite-${m}-${n}` },
      })
      expect(r.status(), await r.text()).toBe(200)
    }
    let h = await ledger(t.id)
    expect(h.map((e) => [e.tipo, e.valor])).toEqual([["pagamento", 100], ["pagamento", 50]])
    const recCaixa = await prisma.caixaOperacao.findMany({ where: { storeId, sessaoId: sessao.id, tipo: "recebimento_cr" }, orderBy: { at: "asc" } })
    expect(recCaixa.map((o) => o.valor)).toEqual([100, 50])

    // ── C/D. Estorno do 2º pagamento pelo HUB (tela) ─────────────────────────────
    await abrirAReceber(page)
    await capturarImpressao(page)
    const linha = page.getByRole("row", { name: new RegExp(`Crediário Aceite ${m}`) })
    await expect(linha).toContainText("150,00")
    await linha.getByRole("button", { name: "Estornar" }).click()
    const est = page.getByRole("dialog", { name: /Estornar recebimento/ })
    await est.getByRole("button", { name: "Confirmar estorno" }).click()
    await expect(est).toBeHidden()
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Recebimento estornado" })).toBeVisible()
    h = await ledger(t.id)
    expect(h.map((e) => e.tipo)).toEqual(["pagamento", "pagamento", "estorno_pagamento"])
    expect(h[2]).toMatchObject({ valor: 50, refHistoricoIndex: 1 })
    const tituloDepois = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })
    expect(tituloDepois.status).not.toBe("pago")
    const estCaixa = await prisma.caixaOperacao.findMany({ where: { storeId, tipo: "estorno_recebimento_cr", sessaoId: sessao.id } })
    expect(estCaixa).toHaveLength(1)
    expect(estCaixa[0]!.valor).toBe(50)
    expect((estCaixa[0]!.payload as Record<string, unknown>).refCaixaOperacaoId).toBe(recCaixa[1]!.id)
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId, referenciaId: t.id }, orderBy: { createdAt: "asc" } })
    expect(movs.map((x) => [x.tipo, x.valor])).toEqual([["entrada", 100], ["entrada", 50], ["saida", 50]])
    await expect(linha).toContainText("100,00")
    await page.screenshot({ path: test.info().outputPath("1-hub-apos-estorno.png") })

    // ── E. 2ª via: estornado bloqueado, válido liberado (sem nova baixa) ──────────
    const movAntes = await prisma.movimentacaoFinanceira.count({ where: { storeId } })
    const r1 = await page.request.get(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(t.localKey!)}&index=1`, { headers: { "x-assistec-loja-id": storeId } })
    expect(r1.status()).toBe(409)
    const r0 = await page.request.get(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(t.localKey!)}&index=0`, { headers: { "x-assistec-loja-id": storeId } })
    expect(r0.status()).toBe(200)
    await linha.getByRole("button", { name: "Comprovantes de recebimento" }).click()
    const sv = page.getByRole("dialog", { name: /Comprovantes de recebimento/ })
    await expect(sv.getByText(/estornado/i).first()).toBeVisible()
    const botoes = sv.getByRole("button", { name: /Reimprimir/ })
    await expect(botoes).toHaveCount(2)
    const estados = await Promise.all([0, 1].map((i) => botoes.nth(i).isEnabled()))
    expect(estados.filter(Boolean)).toHaveLength(1)
    await page.screenshot({ path: test.info().outputPath("2-hub-comprovantes-estornado-bloqueado.png") })
    await botoes.nth(estados.indexOf(true)).click()
    await expect.poll(async () => (await impressos(page)).length).toBe(1)
    const via = (await impressos(page))[0]!
    expect(via).toContain("2ª VIA — REIMPRESSÃO")
    expect(via).toContain("100,00")
    expect(via).not.toMatch(/\b50,00\b.*recebido agora/i)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId } })).toBe(movAntes)
    expect(await ledger(t.id)).toHaveLength(3)
    await page.keyboard.press("Escape")

    // ── B. Relatório Geral: API (delta do dia) e tela ─────────────────────────────
    const depois = await relatorioGeral(page, storeId)
    const delta = (re: RegExp) => (metrica(depois, re)?.value ?? 0) - (metrica(antes, re)?.value ?? 0)
    const linhaSecao = (rep: Report, sec: string, id: (s: string) => boolean, campo: "valor" | "registros") =>
      (rep.sections?.find((s) => s.key === sec)?.rows ?? []).filter((r) => id(String(r.id))).reduce((a, r) => a + (typeof r[campo] === "number" ? (r[campo] as number) : 0), 0)
    const dLinha = (sec: string, id: (s: string) => boolean, campo: "valor" | "registros") => linhaSecao(depois, sec, id, campo) - linhaSecao(antes, sec, id, campo)
    const ehRecebimento = (s: string) => s.startsWith("receber:")
    const ehEstorno = (s: string) => s === "estorno_recebimento"
    const deltas = {
      recebimentosValor: dLinha("recebimentos", ehRecebimento, "valor"),
      recebimentosQtd: dLinha("recebimentos", ehRecebimento, "registros"),
      estornosValor: dLinha("recebimentos", ehEstorno, "valor"),
      estornosQtd: dLinha("recebimentos", ehEstorno, "registros"),
      recebimentosLiquidos: delta(/^Recebimentos líquidos$/),
      caixaSessoes: dLinha("conferencia", (s) => s === "caixa", "valor"),
      ledgerTitulos: dLinha("conferencia", (s) => s === "caixaLedger", "valor"),
      divergencias: delta(/^Verificações com pendência$/),
    }
    test.info().annotations.push({ type: "relatorio-geral-deltas", description: JSON.stringify(deltas) })
    expect(deltas.recebimentosValor).toBeCloseTo(150, 2)
    expect(deltas.recebimentosQtd).toBe(2)
    expect(deltas.estornosValor).toBeCloseTo(-50, 2)
    expect(deltas.estornosQtd).toBe(1)
    expect(deltas.recebimentosLiquidos).toBeCloseTo(100, 2)
    expect(deltas.caixaSessoes).toBeCloseTo(100, 2) // caixa líquido: 150 recebidos − 50 compensados
    expect(deltas.ledgerTitulos).toBeCloseTo(100, 2)
    expect(deltas.divergencias).toBe(0)
    const det = await relatorioGeral(page, storeId, { q: t.id })
    test.info().annotations.push({ type: "relatorio-geral-detalhe", description: JSON.stringify(det.rows).slice(0, 1500) })

    await page.goto("/dashboard/relatorios/geral")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText("Consultando dados persistidos da loja…")).toHaveCount(0, { timeout: 60_000 })
    const blocoRec = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recebimentos efetivos", exact: true }) })
    const liq = metrica(depois, /^Recebimentos líquidos$/)!
    await expect(blocoRec.locator("dt", { hasText: /^Recebimentos líquidos$/ }).locator("xpath=following-sibling::dd[1]")).toContainText(brl(liq.value ?? 0))
    const estUi = linhaSecao(depois, "recebimentos", ehEstorno, "valor")
    await expect(blocoRec.getByRole("row", { name: /Estornos de recebimento/ })).toContainText(brl(Math.abs(estUi)))
    await blocoRec.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath("3a-relatorio-geral-recebimentos.png") })
    await page.getByPlaceholder("Pedido, ID do título ou movimento").fill(t.id)
    await page.getByRole("button", { name: "Aplicar filtros" }).click()
    await expect(page.getByText("Consultando dados persistidos da loja…")).toHaveCount(0, { timeout: 60_000 })
    const tabela = page.getByRole("region", { name: "Detalhamento dos registros" }).or(page.locator('section[aria-label="Detalhamento dos registros"]')).first()
    await expect(tabela).toContainText(`${det.total.toLocaleString("pt-BR")} registros`)
    await page.screenshot({ path: test.info().outputPath("3-relatorio-geral.png"), fullPage: true })

    // ── A. Fechamento de Caixa pela tela ─────────────────────────────────────────
    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)
    await entrarNoTerminal(page)
    await expect(page.getByText("Caixa Aberto", { exact: false }).first()).toBeVisible({ timeout: 30_000 })
    // Resumo protegido: o supervisor libera com o PIN; só então "Fechar Caixa" aparece.
    await page.getByRole("button", { name: /Resumo do Caixa/i }).first().click()
    // Loja com conta de administradora (Caixa Seguro): confirma a senha da própria conta.
    // Sessão de supervisor legado: PIN sintético.
    const gate = page.getByRole("dialog", { name: /Resumo do Caixa protegido/ })
    await expect(gate).toBeVisible({ timeout: 15_000 })
    const senhaConta = gate.getByLabel("Senha da administradora")
    if (await senhaConta.isVisible().catch(() => false)) {
      await senhaConta.fill((process.env.PLAYWRIGHT_E2E_PASSWORD ?? "").trim())
      await gate.getByRole("button", { name: "Liberar" }).click()
    } else {
      expect(pin.length, "E2E_SUPERVISOR_PIN sintético no .env local").toBeGreaterThanOrEqual(6)
      await gate.getByPlaceholder("PIN").fill(pin)
      await gate.getByRole("button", { name: /Autorizar/ }).click()
    }
    await expect(gate).toBeHidden({ timeout: 15_000 })
    await page.screenshot({ path: test.info().outputPath("4a-resumo-liberado.png") })
    await page.getByRole("button", { name: /Fechar Caixa/i }).first().click()
    const fech = page.getByRole("dialog", { name: /Fechamento de Caixa/ })
    await expect(fech).toBeVisible({ timeout: 20_000 })
    const recebido = fech.locator('section[aria-label="Recebido na sessão"]')
    await expect(recebido).toContainText("100,00", { timeout: 30_000 })
    await expect(fech.getByText("Atualizando recebimentos…")).toHaveCount(0, { timeout: 30_000 })
    await expect(fech).toContainText("Contas recebidas")
    await expect(fech).toContainText("Estornos de recebimento")
    await expect(fech.getByText(/Contas recebidas/).first().locator("xpath=ancestor::*[self::li or self::div][1]")).toContainText("150,00")
    await expect(fech.getByText(/Estornos de recebimento/).first().locator("xpath=ancestor::*[self::li or self::div][1]")).toContainText("50,00")
    await fech.getByLabel("Dinheiro contado na gaveta").fill("100")
    await page.screenshot({ path: test.info().outputPath("4-fechamento-caixa.png") })
    await fech.getByRole("button", { name: "Confirmar Fechamento" }).click()
    await expect(page.getByText("Caixa fechado").first()).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: test.info().outputPath("5-pos-fechamento.png") })
    const fechada = await prisma.sessaoCaixa.findUniqueOrThrow({ where: { id: sessao.id } })
    expect(fechada.status).toBe("FECHADA")
    expect(fechada.saldoContado).toBe(100)
    const resumo = ((fechada.payload ?? {}) as Record<string, unknown>).resumoFechamento as Record<string, unknown> | undefined
    test.info().annotations.push({ type: "resumo-fechamento", description: JSON.stringify({ saldoFinal: fechada.saldoFinal, saldoContado: fechada.saldoContado, recebidoPorOrigem: resumo?.recebidoPorOrigem, gavetaDinheiro: resumo?.gavetaDinheiro }) })
    expect(resumo?.recebidoPorOrigem).toMatchObject({ contasRecebidas: 150, estornosRecebimento: 50 })

    // ── J (tela). Estorno do pagamento restante com o caixa da operação fechado ──
    await abrirAReceber(page)
    const linha2 = page.getByRole("row", { name: new RegExp(`Crediário Aceite ${m}`) })
    await linha2.getByRole("button", { name: "Estornar" }).click()
    const patch = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === "/api/financeiro/receber")
    await page.getByRole("dialog", { name: /Estornar recebimento/ }).getByRole("button", { name: "Confirmar estorno" }).click()
    const resp = await patch
    const corpo = await resp.text()
    test.info().annotations.push({ type: "estorno-caixa-fechado", description: `${resp.status()} ${corpo.slice(0, 400)}` })
    expect(resp.status()).toBe(409)
    expect(corpo).toMatch(/caixa_sessao_fechada|caixa que já foi fechado/)
    const avisos = page.locator("[data-sonner-toast]")
    // A recusa precisa chegar ao operador (antes do Toaster no HUB, o modal ficava aberto sem aviso).
    await expect.poll(async () => (await avisos.allTextContents()).join(" | "), { timeout: 10_000 }).toMatch(/caixa que já foi fechado/)
    test.info().annotations.push({ type: "estorno-caixa-fechado-aviso", description: (await avisos.allTextContents()).join(" | ") })
    await page.screenshot({ path: test.info().outputPath("6-estorno-recusado-caixa-fechado.png") })
    expect(await ledger(t.id)).toHaveLength(3)
    expect(await prisma.caixaOperacao.count({ where: { storeId, tipo: "estorno_recebimento_cr", sessaoId: sessao.id } })).toBe(1)
  } finally {
    await prisma.$disconnect()
  }
})

test("Aceite 002 — terminal ocupado por outro computador: supervisor assume pelo fluxo real", async ({ page, browser }) => {
  test.setTimeout(180_000)
  const boasVindas = async (p: Page) =>
    p.addLocatorHandler(p.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
      await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
    })
  await boasVindas(page)
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  // Outro computador: contexto próprio (deviceId próprio), mesma conta, PDV aberto e batendo heartbeat.
  const outro = await browser.newContext({ storageState: test.info().project.use.storageState as string, serviceWorkers: "block" })
  try {
    const ativos = await prisma.pdvTerminal.findMany({ where: { storeId: LOJA, status: "ACTIVE" } })
    expect(ativos, "a loja QA tem um terminal ativo só: o seletor precisa mostrar o ocupado").toHaveLength(1)
    const terminal = ativos[0]!
    expect(terminalDoTeste1 === null || terminalDoTeste1 === terminal.id).toBe(true)

    const pc2 = await outro.newPage()
    await boasVindas(pc2)
    await pc2.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(pc2)
    await entrarNoTerminal(pc2)
    await expect.poll(async () => (await prisma.pdvTerminal.findUniqueOrThrow({ where: { id: terminal.id } })).lockedByDeviceId, { timeout: 20_000 }).toBeTruthy()
    const deviceOutro = (await prisma.pdvTerminal.findUniqueOrThrow({ where: { id: terminal.id } })).lockedByDeviceId

    // Este computador encontra o terminal "Em uso" (heartbeat fresco) e o supervisor assume.
    await page.goto("/dashboard/vendas")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByRole("button", { name: "Em uso", exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: test.info().outputPath("7-terminal-ocupado.png") })
    expect(await entrarNoTerminal(page, { esperarOcupado: true })).toBe("assumido")
    const depois = await prisma.pdvTerminal.findUniqueOrThrow({ where: { id: terminal.id } })
    expect(depois.lockedByDeviceId).toBeTruthy()
    expect(depois.lockedByDeviceId).not.toBe(deviceOutro)
    await expect(page.getByPlaceholder(/Código \/ Bipe|Buscar produto|Digite produto|código/i)).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: test.info().outputPath("8-terminal-assumido.png") })
  } finally {
    await outro.close()
    await prisma.$disconnect()
  }
})
