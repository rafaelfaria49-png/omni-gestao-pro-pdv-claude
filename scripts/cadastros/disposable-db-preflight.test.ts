import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { assertFreshDisposableDatabase } from "./disposable-db-preflight.mjs"

const expected = { database: "cad_r2_021_isolated", role: "cad_r2_021" }
const db = (row: Record<string, unknown> | undefined) => ({ $queryRawUnsafe: async () => (row ? [row] : []) })
const ok = { db: "cad_r2_021_isolated", role: "cad_r2_021", fresh: true, tables: 0 }

describe("Preflight do PostgreSQL descartável do E2E de Ramos", () => {
  it("aceita só o banco esperado, recém-iniciado e sem tabelas", async () => {
    await expect(assertFreshDisposableDatabase(db(ok), expected)).resolves.toBeUndefined()
  })
  it.each([
    ["outro banco", { ...ok, db: "omnigestao_prod" }],
    ["outro papel", { ...ok, role: "postgres" }],
    ["servidor antigo", { ...ok, fresh: false }],
    ["sem resposta", undefined],
  ])("recusa identidade divergente: %s", async (_label, row) => {
    await expect(assertFreshDisposableDatabase(db(row), expected)).rejects.toThrow("RAMOS_E2E_DATABASE_IDENTITY_MISMATCH")
  })
  it("recusa banco com qualquer tabela antes do DDL", async () => {
    await expect(assertFreshDisposableDatabase(db({ ...ok, tables: 1 }), expected)).rejects.toThrow("RAMOS_E2E_DATABASE_MUST_BE_EMPTY")
  })
  it("runner confere o banco antes do primeiro db push", () => {
    const source = readFileSync("scripts/cadastros/run-ramos-e2e-isolated.mjs", "utf8")
    const preflight = source.indexOf("await assertFreshDisposableDatabase(")
    expect(preflight).toBeGreaterThan(0)
    expect(preflight).toBeLessThan(source.indexOf('"db", "push"'))
  })
})
