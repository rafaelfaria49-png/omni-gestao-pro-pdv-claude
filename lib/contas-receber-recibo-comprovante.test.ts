import { describe, expect, it } from "vitest"
import {
  RECIBO_NAO_FISCAL_LABEL,
  buildReciboLoteInnerHtml,
  buildReciboPagamentoInnerHtml,
  cssImpressaoRecibo,
  imprimirReciboLote,
} from "@/lib/contas-receber-recibo"

const base = {
  lojaNome: "Loja QA Centro",
  cliente: "Ana QA",
  dataPagamento: new Date("2026-11-08T13:45:00.000Z"),
  formaPagamento: "PIX",
}

describe("comprovante NÃO FISCAL de recebimento", () => {
  it("lote: marca não fiscal, operação, cada título com saldo restante e total do servidor", () => {
    const html = buildReciboLoteInnerHtml({
      ...base,
      itens: [
        { descricao: "Venda #1", valorRecebido: 100, saldoRestante: 0 },
        { descricao: "Venda #2", valorRecebido: 131.82, saldoRestante: 48.18 },
      ],
      totalRecebido: 231.82,
      saldoDevedorAtual: 48.18,
      operacaoId: "op-123",
    })
    expect(html).toContain(RECIBO_NAO_FISCAL_LABEL)
    expect(html).toContain("op-123")
    expect(html).toContain("Loja QA Centro")
    expect(html).toContain("abatido — resta R$ 48,18")
    expect(html).toContain("R$ 231,82")
    expect(html).toContain("SALDO DEVEDOR ATUAL: R$ 48,18")
    expect(html).not.toContain("2ª VIA")
    // Nada fixo/fictício herdado do recibo simulado antigo.
    for (const fixo of ["Banco Inter", "plena quitação", "OmniGestão Pro"]) expect(html).not.toContain(fixo)
  })

  it("saldo devedor desconhecido (null) some do cupom em vez de imprimir zero inventado", () => {
    const html = buildReciboLoteInnerHtml({ ...base, itens: [{ descricao: "T", valorRecebido: 10, saldoRestante: 5 }], totalRecebido: 10, saldoDevedorAtual: null })
    expect(html).not.toContain("SALDO DEVEDOR ATUAL")
    expect(html).toContain("resta R$ 5,00")
  })

  it("2ª via sai identificada como reimpressão", () => {
    const html = buildReciboLoteInnerHtml({ ...base, itens: [{ descricao: "T", valorRecebido: 10, saldoRestante: 0 }], totalRecebido: 10, saldoDevedorAtual: null, segundaVia: true })
    expect(html).toContain("2ª VIA — REIMPRESSÃO")
  })

  it("data ausente/inválida imprime '—', nunca 'Invalid Date'", () => {
    const html = buildReciboLoteInnerHtml({ ...base, dataPagamento: new Date(NaN), itens: [{ descricao: "T", valorRecebido: 1, saldoRestante: 0 }], totalRecebido: 1, saldoDevedorAtual: 0 })
    expect(html).not.toContain("Invalid Date")
  })

  it("singular: situação do título (abatido/quitado) e marca não fiscal", () => {
    const parcial = buildReciboPagamentoInnerHtml({ ...base, descricaoTitulo: "OS #1", valorPago: 30, saldoDevedorAtual: 70, saldoRestanteTitulo: 70, operacaoId: "k" })
    expect(parcial).toContain(RECIBO_NAO_FISCAL_LABEL)
    expect(parcial).toContain("abatido — resta R$ 70,00")
    const total = buildReciboPagamentoInnerHtml({ ...base, descricaoTitulo: "OS #1", valorPago: 30, saldoDevedorAtual: 0, saldoRestanteTitulo: 0 })
    expect(total).toContain("quitado")
  })

  it("sem DOM (servidor/teste node) a impressão devolve false — a UI avisa e mantém reimprimir", async () => {
    expect(await imprimirReciboLote({ ...base, itens: [], totalRecebido: 0, saldoDevedorAtual: 0 })).toBe(false)
  })
})

describe("página de impressão por bobina (58/80 mm)", () => {
  // `size: 80mm auto` é CSS inválido: o Chromium descarta a regra e pagina em Letter
  // (215,9 mm) — o cupom sai no tamanho do papel padrão do driver, não da bobina.
  it("declara largura E altura válidas (nunca \"auto\") e a largura útil da bobina", () => {
    const c58 = cssImpressaoRecibo("58mm", 131.2)
    expect(c58).toContain("size: 58mm 132mm")
    expect(c58).toMatch(/recibo-print-root {[^}]*width: 48mm !important/)
    const c80 = cssImpressaoRecibo("80mm", 90)
    expect(c80).toContain("size: 80mm 90mm")
    expect(c80).toMatch(/recibo-print-root {[^}]*width: 72mm !important/)
    for (const c of [c58, c80]) expect(c).not.toMatch(/size:[^;]*auto/)
  })

  it("altura não medida (sem layout) cai num comprimento fixo válido, não em \"auto\"", () => {
    for (const h of [null, 0, Number.NaN, -5]) expect(cssImpressaoRecibo("80mm", h)).toContain("size: 80mm 297mm")
  })
})
