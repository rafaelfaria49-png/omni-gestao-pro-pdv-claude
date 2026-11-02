/**
 * PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001 — o preflight da recuperação de quarentena
 * (`readQuarantineServerFacts`) precisa resolver produto EXATAMENTE como o writer
 * (`productResolutionKey`): `produtoId` + loja quando a linha traz; senão id|sku|barcode.
 * Sem isso o preview bloqueava (PRODUCT_UNRESOLVED) uma venda que o writer gravaria, ou
 * conferia saldo contra o produto que hoje ocupa o SKU antigo.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { readQuarantineServerFacts } from "./quarantine-recovery-service"

type FakeProduct = { id: string; storeId: string; sku: string | null; barcode: string | null; name: string; stock: number }

function makeDb(products: FakeProduct[]) {
  const matches = (p: FakeProduct, where: any) => {
    if (where.storeId !== undefined && p.storeId !== where.storeId) return false
    if (where.id !== undefined && p.id !== where.id) return false
    const ors: Array<Record<string, string>> | undefined = where.OR
    if (!ors) return true
    return ors.some(
      (c) => (c.id !== undefined && p.id === c.id) || (c.sku !== undefined && p.sku === c.sku) || (c.barcode !== undefined && p.barcode === c.barcode),
    )
  }
  return {
    venda: { findFirst: async () => null, findUnique: async () => null, findMany: async () => [] },
    sessaoCaixa: { findFirst: async () => null, findUnique: async () => null, findMany: async () => [] },
    produto: {
      findFirst: async ({ where }: any) => {
        const p = products.find((candidate) => matches(candidate, where))
        return p ? { id: p.id, name: p.name, stock: p.stock } : null
      },
    },
  } as any
}

const STORE = "loja-a01"

function candidate(lines: Array<Record<string, unknown>>) {
  return {
    id: "PEND-cs_attempt_abc123",
    clientSaleId: "cs_attempt_abc123",
    at: "2026-11-01T15:03:17.000Z",
    total: 8,
    lines,
  } as any
}

describe("readQuarantineServerFacts — mesma resolução de produto do writer", () => {
  it("produtoId com SKU editado resolve (não vira PRODUCT_UNRESOLVED)", async () => {
    const db = makeDb([{ id: "cuid-pel", storeId: STORE, sku: "PEL-NOVO", barcode: null, name: "PELÍCULA", stock: 10 }])
    const facts = await readQuarantineServerFacts({
      storeId: STORE,
      db,
      candidate: candidate([{ inventoryId: "PEL-ANTIGO", produtoId: "cuid-pel", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
    })
    expect(facts.unresolvedInventoryIds).toEqual([])
    expect(facts.stockShortfalls).toEqual([])
  })

  it("produtoId excluído não confere saldo contra o produto que hoje tem o SKU antigo", async () => {
    const db = makeDb([{ id: "cuid-capinha", storeId: STORE, sku: "PEL-ANTIGO", barcode: null, name: "CAPINHA", stock: 0 }])
    const facts = await readQuarantineServerFacts({
      storeId: STORE,
      db,
      candidate: candidate([{ inventoryId: "PEL-ANTIGO", produtoId: "cuid-pel", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
    })
    expect(facts.unresolvedInventoryIds).toEqual(["PEL-ANTIGO"])
    expect(facts.stockShortfalls).toEqual([])
  })

  it("linha legada sem produtoId mantém o OR id|sku|barcode", async () => {
    const db = makeDb([{ id: "cuid-pel", storeId: STORE, sku: "PEL-NOVO", barcode: null, name: "PELÍCULA", stock: 10 }])
    const facts = await readQuarantineServerFacts({
      storeId: STORE,
      db,
      candidate: candidate([{ inventoryId: "PEL-NOVO", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
    })
    expect(facts.unresolvedInventoryIds).toEqual([])
  })
})
