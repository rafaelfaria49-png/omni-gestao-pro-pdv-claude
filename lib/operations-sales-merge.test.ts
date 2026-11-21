import { describe, expect, it } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { mergeSalesById, kgCashProjectionDelta } from "./operations-sales-merge"

/** Venda mínima para o merge (só os campos que a função lê/preserva). */
function venda(opts: Partial<SaleRecord> & { id: string }): SaleRecord {
  return {
    at: opts.at ?? "2026-06-22T10:00:00.000Z",
    lines: opts.lines ?? [
      { inventoryId: "p1", name: "Produto", quantity: 1, unitPrice: 24, lineTotal: 24, qtyReturned: 0 },
    ],
    total: opts.total ?? 24,
    paymentBreakdown: opts.paymentBreakdown ?? {
      dinheiro: 24,
      pix: 0,
      cartaoDebito: 0,
      cartaoCredito: 0,
      carne: 0,
      aPrazo: 0,
      creditoVale: 0,
    },
    ...opts,
  } as SaleRecord
}

describe("mergeSalesById — propagação de status autoritativo", () => {
  it("propaga status 'cancelada' do servidor para a venda local (que estava sem status)", () => {
    const local = [venda({ id: "VDA-2026-0001" })] // status undefined => tratada como concluída
    const remote = [venda({ id: "VDA-2026-0001", status: "cancelada" })]
    const merged = mergeSalesById(local, remote)
    expect(merged[0]!.status).toBe("cancelada")
  })

  it("limpa syncPending E propaga status quando a venda já existe no servidor", () => {
    const local = [venda({ id: "VDA-2026-0001", syncPending: true })]
    const remote = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const merged = mergeSalesById(local, remote)
    expect(merged[0]!.syncPending).toBe(false)
    expect(merged[0]!.status).toBe("concluida")
  })

  it("NUNCA apaga o status local com undefined remoto (servidor legado sem status)", () => {
    const local = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const remote = [venda({ id: "VDA-2026-0001", status: undefined })]
    const merged = mergeSalesById(local, remote)
    expect(merged[0]!.status).toBe("concluida")
  })

  it("NÃO sobrescreve lines/qtyReturned locais (preserva devolução offline pendente)", () => {
    const local = [
      venda({
        id: "VDA-2026-0001",
        lines: [{ inventoryId: "p1", name: "P", quantity: 2, unitPrice: 10, lineTotal: 20, qtyReturned: 1 }],
      }),
    ]
    const remote = [
      venda({
        id: "VDA-2026-0001",
        status: "cancelada",
        lines: [{ inventoryId: "p1", name: "P", quantity: 2, unitPrice: 10, lineTotal: 20, qtyReturned: 0 }],
      }),
    ]
    const merged = mergeSalesById(local, remote)
    expect(merged[0]!.status).toBe("cancelada")
    expect(merged[0]!.lines[0]!.qtyReturned).toBe(1) // mantém o estado local
  })

  it("adiciona vendas remotas inexistentes localmente, ordenadas por `at`", () => {
    const local = [venda({ id: "VDA-2026-0002", at: "2026-06-22T12:00:00.000Z" })]
    const remote = [
      venda({ id: "VDA-2026-0002", at: "2026-06-22T12:00:00.000Z", status: "concluida" }),
      venda({ id: "VDA-2026-0001", at: "2026-06-22T09:00:00.000Z", status: "concluida" }),
    ]
    const merged = mergeSalesById(local, remote)
    expect(merged.map((s) => s.id)).toEqual(["VDA-2026-0001", "VDA-2026-0002"])
  })

  it("retorna a MESMA referência quando nada muda (sem churn de render)", () => {
    const local = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const remote = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const merged = mergeSalesById(local, remote)
    expect(merged).toBe(local)
  })
})

/**
 * GOAL: PDV-PEDIDO-ID-COLISAO-MULTILOJA-FIX-001 — estar no `remote` significa estar no
 * banco, ou seja, confirmada. Nenhum marcador local pode sobreviver ao merge nem ser
 * reinjetado por uma venda remota extra (payload legado com `syncPending: true`).
 */
describe("mergeSalesById — marcadores client-only nunca voltam do servidor", () => {
  it("9. venda remota EXTRA nunca entra no estado como pendente", () => {
    const local: SaleRecord[] = []
    const remote = [
      venda({ id: "VDA-2026-0046", syncPending: true, syncBlockedCode: "CAIXA_ORIGINAL_FECHADO" }),
    ]
    const merged = mergeSalesById(local, remote)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.syncPending).toBeUndefined()
    expect(merged[0]!.syncBlockedCode).toBeUndefined()
    // Campos legítimos da venda remota preservados.
    expect(merged[0]!.id).toBe("VDA-2026-0046")
    expect(merged[0]!.total).toBe(24)
  })

  it("10. venda local já existente no servidor tem syncPending E syncBlockedCode limpos", () => {
    const local = [
      venda({ id: "VDA-2026-0001", syncPending: true, syncBlockedCode: "CAIXA_ORIGINAL_FECHADO" }),
    ]
    const remote = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const merged = mergeSalesById(local, remote)
    expect(merged[0]!.syncPending).toBe(false)
    expect(merged[0]!.syncBlockedCode).toBeUndefined()
    expect(merged[0]!.status).toBe("concluida")
  })

  it("10b. limpeza converge: o merge seguinte devolve a MESMA referência", () => {
    const local = [venda({ id: "VDA-2026-0001", status: "concluida", syncBlockedCode: "X" })]
    const remote = [venda({ id: "VDA-2026-0001", status: "concluida" })]
    const primeiro = mergeSalesById(local, remote)
    expect(primeiro).not.toBe(local)
    const segundo = mergeSalesById(primeiro, remote)
    expect(segundo).toBe(primeiro)
  })

  it("venda local pendente AUSENTE no servidor continua pendente", () => {
    const local = [venda({ id: "VDA-2026-0046", syncPending: true })]
    const remote = [venda({ id: "VDA-2026-0500", status: "concluida" })]
    const merged = mergeSalesById(local, remote)
    const pendente = merged.find((s) => s.id === "VDA-2026-0046")!
    expect(pendente.syncPending).toBe(true)
  })

  it("preserva syncBlockedCode da venda local ausente no servidor (orientação da UI)", () => {
    const local = [
      venda({ id: "VDA-2026-0046", syncPending: true, syncBlockedCode: "PEDIDO_ID_DE_OUTRA_LOJA" }),
    ]
    const merged = mergeSalesById(local, [])
    expect(merged[0]!.syncBlockedCode).toBe("PEDIDO_ID_DE_OUTRA_LOJA")
    expect(merged[0]!.syncPending).toBe(true)
  })

  it.each([
    "PEDIDO_ID_DE_OUTRA_LOJA",
    "PEDIDO_ID_CONFLITO_MESMA_LOJA",
  ])("preserva quarentena %s e a venda remota ocupante (duas entidades)", (code) => {
    const local = [venda({ id: "VDA-2026-0046", syncPending: false, syncBlockedCode: code })]
    const remote = [venda({ id: "VDA-2026-0046", status: "cancelada", total: 999 })]

    const merged = mergeSalesById(local, remote)

    expect(merged).toHaveLength(2)
    const localRow = merged.find((s) => s.syncBlockedCode === code)
    const remoteRow = merged.find((s) => s.status === "cancelada")
    expect(localRow).toMatchObject({
      id: "VDA-2026-0046",
      total: 24,
      syncPending: true,
      syncBlockedCode: code,
    })
    expect(remoteRow).toMatchObject({
      id: "VDA-2026-0046",
      total: 999,
      status: "cancelada",
    })
    expect(remoteRow!.syncPending).toBeUndefined()
  })
})


describe("manual KG authoritative correction projection", () => {
  it.each([false, true])("reconciles V2=%s facts and revision even without a monetary change", (v2) => {
    const local = venda({ id: v2 ? "PEND-local" : "VDA-KG", clientSaleId: v2 ? "client-kg" : undefined, manualKgSale: "classic-manual-kg-v1", manualKgRevision: 0, localEffectsApplied: true, total: .35, lines: [{ inventoryId: "kg", name: "KG", quantity: .35, unitPrice: 1, lineTotal: .35, quantityUnit: "KG" }], paymentBreakdown: { dinheiro: .35, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 } })
    const remote = { ...local, id: "VDA-KG", serverId: "db", manualKgRevision: 1, lines: [{ ...local.lines[0], quantity: .351 }], localEffectsApplied: false }
    const merged = mergeSalesById([local], [remote])
    expect(merged[0]).toMatchObject({ id: "VDA-KG", manualKgRevision: 1, localEffectsApplied: true, lines: [{ quantity: .351 }] })
    expect(mergeSalesById(merged, [remote])).toBe(merged)
    expect(kgCashProjectionDelta([local], [remote])).toBe(0)
  })
  it("reflects the monetary correction once for cash this terminal already applied", () => {
    const local = venda({ id: "VDA-KG", manualKgSale: "classic-manual-kg-v1", total: 7, paymentBreakdown: { dinheiro: 7, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 }, localEffectsApplied: true })
    const remote = { ...local, total: 6, manualKgRevision: 1, paymentBreakdown: { ...local.paymentBreakdown, dinheiro: 6 } }
    expect(kgCashProjectionDelta([local], [remote])).toBe(-1)
    const merged = mergeSalesById([local], [remote])
    expect(kgCashProjectionDelta(merged, [remote])).toBe(0)
    expect(kgCashProjectionDelta([{ ...local, localEffectsApplied: false }], [remote])).toBe(0)
    expect(kgCashProjectionDelta(merged, [{ ...remote, status: "cancelada" }])).toBe(-6)
  })
})


describe("KG delayed response isolation", () => {
  it.each([false, true])("V2=%s ignores lower revisions and terminal status regressions", (v2) => {
    const current = venda({ id: "VDA-KG", clientSaleId: v2 ? "kg-client" : undefined, manualKgSale: "classic-manual-kg-v1", manualKgRevision: 1, localEffectsApplied: true, status: "concluida", total: 6, paymentBreakdown: { dinheiro: 6, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 } })
    const old = { ...current, manualKgRevision: 0, total: 7, paymentBreakdown: { ...current.paymentBreakdown, dinheiro: 7 } }
    expect(mergeSalesById([current], [old])[0]).toBe(current)
    expect(kgCashProjectionDelta([current], [old])).toBe(0)
    const canceled = { ...current, status: "cancelada" as const, manualKgRevision: 2 }
    expect(mergeSalesById([canceled], [current])[0]).toBe(canceled)
    expect(kgCashProjectionDelta([canceled], [current])).toBe(0)
  })
  it("cash corrections respect the original session and ledger date", () => {
    const previous = venda({ id: "VDA-KG", sessaoId: "cash-yesterday", at: "2026-10-28T12:00:00Z", manualKgSale: "classic-manual-kg-v1", manualKgRevision: 0, localEffectsApplied: true, total: 7, paymentBreakdown: { dinheiro: 7, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0 } })
    const current = { ...previous, manualKgRevision: 1, total: 6, paymentBreakdown: { ...previous.paymentBreakdown, dinheiro: 6 } }
    expect(kgCashProjectionDelta([previous], [current], { sessaoId: "cash-today" })).toBe(0)
    expect(kgCashProjectionDelta([previous], [current], { ledgerDate: "2026-10-29" })).toBe(0)
    expect(kgCashProjectionDelta([previous], [current], { sessaoId: "cash-yesterday" })).toBe(-1)
    expect(kgCashProjectionDelta([previous], [current], { ledgerDate: "2026-10-28" })).toBe(-1)
  })
})
