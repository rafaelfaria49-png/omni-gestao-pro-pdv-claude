import { describe, expect, it } from "vitest"
import {
  classifyStockDrift,
  isProvenStructuralRepair,
  STOCK_DRIFT_REASON,
  sumDepositQuantities,
} from "./stock-drift-reconcile"

const target = "d1"

function c(over: {
  stock: number
  deposits: Array<{ depositoId: string; quantidade: number }>
  lastLedgerEstoqueDepois?: number | null
}) {
  return classifyStockDrift({
    stock: over.stock,
    deposits: over.deposits,
    targetDepositoId: target,
    lastLedgerEstoqueDepois: over.lastLedgerEstoqueDepois ?? null,
  })
}

describe("classifyStockDrift", () => {
  it("saldos iguais", () => {
    const r = c({ stock: 4, deposits: [{ depositoId: target, quantidade: 4 }] })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.ALIGNED)
    expect(isProvenStructuralRepair(r)).toBe(false)
  })

  it("SUM>stock absorvível sem livro (legado PDV / PR #212)", () => {
    const r = c({ stock: 4, deposits: [{ depositoId: target, quantidade: 5 }] })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG)
    expect(r.proven).toBe(true)
    expect(r.alignedTargetQty).toBe(4)
    expect(r.alignedStock).toBe(4)
  })

  it("SUM>stock com livro casando com stock", () => {
    const r = c({
      stock: 41,
      deposits: [{ depositoId: target, quantidade: 45 }],
      lastLedgerEstoqueDepois: 41,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG)
    expect(r.authority).toBe("livro-casa-com-stock")
  })

  it("SUM<stock com linha zero (bootstrap equivalente)", () => {
    const r = c({ stock: 7, deposits: [{ depositoId: target, quantidade: 0 }] })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.UNMATERIALIZED_ZERO)
    expect(r.proven).toBe(true)
    expect(r.alignedTargetQty).toBe(7)
  })

  it("ausência de linha é aligned aqui — bootstrap fica no serviço", () => {
    const r = c({ stock: 7, deposits: [] })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.ALIGNED)
    expect(sumDepositQuantities([])).toBe(0)
  })

  it("SUM<stock com livro casando com stock e um depósito", () => {
    const r = c({
      stock: 10,
      deposits: [{ depositoId: target, quantidade: 4 }],
      lastLedgerEstoqueDepois: 10,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEGACY_DEPOSIT_UNDERCOUNT)
    expect(r.alignedTargetQty).toBe(10)
    expect(isProvenStructuralRepair(r)).toBe(true)
  })

  it("SUM<stock sem livro e depósito com saldo é bloqueio", () => {
    const r = c({ stock: 10, deposits: [{ depositoId: target, quantidade: 4 }] })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.UNPROVEN_WITHOUT_LEDGER)
    expect(r.proven).toBe(false)
    expect(isProvenStructuralRepair(r)).toBe(false)
  })

  it("dois depósitos positivos com SUM>stock não cortam o alvo por conveniência", () => {
    const r = c({
      stock: 4,
      deposits: [
        { depositoId: target, quantidade: 1 },
        { depositoId: "d2", quantidade: 5 },
      ],
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS)
    expect(r.proven).toBe(false)
    expect(isProvenStructuralRepair(r)).toBe(false)
    expect(r.alignedTargetQty).toBeNull()
  })

  it("overhang absorvível no principal com outro depósito positivo permanece ambíguo", () => {
    const r = c({
      stock: 6,
      deposits: [
        { depositoId: target, quantidade: 6 },
        { depositoId: "d2", quantidade: 2 },
      ],
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS)
    expect(r.proven).toBe(false)
    expect(isProvenStructuralRepair(r)).toBe(false)
    expect(r.alignedTargetQty).toBeNull()
    expect(r.alignedStock).toBeNull()
  })

  it("livro casa com a soma — cache de stock obsoleto", () => {
    const r = c({
      stock: 10,
      deposits: [{ depositoId: target, quantidade: 4 }],
      lastLedgerEstoqueDepois: 4,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEGACY_STOCK_CACHE_STALE)
    expect(r.alignedStock).toBe(4)
    expect(isProvenStructuralRepair(r)).toBe(true)
  })

  it("cache obsoleto com dois depósitos não escolhe bin", () => {
    const r = c({
      stock: 10,
      deposits: [
        { depositoId: target, quantidade: 6 },
        { depositoId: "d2", quantidade: 2 },
      ],
      lastLedgerEstoqueDepois: 8,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEGACY_STOCK_CACHE_STALE)
    expect(r.proven).toBe(true)
    expect(r.alignedStock).toBe(8)
    expect(r.alignedTargetQty).toBe(6)
  })

  it("múltiplos depósitos com SUM<stock mesmo com livro no stock", () => {
    const r = c({
      stock: 10,
      deposits: [
        { depositoId: target, quantidade: 2 },
        { depositoId: "d2", quantidade: 3 },
      ],
      lastLedgerEstoqueDepois: 10,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.MULTI_DEPOSIT_AMBIGUOUS)
    expect(r.proven).toBe(false)
  })

  it("livro conflita com os dois lados", () => {
    const r = c({
      stock: 10,
      deposits: [{ depositoId: target, quantidade: 4 }],
      lastLedgerEstoqueDepois: 7,
    })
    expect(r.reason).toBe(STOCK_DRIFT_REASON.LEDGER_CONFLICT)
    expect(r.proven).toBe(false)
  })

  it("duas lojas não se misturam — classificação é só do recorte recebido", () => {
    const a = c({
      stock: 4,
      deposits: [{ depositoId: target, quantidade: 5 }],
    })
    const b = classifyStockDrift({
      stock: 8,
      deposits: [{ depositoId: "dx", quantidade: 8 }],
      targetDepositoId: "dx",
      lastLedgerEstoqueDepois: 8,
    })
    expect(a.reason).toBe(STOCK_DRIFT_REASON.LEGACY_DEPOSIT_OVERHANG)
    expect(b.reason).toBe(STOCK_DRIFT_REASON.ALIGNED)
  })
})
