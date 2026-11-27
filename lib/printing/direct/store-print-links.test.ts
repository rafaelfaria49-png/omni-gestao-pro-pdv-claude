import { beforeEach, describe, expect, it, vi } from "vitest"
import { isPrintForeignKeyViolation, STORE_HAS_PRINT_RECORDS, storeHasPrintRecords, type PrintLinksDb } from "./store-print-links"

const h = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; values: unknown[] }>,
  refs: [] as Array<{ table_name: string; column_name: string }>,
  has: false,
  deleteError: null as unknown,
  deleted: [] as string[],
}))
const fakeDb: PrintLinksDb = {
  async $queryRawUnsafe<T>(sql: string, ...values: unknown[]) {
    h.queries.push({ sql, values })
    return (sql.includes("pg_constraint") ? h.refs : [{ has: h.has }]) as T
  },
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: (sql: string, ...values: unknown[]) => fakeDb.$queryRawUnsafe(sql, ...values),
    store: {
      findUnique: async () => ({ id: "loja-teste", name: "Loja teste" }),
      delete: async ({ where }: { where: { id: string } }) => {
        if (h.deleteError) throw h.deleteError
        h.deleted.push(where.id)
        return { id: where.id }
      },
    },
  },
}))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/access-policy", () => ({ isPlatformSession: () => true }))
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => ({ ok: true, session: { role: "SUPER_ADMIN" } }) }))
vi.mock("@/lib/stores-api-access", () => ({
  assertStoreDeletable: async () => null,
  countStoreOperationalLinks: async () => ({ clientes: 0, os: 0, produtos: 0, tecnicos: 0, hasLinks: false }),
  denyIfNoStoreAccess: () => null,
  parseStoreDeleteConfirm: () => null,
  requireStoresSession: async () => ({ ok: true, session: {} }),
}))
vi.mock("@/lib/config-audit/diff", () => ({ diffScalarFields: () => [] }))
vi.mock("@/lib/config-audit/record", () => ({ recordConfigAuditFromSession: async () => undefined }))

const PRINT_REFS = [{ table_name: "print_documents", column_name: "store_id" }, { table_name: "print_events", column_name: "store_id" }]
const del = async () => {
  const { DELETE } = await import("@/app/api/stores/[id]/route")
  const req = new Request("http://lab/api/stores/loja-teste", { method: "DELETE", body: JSON.stringify({ confirm: true, storeId: "loja-teste" }) })
  const res = await DELETE(req, { params: Promise.resolve({ id: "loja-teste" }) })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

beforeEach(() => { h.queries = []; h.refs = []; h.has = false; h.deleteError = null; h.deleted = [] })

describe("D02-A — exclusão de loja com registros de impressão", () => {
  it("sem tabelas de impressão (banco sem D02): não consulta nada além do catálogo e não bloqueia", async () => {
    expect(await storeHasPrintRecords(fakeDb, "loja-teste")).toBe(false)
    expect(h.queries).toHaveLength(1)
  })

  it("consulta só as tabelas print_* que referenciam a loja, com o id como parâmetro (nunca concatenado)", async () => {
    h.refs = PRINT_REFS; h.has = true
    expect(await storeHasPrintRecords(fakeDb, "x'; DROP TABLE stores; --")).toBe(true)
    const probe = h.queries[1]
    expect(probe.sql).toContain(`FROM public."print_documents" WHERE "store_id" = $1`)
    expect(probe.sql).toContain(`FROM public."print_events" WHERE "store_id" = $1`)
    expect(probe.sql).not.toContain("DROP TABLE")
    expect(probe.values).toEqual(["x'; DROP TABLE stores; --"])
  })

  it("rota DELETE: loja com registros de impressão → 409 com o motivo, nada excluído", async () => {
    h.refs = PRINT_REFS; h.has = true
    expect(await del()).toEqual({ status: 409, body: { ok: false, error: STORE_HAS_PRINT_RECORDS, impressao: true } })
    expect(h.deleted).toEqual([])
  })

  it("rota DELETE: sem registros de impressão → exclusão segue como antes", async () => {
    h.refs = PRINT_REFS
    expect(await del()).toEqual({ status: 200, body: { ok: true } })
    expect(h.deleted).toEqual(["loja-teste"])
  })

  it("rota DELETE: registro criado entre a checagem e a exclusão (FK p004) → mesma mensagem; outra FK → mensagem genérica de antes", async () => {
    h.deleteError = Object.assign(new Error("Foreign key constraint violated"), { code: "P2003", meta: { field_name: "p004_fk_12 (index)" } })
    expect(await del()).toMatchObject({ status: 409, body: { error: STORE_HAS_PRINT_RECORDS } })
    h.deleteError = Object.assign(new Error("Foreign key constraint violated"), { code: "P2003", meta: { field_name: "vendas_storeId_fkey (index)" } })
    expect(await del()).toEqual({ status: 409, body: { ok: false, error: "Não foi possível excluir: existem registros dependentes nesta unidade." } })
  })

  it("isPrintForeignKeyViolation só reconhece P2003 de FK p004", () => {
    expect(isPrintForeignKeyViolation({ code: "P2003", meta: { constraint: "p004_fk_38" } })).toBe(true)
    expect(isPrintForeignKeyViolation({ code: "P2002", meta: { constraint: "p004_fk_38" } })).toBe(false)
    expect(isPrintForeignKeyViolation({ code: "P2003", meta: { field_name: "outra_fk" } })).toBe(false)
    expect(isPrintForeignKeyViolation(null)).toBe(false)
  })
})
