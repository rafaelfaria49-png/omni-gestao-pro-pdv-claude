/** PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — desfecho da fila offline e fator de valor pago. */
import { describe, expect, it } from "vitest"
import { classificarRespostaDevolucao, nextDevolucaoId } from "@/lib/operations-store"
import { fatorValorPago } from "@/lib/pdv/devolucao/registrar-devolucao"
import { bloqueioPersistenteVendaOrigem, distribuirQtyReturned, listarPendenciasDevolucao, resumoTrocasDevolucoesSessao } from "@/lib/pdv/devolucao/pendencias"
import type { DevolucaoRecord, SaleRecord } from "@/lib/operations-sale-types"

describe("fila de devoluções — resposta do servidor", () => {
  it("2xx confirma; conflito de id reidentifica; recusa de negócio sai da fila; resto aguarda", () => {
    expect(classificarRespostaDevolucao(200, undefined)).toBe("confirmada")
    expect(classificarRespostaDevolucao(409, "LOCAL_ID_CONFLITO")).toBe("reidentificar")
    for (const code of ["REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA", "QUANTIDADE_EXCEDE_DEVOLVIVEL", "VENDA_CANCELADA", "CLIENTE_DOC_OBRIGATORIO", "ITEM_NAO_CONSTA_NA_VENDA",
      // Venda/estoque KG e cadastro comercial (#315/#335 integrados à F8): reenvio não resolve.
      "DEVOLUCAO_KG_BLOQUEADA", "MANUAL_KG_SALE_BLOCKED", "PRODUTO_POR_PESO_NAO_OPERACIONAL", "PRODUTO_COMERCIAL_INVALIDO"]) {
      expect(classificarRespostaDevolucao(409, code)).toBe("recusada")
    }
    // Venda ainda não sincronizada, período fechado, 5xx e rede: tenta de novo.
    expect(classificarRespostaDevolucao(409, "VENDA_ORIGEM_NAO_ENCONTRADA")).toBe("aguardar")
    expect(classificarRespostaDevolucao(409, "periodo_fechado")).toBe("aguardar")
    expect(classificarRespostaDevolucao(503, undefined)).toBe("aguardar")
  })

  it("ids de devolução não colidem entre terminais (sufixo aleatório) e o contador continua", () => {
    const year = new Date().getFullYear()
    const a = nextDevolucaoId([])
    const b = nextDevolucaoId([])
    expect(a).toMatch(new RegExp(`^DEV-${year}-0001-[0-9A-F]{8}$`))
    expect(a).not.toBe(b)
    const c = nextDevolucaoId([{ id: `DEV-${year}-0007` } as never, { id: `DEV-${year}-0009-ABCDEF12` } as never])
    expect(c.startsWith(`DEV-${year}-0010-`)).toBe(true)
  })
})

const devR = (over: Partial<DevolucaoRecord>): DevolucaoRecord => ({
  id: "D", at: "2026-11-04T10:00:00.000Z", saleId: "V", customerCpf: "1", customerName: "C",
  lines: [{ inventoryId: "P", name: "P", quantity: 1, valor: 10 }], mode: "vale_credito", creditIssued: 10, sessaoId: "s1", ...over,
})

describe("pendências de devolução (PDV-F8-FINALIZACAO-COMPLETA-001)", () => {
  it("encaminhada não conta como confirmada; bloqueio persistente e recusas aparecem no resumo", () => {
    const devs = [
      devR({ id: "ok", tipo: "troca" }),
      devR({ id: "enc", syncPending: false, conciliacao: { ref: "R", at: "x", operador: "o", categoria: "VALE_EMITIDO", valorDeclarado: 10 } }),
      devR({ id: "bloq", syncPending: true, syncBlocked: true, creditIssued: 0, mode: "somente_estoque" }),
      devR({ id: "esp", syncPending: true, syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM" }),
      devR({ id: "rec", syncRejectedCode: "ITEM_NAO_CONSTA_NA_VENDA" }),
      devR({ id: "outra", sessaoId: "s2" }),
    ]
    const sales = [{ id: "N", at: "x", lines: [], total: 15, sessaoId: "s1", paymentBreakdown: { creditoVale: 10 } } as unknown as SaleRecord]
    expect(resumoTrocasDevolucoesSessao(devs, sales, "s1")).toEqual({
      trocas: 1, devolucoesConfirmadas: 1, creditosEmitidos: 10, creditosUtilizados: 10, diferencasRecebidas: 5,
      pendentes: 0, aguardandoVendaOrigem: 1, bloqueados: 1, recusasDefinitivas: 1, conciliacaoManual: 1, encaminhadas: 1,
    })
    const estados = Object.fromEntries(listarPendenciasDevolucao(devs).map((p) => [p.dev.id, p.estado]))
    expect(estados).toEqual({ enc: "ENCAMINHADA_FINANCEIRO", bloq: "BLOQUEIO_PERSISTENTE", esp: "AGUARDANDO_VENDA_ORIGEM", rec: "RECUSA_DEFINITIVA" })
    // Recusa por encaminhamento feito em outra aba é tratada como encaminhada (sem 2ª conciliação).
    expect(listarPendenciasDevolucao([devR({ syncRejectedCode: "DEVOLUCAO_ENCAMINHADA_FINANCEIRO" })])[0]).toMatchObject({ estado: "ENCAMINHADA_FINANCEIRO", exigeConciliacaoManual: false })
  })

  it("bloqueio persistente: espera natural com a venda na fila local; limite com ela ausente; 24 h sempre", () => {
    const t0 = Date.parse("2026-11-04T10:00:00.000Z")
    const d = { syncWaitingCode: "AGUARDANDO_VENDA_ORIGEM" as const, syncWaitingSince: "2026-11-04T10:00:00.000Z", syncAttempts: 5 }
    expect(bloqueioPersistenteVendaOrigem(d, t0 + 31 * 60_000, false)).toBe(true)
    expect(bloqueioPersistenteVendaOrigem(d, t0 + 31 * 60_000, true)).toBe(false)
    expect(bloqueioPersistenteVendaOrigem({ ...d, syncAttempts: 4 }, t0 + 31 * 60_000, false)).toBe(false)
    expect(bloqueioPersistenteVendaOrigem({ ...d, syncAttempts: 5 }, t0 + 10 * 60_000, false)).toBe(false)
    expect(bloqueioPersistenteVendaOrigem({ ...d, syncAttempts: 1 }, t0 + 25 * 3600_000, true)).toBe(true)
  })

  it("distribuirQtyReturned respeita a capacidade de cada linha repetida, nos dois sentidos", () => {
    const ls = [{ inventoryId: "P", quantity: 1, qtyReturned: 0 }, { inventoryId: "P", quantity: 2, qtyReturned: 0 }]
    const mais = distribuirQtyReturned(ls, "P", 2)
    expect(mais.map((l) => l.qtyReturned)).toEqual([1, 1])
    expect(distribuirQtyReturned(mais, "P", -1).map((l) => l.qtyReturned)).toEqual([1, 0])
    expect(ls.map((l) => l.qtyReturned)).toEqual([0, 0]) // sem mutar a entrada
  })
})

describe("fatorValorPago", () => {
  it("desconto reduz; acréscimo não aumenta; sem linhas = 1", () => {
    expect(fatorValorPago(50, [{ lineTotal: 100 }])).toBe(0.5)
    expect(fatorValorPago(120, [{ lineTotal: 100 }])).toBe(1)
    expect(fatorValorPago(10, [])).toBe(1)
  })
})
