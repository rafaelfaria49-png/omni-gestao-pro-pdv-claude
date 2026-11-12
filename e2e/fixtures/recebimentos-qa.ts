import { expect, test, type Page } from "@playwright/test"
import type { PrismaClient } from "../../generated/prisma"

/**
 * Massa e instrumentos dos E2E de recebimento (F9 + Financeiro HUB).
 * Só PostgreSQL LOCAL DESCARTÁVEL (`fin_receb_f9_qa*`); ver `test/fin-receb-f9-print/qa-bootstrap.mjs`.
 */

export type Hist = Array<{ tipo: string; valor: number; loteId?: string; formaPagamento?: string; refHistoricoIndex?: number }>
export type Layout = "classic" | "assistencia" | "supermercado"

export function bancoDescartavel(): string {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim())
  if (urls.some((v) => !v)) throw new Error("E2E exige DATABASE_URL e DIRECT_URL do banco local descartável.")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("E2E só em loopback.")
  if (parsed[0]!.href !== parsed[1]!.href) throw new Error("E2E exige DATABASE_URL e DIRECT_URL idênticas.")
  if (!parsed[0]!.pathname.replace(/^\//, "").startsWith("fin_receb_f9_qa")) throw new Error("E2E só no banco fin_receb_f9_qa*.")
  return urls[0]!
}

/** Substitui `window.print` por um registrador: guarda o HTML do cupom no instante da impressão. */
export async function capturarImpressao(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __prints: string[] }
    w.__prints = []
    window.print = () => {
      w.__prints.push(document.getElementById("recibo-print-mount")?.innerHTML ?? "")
    }
  })
}
export const impressos = (page: Page) => page.evaluate(() => (window as unknown as { __prints: string[] }).__prints)

/**
 * Renderiza o cupom capturado em mídia `print` (o mesmo CSS e o mesmo `@page` que o
 * navegador manda ao spooler) e devolve a largura da página do PDF em mm, além de
 * conferir que nenhuma linha passa da largura da bobina.
 */
export async function cupomEmMidiaPrint(page: Page, html: string, nome: string): Promise<{ larguraMm: number; estouro: number; paginas: number }> {
  await page.evaluate((inner) => {
    const el = document.getElementById("recibo-print-mount") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "recibo-print-mount" }))
    el.innerHTML = inner
    document.documentElement.setAttribute("data-printing-recibo", "true")
  }, html)
  await page.emulateMedia({ media: "print" })
  const estouro = await page.evaluate(() => {
    const root = document.querySelector("#recibo-print-mount .recibo-thermal") as HTMLElement | null
    if (!root) return -1
    let pior = 0
    root.querySelectorAll("*").forEach((n) => {
      const e = n as HTMLElement
      pior = Math.max(pior, e.scrollWidth - e.clientWidth)
    })
    return Math.max(pior, root.scrollWidth - root.clientWidth)
  })
  const pdf = await page.pdf({ path: test.info().outputPath(nome), preferCSSPageSize: true, printBackground: true })
  await page.emulateMedia({ media: null })
  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-printing-recibo")
    const el = document.getElementById("recibo-print-mount")
    if (el) el.innerHTML = ""
  })
  const caixa = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+[\d.]+\s*\]/.exec(pdf.toString("latin1"))
  const larguraMm = caixa ? (Number(caixa[1]) / 72) * 25.4 : NaN
  // Folhas em branco viram papel térmico avançado e cortado: o cupom cabe em UMA página.
  const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length
  return { larguraMm, estouro, paginas }
}

export async function definirLayout(prisma: PrismaClient, storeId: string, layout: Layout, bobina: "58mm" | "80mm") {
  const atual = await prisma.storeSettings.findUnique({ where: { storeId } })
  const base = (atual?.printerConfig && typeof atual.printerConfig === "object" ? atual.printerConfig : {}) as Record<string, unknown>
  const pdvParams = (base.pdvParams && typeof base.pdvParams === "object" ? base.pdvParams : {}) as Record<string, unknown>
  const impressao = (base.impressao && typeof base.impressao === "object" ? base.impressao : {}) as Record<string, unknown>
  const main = layout === "supermercado" ? "supermercado" : "classic"
  const printerConfig = {
    ...base,
    pdvMainLayout: main,
    v3PdvSectionCard: main,
    pdvParams: { ...pdvParams, pdvClassicLayout: layout === "assistencia" ? "services" : "lovable" },
    impressao: { ...impressao, bobinaTamanho: bobina, imprimirCrediario: true },
  }
  await prisma.storeSettings.upsert({ where: { storeId }, update: { printerConfig }, create: { storeId, printerConfig } })
}

export async function lojaAtiva(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1"))).toBeTruthy()
  return (await page.evaluate(() => localStorage.getItem("assistec-pro-loja-ativa-v1")))!
}
