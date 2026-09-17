/**
 * CAD-R2-002 — GET/POST /api/clientes* com o gate REAL.
 * Mock: auth, Prisma, matchClientesByPhone. Não mocka requireCadastrosHubApi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  clienteFindMany: vi.fn(async () => []),
  clientesById: new Map<string, { id: string; storeId: string; name: string; totalSpent: number }>(),
  clienteFindFirst: vi.fn(async ({ where }: { where?: { id?: string; storeId?: string } } = {}) => {
    const row = h.clientesById.get(where?.id ?? "")
    if (!row) return null
    if (where?.storeId && row.storeId !== where.storeId) return null
    return { ...row, phone: "11988887777", email: null, document: "", ordensServico: [], vendas: [] }
  }),
  clienteCreate: vi.fn(async (args: { data: Record<string, unknown> }) => {
    const row = {
      id: "cli-1",
      storeId: String(args.data.storeId ?? "loja-a"),
      name: args.data.name as string,
      phone: (args.data.phone as string | null) ?? null,
      email: (args.data.email as string | null) ?? null,
      document: (args.data.document as string) ?? "",
      kind: (args.data.kind as string) ?? "PF",
      city: (args.data.city as string) ?? "",
      tags: args.data.tags ?? null,
      active: args.data.active !== false,
      totalSpent: (args.data.totalSpent as number) ?? 0,
      lastPurchaseAt: (args.data.lastPurchaseAt as Date | null) ?? null,
      createdAt: new Date(),
    }
    h.clientesById.set(row.id, { id: row.id, storeId: row.storeId, name: row.name, totalSpent: row.totalSpent })
    return row
  }),
  clienteUpdate: vi.fn(async () => ({ id: "cli-1" })),
  logsCreate: vi.fn(async () => ({ id: "log-1" })),
  groupBy: vi.fn(async () => []),
  aggregate: vi.fn(async () => ({ _sum: { valorTotal: null, total: null } })),
  matchByPhone: vi.fn(async () => ({
    status: "none",
    phoneNormalized: "",
    candidates: [],
  })),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.findUnique },
    cliente: {
      findMany: h.clienteFindMany,
      findFirst: h.clienteFindFirst,
      create: h.clienteCreate,
      update: h.clienteUpdate,
    },
    logsAuditoria: { create: h.logsCreate },
    $transaction: async (fn: (tx: Record<string, unknown>) => unknown) =>
      fn({
        cliente: {
          findMany: h.clienteFindMany,
          findFirst: h.clienteFindFirst,
          create: h.clienteCreate,
          update: h.clienteUpdate,
        },
        logsAuditoria: { create: h.logsCreate },
      }),
    ordemServico: { groupBy: h.groupBy, aggregate: h.aggregate },
    venda: { groupBy: h.groupBy, aggregate: h.aggregate },
  },
}))
vi.mock("@/lib/cliente-phone-match", () => ({
  matchClientesByPhone: h.matchByPhone,
}))

import { GET as listClientes, POST as createClienteAdmin } from "./route"
import { GET as getCliente, PATCH as patchCliente } from "./[id]/route"
import { GET as matchByPhone } from "./match-by-phone/route"
import { POST as quickCreate } from "./quick/route"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
}): Session {
  return {
    user: {
      id: "user-1",
      email: "u@x.com",
      name: "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds ?? ["loja-a"],
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session
}

function sessionAtiva(opts?: Parameters<typeof makeSession>[0]) {
  const s = makeSession(opts ?? {})
  h.auth.mockResolvedValue(s)
  h.findUnique.mockResolvedValue({ active: true, planName: "PRATA", role: s.user.role })
  return s
}

function listReq(storeId?: string) {
  const url = storeId
    ? `https://app.local/api/clientes?q=ana`
    : `https://app.local/api/clientes`
  const headers = new Headers()
  if (storeId) headers.set(ASSISTEC_LOJA_HEADER, storeId)
  return new Request(url, { headers })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.clienteFindMany.mockClear()
  h.clientesById.clear()
  h.clienteFindFirst.mockClear()
  h.clienteCreate.mockClear()
  h.matchByPhone.mockClear()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("GET /api/clientes", () => {
  it("sem sessão → 401 e não consulta clientes", async () => {
    const res = await listClientes(listReq("loja-a"))
    expect(res.status).toBe(401)
    expect(h.clienteFindMany).not.toHaveBeenCalled()
  })

  it("restricted loja-a pedindo loja-b → 403", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await listClientes(listReq("loja-b"))
    expect(res.status).toBe(403)
    expect(h.clienteFindMany).not.toHaveBeenCalled()
  })

  it("CAIXA na própria loja → 200 (PDV shared, sem hubs.cadastros)", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await listClientes(listReq("loja-a"))
    expect(res.status).toBe(200)
    expect(h.clienteFindMany).toHaveBeenCalled()
  })
})

describe("GET /api/clientes/[id]", () => {
  it("sem sessão → 401", async () => {
    const res = await getCliente(listReq("loja-a"), { params: Promise.resolve({ id: "cli-1" }) })
    expect(res.status).toBe(401)
    expect(h.clienteFindFirst).not.toHaveBeenCalled()
  })

  it("cross-store → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await getCliente(listReq("loja-b"), { params: Promise.resolve({ id: "cli-1" }) })
    expect(res.status).toBe(403)
  })

  it("IDOR: loja-A autorizada + id da loja-B → 404 e Prisma escopado em loja-A", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.clientesById.set("cli-b", { id: "cli-b", storeId: "loja-b", name: "Cliente B", totalSpent: 99 })
    const res = await getCliente(listReq("loja-a"), { params: Promise.resolve({ id: "cli-b" }) })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error?: string; cliente?: unknown }
    expect(body.cliente).toBeUndefined()
    expect(body.error).toBe("Cliente não encontrado")
    expect(h.clienteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-b", storeId: "loja-a" } }),
    )
  })

  it("própria loja + recurso da loja-A → 200 só com o cliente autorizado", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    h.clientesById.set("cli-a", { id: "cli-a", storeId: "loja-a", name: "Cliente A", totalSpent: 10 })
    h.clientesById.set("cli-b", { id: "cli-b", storeId: "loja-b", name: "Cliente B", totalSpent: 99 })
    const res = await getCliente(listReq("loja-a"), { params: Promise.resolve({ id: "cli-a" }) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; cliente?: { id?: string; name?: string; storeId?: string } }
    expect(body.ok).toBe(true)
    expect(body.cliente).toEqual(expect.objectContaining({ id: "cli-a", name: "Cliente A", storeId: "loja-a" }))
    expect(body.cliente?.id).not.toBe("cli-b")
    expect(h.clienteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cli-a", storeId: "loja-a" } }),
    )
  })
})

describe("GET /api/clientes/match-by-phone", () => {
  it("sem sessão → 401", async () => {
    const res = await matchByPhone(
      new Request("https://app.local/api/clientes/match-by-phone?phone=11999990000", {
        headers: { [ASSISTEC_LOJA_HEADER]: "loja-a" },
      }),
    )
    expect(res.status).toBe(401)
    expect(h.matchByPhone).not.toHaveBeenCalled()
  })

  it("própria loja → chama matcher com store autorizado", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await matchByPhone(
      new Request("https://app.local/api/clientes/match-by-phone?phone=11999990000", {
        headers: { [ASSISTEC_LOJA_HEADER]: "loja-a" },
      }),
    )
    expect(res.status).toBe(200)
    expect(h.matchByPhone).toHaveBeenCalledWith("loja-a", "11999990000")
  })
})

describe("POST /api/clientes/quick", () => {
  it("sem sessão → 401", async () => {
    const res = await quickCreate(
      new Request("https://app.local/api/clientes/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-a" },
        body: JSON.stringify({ name: "Ana" }),
      }),
    )
    expect(res.status).toBe(401)
    expect(h.clienteCreate).not.toHaveBeenCalled()
  })

  it("CAIXA outra loja → 403", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await quickCreate(
      new Request("https://app.local/api/clientes/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-b" },
        body: JSON.stringify({ name: "Ana" }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it("CAIXA própria loja → 201", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await quickCreate(
      new Request("https://app.local/api/clientes/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-a" },
        body: JSON.stringify({ name: "Ana" }),
      }),
    )
    expect(res.status).toBe(201)
    expect(h.clienteCreate).toHaveBeenCalled()
  })

  it("write sem header de loja → 400", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await quickCreate(
      new Request("https://app.local/api/clientes/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ana" }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("POST /api/clientes admin", () => {
  it("VENDEDOR própria loja não cria via CRUD admin", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await createClienteAdmin(
      new Request("https://app.local/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-a" },
        body: JSON.stringify({ name: "Ana", phone: "11999990000" }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it("ADMIN com loja explícita → permitido", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all" })
    const res = await createClienteAdmin(
      new Request("https://app.local/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-z" },
        body: JSON.stringify({ name: "Ana", phone: "11988887777" }),
      }),
    )
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/clientes/[id] admin", () => {
  it("CAIXA não administra cliente", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await patchCliente(
      new Request("https://app.local/api/clientes/cli-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: "loja-a" },
        body: JSON.stringify({ name: "Ana", phone: "11988887777" }),
      }),
      { params: Promise.resolve({ id: "cli-1" }) },
    )
    expect(res.status).toBe(403)
  })
})
