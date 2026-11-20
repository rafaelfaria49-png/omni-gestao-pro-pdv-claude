import { describe, it, expect } from "vitest"
import { buildGeneralSections, ledgerTotals, type GeneralRaw, type LedgerRow } from "./geral-model"
import { textTable, wrapText, pdfGeneralReport } from "./export-geral"
import { csvReport } from "./export"
import type { ReportResponse } from "./contracts"

const L = (classe: string, valor: number, extra: Partial<LedgerRow> = {}): LedgerRow => ({ classe, sub: null, categoria: null, compra: null, registros: 1, valor, invalidos: 0, ...extra })
const raw = (over: Partial<GeneralRaw> = {}): GeneralRaw => ({
  salesTypes: [{ tipo: "produto", vendas: 2, quantidade: 3, bruto: 300 }, { tipo: "aparelho", vendas: 1, quantidade: 1, bruto: 1000 }],
  salesTotals: { vendas: 3, total: 1290, linhas: 1300, canceladas: 1, totalCanceladas: 50, devolvidas: 0, parciais: 0 },
  returnTypes: [{ tipo: "produto", quantidade: 1, valor: 100 }], returnTotals: { documentos: 1, total: 100, itens: 100, semVenda: 0, divergentes: 0 },
  split: { total: 1290, avista: 990, aprazo: 300, credito: 0, osDoc: 0, osDocCount: 0, semComprovacao: 0, semComprovacaoCount: 0, excedente: 0, excedenteCount: 0,
    dinheiro: 990, pix: 0, debito: 0, creditoCartao: 0, carne: 0, aprazoDeclarado: 300, semBreakdown: 0, divergenciaAvista: 0, divergenciaAvistaValor: 0, aprazoSemTitulo: 0 },
  ledger: [L("venda_avista", 990), L("recebimento_titulo", 150, { sub: "parcela_venda_anterior" }), L("devolucao", -100), L("pagamento_titulo", -400, { categoria: "estoque", compra: true }),
    L("pagamento_titulo", -200, { categoria: "Aluguel", compra: false }), L("tesouraria", -50), L("transferencia", -80), L("transferencia", 80), L("nao_classificado", 10)],
  open: [{ lado: "receber", grupo: "venda_prazo", titulos: 1, aberto: 300, vencido: 0, noPeriodo: 0, indeterminados: 0 }],
  flow: { initial: 100, incoming: 1150, outgoing: 750, openingAdjustments: 0, final: 500 },
  conference: { cancelSemEstorno: 0, cancelSemEstornoValor: 0, osDupla: 0, osDuplaValor: 0, caixaRecebimentos: 150, caixaEstornos: 0, aprazoAbertoCoorte: 300, osCriadas: 4, aparelhosUnidades: 1, aparelhosValor: 1000 },
  ...over,
})
const sec = (r: ReturnType<typeof buildGeneralSections>, key: string) => r.sections.find(s => s.key === key)!
const val = (r: ReturnType<typeof buildGeneralSections>, s: string, k: string) => sec(r, s).metrics.find(m => m.key === k)?.value

describe("Relatório Geral — regras de conciliação", () => {
  it("recebidos e pagos vêm só do ledger; tesouraria, transferência e não classificado ficam fora", () => {
    const t = ledgerTotals(raw().ledger)
    expect(t).toMatchObject({ receipts: 1040, payments: 600, treasury: -50, transfers: 0, unclassifiedIn: 10, unclassifiedCount: 1 })
  })
  it("vendas (competência) e recebimentos (caixa) nunca são somados; caixa da sessão só informa", () => {
    const r = buildGeneralSections(raw(), { service: true })
    expect(val(r, "resumo", "salesGross")).toBe(1290)
    expect(val(r, "resumo", "receipts")).toBe(1040)
    expect(r.metrics.some(m => m.value === 1290 + 1040)).toBe(false)
    expect(sec(r, "conferencia").rows!.find(x => x.id === "caixa")?.situacao).toBe("Informativo")
  })
  it("compras de estoque separadas das despesas e nunca como CMV", () => {
    const r = buildGeneralSections(raw(), { service: true })
    expect(val(r, "despesas", "purchases")).toBe(400)
    expect(val(r, "despesas", "expenses")).toBe(200)
    expect(val(r, "resumo", "cmv")).toBeNull()
  })
  it("ajuste geral não rateado e devolução por tipo", () => {
    const r = buildGeneralSections(raw(), { service: true })
    expect(val(r, "vendas-tipo", "adjustment")).toBe(-10)
    expect(sec(r, "vendas-tipo").rows!.find(x => x.id === "produto")).toMatchObject({ bruto: 300, devolvido: 100, liquido: 200 })
  })
  it("saldo sem comprovação vira Indisponível, nunca zero", () => {
    const r = buildGeneralSections(raw({ open: [{ lado: "receber", grupo: "titulo_nao_classificado", titulos: 1, aberto: 0, vencido: 0, noPeriodo: 0, indeterminados: 2 }] }), { service: true })
    expect(val(r, "resumo", "receivableOpen")).toBeNull()
    expect(sec(r, "resumo").metrics.find(m => m.key === "receivableOpen")?.reason).toContain("2 título")
    expect(val(r, "receber", "receivableOverdue")).toBeNull()
    expect(val(r, "receber", "receivableDue")).toBeNull()
    expect(val(buildGeneralSections(raw({ conference: { ...raw().conference, aprazoAbertoCoorte: null } }), { service: true }), "receber", "receivableCohort")).toBeNull()
  })
  it("sem acesso a Operações, contagem de OS fica indisponível", () => {
    expect(val(buildGeneralSections(raw(), { service: false }), "os", "osCreated")).toBeNull()
  })
  it("divergências são apontadas, não corrigidas", () => {
    const r = buildGeneralSections(raw({ conference: { ...raw().conference, osDupla: 1, osDuplaValor: 250 }, flow: { ...raw().flow, incoming: 1000 } }), { service: true })
    const rows = sec(r, "conferencia").rows!
    expect(rows.find(x => x.id === "osDupla")).toMatchObject({ situacao: "Verificar", valor: 250 })
    expect(rows.find(x => x.id === "fluxo")?.situacao).toBe("Verificar")
    expect(val(r, "resumo", "receipts")).toBe(1040)
    expect(val(r, "conferencia", "divergences")).toBeGreaterThanOrEqual(3)
  })
})

describe("Relatório Geral — exportação", () => {
  it("tabela de largura fixa quebra células longas sem cortar texto", () => {
    const long = "Classificação muito longa ".repeat(12)
    const t = textTable([{ key: "a", label: "A" }, { key: "v", label: "Valor", format: "money" }], [{ a: long, v: 10 }], 60)
    const first = t.blocks[0].map(l => l.replace(/\s+R\$\s10,00$/, ""))
    expect(first.join(" ").replace(/\s+/g, " ").trim()).toBe(long.trim())
    expect(t.blocks[0][0]).toMatch(/R\$\s10,00$/)
    expect(t.blocks[0].every(l => l.length <= 60)).toBe(true)
    expect(wrapText("a − b", 20)[0]).toBe("a - b")
  })
  const report = (rows: number) => ({ kind: "geral", title: "Relatório Geral da Loja", storeId: "qa", period: { from: "2026-11-01", to: "2026-11-10" }, generatedAt: "2026-11-10T12:00:00Z",
    basis: "b", source: "s", limitations: ["CMV indisponível"], metrics: [], sections: buildGeneralSections(raw(), { service: true }).sections,
    columns: [{ key: "reference", label: "Referência" }, { key: "amount", label: "Valor", format: "money" }],
    rows: Array.from({ length: rows }, (_, i) => ({ reference: `REG-${i} (x) \\`, amount: i })), total: rows }) as unknown as ReportResponse
  it("PDF paginado com todos os registros, cabeçalho repetido e xref válido", () => {
    const pdf = Buffer.from(pdfGeneralReport(report(400))).toString("latin1")
    expect(Number(pdf.match(/\/Count (\d+)/)?.[1])).toBeGreaterThan(3)
    for (const i of [0, 199, 399]) expect(pdf).toContain(`REG-${i} \\(x\\) \\\\`)
    expect(pdf).toContain("Detalhamento \\(continua")
    expect(pdf).toMatch(/Pagina 1\/\d+/)
    const offset = Number(pdf.match(/startxref\n(\d+)/)?.[1])
    expect(pdf.slice(offset, offset + 4)).toBe("xref")
  })
  it("CSV inclui todos os blocos antes do detalhamento", () => {
    const csv = csvReport(report(3))
    expect(csv.indexOf("Seção: Resumo geral")).toBeLessThan(csv.indexOf("REG-0"))
    expect(csv).toContain("Seção: Conferência de lançamentos e divergências")
    expect(csv).toContain("3 registro(s)")
  })
})
