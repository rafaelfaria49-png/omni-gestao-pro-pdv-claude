import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import {
  closePersistedSaleAttemptIfIdentity,
  findMatchingPendingSale,
  readPersistedSaleAttempt,
  reconcilePersistedSaleAttempts,
  resolvePersistedAttemptForNewSale,
  saleAttemptFingerprint,
  saleAttemptStorageKey,
  shouldReusePersistedSaleAttempt,
  writePersistedSaleAttempt,
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

function installLocalStorageShim() {
  const store = new Map<string, string>()
  const fake = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  ;(globalThis as unknown as { window: { localStorage: typeof fake } }).window = { localStorage: fake }
  return store
}

function uninstallLocalStorageShim() {
  delete (globalThis as { window?: unknown }).window
}

const FP = saleAttemptFingerprint({
  lines: [{ inventoryId: "P0002FINISH", quantity: 1, unitPrice: 20 }],
  total: 20,
  paymentBreakdown: { ...pb, dinheiro: 20 },
})

const ATTEMPT_A = {
  fingerprint: FP,
  clientSaleId: "cs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  saleId: "PEND-cs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  at: "2026-09-19T14:49:48.131Z",
}

const ATTEMPT_B = {
  fingerprint: FP,
  clientSaleId: "cs_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  saleId: "PEND-cs_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  at: "2026-09-19T14:58:05.959Z",
}

describe("ciclo de vida da tentativa após confirmação", () => {
  beforeEach(() => {
    installLocalStorageShim()
  })
  afterEach(() => {
    uninstallLocalStorageShim()
  })

  it("retry da mesma pending reutiliza a clientSaleId", () => {
    writePersistedSaleAttempt("loja-1", ATTEMPT_A)
    const pending = [
      { id: ATTEMPT_A.saleId, clientSaleId: ATTEMPT_A.clientSaleId, syncPending: true },
    ]
    expect(shouldReusePersistedSaleAttempt(ATTEMPT_A, pending)).toBe(true)
    expect(resolvePersistedAttemptForNewSale("loja-1", FP, pending)?.clientSaleId).toBe(
      ATTEMPT_A.clientSaleId,
    )
    expect(findMatchingPendingSale([{ id: ATTEMPT_A.saleId, clientSaleId: ATTEMPT_A.clientSaleId, syncPending: true, lines: [{ inventoryId: "P0002FINISH", quantity: 1, unitPrice: 20, lineTotal: 20, name: "x" }], total: 20, paymentBreakdown: { ...pb, dinheiro: 20 }, at: ATTEMPT_A.at }] as SaleRecord[], FP)?.clientSaleId).toBe(ATTEMPT_A.clientSaleId)
  })

  it("nova venda legítima igual não herda identidade já confirmada", () => {
    writePersistedSaleAttempt("loja-1", ATTEMPT_A)
    const confirmed = [
      { id: "VDA-H02-2026-000001", clientSaleId: ATTEMPT_A.clientSaleId, syncPending: false },
    ]
    expect(shouldReusePersistedSaleAttempt(ATTEMPT_A, confirmed)).toBe(false)
    expect(resolvePersistedAttemptForNewSale("loja-1", FP, confirmed)).toBeNull()
  })

  it("confirmação encerra só a identidade correspondente", () => {
    writePersistedSaleAttempt("loja-1", ATTEMPT_A)
    closePersistedSaleAttemptIfIdentity("loja-1", { clientSaleId: ATTEMPT_A.clientSaleId, saleId: ATTEMPT_A.saleId })
    expect(readPersistedSaleAttempt("loja-1", FP)).toBeNull()
  })

  it("confirmação tardia de A não apaga tentativa B mais nova no mesmo fingerprint", () => {
    writePersistedSaleAttempt("loja-1", ATTEMPT_B)
    closePersistedSaleAttemptIfIdentity("loja-1", {
      clientSaleId: ATTEMPT_A.clientSaleId,
      saleId: ATTEMPT_A.saleId,
    })
    expect(readPersistedSaleAttempt("loja-1", FP)?.clientSaleId).toBe(ATTEMPT_B.clientSaleId)
  })

  it("reconcile encerra confirmadas, preserva pending e ausentes", () => {
    writePersistedSaleAttempt("loja-1", ATTEMPT_A)
    writePersistedSaleAttempt("loja-2", ATTEMPT_A)
    reconcilePersistedSaleAttempts("loja-1", [
      { id: "VDA-H02-2026-000001", clientSaleId: ATTEMPT_A.clientSaleId, syncPending: false },
    ])
    expect(readPersistedSaleAttempt("loja-1", FP)).toBeNull()
    expect(readPersistedSaleAttempt("loja-2", FP)?.clientSaleId).toBe(ATTEMPT_A.clientSaleId)

    writePersistedSaleAttempt("loja-1", ATTEMPT_B)
    reconcilePersistedSaleAttempts("loja-1", [
      { id: ATTEMPT_B.saleId, clientSaleId: ATTEMPT_B.clientSaleId, syncPending: true },
    ])
    expect(readPersistedSaleAttempt("loja-1", FP)?.clientSaleId).toBe(ATTEMPT_B.clientSaleId)

    reconcilePersistedSaleAttempts("loja-1", [])
    expect(readPersistedSaleAttempt("loja-1", FP)?.clientSaleId).toBe(ATTEMPT_B.clientSaleId)
  })

  it("lista parcial vazia não prova inexistência — pending ausente continua reutilizável", () => {
    expect(shouldReusePersistedSaleAttempt(ATTEMPT_A, [])).toBe(true)
  })
})

describe("operations-store amarra confirmação e nova venda ao contrato", () => {
  it("não reutiliza readPersistedSaleAttempt cru na escolha de identidade", () => {
    const store = readFileSync(join(resolve(__dirname, ".."), "operations-store.tsx"), "utf8")
    expect(store).toContain("closePersistedSaleAttemptIfIdentity")
    expect(store).toContain("resolvePersistedAttemptForNewSale")
    expect(store).toContain("reconcilePersistedSaleAttempts")
    expect(store).not.toMatch(/reusedIdentity = readPersistedSaleAttempt\(/)
    expect(store).not.toMatch(/clearPersistedSaleAttempt\(lj, fingerprint\)\s*$/m)
  })
})
