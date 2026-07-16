import { describe, expect, it } from "vitest"
import { agregarFinanceiro, parseVencimento, type MovimentacaoRow, type TituloRow } from "./financeiro"

const comp = { ano: 2026, mes: 6 }

describe("parseVencimento", () => {
  const validos = [
    ["ISO da competência anterior", "2026-05-31", { ano: 2026, mes: 5 }],
    ["ISO da competência atual", "2026-06-20", { ano: 2026, mes: 6 }],
    ["ISO da competência seguinte", "2026-07-01", { ano: 2026, mes: 7 }],
    ["BR da competência anterior", "31/05/2026", { ano: 2026, mes: 5 }],
    ["BR da competência atual", "20/06/2026", { ano: 2026, mes: 6 }],
    ["BR da competência seguinte", "01/07/2026", { ano: 2026, mes: 7 }],
    ["último dia antes da virada do ano", "2026-12-31", { ano: 2026, mes: 12 }],
    ["primeiro dia após a virada do ano", "01/01/2027", { ano: 2027, mes: 1 }],
    ["ano bissexto real", "2024-02-29", { ano: 2024, mes: 2 }],
    ["último dia real de fevereiro não bissexto", "2026-02-28", { ano: 2026, mes: 2 }],
    ["último dia real de abril", "2026-04-30", { ano: 2026, mes: 4 }],
  ] as const

  it.each(validos)("aceita %s sem normalizar a data-parede", (_nome, entrada, esperado) => {
    expect(parseVencimento(entrada)).toEqual(esperado)
  })

  const invalidos = [
    ["vazio", ""],
    ["texto livre", "junho"],
    ["espaço antes de ISO", " 2026-06-20"],
    ["espaço depois de ISO", "2026-06-20 "],
    ["espaços ao redor de ISO", " 2026-06-20 "],
    ["espaço antes de BR", " 20/06/2026"],
    ["espaço depois de BR", "20/06/2026 "],
    ["espaços ao redor de BR", " 20/06/2026 "],
    ["tab antes de ISO", "\t2026-06-20"],
    ["tab depois de ISO", "2026-06-20\t"],
    ["tab antes de BR", "\t20/06/2026"],
    ["tab depois de BR", "20/06/2026\t"],
    ["newline antes de ISO", "\n2026-06-20"],
    ["newline depois de BR", "20/06/2026\n"],
    ["newline antes de BR", "\n20/06/2026"],
    ["newline depois de ISO", "2026-06-20\n"],
    ["CRLF ao redor de ISO", "\r\n2026-06-20\r\n"],
    ["CRLF ao redor de BR", "\r\n20/06/2026\r\n"],
    ["mês ISO zero", "2026-00-01"],
    ["mês ISO zero com dia dez", "2026-00-10"],
    ["mês ISO treze", "2026-13-01"],
    ["dia ISO zero", "2026-06-00"],
    ["dia ISO zero em janeiro", "2026-01-00"],
    ["dia ISO fora do mês", "2026-02-99"],
    ["dia ISO inexistente em fevereiro", "2026-02-30"],
    ["29 de fevereiro em ano não bissexto ISO", "2026-02-29"],
    ["31 de abril ISO", "2026-04-31"],
    ["31 de junho ISO", "2026-06-31"],
    ["dia BR zero", "00/06/2026"],
    ["mês BR zero", "01/00/2026"],
    ["mês BR treze", "01/13/2026"],
    ["29 de fevereiro em ano não bissexto BR", "29/02/2026"],
    ["31 de abril BR", "31/04/2026"],
    ["31 de junho BR", "31/06/2026"],
    ["timestamp ISO", "2026-06-20T00:00:00Z"],
    ["sufixo BR", "20/06/2026 extra"],
    ["mês ISO sem zero à esquerda", "2026-6-20"],
    ["ano ISO com dois dígitos", "26-06-20"],
    ["ISO com barras", "2026/06/20"],
    ["ISO sem dia", "2026-06"],
    ["sufixo ISO", "2026-06-20-extra"],
    ["alfabético", "abc"],
  ] as const

  it.each(invalidos)("rejeita individualmente %s", (_nome, entrada) => {
    expect(parseVencimento(entrada)).toBeNull()
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

  it("agrega somente a competência atual entre anterior, atual e seguinte", () => {
    const receber: TituloRow[] = [
      { valor: 501, status: "pendente", vencimento: "2026-05-31" },
      { valor: 602, status: "pendente", vencimento: "2026-06-01" },
      { valor: 603, status: "pendente", vencimento: "30/06/2026" },
      { valor: 704, status: "pendente", vencimento: "01/07/2026" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber, pagar: [], competencia: comp })
    expect(r.titulosReceberAberto).toMatchObject({ valor: 1205, disponibilidade: "real" })
    expect(r.titulosReceberQuantidade.valor).toBe(2)
  })

  it("respeita a virada de ano na agregação da data-parede", () => {
    const pagar: TituloRow[] = [
      { valor: 120, status: "pendente", vencimento: "2026-12-31" },
      { valor: 101, status: "pendente", vencimento: "2027-01-01" },
      { valor: 102, status: "pendente", vencimento: "31/01/2027" },
      { valor: 220, status: "pendente", vencimento: "2027-02-01" },
    ]
    const r = agregarFinanceiro({
      movimentacoes: [],
      receber: [],
      pagar,
      competencia: { ano: 2027, mes: 1 },
    })
    expect(r.titulosPagarAberto).toMatchObject({ valor: 203, disponibilidade: "real" })
    expect(r.titulosPagarQuantidade.valor).toBe(2)
  })

  it("título aberto sem vencimento real reconhecível → parcial", () => {
    const pagar: TituloRow[] = [
      { valor: 80, status: "pendente", vencimento: "2026-06-01" },
      { valor: 20, status: "pendente", vencimento: "31/06/2026" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber: [], pagar, competencia: comp })
    expect(r.titulosPagarAberto.valor).toBe(80)
    expect(r.titulosPagarQuantidade.valor).toBe(1)
    expect(r.titulosPagarAberto.disponibilidade).toBe("parcial")
    expect(r.titulosPagarAberto.observacao).toContain("1 título(s) aberto(s) sem vencimento reconhecível")
  })

  it("rejeita literais civis 2026-00-10 e 2026-01-00 no agregador sem derrubar o reader", () => {
    expect(parseVencimento("2026-00-10")).toBeNull()
    expect(parseVencimento("2026-01-00")).toBeNull()

    const receber: TituloRow[] = [
      { valor: 100, status: "pendente", vencimento: "2026-06-10" },
      { valor: 50, status: "pendente", vencimento: "2026-00-10" },
      { valor: 75, status: "pendente", vencimento: "2026-01-00" },
    ]
    const r = agregarFinanceiro({ movimentacoes: [], receber, pagar: [], competencia: comp })

    expect(r.titulosReceberAberto.valor).toBe(100)
    expect(r.titulosReceberQuantidade.valor).toBe(1)
    expect(r.titulosReceberAberto.disponibilidade).toBe("parcial")
    expect(r.titulosReceberAberto.observacao).toContain(
      "2 título(s) aberto(s) sem vencimento reconhecível",
    )
  })
})
