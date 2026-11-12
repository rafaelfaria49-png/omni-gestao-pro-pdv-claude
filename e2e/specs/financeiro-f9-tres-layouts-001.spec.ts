import { expect, test, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { dismissFirstAccessWizardIfPresent, selecionarTerminalSeSolicitado } from "../helpers"
import { bancoDescartavel, capturarImpressao, cupomEmMidiaPrint, definirLayout, impressos, lojaAtiva, type Hist, type Layout } from "../fixtures/recebimentos-qa"

/**
 * OMNI-FINANCEIRO-F9-HUB-HOMOLOGACAO-FINAL-001 — F9 (Recebimento de Contas) nos TRÊS
 * layouts do PDV, na app real (build local + `next start`, NextAuth real).
 *
 * Só PostgreSQL LOCAL DESCARTÁVEL (`fin_receb_f9_qa*`) com massa sintética
 * (`test/fin-receb-f9-print/qa-bootstrap.mjs`). Toda asserção financeira confere o BANCO
 * (ledger `payload.historico`, `caixa_operacoes`, `movimentacoes_financeiras`) — o texto
 * da tela é só o que o operador vê. Nenhuma resposta financeira de SUCESSO é simulada:
 * as interceptações abaixo só derrubam a rede, perdem a resposta (o servidor grava de
 * verdade) ou devolvem um 403 de recusa.
 *
 * Impressão: `window.print` vira registrador (captura o HTML de `#recibo-print-mount` no
 * instante da impressão) e o cupom é renderizado em mídia `print` pelo Chromium
 * (`page.pdf`, respeitando o `@page size` do cupom). Isso é spooler simulado — NÃO é
 * prova de impressão física.
 */


const LAYOUTS: Array<{
  id: Layout
  nome: string
  bobina: "58mm" | "80mm"
  forma: { rotulo: RegExp; id: string; cupom: RegExp }
  /** Campo de bipe do layout — prova de que a superfície certa montou. */
  marca: RegExp
}> = [
  { id: "classic", nome: "Clássico", bobina: "80mm", forma: { rotulo: /^Dinheiro$/i, id: "dinheiro", cupom: /Dinheiro/i }, marca: /Código \/ Bipe|Buscar produto|código/i },
  { id: "assistencia", nome: "Assistência", bobina: "58mm", forma: { rotulo: /^PIX$/i, id: "pix", cupom: /PIX/ }, marca: /Bipe o produto ou busque/i },
  { id: "supermercado", nome: "Supermercado", bobina: "80mm", forma: { rotulo: /^PIX$/i, id: "pix", cupom: /PIX/ }, marca: /Digite produto, categoria ou escaneie/i },
]

const LOJA_QA_NOME = "Loja QA Recebimentos F9"
const CLIENTE_OUTRA_LOJA = "Cliente Outra Loja QA"

/** CPF sintético com DV válido a partir de 9 dígitos. */
function cpfSintetico(base9: string): string {
  const d = base9.split("").map(Number)
  const dv = (arr: number[]) => {
    const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  d.push(dv(d))
  d.push(dv(d))
  return d.join("")
}

/** Dígitos determinísticos (sem `Math.random`) a partir do marcador da execução. */
function digitos(m: string, n: number): string {
  let h = 0
  for (const ch of m) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return String(h).padStart(n, "7").slice(-n)
}

/**
 * Caixa sintético. A sessão é POR TERMINAL: o PDV procura a sessão aberta do terminal que
 * ESTE navegador escolheu (`@omnigestao:pdv-terminal:{loja}`), que pode não ser o PDV1 —
 * um terminal ainda travado por outro contexto aparece como "Assumir", não "Usar".
 */
async function caixa(prisma: PrismaClient, storeId: string, terminalId: string | null) {
  await prisma.sessaoCaixa.updateMany({ where: { storeId, status: "ABERTA" }, data: { status: "FECHADA", fechadaEm: new Date() } })
  if (!terminalId) return
  await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA E2E", status: "ABERTA", terminalId } })
}

async function terminalDoNavegador(page: Page, storeId: string): Promise<string> {
  const raw = await page.evaluate((sid) => localStorage.getItem(`@omnigestao:pdv-terminal:${sid}`), storeId)
  const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined
  if (!id) throw new Error("Nenhum terminal selecionado neste navegador.")
  return id
}

const historico = async (prisma: PrismaClient, id: string) =>
  ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id } })).payload as { historico: Hist }).historico

/** Abre o PDV no layout pedido, escolhe o terminal e devolve o diálogo do F9 (fechado). */
async function abrirPdv(page: Page, marca: RegExp, verificarTerminal = true) {
  await page.goto("/dashboard/vendas")
  await dismissFirstAccessWizardIfPresent(page)
  const dialog = page.getByRole("dialog", { name: /Receber conta/ })
  if (verificarTerminal) {
    // Terminal não selecionado: a tela é a escolha de terminal — F9 não abre recebimento.
    await expect(page.getByText("Selecionar Terminal", { exact: true })).toBeVisible({ timeout: 45_000 })
    await page.locator("body").press("F9")
    await page.waitForTimeout(800)
    await expect(dialog).toHaveCount(0)
  }
  await selecionarTerminalSeSolicitado(page)
  await expect(page.getByPlaceholder(marca).first()).toBeVisible({ timeout: 45_000 })
  await page.waitForLoadState("networkidle").catch(() => undefined)
  return dialog
}

async function abrirF9(page: Page) {
  const dialog = page.getByRole("dialog", { name: /Receber conta/ })
  const toasts: string[] = []
  try {
    await expect
      .poll(async () => {
        if (!(await dialog.isVisible().catch(() => false))) {
          await page.locator("body").press("F9")
          toasts.push(...(await page.locator("[data-sonner-toast], [role='status'], li[role='status']").allTextContents().catch(() => [])))
        }
        return dialog.isVisible()
      }, { timeout: 45_000, intervals: [1_000, 2_000, 3_000] })
      .toBe(true)
  } catch (e) {
    const foco = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 200) ?? "none")
    throw new Error(`F9 não abriu o recebimento. Foco: ${foco}. Avisos: ${[...new Set(toasts)].join(" | ")}\n${e}`)
  }
  await expect(dialog.getByLabel(/Cliente \(nome, telefone ou CPF\)/)).toBeFocused({ timeout: 10_000 })
  return dialog
}

async function buscar(page: Page, termo: string) {
  const dialog = page.getByRole("dialog", { name: /Receber conta/ })
  const campo = dialog.getByLabel(/Cliente \(nome, telefone ou CPF\)/)
  await campo.fill("")
  const req = page.waitForRequest((r) => r.url().endsWith("/api/clientes/search") && r.method() === "POST")
  const resp = page.waitForResponse((r) => r.url().endsWith("/api/clientes/search") && r.request().method() === "POST")
  await campo.fill(termo)
  expect((await req).postDataJSON()).toEqual({ q: termo })
  expect((await resp).status()).toBe(200)
}

async function escolherForma(page: Page, rotulo: RegExp) {
  const dialog = page.getByRole("dialog", { name: /Receber conta/ })
  await dialog.locator("#pdv-receber-forma").click()
  await page.getByRole("option", { name: rotulo }).click()
}

test.describe.configure({ mode: "serial" })
// Os testes trocam o layout e a bobina da loja QA; os demais E2E (smoke 02) pressupõem o padrão.
test.afterAll(async () => {
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  try {
    await definirLayout(prisma, "000-qa-fin-f9", "classic", "80mm")
  } finally {
    await prisma.$disconnect()
  }
})
// O service worker do PWA intercepta /api/* e as respostas deixam de ser observáveis.
test.use({ serviceWorkers: "block" })

for (const L of LAYOUTS) {
  test(`F9 ${L.nome} — caixa fechado, terminal, lista, busca nome/telefone/CPF, parcial, cupom ${L.bobina}, 2ª via e foco`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
      await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
    })
    const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
    const m = `${L.id.slice(0, 3)}${Date.now().toString(36)}`
    try {
      await page.goto("/dashboard")
      await dismissFirstAccessWizardIfPresent(page)
      const storeId = await lojaAtiva(page)
      await definirLayout(prisma, storeId, L.id, L.bobina)

      const fone = `119${digitos(m, 8)}`
      const cpf = cpfSintetico(digitos(m + "cpf", 9))
      const cli = await prisma.cliente.create({ data: { storeId, name: `Cliente ${L.nome} ${m}`, phone: fone, document: cpf } })
      const t = await prisma.contaReceberTitulo.create({
        data: {
          storeId, localKey: `receber:e2e-3l:${m}`, descricao: `Crediário ${L.nome} ${m}`, cliente: cli.name,
          valor: 1234.56, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
        },
      })

      // ── Caixa FECHADO: F9 não deixa gravar nada ───────────────────────────────
      await caixa(prisma, storeId, null)
      const dialog = await abrirPdv(page, L.marca)
      for (let i = 0; i < 3; i++) {
        await page.locator("body").press("F9")
        await page.waitForTimeout(700)
      }
      await expect(dialog.getByRole("button", { name: /Gravar R\$/ })).toHaveCount(0)
      await expect(dialog).toBeHidden({ timeout: 15_000 })
      expect(await historico(prisma, t.id)).toHaveLength(0)
      await page.screenshot({ path: test.info().outputPath(`${L.id}-0-caixa-fechado.png`) })

      // ── Caixa ABERTO ──────────────────────────────────────────────────────────
      await caixa(prisma, storeId, await terminalDoNavegador(page, storeId))
      await abrirPdv(page, L.marca, false)
      await capturarImpressao(page)
      await abrirF9(page)

      // Lista inicial de devedores: o cliente aparece com contato mascarado; outra loja não.
      await expect(dialog.getByText("Clientes com contas em aberto")).toBeVisible()
      const linhaLista = dialog.getByRole("button", { name: new RegExp(cli.name) })
      await expect(linhaLista).toBeVisible()
      await expect(linhaLista).toContainText("•••")
      await expect(linhaLista).not.toContainText(fone)
      await expect(linhaLista).not.toContainText(cpf)
      await expect(dialog.getByRole("button", { name: new RegExp(CLIENTE_OUTRA_LOJA) })).toHaveCount(0)
      await page.screenshot({ path: test.info().outputPath(`${L.id}-1-lista-inicial.png`) })

      // Busca real (POST /api/clientes/search) por nome, telefone e CPF.
      for (const termo of [cli.name, fone.slice(-6), cpf]) {
        await buscar(page, termo)
        await expect(dialog.getByRole("button", { name: new RegExp(cli.name) })).toBeVisible()
      }
      await buscar(page, CLIENTE_OUTRA_LOJA)
      await expect(dialog.getByText(/Nenhum cliente encontrado/)).toBeVisible()

      // Seleção, parcial, forma e gravação (clique duplo = uma baixa).
      await buscar(page, cpf)
      await dialog.getByRole("button", { name: new RegExp(cli.name) }).click()
      await dialog.getByLabel(`Selecionar ${t.descricao}`).click()
      await dialog.getByRole("checkbox", { name: "Informar valor parcial por título" }).click()
      await dialog.locator(`[id="parcial-${t.localKey}"]`).fill("45,50")
      await escolherForma(page, L.forma.rotulo)
      await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
      await dialog.getByRole("button", { name: /Gravar R\$\s?45,50/ }).dblclick()
      await expect(dialog.getByText("Recebimento confirmado")).toBeVisible()
      await expect(dialog.getByText(/abatido — resta R\$\s?1\.189,06/)).toBeVisible()
      await page.screenshot({ path: test.info().outputPath(`${L.id}-2-sucesso.png`) })

      // Banco: UMA baixa parcial com a forma escolhida, título parcial, 1 operação de caixa.
      const h = await historico(prisma, t.id)
      expect(h).toHaveLength(1)
      expect(h[0]).toMatchObject({ tipo: "pagamento", valor: 45.5, formaPagamento: L.forma.id })
      expect(h[0]!.loteId).toBeTruthy()
      expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("parcial")
      const opsCaixa = () =>
        prisma.caixaOperacao.count({ where: { storeId, tipo: "recebimento_cr", payload: { path: ["itens", "0", "localKey"], equals: t.localKey! } } })
      expect(await opsCaixa()).toBe(1)
      const movs = () => prisma.movimentacaoFinanceira.count({ where: { storeId } })
      const movAntes = await movs()

      // Comprovante não fiscal: impressão automática (crediário ligado) + reimpressão.
      await expect.poll(async () => (await impressos(page)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
      const reimpr = dialog.getByRole("button", { name: /Reimprimir comprovante/ })
      await expect(reimpr).toBeVisible()
      const antes = (await impressos(page)).length
      await reimpr.click()
      await expect.poll(async () => (await impressos(page)).length).toBe(antes + 1)
      const cupom = (await impressos(page)).at(-1)!
      for (const tx of ["COMPROVANTE NÃO FISCAL", LOJA_QA_NOME, cli.name, t.descricao, "45,50", "1.189,06"]) expect(cupom).toContain(tx)
      expect(cupom).toMatch(L.forma.cupom)
      expect(cupom).toMatch(/\d{2}\/\d{2}\/\d{4}/)
      expect(cupom).toContain(h[0]!.loteId!.slice(0, 8))
      for (const fixo of ["Banco Inter", "plena quitação", "undefined", "NaN"]) expect(cupom).not.toContain(fixo)

      // Reimpressão não é operação financeira.
      expect(await historico(prisma, t.id)).toHaveLength(1)
      expect(await opsCaixa()).toBe(1)
      expect(await movs()).toBe(movAntes)

      // Fechar: modal some, foco volta ao PDV e o atalho continua vivo.
      await dialog.getByRole("button", { name: /^Concluir/ }).click()
      await expect(dialog).toBeHidden()
      await expect
        .poll(() => page.evaluate(() => {
          const a = document.activeElement
          return !a || !a.closest('[role="dialog"]')
        }))
        .toBe(true)
      const foco = await page.evaluate(() => {
        const a = document.activeElement as HTMLInputElement | null
        return a ? `${a.tagName}${a.placeholder ? `[${a.placeholder}]` : ""}` : "none"
      })
      test.info().annotations.push({ type: "foco-apos-fechar", description: foco })
      await abrirF9(page) // atalho F9 reabre (keymap do PDV intacto)
      await page.keyboard.press("Escape")
      await expect(dialog).toBeHidden()
      if (L.id !== "supermercado") {
        // F2 = busca de cliente do PDV (no Supermercado F2 é pagamento rápido e exige carrinho).
        await page.locator("body").press("F2")
        await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 10_000 })
        await page.keyboard.press("Escape")
      }
      expect(await historico(prisma, t.id)).toHaveLength(1)

      // Cupom em mídia print (spooler simulado): página com a largura da bobina e nada
      // passando da largura útil. `size: 80mm auto` seria descartado (Letter 215,9 mm).
      expect(cupom).toMatch(new RegExp(`size: ${Number.parseInt(L.bobina, 10)}mm \\d+mm`))
      const render = await cupomEmMidiaPrint(page, cupom, `${L.id}-3-cupom-${L.bobina}.pdf`)
      test.info().annotations.push({ type: "cupom-pdf", description: `${render.larguraMm.toFixed(1)}mm, ${render.paginas} página(s), estouro ${render.estouro}px` })
      expect(Math.abs(render.larguraMm - Number.parseInt(L.bobina, 10))).toBeLessThan(1)
      expect(render.estouro).toBeLessThanOrEqual(0)
      expect(render.paginas).toBe(1)
    } finally {
      await prisma.$disconnect()
    }
  })

  test(`F9 ${L.nome} — rede caída, resposta perdida, 403, 409 real, sem títulos, homônimos e outra loja`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
      await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
    })
    const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
    const m = `${L.id.slice(0, 3)}b${Date.now().toString(36)}`
    try {
      await page.goto("/dashboard")
      await dismissFirstAccessWizardIfPresent(page)
      const storeId = await lojaAtiva(page)
      await definirLayout(prisma, storeId, L.id, L.bobina)

      const novoTitulo = (cliente: { id: string; name: string }, n: string, valor: number) =>
        prisma.contaReceberTitulo.create({
          data: {
            storeId, localKey: `receber:e2e-3lb:${m}:${n}`, descricao: `Título ${n} ${m}`, cliente: cliente.name,
            valor, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cliente.id, historico: [] },
          },
        })
      const cli = await prisma.cliente.create({ data: { storeId, name: `Borda ${L.nome} ${m}`, phone: `118${digitos(m, 8)}` } })
      const [e1, e2, e3] = [await novoTitulo(cli, "E1", 100), await novoTitulo(cli, "E2", 50), await novoTitulo(cli, "E3", 70)]
      const semTitulo = await prisma.cliente.create({ data: { storeId, name: `Sem Título ${m}`, phone: `117${digitos(m + "s", 8)}` } })
      const homonimo = `Homônimo ${m}`
      const h1 = await prisma.cliente.create({ data: { storeId, name: homonimo, phone: `116${digitos(m + "h1", 8)}` } })
      const h2 = await prisma.cliente.create({ data: { storeId, name: homonimo, phone: `115${digitos(m + "h2", 8)}` } })
      const th1 = await novoTitulo(h1, "H1", 30)
      const th2 = await novoTitulo(h2, "H2", 40)

      await abrirPdv(page, L.marca, false)
      await caixa(prisma, storeId, await terminalDoNavegador(page, storeId))
      const dialog = await abrirPdv(page, L.marca, false)
      await abrirF9(page)

      // Outra loja: nem na lista, nem na busca.
      await expect(dialog.getByRole("button", { name: new RegExp(CLIENTE_OUTRA_LOJA) })).toHaveCount(0)
      await buscar(page, CLIENTE_OUTRA_LOJA)
      await expect(dialog.getByText(/Nenhum cliente encontrado/)).toBeVisible()

      // Cliente sem títulos: encontrado, mas nada para receber.
      await buscar(page, semTitulo.name)
      const linhaSem = dialog.getByRole("button", { name: new RegExp(semTitulo.name) })
      await expect(linhaSem).toContainText("sem títulos em aberto")
      await linhaSem.click()
      await expect(dialog.getByLabel(/^Selecionar /)).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: /Receber \d+ títulos?/ })).toHaveCount(0)
      await dialog.getByRole("button", { name: "Trocar cliente" }).click()

      // Homônimos: dois cadastros, cada um só com o próprio título.
      await buscar(page, homonimo)
      const linhasHom = dialog.getByRole("button", { name: new RegExp(homonimo) })
      await expect(linhasHom).toHaveCount(2)
      await linhasHom.filter({ hasText: h2.phone!.slice(-4) }).click()
      await expect(dialog.getByLabel(`Selecionar ${th2.descricao}`)).toBeVisible()
      await expect(dialog.getByLabel(`Selecionar ${th1.descricao}`)).toHaveCount(0)
      await dialog.getByRole("button", { name: "Trocar cliente" }).click()

      await buscar(page, cli.name)
      await dialog.getByRole("button", { name: new RegExp(cli.name) }).click()
      await escolherForma(page, /^PIX$/i)

      const gravar = async (descricao: string, valor: RegExp) => {
        await dialog.getByLabel(`Selecionar ${descricao}`).check()
        await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
        await dialog.getByRole("button", { name: valor }).click()
      }
      const rota = "**/api/pdv/receber-conta-lote"

      // ── 1. Rede caída ANTES do servidor: nada gravado; retry com a mesma chave grava UMA vez.
      await page.route(rota, (r) => r.abort("internetdisconnected"))
      await gravar(e1.descricao, /Gravar R\$\s?100,00/)
      await expect(dialog.getByText(/Não deu para confirmar o recebimento/)).toBeVisible()
      expect(await historico(prisma, e1.id)).toHaveLength(0)
      await page.unroute(rota)
      await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
      await dialog.getByRole("button", { name: /Gravar R\$\s?100,00/ }).click()
      await expect(dialog.getByText("Recebimento confirmado")).toBeVisible()
      expect(await historico(prisma, e1.id)).toHaveLength(1)
      await dialog.getByRole("button", { name: "Ver títulos" }).click()

      // ── 2. Resposta PERDIDA: o servidor grava, o navegador não sabe; o retry vira replay.
      let perdidas = 0
      await page.route(rota, async (r) => {
        if (perdidas === 0) {
          perdidas++
          const resp = await r.fetch() // chega ao servidor de verdade
          expect(resp.status()).toBe(200)
          await r.abort("connectionreset")
          return
        }
        await r.continue()
      })
      await gravar(e2.descricao, /Gravar R\$\s?50,00/)
      await expect(dialog.getByText(/Não deu para confirmar o recebimento/)).toBeVisible()
      expect(await historico(prisma, e2.id)).toHaveLength(1) // gravado no servidor
      await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
      await dialog.getByRole("button", { name: /Gravar R\$\s?50,00/ }).click()
      await expect(dialog.getByText("Recebimento já estava registrado")).toBeVisible()
      const hE2 = await historico(prisma, e2.id)
      expect(hE2).toHaveLength(1)
      expect(
        await prisma.caixaOperacao.count({ where: { storeId, tipo: "recebimento_cr", payload: { path: ["itens", "0", "localKey"], equals: e2.localKey! } } }),
      ).toBe(1)
      await page.unroute(rota)
      await dialog.getByRole("button", { name: "Ver títulos" }).click()

      // ── 3. 403 (recusa do servidor): nada de "confirmado", nada gravado.
      await page.route(rota, (r) =>
        r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sem permissão para alterar dados financeiros." }) }),
      )
      await gravar(e3.descricao, /Gravar R\$\s?70,00/)
      await expect(page.getByText("Recebimento não gravado").first()).toBeVisible()
      await expect(dialog.getByText("Recebimento confirmado")).toHaveCount(0)
      expect(await historico(prisma, e3.id)).toHaveLength(0)
      await page.unroute(rota)

      // ── 4. 409 REAL: outro terminal abate E3 enquanto este está na confirmação.
      await dialog.getByLabel(`Selecionar ${e3.descricao}`).check()
      await dialog.getByRole("button", { name: /Receber 1 título/ }).click()
      await prisma.contaReceberTitulo.update({
        where: { id: e3.id },
        data: { status: "parcial", payload: { clienteId: cli.id, historico: [{ tipo: "pagamento", valor: 10, at: new Date().toISOString(), origem: "e2e-outro-terminal" }] } },
      })
      const resp409 = page.waitForResponse((r) => r.url().includes("/api/pdv/receber-conta-lote"))
      await dialog.getByRole("button", { name: /Gravar R\$\s?70,00/ }).click()
      expect((await resp409).status()).toBe(409)
      await expect(dialog.getByText("Recebimento confirmado")).toHaveCount(0)
      const hE3 = await historico(prisma, e3.id)
      expect(hE3).toHaveLength(1)
      expect(hE3[0]).toMatchObject({ valor: 10 })
      await page.screenshot({ path: test.info().outputPath(`${L.id}-borda-409.png`) })
    } finally {
      await prisma.$disconnect()
    }
  })
}

test("API — perfil sem permissão (TÉCNICO) e loja sem vínculo recebem 403, sem nenhuma escrita", async ({ browser, page }) => {
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = `api${Date.now().toString(36)}`
  const email = (process.env.PLAYWRIGHT_E2E_EMAIL ?? "").trim().replace("@", "+tecnico@")
  const senha = (process.env.PLAYWRIGHT_E2E_PASSWORD ?? "").trim()
  try {
    await page.goto("/dashboard")
    const storeId = await lojaAtiva(page)
    const sessao = await prisma.sessaoCaixa.findFirst({ where: { storeId, status: "ABERTA" } })
    const sessaoId = sessao?.id ?? (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA E2E", status: "ABERTA" } })).id
    const cli = await prisma.cliente.create({ data: { storeId, name: `API ${m}` } })
    const t = await prisma.contaReceberTitulo.create({
      data: {
        storeId, localKey: `receber:e2e-api:${m}`, descricao: `API ${m}`, cliente: cli.name,
        valor: 20, vencimento: "2026-12-20", status: "pendente", payload: { clienteId: cli.id, historico: [] },
      },
    })
    const item = { localKey: t.localKey!, tituloId: t.id, saldoEsperado: 20, valorReceber: 20 }
    const corpoPdv = { sessaoId, formaPagamento: "pix", idempotencyKey: `api-pdv-${m}`, itens: [item] }
    const corpoHub = { formaPagamento: "pix", idempotencyKey: `api-hub-${m}`, itens: [item] }

    // TÉCNICO: login real, sem financeiro.edit nem abrirCaixa.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, serviceWorkers: "block" })
    const p2 = await ctx.newPage()
    await p2.goto("/login")
    await p2.getByLabel("Email").fill(email)
    await p2.getByRole("textbox", { name: "Senha" }).fill(senha)
    await Promise.all([p2.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 }), p2.getByRole("button", { name: "Entrar" }).click()])
    const headers = { "content-type": "application/json", "x-assistec-loja-id": storeId }
    const rPdv = await ctx.request.post("/api/pdv/receber-conta-lote", { headers, data: corpoPdv })
    const rHub = await ctx.request.post("/api/financeiro/receber-lote", { headers, data: corpoHub })
    expect([rPdv.status(), rHub.status()]).toEqual([403, 403])
    await ctx.close()

    // ADMIN da loja QA apontando para a OUTRA loja: recusado antes de ler qualquer título.
    const outra = { "content-type": "application/json", "x-assistec-loja-id": "000-qa-fin-f9-outra" }
    const tituloOutra = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: "000-qa-fin-f9-outra", localKey: "receber:qa-outra:1" } } })
    const itemOutra = { localKey: tituloOutra.localKey!, tituloId: tituloOutra.id, saldoEsperado: 99, valorReceber: 99 }
    const rOutraPdv = await page.request.post("/api/pdv/receber-conta-lote", { headers: outra, data: { ...corpoPdv, idempotencyKey: `api-o1-${m}`, itens: [itemOutra] } })
    const rOutraHub = await page.request.post("/api/financeiro/receber-lote", { headers: outra, data: { ...corpoHub, idempotencyKey: `api-o2-${m}`, itens: [itemOutra] } })
    expect(rOutraPdv.status()).toBe(403)
    expect(rOutraHub.status()).toBe(403)
    expect(((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: tituloOutra.id } })).payload as { historico: Hist }).historico).toHaveLength(0)
    expect(await historico(prisma, t.id)).toHaveLength(0)
    const segundaViaOutra = await page.request.get(`/api/financeiro/recibo-recebimento?localKey=${encodeURIComponent(tituloOutra.localKey!)}`, { headers: outra })
    expect(segundaViaOutra.status()).toBe(403)
  } finally {
    await prisma.$disconnect()
  }
})
