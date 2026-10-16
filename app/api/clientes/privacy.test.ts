import { beforeEach, afterEach, describe, it, expect, vi } from "vitest"
import type { Session } from "next-auth"
const h = vi.hoisted(() => ({
  session: null as Session | null,
  findMany: vi.fn(), findFirst: vi.fn(), audit: vi.fn(), matcher: vi.fn(), importItems: vi.fn(), update: vi.fn(),
}))
vi.mock("@/auth", () => ({ auth: async () => h.session }))
vi.mock("@/lib/api-auth", () => ({ getVerifiedSubscriptionFromCookies: async () => ({ ok: true, status: "ativa", vencimento: "2099-12-31" }) }))
vi.mock("@/lib/trusted-time", () => ({ getTrustedTimeMs: async () => Date.now() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/prisma", () => ({ prisma: {
  cliente: { findMany: h.findMany, findFirst: h.findFirst, deleteMany: h.update },
  logsAuditoria: { create: h.audit },
  ordemServico: { groupBy: async () => [], aggregate: async () => ({ _sum: { valorTotal: null } }) },
  venda: { groupBy: async () => [], aggregate: async () => ({ _sum: { total: null } }) },
} }))
vi.mock("@/lib/clientes-import-handler", () => ({ importClientesItems: h.importItems, listClientesForLoja: h.findMany }))
vi.mock("@/lib/cliente-phone-match", () => ({ matchClientesByPhone: h.matcher }))
import { GET as list } from "./route"
import { POST as search } from "./search/route"
import { GET as detail, DELETE as erase } from "./[id]/route"
import { GET as phoneGet, POST as phone } from "./match-by-phone/route"
import { POST as importClients, GET as importList } from "./importar/route"
import { POST as bulkErase } from "./bulk-delete/route"
import { POST as privacy } from "./privacy-request/route"
import { GET as duplicates } from "./duplicates/route"
import { GET as legacy } from "../clients/route"
import { POST as validate } from "../import/validate/clientes/route"

const pii = "PRIVATE_CUSTOMER_MARKER"
function session(role = "ADMIN") {
  h.session = { user: { id: "actor-1", name: "Canonical Actor", role, storeAccess: "restricted", allowedStoreIds: ["store-a"] }, expires: "2099-01-01" } as Session
}
function req(body?: unknown, store = "store-a", path = "clientes") {
  return new Request("https://app.local/api/" + path, { method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-assistec-loja-id": store }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
const context = { params: Promise.resolve({ id: "c1" }) }
const row: Record<string, unknown> = { id: "c1", name: "Needed Name", phone: "11999990000", document: "52998224725", kind: "PF", active: true,
  email: pii, city: "City", tags: { _raw: pii, rg: pii, financial: { private: pii }, address: { street: "Street", secret: pii } }, documentKey: pii,
  totalSpent: 100, lastPurchaseAt: null, createdAt: new Date(), updatedAt: new Date(), storeId: "store-a" }
function projection(select: Record<string, unknown>) { return Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) }
beforeEach(() => {
  vi.clearAllMocks(); session()
  h.findMany.mockImplementation(async ({ select }: { select: Record<string, unknown> }) => [projection(select)])
  h.findFirst.mockImplementation(async ({ where, select }: { where: { id: string; storeId: string }; select: Record<string, unknown> }) => where.id === "c1" && where.storeId === "store-a" ? projection(select) : null)
  h.audit.mockResolvedValue({ id: "ref-1" }); h.importItems.mockResolvedValue({ created: 1, updated: 0, skippedDuplicate: 0 })
  h.matcher.mockResolvedValue({ status: "unique", phoneNormalized: pii, candidates: [{ id: "c1", name: "Name", phone: "11999990000", email: pii }] })
})
afterEach(() => vi.restoreAllMocks())
const reads = [list, legacy, importList, duplicates]
describe("CAD-R2-020 boundaries", () => {
  it.each(reads)("unauthenticated reads are denied", async (fn) => {
    h.session = null; expect((await fn(req())).status).toBe(401); expect(h.findMany).not.toHaveBeenCalled()
  })
  it.each([list, legacy, importList, duplicates])("restricted user cannot choose another store", async fn => {
    session("VENDEDOR"); expect((await fn(req(undefined, "store-b"))).status).toBe(403); expect(h.findMany).not.toHaveBeenCalled()
  })
  it.each(["", "UNKNOWN", "CONTADOR"])("unknown/non-operational role %s is denied", async role => {
    session(role); expect((await list(req())).status).toBe(403); expect(h.findMany).not.toHaveBeenCalled()
  })
  it("shared checkout keeps billing identity but no email, metadata or financial history", async () => {
    session("CAIXA"); const res = await search(req({ q: "Customer" })); const body = await res.json()
    expect(body.clientes[0]).toEqual({ id: "c1", name: row.name, phone: row.phone, document: row.document, kind: "PF", active: true })
    expect(JSON.stringify(body)).not.toContain(pii)
    expect(h.findMany.mock.calls[0][0].where.storeId).toBe("store-a")
    expect(res.headers.get("cache-control")).toContain("no-store")
  })
  it("HUB list hides import/financial JSON and documentKey", async () => {
    const res = await list(req()); const client = (await res.json()).clientes[0]
    expect(client.documentKey).toBeUndefined(); expect(client.tags).toEqual({ address: { street: "Street" } })
    expect(h.findMany.mock.calls[0][0].select.documentKey).toBeUndefined()
  })
  it("IDOR returns the same 404 as a nonexistent record", async () => {
    const res = await detail(req(), { params: Promise.resolve({ id: "foreign-client" }) })
    expect(res.status).toBe(404); expect(await res.text()).not.toContain(pii)
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ id: "foreign-client", storeId: "store-a" })
  })
  it("child history is store-scoped and explicitly projected", async () => {
    await detail(req(), context)
    const select = h.findFirst.mock.calls[0][0].select
    expect(select.ordensServico.where).toEqual({ storeId: "store-a" })
    expect(select.vendas.where).toEqual({ storeId: "store-a" })
    expect(select.ordensServico.select.metadata).toBeUndefined()
    expect(select.documentKey).toBeUndefined()
  })
  it("phone matching returns no normalized echo or email", async () => {
    const res = await phone(req({ phone: "11999990000" })); expect(res.status).toBe(200)
    expect(await res.text()).not.toContain(pii)
    expect(h.matcher).toHaveBeenCalledWith("store-a", "11999990000")
  })
  it("rejects URL searches and legacy phone GET", async () => {
    expect((await list(req(undefined, "store-a", "clientes?q=private"))).status).toBe(400)
    expect((await phoneGet()).status).toBe(405); expect(h.findMany).not.toHaveBeenCalled()
  })
  it.each([list, legacy])("exceptions are absent from response and logs even in development", async fn => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    h.findMany.mockRejectedValue(new Error(pii)); const res = await fn(req())
    expect(res.status).toBe(503); expect(await res.text()).not.toContain(pii)
    expect(JSON.stringify(spy.mock.calls)).not.toContain(pii)
  })
  it("import rejects non-admin before processing rows", async () => {
    session("VENDEDOR"); expect((await importClients(req({ items: [{ name: pii }] }))).status).toBe(403)
    expect(h.importItems).not.toHaveBeenCalled()
  })
  it("import has no reflective credentialed CORS and suppresses exceptions", async () => {
    h.importItems.mockRejectedValue(new Error(pii)); const res = await importClients(req({ items: [] }))
    expect(res.status).toBe(503); expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(await res.text()).not.toContain(pii)
  })
  it("validation errors never echo the invalid document", async () => {
    const res = await validate(req({ rows: [{ Nome: "Name", CPF: pii + "123" }], mapping: { "clientes.nome": "Nome", "clientes.doc": "CPF" } }))
    const body = await res.json(); expect(body.errors).toHaveLength(1); expect(JSON.stringify(body)).not.toContain(pii)
  })
  it("all erasure adapters fail closed without a database delete", async () => {
    expect((await erase(req(), context)).status).toBe(409)
    expect((await bulkErase(req({ ids: ["c1"] }))).status).toBe(409)
    expect(h.update).not.toHaveBeenCalled()
  })
  it.each(["access", "correction", "erasure"])("%s request records only an internal pending referral", async kind => {
    const res = await privacy(req({ clientId: "c1", kind, note: pii, identityVerified: true, userLabel: "spoof" }))
    expect(res.status).toBe(202); expect(await res.json()).toMatchObject({ status: "PENDING_GOVERNANCE_REVIEW" })
    const data = h.audit.mock.calls[0][0].data; const meta = JSON.parse(data.metadata)
    expect(data.userLabel).toBe("Canonical Actor"); expect(meta.actor.userId).toBe("actor-1")
    expect(meta.identityVerified).toBe(false); expect(meta.retentionReviewed).toBe(false)
    expect(JSON.stringify(data)).not.toContain(pii); expect(h.update).not.toHaveBeenCalled()
  })
  it("foreign subject cannot produce a privacy referral", async () => {
    expect((await privacy(req({ clientId: "foreign-client", kind: "access" }))).status).toBe(404)
    expect(h.audit).not.toHaveBeenCalled()
  })
  it("failed audit does not claim successful intake", async () => {
    h.audit.mockRejectedValue(new Error(pii)); const res = await privacy(req({ clientId: "c1", kind: "access" }))
    expect(res.status).toBe(503); expect(await res.text()).not.toContain(pii)
  })
})
