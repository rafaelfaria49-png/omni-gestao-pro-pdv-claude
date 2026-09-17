/**
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 §6 — timeline REAL da venda.
 *
 * Regra central provada aqui: a timeline só contém o que está PERSISTIDO. Venda antiga
 * sem operador/motivo não ganha valor plausível; devolução que não gerou vale não
 * produz evento de vale; movimentação que já é eco de outro evento não duplica linha.
 */
import { describe, expect, it } from "vitest"
import type { VendaDetalhe } from "./venda-detalhe-contract"
import { SEM_REGISTRO, buildVendaTimeline } from "./venda-timeline"

function venda(over: Partial<VendaDetalhe> = {}): VendaDetalhe {
  return {
    id: "VDA-L01-2026-000407",
    dbId: "ck_tecnico",
    at: "2026-03-10T12:00:00.000Z",
    clienteNome: null,
    clienteId: null,
    clienteCpf: null,
    total: 100,
    desconto: 0,
    cashTendered: null,
    status: "concluida",
    operador: "Ana",
    canceladaEm: null,
    canceladaPor: null,
    motivoCancelamento: null,
    sessaoId: "sess-1",
    observacao: null,
    correcoes: [],
    pagamentos: [],
    itens: [],
    devolucoes: [],
    ...over,
  }
}

describe("buildVendaTimeline · base", () => {
  it("toda venda começa por 'Venda criada' com total, operador e número", () => {
    const [e] = buildVendaTimeline(venda())
    expect(e).toMatchObject({
      tipo: "venda_criada",
      titulo: "Venda criada",
      valor: 100,
      operador: "Ana",
      referencia: "VDA-L01-2026-000407",
    })
  })

  it("venda antiga sem operador NÃO inventa operador — o campo simplesmente falta", () => {
    const [e] = buildVendaTimeline(venda({ operador: null }))
    expect(e.operador).toBeUndefined()
    expect(SEM_REGISTRO).toMatch(/não registrada/i)
  })

  it("operador em branco conta como não registrado", () => {
    expect(buildVendaTimeline(venda({ operador: "   " }))[0]!.operador).toBeUndefined()
  })
})

describe("buildVendaTimeline · pagamentos (§28: múltiplo, avulso, sem cliente)", () => {
  it("pagamento múltiplo vira um evento por forma, discriminado", () => {
    const eventos = buildVendaTimeline(
      venda({ pagamentos: [{ label: "Dinheiro", valor: 60 }, { label: "Pix", valor: 40 }] }),
    ).filter((e) => e.tipo === "pagamento")
    expect(eventos.map((e) => e.titulo)).toEqual(["Pagamento — Dinheiro", "Pagamento — Pix"])
    expect(eventos.map((e) => e.valor)).toEqual([60, 40])
  })

  it("forma com valor zero não vira evento", () => {
    const eventos = buildVendaTimeline(
      venda({ pagamentos: [{ label: "Dinheiro", valor: 100 }, { label: "Vale/Crédito", valor: 0 }] }),
    ).filter((e) => e.tipo === "pagamento")
    expect(eventos).toHaveLength(1)
  })
})

describe("buildVendaTimeline · à prazo e recebimento (§18)", () => {
  const titulo = {
    id: "t1",
    localKey: "pdv-aprazo-VDA-L01-2026-000407-1",
    descricao: "Parcela 1/2",
    cliente: "Cliente",
    valor: 50,
    vencimento: "2026-04-10",
    status: "pendente",
    pago: 0,
    createdAt: "2026-03-10T12:01:00.000Z",
  }

  it("título gerado aparece; sem recebimento não inventa baixa", () => {
    const eventos = buildVendaTimeline(venda({ titulos: [titulo] }))
    expect(eventos.some((e) => e.tipo === "titulo_gerado")).toBe(true)
    expect(eventos.some((e) => e.tipo === "recebimento")).toBe(false)
  })

  it("recebimento PARCIAL é rotulado como parcial", () => {
    const e = buildVendaTimeline(venda({ titulos: [{ ...titulo, pago: 20 }] })).find(
      (x) => x.tipo === "recebimento",
    )
    expect(e).toMatchObject({ valor: 20, descricao: "Recebimento parcial" })
  })

  it("título quitado é rotulado como quitado", () => {
    const e = buildVendaTimeline(
      venda({ titulos: [{ ...titulo, pago: 50, status: "pago" }] }),
    ).find((x) => x.tipo === "recebimento")
    expect(e?.descricao).toBe("Título quitado")
  })
})

describe("buildVendaTimeline · devolução, troca e vale (§30/§31)", () => {
  const dev = {
    id: "d1",
    localId: "DEV-2026-0001",
    at: "2026-03-11T09:00:00.000Z",
    tipo: "vale_credito",
    valorTotal: 35,
    creditoEmitido: 35,
    operador: "Bruno",
    motivo: "Produto com defeito",
    itens: [{ nome: "Capa", quantidade: 1, valorTotal: 35 }],
  }

  it("devolução com vale gera DOIS eventos: a devolução e o vale emitido", () => {
    const eventos = buildVendaTimeline(venda({ devolucoes: [dev] }))
    expect(eventos.find((e) => e.tipo === "devolucao")).toMatchObject({
      valor: 35,
      operador: "Bruno",
      motivo: "Produto com defeito",
      referencia: "DEV-2026-0001",
      descricao: "1× Capa",
    })
    expect(eventos.find((e) => e.tipo === "vale_gerado")).toMatchObject({ valor: 35 })
  })

  it("devolução somente-estoque NÃO gera evento de vale", () => {
    const eventos = buildVendaTimeline(
      venda({ devolucoes: [{ ...dev, tipo: "somente_estoque", creditoEmitido: 0 }] }),
    )
    expect(eventos.some((e) => e.tipo === "vale_gerado")).toBe(false)
    expect(eventos.find((e) => e.tipo === "devolucao")?.titulo).toBe("Devolução (somente estoque)")
  })

  it("troca é classificada como troca, tanto por tipo quanto por modo", () => {
    expect(
      buildVendaTimeline(venda({ devolucoes: [{ ...dev, tipo: "troca" }] })).some(
        (e) => e.tipo === "troca",
      ),
    ).toBe(true)
    expect(
      buildVendaTimeline(
        venda({ devolucoes: [{ ...dev, tipo: "devolucao", modo: "troca_imediata" }] }),
      ).some((e) => e.tipo === "troca"),
    ).toBe(true)
  })

  it("devolução sem motivo gravado não inventa motivo", () => {
    const e = buildVendaTimeline(venda({ devolucoes: [{ ...dev, motivo: "" }] })).find(
      (x) => x.tipo === "devolucao",
    )
    expect(e?.motivo).toBeUndefined()
  })
})

describe("buildVendaTimeline · correção traz o autorizador (§32)", () => {
  it("supervisorNome gravado vira `autorizador`", () => {
    const e = buildVendaTimeline(
      venda({
        correcoes: [
          {
            at: "2026-03-10T15:00:00.000Z",
            operador: "Ana",
            motivo: "Troca de forma",
            campos: ["formaPagamento"],
            supervisorNome: "Carla",
          },
        ],
      }),
    ).find((x) => x.tipo === "correcao")
    expect(e).toMatchObject({ autorizador: "Carla", descricao: "formaPagamento" })
  })

  it("correção antiga sem supervisor não ganha autorizador", () => {
    const e = buildVendaTimeline(
      venda({ correcoes: [{ at: "2026-03-10T15:00:00.000Z", operador: "Ana", motivo: "x", campos: [] }] }),
    ).find((x) => x.tipo === "correcao")
    expect(e?.autorizador).toBeUndefined()
    expect(e?.descricao).toBeUndefined()
  })
})

describe("buildVendaTimeline · estorno (§10/§29)", () => {
  const cancelada = venda({
    status: "cancelada",
    canceladaEm: "2026-03-12T10:00:00.000Z",
    canceladaPor: "Ana",
    motivoCancelamento: "Cliente desistiu [autorizado por Carla]",
    estoqueReposto: true,
    estornoFinanceiro: true,
    movimentacoesFinanceiras: [
      {
        id: "m1",
        tipo: "entrada",
        origem: "venda",
        valor: 100,
        descricao: "Venda",
        createdAt: "2026-03-10T12:00:00.000Z",
      },
      {
        id: "m2",
        tipo: "saida",
        origem: "cancelamento_pdv",
        valor: 100,
        descricao: "Estorno",
        createdAt: "2026-03-12T10:00:00.000Z",
      },
    ],
  })

  it("o estorno é UM evento com o valor revertido e os efeitos reais", () => {
    const e = buildVendaTimeline(cancelada).find((x) => x.tipo === "cancelamento")
    expect(e).toMatchObject({
      titulo: "Venda estornada",
      valor: 100,
      operador: "Ana",
      descricao: "estoque reposto · estorno financeiro",
    })
    expect(e?.motivo).toContain("autorizado por Carla")
  })

  it("não duplica: a entrada da venda e a saída do estorno não viram linhas soltas", () => {
    const eventos = buildVendaTimeline(cancelada)
    expect(eventos.filter((e) => e.tipo === "estorno_financeiro")).toHaveLength(0)
    expect(eventos.filter((e) => e.valor === 100 && e.tipo === "cancelamento")).toHaveLength(1)
  })

  it("saída de devolução também não duplica o evento da devolução", () => {
    const eventos = buildVendaTimeline(
      venda({
        movimentacoesFinanceiras: [
          {
            id: "m3",
            tipo: "saida",
            origem: "devolucao_pdv",
            valor: 35,
            descricao: "Devolução",
            createdAt: "2026-03-11T09:00:00.000Z",
          },
        ],
      }),
    )
    expect(eventos.some((e) => e.tipo === "estorno_financeiro")).toBe(false)
  })

  it("venda não cancelada não produz evento de estorno", () => {
    expect(buildVendaTimeline(venda()).some((e) => e.tipo === "cancelamento")).toBe(false)
  })
})

describe("buildVendaTimeline · ordenação", () => {
  it("ordena por data e mantém a ordem de inserção no mesmo instante", () => {
    const eventos = buildVendaTimeline(
      venda({
        pagamentos: [{ label: "Dinheiro", valor: 100 }],
        devolucoes: [
          {
            id: "d1",
            localId: "DEV-1",
            at: "2026-03-11T09:00:00.000Z",
            tipo: "vale_credito",
            valorTotal: 35,
            creditoEmitido: 35,
            operador: "B",
            motivo: "",
            itens: [],
          },
        ],
        canceladaEm: "2026-03-12T10:00:00.000Z",
        canceladaPor: "A",
        motivoCancelamento: "m",
      }),
    )
    expect(eventos.map((e) => e.tipo)).toEqual([
      "venda_criada",
      "pagamento",
      "devolucao",
      "vale_gerado",
      "cancelamento",
    ])
  })

  it("data inválida não derruba a construção", () => {
    expect(() => buildVendaTimeline(venda({ at: "data-quebrada" }))).not.toThrow()
  })

  it("venda mínima (sem arrays opcionais) produz ao menos a criação", () => {
    const min = { ...venda() } as VendaDetalhe
    delete (min as Partial<VendaDetalhe>).correcoes
    delete (min as Partial<VendaDetalhe>).devolucoes
    delete (min as Partial<VendaDetalhe>).pagamentos
    expect(buildVendaTimeline(min)).toHaveLength(1)
  })
})
