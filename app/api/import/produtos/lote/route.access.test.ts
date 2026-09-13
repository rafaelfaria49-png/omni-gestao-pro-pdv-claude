/**
 * CAD-R2-004B — POST /api/import/produtos/lote com o gate REAL (002/003).
 * Persistência mockada. Não altera matching/trava 50%.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"
import { NextRequest } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

const h = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<unknown> => null),
  findUnique: vi.fn(async (): Promise<unknown> => null),
  persistirLoteProdutos: vi.fn(
    async (
      _storeId: string,
      _itens: unknown[],
      _modo: string,
    ): Promise<{
      criados: number
      atualizados: number
      pulados: number
      erros: number
      itens: unknown[]
      duracaoMs: number
      telemetria: Record<string, number>
    }> => ({
      criados: 1,
      atualizados: 0,
      pulados: 0,
      erros: 0,
      itens: [],
      duracaoMs: 1,
      telemetria: {
        matchForteBarcode: 0,
        matchForteSku: 0,
        matchFracoBarcode: 0,
        matchFracoSku: 0,
        semChave: 0,
      },
    }),
  ),
  logsCreate: vi.fn(async (_args: { data: { userLabel: string; metadata: string } }) => ({
    id: "log-1",
  })),
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock("@/auth", () => ({ auth: h.auth }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.findUnique },
    logsAuditoria: { create: h.logsCreate },
  },
}))
vi.mock("@/lib/importador-produtos/persist", () => ({
  persistirLoteProdutos: h.persistirLoteProdutos,
}))

import { POST } from "./route"

function makeSession(opts: {
  role?: string
  storeAccess?: "all" | "restricted"
  allowedStoreIds?: string[]
  id?: string
  name?: string
  email?: string
}): Session {
  return {
    user: {
      id: opts.id ?? "user-1",
      email: opts.email ?? "u@x.com",
      name: opts.name ?? "U",
      role: opts.role ?? "VENDEDOR",
      storeAccess: opts.storeAccess ?? "restricted",
      allowedStoreIds: opts.allowedStoreIds ?? ["loja-a"],
      lojaId: "loja-a",
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

function loteBody(extra?: Record<string, unknown>) {
  return {
    batchId: "batch-123",
    arquivo: "produtos.xlsx",
    loteIndex: 0,
    totalLotes: 1,
    lojaAtivaIdConfirmado: "loja-a",
    itens: [
      {
        linha: 1,
        nome: "Cabo",
        sku: "SKU1",
        barcode: "789",
        custo: 1,
        preco: 10,
        estoque: 0,
        categoria: "Acessorios",
      },
    ],
    ...extra,
  }
}

function req(storeId: string | undefined, body: Record<string, unknown>) {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (storeId) headers.set(ASSISTEC_LOJA_HEADER, storeId)
  return new NextRequest("https://app.local/api/import/produtos/lote", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  h.auth.mockReset()
  h.findUnique.mockReset()
  h.persistirLoteProdutos.mockClear()
  h.logsCreate.mockReset()
  h.auth.mockResolvedValue(null)
  h.findUnique.mockResolvedValue(null)
})

describe("POST /api/import/produtos/lote — ownership + ator", () => {
  it("sem sessão → 401 e não persiste", async () => {
    const res = await POST(req("loja-a", loteBody()))
    expect(res.status).toBe(401)
    expect(h.persistirLoteProdutos).not.toHaveBeenCalled()
  })

  it("user.id vazio → 401 e não persiste", async () => {
    sessionAtiva({ id: "" })
    const res = await POST(req("loja-a", loteBody()))
    expect(res.status).toBe(401)
    expect(h.persistirLoteProdutos).not.toHaveBeenCalled()
  })

  it("VENDEDOR loja-A + store B → 403", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("loja-b", loteBody({ lojaAtivaIdConfirmado: "loja-b" })))
    expect(res.status).toBe(403)
    expect(h.persistirLoteProdutos).not.toHaveBeenCalled()
  })

  it("CAIXA própria loja → 403 (sem hubs.cadastros)", async () => {
    sessionAtiva({ role: "CAIXA", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("loja-a", loteBody()))
    expect(res.status).toBe(403)
    expect(h.persistirLoteProdutos).not.toHaveBeenCalled()
  })

  it("sem store → 400", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req(undefined, loteBody()))
    expect(res.status).toBe(400)
    expect(h.persistirLoteProdutos).not.toHaveBeenCalled()
  })

  it("VENDEDOR própria loja → persiste na loja autorizada", async () => {
    sessionAtiva({ role: "VENDEDOR", storeAccess: "restricted", allowedStoreIds: ["loja-a"] })
    const res = await POST(req("loja-a", loteBody()))
    expect(res.status).toBe(200)
    expect(h.persistirLoteProdutos).toHaveBeenCalledTimes(1)
    expect(h.persistirLoteProdutos.mock.calls.at(0)?.[0]).toBe("loja-a")
  })

  it("ADMIN + store explícito → allow", async () => {
    sessionAtiva({ role: "ADMIN", storeAccess: "all", allowedStoreIds: undefined })
    const res = await POST(req("loja-z", loteBody({ lojaAtivaIdConfirmado: "loja-z" })))
    expect(res.status).toBe(200)
    expect(h.persistirLoteProdutos.mock.calls.at(0)?.[0]).toBe("loja-z")
  })

  it("ator oficial é o principal da sessão; body.userLabel não spoofa", async () => {
    sessionAtiva({
      role: "VENDEDOR",
      name: "Sessão Real",
      email: "real@loja.com",
      storeAccess: "restricted",
      allowedStoreIds: ["loja-a"],
    })
    const res = await POST(req("loja-a", loteBody({ userLabel: "Administrador Supremo" })))
    expect(res.status).toBe(200)
    const row = h.logsCreate.mock.calls.at(0)?.[0].data
    expect(row?.userLabel).toBe("Sessão Real")
    expect(row?.userLabel).not.toBe("Administrador Supremo")
    const meta = JSON.parse(row?.metadata ?? "{}") as {
      storeId: string
      batchId: string
      actor: { userId: string; email?: string; role?: string }
    }
    expect(meta.storeId).toBe("loja-a")
    expect(meta.batchId).toBe("batch-123")
    expect(meta.actor.userId).toBe("user-1")
    expect(meta.actor.email).toBe("real@loja.com")
    expect(meta.actor.role).toBe("VENDEDOR")
  })
})
