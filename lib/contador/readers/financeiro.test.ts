import { describe, expect, it } from "vitest"
import { agregarFinanceiro, parseVencimento, type MovimentacaoRow, type TituloRow } from "./financeiro"

const comp = { ano: 2026, mes: 6 }

describe("parseVencimento", () => {
  it("aceita somente ISO e BR com data de calendário real", () => {
    expect(parseVencimento("2026-06-20")).toEqual({ ano: 2026, mes: 6 })
    expect(parseVencimento("20/06/2026")).toEqual({ ano: 2026, mes: 6 })
    expect(parseVencimento("2024-02-29")).toEqual({ ano: 2024, mes: 2 })
    expect(parseVencimento("")).toBeNull()
    expect(parseVencimento("junho")).toBeNull()
    expect(parseVencimento("2026-13-01")).toBeNull()
    expect(parseVencimento("2026-02-99")).toBeNull()
    expect(parseVencimento("2026-02-29")).toBeNull()
    expect(parseVencimento("31/04/2026")).toBeNull()
    expect(parseVencimento("00/06/2026")).toBeNull()
    expect(parseVencimento("2026-06-20T00:00:00Z")).toBeNull()
    expect(parseVencimento("20/06/2026 extra")).toBeNull()
    expect(parseVencimento(" 2026-06-20 ")).toBeNull()
    expect(parseVencimento(" 20/06/2026 ")).toBeNull()
  })
})

describe("agregarFinanceiro", () => {
  it("separa transferências e reversões reais de entradas/saídas", () => {
    const movs: MovimentacaoRow[] = [
      { tipo: "entrada", origem: "venda", valor: 100 },
      { tipo: "entrada", origem: "os", valor: 50 },
      { tipo: "saida", origem: "pagar", valor: 40 },
      { tipo: "entrada", origem: "transferencia", valor: 999 },
      { tipo: "saida", origem: "estorno", valor: 30 },
      { tipo: "saida", origem: "devolucao_pdv", valor: 20 },
      { tipo: "saida", origem: "cancelamento_pdv", valor: 10 },
      { tipo: "entrada", origem: "estorno_pagar_parcial", valor: 5 },
    ]
    const r = agregarFinanceiro({ movimentacoes: movs, receber: [], pagar: [], competencia: comp })
    expect(r.entradasRealizadas.valor).toBe(150)
    expect(r.saidasRealizadas.valor).toBe(40)
    expect(r.estornos.valor).toBe(65)
    expect(r.transferencias.valor).toBe(999)
    expect(r.transferenciasQuantidade.valor).toBe(1)
    expect(r.naoClassificados.valor).toBe(0)
  })

  it("origens desconhecidas, nulas ou vazias nunca herdam tipo economico", () => {
    const r = agregarFinanceiro({
      movimentacoes: [
        { tipo: "entrada", origem: "origem_futura", valor: 100 },
        { tipo: "saida", origem: "origem_futura", valor: 50 },
        { tipo: "entrada", origem: null, valor: 20 },
        { tipo: "saida", origem: "", valor: 10 },
        { tipo: "saida", origem: "venda", valor: 5 },
      ],
      receber: [],
      pagar: [],
      competencia: comp,
    })
    expect(r.entradasRealizadas.valor).toBe(0)
    expect(r.saidasRealizadas.valor).toBe(0)
    expect(r.naoClassificados).toMatchObject({ valor: 185, disponibilidade: "parcial" })
    expect(r.naoClassificadosQuantidade.valor).toBe(5)
  })

  it("allowlist cobre familias derivadas e origens bidirecionais confirmadas", () => {
    const r = agregarFinanceiro({
      movimentacoes: [
        { tipo: "entrada", origem: "receber_parcial", valor: 30 },
        { tipo: "saida", origem: "pagar_parcial", valor: 12 },
        { tipo: "entrada", origem: "marketplace", valor: 8 },
        { tipo: "entrada", origem: "manual", valor: 7 },
        { tipo: "saida", origem: "ajuste", valor: 3 },
        { tipo: "entrada", origem: "legado", valor: 2 },
      ],
      receber: [],
      pagar: [],
      competencia: comp,
    })
    expect(r.entradasRealizadas.valor).toBe(47)
    expect(r.saidasRealizadas.valor).toBe(15)
    expect(r.naoClassificadosQuantidade.valor).toBe(0)
  })

  it("soma apenas títulos abertos com vencimento válido na competência", () => {
    const receber: TituloRow[] = [
      { valor: 200, status: "pendente", vencimento: "2026-06-10" },
      { valor: 100, status: "pendente", vencimento: "2026-07-10" },
      { valor: 300, status: "pago", vencimento: "2026-06-15" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber, pagar: [], competencia: comp })
    expect(r.titulosReceberAberto.valor).toBe(200)
    expect(r.titulosReceberQuantidade.valor).toBe(1)
    expect(r.titulosReceberAberto.disponibilidade).toBe("real")
  })

  it("título aberto sem vencimento real reconhecível → parcial", () => {
    const pagar: TituloRow[] = [
      { valor: 80, status: "pendente", vencimento: "2026-06-01" },
      { valor: 20, status: "pendente", vencimento: "31/06/2026" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber: [], pagar, competencia: comp })
    expect(r.titulosPagarAberto.valor).toBe(80)
    expect(r.titulosPagarAberto.disponibilidade).toBe("parcial")
  })
})
