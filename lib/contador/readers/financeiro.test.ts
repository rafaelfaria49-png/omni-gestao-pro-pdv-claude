import { describe, it, expect } from "vitest"
import { agregarFinanceiro, parseVencimento, type MovimentacaoRow, type TituloRow } from "./financeiro"

const comp = { ano: 2026, mes: 6 }

describe("parseVencimento", () => {
  it("aceita ISO e BR, rejeita lixo", () => {
    expect(parseVencimento("2026-06-20")).toEqual({ ano: 2026, mes: 6 })
    expect(parseVencimento("20/06/2026")).toEqual({ ano: 2026, mes: 6 })
    expect(parseVencimento("")).toBeNull()
    expect(parseVencimento("junho")).toBeNull()
    expect(parseVencimento("2026-13-01")).toBeNull()
  })
})

describe("agregarFinanceiro", () => {
  it("realizados: entradas/saídas de movimentações; exclui transferência; estorno à parte", () => {
    const movs: MovimentacaoRow[] = [
      { tipo: "entrada", origem: "venda", valor: 100 },
      { tipo: "entrada", origem: "os", valor: 50 },
      { tipo: "saida", origem: "pagar", valor: 40 },
      { tipo: "entrada", origem: "transferencia", valor: 999 },
      { tipo: "saida", origem: "estorno", valor: 30 },
    ]
    const r = agregarFinanceiro({ movimentacoes: movs, receber: [], pagar: [], competencia: comp })
    expect(r.entradasRealizadas.valor).toBe(150)
    expect(r.saidasRealizadas.valor).toBe(40)
    expect(r.estornos.valor).toBe(30)
  })

  it("títulos abertos: soma só os com vencimento na competência e status aberto", () => {
    const receber: TituloRow[] = [
      { valor: 200, status: "pendente", vencimento: "2026-06-10" },
      { valor: 100, status: "pendente", vencimento: "2026-07-10" }, // fora
      { valor: 300, status: "pago", vencimento: "2026-06-15" }, // fechado
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber, pagar: [], competencia: comp })
    expect(r.titulosReceberAberto.valor).toBe(200)
    expect(r.titulosReceberQuantidade.valor).toBe(1)
    expect(r.titulosReceberAberto.disponibilidade).toBe("real")
  })

  it("título aberto sem vencimento reconhecível → parcial", () => {
    const pagar: TituloRow[] = [
      { valor: 80, status: "pendente", vencimento: "2026-06-01" },
      { valor: 20, status: "pendente", vencimento: "" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber: [], pagar, competencia: comp })
    expect(r.titulosPagarAberto.valor).toBe(80)
    expect(r.titulosPagarAberto.disponibilidade).toBe("parcial")
  })
})
