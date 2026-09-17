/**
 * CAD-R2-007 — Testes do boundary canônico para REST:
 * CLEAR_METADATA explícito, Tx componível sem nested, idempotência e mappers.
 */
import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Prisma } from "@/generated/prisma"

vi.mock("@/lib/prisma", () => ({
  prisma: {},
  prismaEnsureConnected: async () => {},
}))

import {
  createProduct,
  updateProduct,
  updateProductTx,
} from "@/lib/cadastros/product-write-service"
import type { ProductWriteDb } from "@/lib/cadastros/product-write-service"
import {
  mapProductWriteFailureToResponse,
  mapStockLedgerFailureToResponse,
  restPatchIdempotencyKey,
} from "@/lib/cadastros/product-rest-write-adapter"

type FakeRow = {
  id: string
  storeId: string
  name: string
  sku: string | null
  barcode: string | null
  metadata: Record<string, unknown> | null
  stock: number
  price: number
  active: boolean
  status: string
}

function seedRow(partial: Partial<FakeRow> & { id: string; storeId: string }): FakeRow {
  return {
    name: "Produto",
    sku: null,
    barcode: null,
    metadata: null,
    stock: 0,
    price: 0,
    active: true,
    status: "Ativo",
    ...partial,
  }
}

function makeDb(seed: FakeRow[] = []) {
  const rows = new Map(seed.map((r) => [r.id, { ...r, metadata: r.metadata ? { ...r.metadata } : null }]))
  const calls: string[] = []
  const tx = {
    produto: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        calls.push("tx.produto.findFirst")
        for (const row of rows.values()) {
          const w = args.where
          if (w.storeId !== undefined && row.storeId !== w.storeId) continue
          const idCond = w.id as string | { not?: string } | undefined
          if (typeof idCond === "string" && row.id !== idCond) continue
          if (idCond && typeof idCond === "object" && idCond.not !== undefined && row.id === idCond.not) continue
          if (Array.isArray((w as { OR?: unknown[] }).OR)) {
            const ors = (w as unknown as { OR: Array<Record<string, unknown>> }).OR
            const hit = ors.some((c) => {
              if (c.sku !== undefined) return row.sku !== null && row.sku === c.sku
              if (c.barcode !== undefined) return row.barcode !== null && row.barcode === c.barcode
              return false
            })
            if (!hit) continue
          } else if (w.id !== undefined && typeof w.id === "string") {
            // match id only
          }
          return { ...row, metadata: row.metadata ? { ...row.metadata } : null }
        }
        return null
      },
      findUnique: async (args: { where: { id?: string } }) => {
        calls.push("tx.produto.findUnique")
        const row = args.where?.id ? rows.get(args.where.id) : undefined
        return row ? { id: row.id, storeId: row.storeId } : null
      },
      create: async () => {
        calls.push("tx.produto.create")
        return { id: "new" }
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.push("tx.produto.update")
        const row = rows.get(args.where.id)
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError("x", { code: "P2025", clientVersion: "test" })
        }
        Object.assign(row, args.data)
        return { id: row.id }
      },
    },
    logsAuditoria: {
      create: async () => {
        calls.push("tx.logsAuditoria.create")
        return { id: "audit-1" }
      },
    },
    $queryRaw: async () => {
      calls.push("tx.$queryRaw")
      return []
    },
    deposito: { findFirst: async () => null, findUnique: async () => null, create: async () => ({ id: "d", storeId: "loja-a" }) },
    produtoDeposito: { findMany: async () => [], upsert: async () => ({}) },
    movimentacaoEstoque: { findFirst: async () => null, create: async () => ({ id: "m" }) },
  }
  const db = {
    produto: {
      findFirst: async () => null,
      findUnique: async () => null,
    },
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>): Promise<T> => {
      calls.push("$transaction")
      return fn(tx)
    },
  } as unknown as ProductWriteDb
  return { db, rows, calls, tx }
}

const PRINCIPAL = { userId: "u1", displayLabel: "Op" }
const ctx = () => ({ storeId: "loja-a", principal: PRINCIPAL })

describe("CAD-R2-007 — CLEAR_METADATA explícito", () => {
  it("interactive metadata:null preserva (sem opção)", async () => {
    const { db, rows } = makeDb([
      seedRow({ id: "p1", storeId: "loja-a", metadata: { fiscal: { ncm: "1" } } }),
    ])
    const r = await updateProduct(ctx(), "p1", { nome: "A", metadata: null }, { db })
    expect(r.ok).toBe(true)
    expect(rows.get("p1")?.metadata).toEqual({ fiscal: { ncm: "1" } })
  })

  it("REST metadata:null com clearMetadata limpa (DbNull → null)", async () => {
    const { db, rows } = makeDb([
      seedRow({ id: "p1", storeId: "loja-a", metadata: { fiscal: { ncm: "1" } } }),
    ])
    const r = await updateProduct(ctx(), "p1", { nome: "A", metadata: null }, { db, clearMetadata: true })
    expect(r.ok).toBe(true)
    // Prisma DbNull aplicado via update → fake guarda o símbolo; aceita null/símbolo como limpo
    const meta = rows.get("p1")?.metadata as unknown
    expect(meta === null || String(meta).includes("DbNull") || meta === Prisma.DbNull).toBe(true)
  })

  it("CLEAR + fiscal reconstrói sobre base zerada", async () => {
    const { db, rows } = makeDb([
      seedRow({ id: "p1", storeId: "loja-a", metadata: { importacao: { lote: "L" } } }),
    ])
    const r = await updateProduct(
      ctx(),
      "p1",
      { nome: "A", metadata: null, ncm: "84713012" },
      { db, clearMetadata: true },
    )
    expect(r.ok).toBe(true)
    const meta = rows.get("p1")?.metadata as Record<string, unknown>
    expect(meta).toBeDefined()
    expect((meta.fiscal as Record<string, unknown>)?.ncm).toBe("84713012")
  })
})

describe("CAD-R2-007 — Tx componível sem nested", () => {
  it("updateProduct abre UMA transaction; updateProductTx não abre", async () => {
    const { db, calls } = makeDb([seedRow({ id: "p1", storeId: "loja-a" })])
    await updateProduct(ctx(), "p1", { nome: "B" }, { db })
    expect(calls).toContain("$transaction")
    expect(calls).toContain("tx.produto.update")

    const inner = makeDb([seedRow({ id: "p1", storeId: "loja-a" })])
    const r = await updateProductTx(inner.tx as never, ctx(), "p1", { nome: "C" })
    expect(r.ok).toBe(true)
    expect(inner.calls).not.toContain("$transaction")
    expect(inner.calls).toContain("tx.produto.update")
  })

  it("updateProductTx + ledger compartilham o mesmo tx (composição)", async () => {
    const src = readFileSync(resolve(process.cwd(), "app/api/produtos/[id]/route.ts"), "utf8")
    expect(src).toMatch(/updateProductTx/)
    expect(src).toMatch(/applyStockMutationTx/)
    expect(src).toMatch(/\$transaction/)
    // Sem nested: Tx variant nunca abre transação própria
    const svc = readFileSync(resolve(process.cwd(), "lib/cadastros/product-write-service.ts"), "utf8")
    const txBody = svc.slice(svc.indexOf("export async function updateProductTx"))
    expect(txBody.slice(0, 4000)).not.toMatch(/\$transaction/)
  })

  it("rotas REST sem Prisma Produto direto (create/update)", async () => {
    for (const f of ["app/api/produtos/route.ts", "app/api/produtos/[id]/route.ts", "app/api/produtos/[id]/codigos/route.ts"]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8")
      expect(src, f).not.toMatch(/prisma\.produto\.(create|update|updateMany|upsert)\s*\(/)
      expect(src, f).not.toMatch(/tx\.produto\.(create|update|updateMany|upsert)\s*\(/)
    }
    const bulk = readFileSync(resolve(process.cwd(), "app/api/produtos/bulk-action/route.ts"), "utf8")
    expect(bulk).toMatch(/updateProductTx/)
    expect(bulk).not.toMatch(/tx\.produto\.updateMany/)
  })

  it("nenhuma rota REST normal escreve stock direto", async () => {
    for (const f of [
      "app/api/produtos/route.ts",
      "app/api/produtos/[id]/route.ts",
      "app/api/produtos/[id]/codigos/route.ts",
      "app/api/produtos/bulk-action/route.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8")
      expect(src, f).not.toMatch(/data\.stock\s*=/)
      expect(src, f).not.toMatch(/stock\s*:\s*\{\s*(increment|decrement)/)
    }
  })

  it("imports migrados em 014 (sem write direto de Produto)", async () => {
    // CAD-R2-014: os 4 import writers ativos usam os boundaries canônicos.
    // O allowlist "não migrados" do 007 foi aposentado aqui.
    for (const f of [
      "lib/importador-produtos/persist.ts",
      "lib/importador-avancado/persistidor.ts",
      "app/api/ops/inventory/import/route.ts",
      "app/api/stores/import-catalog/route.ts",
    ]) {
      const src = readFileSync(resolve(process.cwd(), f), "utf8")
      expect(src, f).not.toMatch(/prisma\.produto\.(create|update|updateMany|upsert)\s*\(/)
      expect(src, f).not.toMatch(/tx\.produto\.(create|update|updateMany|upsert)\s*\(/)
    }
    const catalog = readFileSync(resolve(process.cwd(), "app/api/stores/import-catalog/route.ts"), "utf8")
    expect(catalog).toMatch(/createProductTx/)
    expect(catalog).toMatch(/updateProductTx/)
    expect(catalog).toMatch(/applyStockMutationTx/)
    const ops = readFileSync(resolve(process.cwd(), "app/api/ops/inventory/import/route.ts"), "utf8")
    expect(ops).toMatch(/createProduct/)
    expect(ops).toMatch(/updateProduct/)
  })
})

describe("CAD-R2-007 — idempotência do PATCH", () => {
  it("sem header → null (compat, nunca obrigatório)", async () => {
    const req = new Request("http://x/api/produtos/p1", { method: "PATCH" })
    expect(restPatchIdempotencyKey(req, "p1")).toBeNull()
  })

  it("com header → namespaceda por produto", async () => {
    const req = new Request("http://x/api/produtos/p1", {
      method: "PATCH",
      headers: { "Idempotency-Key": "abc-123" },
    })
    const key = restPatchIdempotencyKey(req, "p1")
    expect(key).toContain("p1")
    expect(key).toContain("abc-123")
    expect(key).toContain("api-produto-patch")
  })

  it("nunca usa header puro globalmente", async () => {
    const a = new Request("http://x/", { method: "PATCH", headers: { "Idempotency-Key": "k" } })
    const ka = restPatchIdempotencyKey(a, "p1")
    const b = new Request("http://x/", { method: "PATCH", headers: { "Idempotency-Key": "k" } })
    const kb = restPatchIdempotencyKey(b, "p2")
    expect(ka).not.toBe(kb)
  })
})

describe("CAD-R2-007 — error mapping", () => {
  it("ProductWrite: VALIDATION→400, DUPLICATE→409, NOT_FOUND/CROSS→404, PERSISTENCE→503", async () => {
    expect(mapProductWriteFailureToResponse({ ok: false, code: "VALIDATION", message: "x" }).status).toBe(400)
    const dup = mapProductWriteFailureToResponse({
      ok: false,
      code: "DUPLICATE",
      message: "já",
      field: "sku",
      produto: { id: "1", name: "N", sku: "S", barcode: null, stock: 1 },
    })
    expect(dup.status).toBe(409)
    const dupJson = (await dup.json()) as { type?: string }
    expect(dupJson.type).toBe("DUPLICATE_PRODUCT")
    expect(mapProductWriteFailureToResponse({ ok: false, code: "NOT_FOUND", message: "x" }).status).toBe(404)
    expect(mapProductWriteFailureToResponse({ ok: false, code: "CROSS_STORE", message: "x" }).status).toBe(404)
    expect(mapProductWriteFailureToResponse({ ok: false, code: "PERSISTENCE", message: "x" }).status).toBe(503)
  })

  it("StockLedger: VALIDATION→400, NOT_FOUND→404, INSUFFICIENT/DRIFT/IDEMPOTENCY→409", async () => {
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "VALIDATION", message: "x" }).status).toBe(400)
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "NOT_FOUND", message: "x" }).status).toBe(404)
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "INSUFFICIENT_STOCK", message: "x" }).status).toBe(409)
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "STOCK_INVARIANT_DRIFT", message: "x" }).status).toBe(409)
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "IDEMPOTENCY_CONFLICT", message: "x" }).status).toBe(409)
    expect(mapStockLedgerFailureToResponse({ ok: false, code: "PERSISTENCE", message: "x" }).status).toBe(503)
  })

  it("createProduct não toca rede/IA e usa ledger para inicial", async () => {
    const src = readFileSync(resolve(process.cwd(), "lib/cadastros/product-write-service.ts"), "utf8")
    expect(src).toMatch(/applyStockMutationTx/)
    expect(src).not.toMatch(/movimentacaoEstoque\.create/)
  })
})
