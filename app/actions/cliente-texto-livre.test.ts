import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const h = vi.hoisted(() => ({
  session: null as Session | null,
  rows: [] as Record<string, unknown>[],
  create: vi.fn(async (_args: unknown) => ({ id: "synthetic-new" })),
  update: vi.fn(async (_args: unknown) => ({ id: "synthetic-existing" })),
  audit: vi.fn(async (_args: unknown) => ({})),
  query: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: async () => ({ ok: !!h.session }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  cliente: {
    findFirst: async ({ where }: { where: { id: string; storeId: string } }) => h.rows.find((r) => r.id === where.id && r.storeId === where.storeId) ?? null,
  },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    cliente: {
      findMany: async ({ where }: { where: { storeId: string } }) => { h.query(where); return h.rows.filter((r) => r.storeId === where.storeId) },
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => h.rows.find((r) => r.id === where.id && r.storeId === where.storeId) ?? null,
      create: h.create, update: h.update,
    }, logsAuditoria: { create: h.audit },
  }),
} }))

import { interpretarClienteTextoLivre, salvarClienteRevisado } from "./cliente-texto-livre"
import type { ClientEditorValues } from "@/lib/cadastros/natural-text/cliente"
const input = (): ClientEditorValues => ({ nome: "Lia de Teste", telefone: "14999998888", documento: "", email: "", cidade: "Itaí", endereco: "", uf: "", tipo: "PF", tags: "", observacoes: "", active: true })
function session(role = "ADMIN", allowedStoreIds = ["loja-a"]): Session {
  return { user: { id: "actor-canonical", email: "operator@example.invalid", role, storeAccess: "restricted", allowedStoreIds }, expires: "2099-01-01" } as Session
}
function row(overrides: Record<string, unknown> = {}) {
  return { id: "synthetic-existing", storeId: "loja-a", name: "Lia de Teste", phone: "14999998888", email: null, kind: "PF", document: "", documentKey: null, tags: { private: "preserve", address: { zip: "private" } }, city: "", active: true, totalSpent: 42, lastPurchaseAt: null, ...overrides }
}
beforeEach(() => { vi.clearAllMocks(); h.session = session(); h.rows = []; h.create.mockResolvedValue({ id: "synthetic-new" }); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("External transfer forbidden") })) })

describe("Cliente actions with real access gate, identity and ClientWriteService", () => {
  it("interprets without database writes, network, logs or cache", async () => {
    const log = vi.spyOn(console, "log"), error = vi.spyOn(console, "error")
    const r = await interpretarClienteTextoLivre("loja-a", "Novo cliente Lia de Teste, telefone 14999998888, mora em Itaí")
    expect(r.ok).toBe(true)
    expect(h.create).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled()
    log.mockRestore(); error.mockRestore()
  })
  it.each([null, session("UNKNOWN"), session("CONTADOR"), session("VENDEDOR", ["loja-b"])])("rejects unauthorized session/profile/store for both actions", async (s) => {
    h.session = s
    await expect(interpretarClienteTextoLivre("loja-a", "Lia")).rejects.toThrow()
    await expect(salvarClienteRevisado("loja-a", null, input(), true)).rejects.toThrow()
    expect(h.create).not.toHaveBeenCalled(); expect(h.query).not.toHaveBeenCalled()
  })
  it("rejects voice and forged capture sources server-side", async () => {
    for (const source of ["voice", "whisper", { enabled: true }]) expect(await interpretarClienteTextoLivre("loja-a", "Lia", source)).toMatchObject({ ok: false })
    expect(fetch).not.toHaveBeenCalled()
  })
  it("requires explicit confirmation and validates corrected values before writing", async () => {
    expect(await salvarClienteRevisado("loja-a", null, input(), false)).toMatchObject({ ok: false })
    expect(await salvarClienteRevisado("loja-a", null, { ...input(), documento: "11111111111" }, true)).toMatchObject({ ok: false, errors: { documento: expect.any(String) } })
    expect(h.create).not.toHaveBeenCalled()
  })
  it("saves reviewed fields with canonical store, author and documentKey, discarding extra payload", async () => {
    const payload = { ...input(), documento: "52998224725", transcript: "do not persist", storeId: "loja-b", principal: "spoof", totalSpent: 999, tagsRaw: { private: "spoof" } }
    expect(await salvarClienteRevisado("loja-a", null, payload, true)).toEqual({ ok: true, id: "synthetic-new" })
    const data = (h.create.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data).toMatchObject({ storeId: "loja-a", documentKey: "52998224725", totalSpent: 0 })
    expect(JSON.stringify(data)).not.toMatch(/transcript|do not persist|spoof/)
    expect(h.audit).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })
  it("blocks same-store contact duplicates without merge or writes", async () => {
    h.rows = [row()]
    expect(await salvarClienteRevisado("loja-a", null, input(), true)).toMatchObject({ ok: false, code: "IDENTITY_REVIEW_REQUIRED" })
    expect(h.create).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled()
  })
  it("blocks strong document conflict and exact document duplicates", async () => {
    h.rows = [row({ document: "52998224725", documentKey: "52998224725" })]
    expect(await salvarClienteRevisado("loja-a", null, { ...input(), documento: "39053344705" }, true)).toMatchObject({ ok: false, code: "IDENTITY_CONFLICT" })
    expect(await salvarClienteRevisado("loja-a", null, { ...input(), documento: "52998224725" }, true)).toMatchObject({ ok: false, code: "IDENTITY_REVIEW_REQUIRED" })
    expect(h.create).not.toHaveBeenCalled()
  })
  it("isolates other-store matches and preserves hidden metadata on edit", async () => {
    h.rows = [row({ storeId: "loja-b" })]
    expect(await salvarClienteRevisado("loja-a", null, input(), true)).toMatchObject({ ok: true })
    expect(await salvarClienteRevisado("loja-a", "synthetic-existing", input(), true)).toMatchObject({ ok: false, code: "NOT_FOUND" })
    h.rows = [row()]
    expect(await salvarClienteRevisado("loja-a", "synthetic-existing", { ...input(), endereco: "Rua de Teste" }, true)).toMatchObject({ ok: true })
    expect((h.update.mock.calls[0][0] as { data: Record<string, unknown> }).data.tags).toMatchObject({ private: "preserve", address: { zip: "private", street: "Rua de Teste" } })
  })
  it("maps a concurrent UNIQUE collision without leaking database errors or PII", async () => {
    h.create.mockRejectedValueOnce({ code: "P2002", name: "PrismaClientKnownRequestError", meta: { target: ["storeId", "documentKey"] } })
    const r = await salvarClienteRevisado("loja-a", null, { ...input(), documento: "52998224725" }, true)
    expect(r).toMatchObject({ ok: false, code: "IDENTITY_REVIEW_REQUIRED" })
    expect(JSON.stringify(r)).not.toContain("52998224725")
  })
  it("preserves canonical legacy-edit rules without requiring repair of historical identity fields", async () => {
    h.rows = [row({ document: "LEGACY-SYNTHETIC", phone: "123" })]
    const r = await salvarClienteRevisado("loja-a", "synthetic-existing", { ...input(), documento: "LEGACY-SYNTHETIC", telefone: "123" }, true)
    expect(r).toMatchObject({ ok: true })
    expect(h.update).toHaveBeenCalledOnce()
    expect((h.update.mock.calls[0][0] as { data: Record<string, unknown> }).data).not.toHaveProperty("document")
  })
  it("revalidates kind/document together when the operator changes kind", async () => {
    h.rows = [row({ document: "52998224725", documentKey: "52998224725" })]
    const r = await salvarClienteRevisado("loja-a", "synthetic-existing", { ...input(), documento: "52998224725", tipo: "PJ" }, true)
    expect(r).toMatchObject({ ok: false, errors: { documento: expect.any(String) } })
    expect(h.update).not.toHaveBeenCalled()
  })
  it("rejects newly invalid identity values while preserving untouched legacy identity", async () => {
    h.rows = [row({ document: "LEGACY-SYNTHETIC", phone: "123" })]
    const base = { ...input(), documento: "LEGACY-SYNTHETIC", telefone: "123" }
    expect(await salvarClienteRevisado("loja-a", "synthetic-existing", { ...base, documento: "OTHER-INVALID" }, true)).toMatchObject({ ok: false, errors: { documento: expect.any(String) } })
    expect(await salvarClienteRevisado("loja-a", "synthetic-existing", { ...base, telefone: "456" }, true)).toMatchObject({ ok: false, errors: { telefone: expect.any(String) } })
    expect(await salvarClienteRevisado("loja-a", "synthetic-existing", { ...base, email: "invalid" }, true)).toMatchObject({ ok: false, errors: { email: expect.any(String) } })
    expect(h.update).not.toHaveBeenCalled()
  })
})
