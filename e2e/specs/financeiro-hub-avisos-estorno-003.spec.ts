import { expect, test, type Page } from "@playwright/test"
import { PrismaClient } from "../../generated/prisma"
import { dismissFirstAccessWizardIfPresent } from "../helpers"

/**
 * FINANCEIRO-HUB-TOASTER-FIX-003 — o Financeiro HUB precisa MOSTRAR o resultado do estorno.
 *
 * O wrapper isolado não monta o `__root.tsx` (onde fica o Toaster do `sonner`), então
 * "Recebimento estornado" e toda recusa do servidor sumiam: o modal ficava aberto sem
 * explicação. App real (build local, NextAuth real), PostgreSQL LOCAL DESCARTÁVEL
 * `fin_receb_f9_qa*`, massa sintética.
 *
 * - Sucesso e recusa REAIS do servidor desta base.
 * - Recusas do contrato de estorno da #384 (caixa fechado, título alterado, histórico
 *   ambíguo), com os corpos exatos que a rota devolve, e queda de rede: respostas
 *   interceptadas no navegador — nada chega ao servidor, o banco não muda.
 */

const ROTA = "/api/financeiro/receber"
const SUCESSO = "Recebimento estornado"

function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim())
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL do banco local descartável.")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("E2E só em loopback.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_receb_f9_qa")) throw new Error("E2E só no banco fin_receb_f9_qa*.")
  return urls[0]!
}

const avisos = (page: Page) => page.locator("[data-sonner-toast]")

/** Foto do aviso já assentado (sem a animação de entrada) + estilo calculado e posição. */
async function fotoDoAviso(page: Page, nome: string) {
  const aviso = avisos(page).first()
  await expect.poll(async () => aviso.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 }).toBe("1")
  await page.waitForTimeout(400)
  const info = await aviso.evaluate((el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const sonda = document.createElement("div")
    sonda.style.cssText = "position:absolute;width:1px;height:1px;background:var(--popover);color:var(--popover-foreground)"
    el.parentElement!.appendChild(sonda)
    const tok = getComputedStyle(sonda)
    const tokens = { bg: tok.backgroundColor, color: tok.color }
    sonda.remove()
    return { bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, tokens, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), vh: innerHeight }
  })
  test.info().annotations.push({ type: `aviso-${nome}`, description: JSON.stringify(info) })
  expect(info.bg, "fundo do aviso = token --popover do tema ativo").toBe(info.tokens.bg)
  expect(info.color, "texto do aviso = token --popover-foreground").toBe(info.tokens.color)
  expect(info.top).toBeGreaterThanOrEqual(0) // aviso inteiro na tela, nada cortado no topo
  expect(info.bottom).toBeLessThanOrEqual(info.vh)
  await page.screenshot({ path: test.info().outputPath(`${nome}.png`) })
}

/** Recusa: aviso com a mensagem do servidor, modal continua aberto, nenhum aviso de sucesso. */
async function esperarRecusa(page: Page, mensagem: string | RegExp) {
  await expect(avisos(page).filter({ hasText: mensagem }).first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole("dialog", { name: /Estornar recebimento/ })).toBeVisible()
  await expect(avisos(page).filter({ hasText: SUCESSO })).toHaveCount(0)
}

test.use({ serviceWorkers: "block" })

test("Financeiro HUB — estorno mostra sucesso e cada recusa, sem tratar recusa como sucesso", async ({ page }) => {
  test.setTimeout(180_000)
  await page.addLocatorHandler(page.getByRole("dialog", { name: /Boas-vindas/i }), async (dlg) => {
    await dlg.getByRole("button", { name: /^Voltar depois$/i }).click()
  })
  const prisma = new PrismaClient({ datasourceUrl: bancoDescartavel() })
  const m = `av3${Date.now().toString(36)}`
  try {
    await page.goto("/dashboard")
    await dismissFirstAccessWizardIfPresent(page)
    await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBeTruthy()
    const storeId = (await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")))!
    const t = await prisma.contaReceberTitulo.create({
      data: {
        storeId, localKey: `receber:e2e-avisos:${m}`, descricao: `Título Avisos ${m}`, cliente: `Cliente Avisos ${m}`,
        valor: 300, vencimento: "2026-12-20", status: "pendente", payload: { historico: [] },
      },
    })
    // Sem nenhum pagamento: o servidor desta base recusa o estorno (recusa REAL).
    const semPagamento = await prisma.contaReceberTitulo.create({
      data: {
        storeId, localKey: `receber:e2e-avisos:${m}:sem-pagamento`, descricao: `Título Sem Pagamento ${m}`, cliente: `Cliente Avisos ${m}`,
        valor: 80, vencimento: "2026-12-20", status: "pendente", payload: { historico: [] },
      },
    })
    const pago = await page.request.patch(ROTA, {
      headers: { "x-assistec-loja-id": storeId },
      data: { lojaId: storeId, op: "parcial", localKey: t.localKey, valor: 100, formaPagamento: "pix" },
    })
    expect(pago.status(), await pago.text()).toBe(200)
    const historico = async () => ((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })).payload as { historico: unknown[] }).historico

    await page.goto("/dashboard/financeiro-v2")
    await dismissFirstAccessWizardIfPresent(page)
    await expect(page.getByRole("heading", { name: /Financeiro HUB/i })).toBeVisible({ timeout: 45_000 })
    await page.getByRole("tab", { name: /A receber/i }).click()
    const linha = page.getByRole("row", { name: new RegExp(`Título Avisos ${m}`) })
    const modal = page.getByRole("dialog", { name: /Estornar recebimento/ })
    const confirmar = () => modal.getByRole("button", { name: "Confirmar estorno" }).click()
    const abrir = async () => {
      if (!(await modal.isVisible().catch(() => false))) await linha.getByRole("button", { name: "Estornar" }).click()
      await expect(modal).toBeVisible()
    }

    // ── 1. Sucesso real ──────────────────────────────────────────────────────────
    await abrir()
    const r1 = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === ROTA)
    await confirmar()
    expect((await r1).status()).toBe(200)
    await expect(avisos(page).filter({ hasText: SUCESSO })).toBeVisible()
    await expect(modal).toBeHidden()
    await fotoDoAviso(page, "1-estorno-realizado")
    const depoisSucesso = (await historico()).length
    await expect(avisos(page).filter({ hasText: SUCESSO })).toHaveCount(0, { timeout: 15_000 })

    // ── 2. Recusa real do servidor (título sem pagamento) ──────────────────────────
    await page.getByRole("row", { name: new RegExp(`Título Sem Pagamento ${m}`) }).getByRole("button", { name: "Estornar" }).click()
    await expect(modal).toBeVisible()
    const r2 = page.waitForResponse((r) => r.request().method() === "PATCH" && new URL(r.url()).pathname === ROTA)
    await confirmar()
    const resp2 = await r2
    const corpo2 = (await resp2.json()) as { ok?: boolean; error?: string; code?: string }
    test.info().annotations.push({ type: "recusa-real", description: `${resp2.status()} ${JSON.stringify(corpo2)}` })
    expect(resp2.status()).toBeGreaterThanOrEqual(400)
    expect(corpo2.ok).toBe(false)
    await esperarRecusa(page, corpo2.error!)
    expect(((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: semPagamento.id } })).payload as { historico: unknown[] }).historico).toHaveLength(0)
    await fotoDoAviso(page, "2-recusa-real")
    await modal.getByRole("button", { name: "Cancelar" }).click()
    await expect(modal).toBeHidden()
    await expect(avisos(page)).toHaveCount(0, { timeout: 15_000 })

    // ── 3. Contrato da #384 + queda de rede (interceptados; o servidor não é chamado) ─
    const casos: Array<{ nome: string; status?: number; corpo?: Record<string, unknown>; aviso: string | RegExp }> = [
      {
        nome: "caixa-fechado", status: 409,
        corpo: { ok: false, code: "estornar_caixa_sessao_fechada", error: "Este pagamento entrou num caixa que já foi fechado. O estorno não altera sessões fechadas: registre a devolução no caixa atual (sangria/devolução) e ajuste o fechamento pelo procedimento de conciliação." },
        aviso: "entrou num caixa que já foi fechado",
      },
      {
        nome: "recebimento-alterado", status: 409,
        corpo: { ok: false, code: "estornar_titulo_alterado", error: "O título foi alterado por outra operação. Atualize e tente de novo." },
        aviso: "O título foi alterado por outra operação",
      },
      {
        nome: "historico-ambiguo", status: 409,
        corpo: { ok: false, code: "estornar_historico_ambiguo", error: "O histórico deste título tem estornos sem identificação do pagamento. Estorno bloqueado: requer conciliação manual." },
        aviso: "estornos sem identificação do pagamento",
      },
      { nome: "sem-conexao", aviso: "Sem conexão com o servidor: o estorno não foi confirmado" },
    ]
    let interceptados = 0
    for (const caso of casos) {
      await page.route(`**${ROTA}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.fallback()
        interceptados++
        if (!caso.status) return route.abort("internetdisconnected")
        return route.fulfill({ status: caso.status, contentType: "application/json", body: JSON.stringify(caso.corpo) })
      })
      await abrir()
      await confirmar()
      await esperarRecusa(page, caso.aviso)
      await fotoDoAviso(page, `3-${caso.nome}`)
      await page.unrouteAll({ behavior: "wait" })
      // Próximo caso com o aviso anterior já fora da tela: cada aviso é conferido sozinho.
      await expect(avisos(page)).toHaveCount(0, { timeout: 15_000 })
    }
    expect(interceptados).toBe(casos.length)
    expect((await historico()).length).toBe(depoisSucesso)
  } finally {
    await prisma.$disconnect()
  }
})
