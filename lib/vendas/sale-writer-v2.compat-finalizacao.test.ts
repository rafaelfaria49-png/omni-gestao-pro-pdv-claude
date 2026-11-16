/**
 * COMPAT-PROFISSIONAL-001 — o writer V2 reconstrói as opções do upsert; o sinal de finalização
 * ao vivo (guard de cor desativada) precisa chegar ao `upsertVendaInTransaction` (revisão Codex).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({ upsert: vi.fn(), opts: [] as unknown[] }))

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({}) },
}))
vi.mock("@/lib/ops-upsert-venda", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/ops-upsert-venda")>()
  return {
    ...orig,
    upsertVendaInTransaction: (...args: unknown[]) => {
      h.opts.push(args[4])
      return h.upsert(...args)
    },
  }
})

import { persistSaleV2 } from "./sale-writer-v2"

const sale = { id: "PEND-1", total: 10, paymentBreakdown: { dinheiro: 10 }, lines: [] } as never

beforeEach(() => {
  h.opts = []
  h.upsert.mockReset().mockResolvedValue({ replayed: false, venda: { id: "v1" } })
})

describe("persistSaleV2 — sinal de finalização ao vivo", () => {
  it("encaminha finalizacaoAoVivo quando a rota recebe tentativa=finalize", async () => {
    await persistSaleV2({ storeId: "loja-a", sale, clientSaleId: "cs_aaaaaaaaaaaa", options: { finalizacaoAoVivo: true } })
    expect(h.opts[0]).toMatchObject({ finalizacaoAoVivo: true, enforceStock: true })
  })

  it("reenvio (sem o sinal) não liga o guard", async () => {
    await persistSaleV2({ storeId: "loja-a", sale, clientSaleId: "cs_aaaaaaaaaaaa", options: { enforceStock: true } })
    expect(h.opts[0]).not.toHaveProperty("finalizacaoAoVivo")
  })
})
