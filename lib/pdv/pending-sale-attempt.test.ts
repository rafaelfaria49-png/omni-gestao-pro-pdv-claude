import { describe, expect, it } from "vitest"
import {
  findMatchingPendingSale,
  saleAttemptFingerprint,
  saleAttemptStorageKey,
  saleRecordAttemptFingerprint,
} from "./pending-sale-attempt"
import type { SaleRecord } from "@/lib/operations-sale-types"

const pb = {
  dinheiro: 18,
  pix: 0,
  cartaoDebito: 0,
  cartaoCredito: 0,
  carne: 0,
  aPrazo: 0,
  creditoVale: 0,
}

describe("saleAttemptFingerprint", () => {
  it("mesma tentativa (ordem de linhas diferente) gera a mesma impressão", () => {
    const a = saleAttemptFingerprint({
      lines: [
        { inventoryId: "b", quantity: 1, unitPrice: 8 },
        { inventoryId: "a", quantity: 2, unitPrice: 5 },
      ],
      total: 18,
      paymentBreakdown: pb,
    })
    const b = saleAttemptFingerprint({
      lines: [
        { inventoryId: "a", quantity: 2, unitPrice: 5 },
        { inventoryId: "b", quantity: 1, unitPrice: 8 },
      ],
      total: 18,
      paymentBreakdown: pb,
    })
    expect(a).toBe(b)
  })

  it("lojas diferentes usam chaves de persistência isoladas", () => {
    expect(saleAttemptStorageKey("loja-1")).not.toBe(saleAttemptStorageKey("loja-2"))
  })
})
