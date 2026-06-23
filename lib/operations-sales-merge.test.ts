import { describe, expect, it } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { mergeSalesById } from "./operations-sales-merge"

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
