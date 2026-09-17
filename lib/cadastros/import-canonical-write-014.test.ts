/**
 * CAD-R2-014 — Source-scan de bypass: nenhum import runtime ativo escreve
 * Produto ou Produto.stock diretamente.
 *
 * Inventário ativo (4 writers):
 * - lib/importador-produtos/persist.ts
 * - lib/importador-avancado/persistidor.ts
 * - app/api/ops/inventory/import/route.ts
 * - app/api/stores/import-catalog/route.ts
 * Helper puro (sem Prisma por construção):
 * - lib/cadastros/importacao-produtos/escrita.ts
 *
 * Gates:
 * - IMPORT_DIRECT_PRODUCT_CREATE_UPDATE_WRITES = 0
 * - IMPORT_DIRECT_STOCK_WRITES = 0
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "../..")

const WRITERS = [
  "lib/importador-produtos/persist.ts",
  "lib/importador-avancado/persistidor.ts",
  "app/api/ops/inventory/import/route.ts",
  "app/api/stores/import-catalog/route.ts",
] as const

const HELPER = "lib/cadastros/importacao-produtos/escrita.ts" as const

function src(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

/** Formas legadas de write direto de Produto (create/update/upsert via Prisma). */
const DIRECT_PRODUCT_WRITES = [
  "prisma.produto.create",
  "prisma.produto.update",
  "prisma.produto.upsert",
  "tx.produto.create",
  "tx.produto.update",
  "tx.produto.upsert",
] as const

/** Formas legadas de write direto de saldo em imports. */
const DIRECT_STOCK_WRITES = [
  "stock: p.estoque",
  "stock: p.stock",
  "stock: Math.max",
] as const

describe("CAD-R2-014 — imports usam boundaries canônicos (scan)", () => {
  for (const rel of WRITERS) {
    it(`${rel} — sem write direto de Produto`, () => {
      const text = src(rel)
      for (const shape of DIRECT_PRODUCT_WRITES) {
        expect(text, `${rel} contém bypass "${shape}"`).not.toContain(shape)
      }
    })

    it(`${rel} — sem write direto de stock`, () => {
      const text = src(rel)
      for (const shape of DIRECT_STOCK_WRITES) {
        expect(text, `${rel} contém bypass "${shape}"`).not.toContain(shape)
      }
    })
  }

  it(`${HELPER} — helper puro sem Prisma`, () => {
    const text = src(HELPER)
    expect(text).not.toContain("prisma.produto")
    expect(text).not.toContain("@/lib/prisma")
  })

  it("importador-produtos — via ProductWriteService", () => {
    const text = src("lib/importador-produtos/persist.ts")
    expect(text).toContain("createProduct")
    expect(text).toContain("updateProduct")
    expect(text).toContain("product-write-service")
  })

  it("importador-avancado (slice produtos) — via ProductWriteService", () => {
    const text = src("lib/importador-avancado/persistidor.ts")
    expect(text).toContain("createProduct")
    expect(text).toContain("updateProduct")
    expect(text).toContain("product-write-service")
  })

  it("inventory import — via ProductWriteService + ownership fail-closed", () => {
    const text = src("app/api/ops/inventory/import/route.ts")
    expect(text).toContain("createProduct")
    expect(text).toContain("updateProduct")
    expect(text).toContain("canAuthorizeCadastrosStore")
  })

  it("import-catalog — via Tx variants + ledger + ownership fail-closed", () => {
    const text = src("app/api/stores/import-catalog/route.ts")
    expect(text).toContain("createProductTx")
    expect(text).toContain("updateProductTx")
    expect(text).toContain("applyStockMutationTx")
    expect(text).toContain("canAuthorizeCadastrosStore")
    // merge preserva estoque: branch de merge não menciona saldo
    expect(text).toContain("preserva estoque")
  })
})
