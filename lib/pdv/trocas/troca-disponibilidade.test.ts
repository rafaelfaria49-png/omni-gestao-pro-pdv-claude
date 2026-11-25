import { describe, expect, it } from "vitest"
import {
  TROCA_PAYLOAD_SCHEMA,
  alocarDevolucoes,
  liquidosPorLinha,
  linhasComDisponibilidade,
  linhasDaVenda,
  paymentBreakdownDaTroca,
  planoTroca,
  statusVendaAposDevolucoes,
  validarLinhasDevolucao,
  valorDevolucaoLinha,
  type DevolucaoPersistida,
} from "./troca-disponibilidade"
import { normalizarTermoBusca } from "./troca-busca-termo"

const vendaPs4 = {
  lines: [{ inventoryId: "prod-ps4", produtoId: "prod-ps4", name: "CONTROLE DE VIDEO GAME PS4 WIRELESS", quantity: 1, unitPrice: 119.9, lineTotal: 119.9, itemType: "produto" }],
}

function devLegado(localId: string, inventoryId: string | null, nome: string, quantidade: number, at = "2026-11-21T18:00:00Z"): DevolucaoPersistida {
  return { id: localId, localId, tipo: "troca", at, payload: { modo: "troca_imediata" }, itens: [{ inventoryId, nome, quantidade }] }
}

describe("linhasDaVenda", () => {
  it("usa payload.lines com identidade por posição e classifica avulso/serviço", () => {
    const l = linhasDaVenda(
      {
        lines: [
          { inventoryId: "p1", name: "Cabo", quantity: 2, unitPrice: 10, lineTotal: 20 },
          { inventoryId: "avulso-123", name: "Item avulso", quantity: 1, unitPrice: 5, lineTotal: 5, itemType: "avulso", isAvulso: true },
          { inventoryId: "servico-tela", name: "Troca de tela", quantity: 1, unitPrice: 100, lineTotal: 100, itemType: "servico" },
        ],
      },
      [],
    )
    expect(l.map((x) => x.lineIndex)).toEqual([0, 1, 2])
    expect(l[1]!.isAvulso).toBe(true)
    expect(l[2]!.itemType).toBe("servico")
  })

  it("cai para ItemVenda quando a venda legada não tem payload.lines", () => {
    const l = linhasDaVenda(null, [{ inventoryId: "p9", nome: "Fone", quantidade: 3, precoUnitario: 10, lineTotal: 30 }])
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ lineIndex: 0, inventoryId: "p9", quantity: 3, lineTotal: 30 })
  })

  it("formato real da VDA-L01-2026-000767: inventoryId da linha é o código usado na venda", () => {
    const l = linhasDaVenda(
      {
        lines: [
          { inventoryId: "KD-327A", produtoId: "cmvse0p4d000bl808rjja2lih", name: "CABO LIGHTNING", quantity: 1, unitPrice: 29.99, lineTotal: 29.99 },
          { inventoryId: "cmpevc3i40073l8048fpvibws", produtoId: "cmpevc3i40073l8048fpvibws", name: "PS4", quantity: 1, unitPrice: 119.9, lineTotal: 119.9 },
          { inventoryId: "avulso-1", name: "Avulso", quantity: 1, unitPrice: 5, lineTotal: 5, itemType: "avulso" },
        ],
      },
      [],
    )
    expect(l.map((x) => x.codigoNaVenda)).toEqual(["KD-327A", "", ""])
  })

  it("linha vendida por peso (KG) não é arredondada e é recusada explicitamente", () => {
    const { linhas } = linhasComDisponibilidade(
      linhasDaVenda({ lines: [{ inventoryId: "queijo", name: "QUEIJO", quantity: 0.35, unitPrice: 20, lineTotal: 7, vendaPorPeso: true }] }, []),
      [],
    )
    expect(linhas[0]).toMatchObject({ quantity: 0.35, porPeso: true, destino: "venda_por_peso" })
    expect(validarLinhasDevolucao(linhas, [{ lineIndex: 0, quantidade: 1 }], [7])).toMatchObject({ ok: false, code: "DEVOLUCAO_POR_PESO_NAO_SUPORTADA" })
    const legado = linhasDaVenda(null, [{ inventoryId: "queijo", nome: "QUEIJO", quantidade: null, precoUnitario: 20, lineTotal: 7 }])
    expect(legado[0]).toMatchObject({ porPeso: true })
  })

  it("nunca preenche código do snapshot a partir de outra fonte", () => {
    const [l] = linhasDaVenda(vendaPs4, [])
    expect(l!.snapshotSku).toBe("")
    expect(l!.snapshotBarcode).toBe("")
  })
})

describe("disponibilidade servidor (cenário real 000760)", () => {
  it("venda sem devolução persistida → disponível 1, mesmo que o navegador diga qtyReturned=1", () => {
    const local = { lines: [{ ...vendaPs4.lines[0], qtyReturned: 1 }] }
    const { linhas } = linhasComDisponibilidade(linhasDaVenda(local, []), [])
    expect(linhas[0]).toMatchObject({ quantity: 1, devolvido: 0, disponivel: 1 })
  })

  it("devolução persistida (legado por inventoryId) → disponível 0, com a devolução associada", () => {
    const { linhas } = linhasComDisponibilidade(linhasDaVenda(vendaPs4, []), [devLegado("DEV-2026-0003", "prod-ps4", "PS4", 1)])
    expect(linhas[0]).toMatchObject({ devolvido: 1, disponivel: 0 })
    expect(linhas[0]!.devolucoes).toEqual([{ localId: "DEV-2026-0003", quantidade: 1 }])
  })
})

describe("alocarDevolucoes", () => {
  const venda = linhasDaVenda(
    {
      lines: [
        { inventoryId: "p1", name: "Película", quantity: 1, unitPrice: 20, lineTotal: 20 },
        { inventoryId: "p1", name: "Película", quantity: 2, unitPrice: 15, lineTotal: 30 },
        { inventoryId: "", name: "Item avulso X", quantity: 1, unitPrice: 9, lineTotal: 9, itemType: "avulso", isAvulso: true },
      ],
    },
    [],
  )

  it("linhas repetidas do mesmo produto com preços diferentes: fluxo novo é exato por lineIndex", () => {
    const dev: DevolucaoPersistida = {
      id: "a",
      localId: "trc_a",
      tipo: "troca",
      at: "2026-11-21T10:00:00Z",
      payload: { schema: TROCA_PAYLOAD_SCHEMA, linhas: [{ lineIndex: 1, quantidade: 2 }] },
      itens: [{ inventoryId: "p1", nome: "Película", quantidade: 2 }],
    }
    const { porLinha } = alocarDevolucoes(venda, [dev])
    expect(porLinha.map((p) => p.devolvido)).toEqual([0, 2, 0])
  })

  it("legado distribui pela ordem das linhas sem contar duas vezes; excesso vai para naoAlocado", () => {
    const { porLinha, naoAlocado } = alocarDevolucoes(venda, [devLegado("D1", "p1", "Película", 2), devLegado("D2", "p1", "Película", 2, "2026-11-22T00:00:00Z")])
    expect(porLinha.map((p) => p.devolvido)).toEqual([1, 2, 0])
    expect(naoAlocado).toEqual([{ localId: "D2", nome: "Película", quantidade: 1 }])
  })

  it("item avulso sem inventoryId casa pelo nome histórico", () => {
    const { porLinha } = alocarDevolucoes(venda, [devLegado("D3", null, "item avulso x", 1)])
    expect(porLinha[2]!.devolvido).toBe(1)
  })
})

describe("valores", () => {
  it("devolução parcial fecha exatamente no total da linha (sem centavo a mais)", () => {
    const [l] = linhasDaVenda({ lines: [{ inventoryId: "p", name: "X", quantity: 3, unitPrice: 33.33, lineTotal: 100 }] }, [])
    const v1 = valorDevolucaoLinha(l!, 100, 0, 1)
    const v2 = valorDevolucaoLinha(l!, 100, 1, 1)
    const v3 = valorDevolucaoLinha(l!, 100, 2, 1)
    expect([v1, v2, v3]).toEqual([33.33, 33.34, 33.33])
    expect(Math.round((v1 + v2 + v3) * 100) / 100).toBe(100)
  })

  it("rateia desconto global da venda e nunca devolve mais que o pago", () => {
    const linhas = linhasDaVenda({ lines: [{ inventoryId: "a", name: "A", quantity: 1, unitPrice: 60, lineTotal: 60 }, { inventoryId: "b", name: "B", quantity: 1, unitPrice: 40, lineTotal: 40 }] }, [])
    const liq = liquidosPorLinha(90, linhas)
    expect(liq).toEqual([54, 36])
    expect(valorDevolucaoLinha(linhas[0]!, liq[0]!, 0, 1)).toBe(54)
    expect(liquidosPorLinha(120, linhas)).toEqual([60, 40]) // acréscimo não aumenta a devolução
  })

  it("rateio em centavos fecha exatamente no total pago (20,00 em 3 × 10,00 → nunca 20,01)", () => {
    const linhas = linhasDaVenda({ lines: [0, 1, 2].map((i) => ({ inventoryId: `x${i}`, name: "X", quantity: 1, unitPrice: 10, lineTotal: 10 })) }, [])
    const liq = liquidosPorLinha(20, linhas)
    expect(Math.round(liq.reduce((a, b) => a + b, 0) * 100)).toBe(2000)
    expect(liq.slice().sort()).toEqual([6.66, 6.67, 6.67])
  })
})

describe("validarLinhasDevolucao", () => {
  const { linhas } = linhasComDisponibilidade(linhasDaVenda(vendaPs4, []), [])

  it("aceita o cenário 119,90", () => {
    const r = validarLinhasDevolucao(linhas, [{ lineIndex: 0, quantidade: 1 }], [119.9])
    expect(r).toMatchObject({ ok: true, valorTotal: 119.9 })
  })

  it("recusa acima do disponível, linha repetida, quantidade fracionada", () => {
    expect(validarLinhasDevolucao(linhas, [{ lineIndex: 0, quantidade: 2 }], [119.9])).toMatchObject({ ok: false, code: "DEVOLUCAO_ACIMA_DO_DISPONIVEL" })
    expect(validarLinhasDevolucao(linhas, [{ lineIndex: 0, quantidade: 1 }, { lineIndex: 0, quantidade: 1 }], [119.9])).toMatchObject({ ok: false, code: "LINHA_INVALIDA" })
    expect(validarLinhasDevolucao(linhas, [{ lineIndex: 0, quantidade: 0.5 }], [119.9])).toMatchObject({ ok: false, code: "QUANTIDADE_INVALIDA" })
    expect(validarLinhasDevolucao(linhas, [], [119.9])).toMatchObject({ ok: false, code: "SEM_LINHAS" })
  })

  it("aparelho IMEI segue bloqueado", () => {
    const d = linhasComDisponibilidade(linhasDaVenda({ lines: [{ inventoryId: "m", name: "iPhone", quantity: 1, unitPrice: 1000, lineTotal: 1000, deviceSale: { imei: "x" } }] }, []), []).linhas
    expect(validarLinhasDevolucao(d, [{ lineIndex: 0, quantidade: 1 }], [119.9])).toMatchObject({ ok: false, code: "APARELHO_REVERSAO_NAO_INTEGRADA" })
  })
})

describe("planoTroca", () => {
  it("119,90 → 129,90: crédito 119,90, diferença 10,00 em dinheiro, sem vale residual", () => {
    const p = planoTroca(119.9, 129.9)
    expect(p).toEqual({ valorDevolvido: 119.9, totalNovaCompra: 129.9, creditoAplicado: 119.9, diferenca: 10, excedente: 0 })
    expect(paymentBreakdownDaTroca(p, "dinheiro")).toMatchObject({ creditoVale: 119.9, dinheiro: 10, pix: 0 })
  })
  it("mesmo preço e mais barato", () => {
    expect(planoTroca(50, 50)).toMatchObject({ diferenca: 0, excedente: 0, creditoAplicado: 50 })
    expect(planoTroca(50, 30)).toMatchObject({ diferenca: 0, excedente: 20, creditoAplicado: 30 })
  })
})

describe("status e busca", () => {
  it("status da venda após devoluções", () => {
    const { linhas } = linhasComDisponibilidade(linhasDaVenda(vendaPs4, []), [devLegado("D", "prod-ps4", "PS4", 1)])
    expect(statusVendaAposDevolucoes("concluida", linhas)).toBe("devolvida")
    expect(statusVendaAposDevolucoes("cancelada", linhas)).toBe("cancelada")
  })
  it("termo sem acento e minúsculo", () => {
    expect(normalizarTermoBusca("  Cábo  de ÁUDIO ")).toBe("cabo de audio")
  })
})
