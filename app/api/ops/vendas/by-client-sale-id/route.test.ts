import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "next-auth"

const STORE = "loja-1"
const h = vi.hoisted(() => ({ session: null as Session | null }))

// Isola o provedor externo; requireModuleApi e suas políticas continuam reais.
vi.mock("@/auth", () => ({ auth: async () => h.session }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    venda: {
      findFirst: vi.fn(async ({ where }: { where: { storeId: string; clientSaleId: string } }) => {
        const vendas = [{
          id: "venda-1",
          storeId: STORE,
          pedidoId: "VDA-RC02-2026-000001",
          clientSaleId: "cs_attempt_aaaaaa",
          total: 18,
          at: new Date("2026-08-16T12:00:00.000Z"),
          clienteNome: null,
          clienteId: null,
          terminalId: null,
          status: "concluida",
        }, {
          id: "venda-outra-loja",
          storeId: "loja-2",
          pedidoId: "VDA-OUTRA-LOJA",
          clientSaleId: "cs_otherstore01",
          total: 99,
          at: new Date("2026-08-16T12:00:00.000Z"),
          clienteNome: "Cliente sintético de outra loja",
          clienteId: null,
          terminalId: null,
          status: "concluida",
        }]
        return vendas.find((venda) =>
          venda.storeId === where.storeId && venda.clientSaleId === where.clientSaleId,
        ) ?? null
      }),
    },
  },
  prismaEnsureConnected: vi.fn(async () => undefined),
}))
vi.mock("@/lib/ops-api-gate", () => ({
  opsLojaIdFromRequest: () => STORE,
}))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({
  apiGuardEnterpriseOrOps: vi.fn(async () => null),
}))

import { GET } from "./route"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"

beforeEach(() => {
  vi.clearAllMocks()
  h.session = {
    user: {
      id: "usuario-sintetico",
      role: "VENDEDOR",
      platformAuthority: false,
      lojaId: STORE,
      storeAccess: "restricted",
      allowedStoreIds: [STORE],
      storeModules: { [STORE]: ["sales"] },
    },
    expires: "2099-01-01T00:00:00.000Z",
  }
})

describe("GET /api/ops/vendas/by-client-sale-id", () => {
  it("localiza por (storeId, clientSaleId)", async () => {
    const res = await GET(
      new Request(
        "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_attempt_aaaaaa",
      ),
    )
    expect(res.status).toBe(200)
    expect(prismaEnsureConnected).toHaveBeenCalledTimes(1)
    expect(prisma.venda.findFirst).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { storeId: STORE, clientSaleId: "cs_attempt_aaaaaa" },
    }))
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      venda: { pedidoId: "VDA-RC02-2026-000001", clientSaleId: "cs_attempt_aaaaaa" },
    })
  })

  it("não revela venda de outra loja — 404 idêntico", async () => {
    const res = await GET(
      new Request(
        "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_otherstore01",
      ),
    )
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Venda não encontrada" })
    expect(prisma.venda.findFirst).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { storeId: STORE, clientSaleId: "cs_otherstore01" },
    }))
  })

  it("retorna o mesmo 404 para venda inexistente", async () => {
    const res = await GET(new Request(
      "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_missing_aaaaaa",
    ))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "Venda não encontrada" })
    expect(prisma.venda.findFirst).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      where: { storeId: STORE, clientSaleId: "cs_missing_aaaaaa" },
    }))
  })

  it("nega ausência de sessão com 401 antes de consultar Prisma", async () => {
    h.session = null
    const res = await GET(new Request(
      "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_attempt_aaaaaa",
    ))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ ok: false, error: "Não autenticado" })
    expect(prismaEnsureConnected).not.toHaveBeenCalled()
    expect(prisma.venda.findFirst).not.toHaveBeenCalled()
  })

  it("nega loja não autorizada com 403 antes de consultar Prisma", async () => {
    h.session!.user.allowedStoreIds = ["loja-2"]
    h.session!.user.lojaId = "loja-2"
    h.session!.user.storeModules = { "loja-2": ["sales"] }
    const res = await GET(new Request(
      "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_attempt_aaaaaa",
    ))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ ok: false, error: "Sem permissão para este módulo ou unidade." })
    expect(prismaEnsureConnected).not.toHaveBeenCalled()
    expect(prisma.venda.findFirst).not.toHaveBeenCalled()
  })

  it("nega módulo sales não autorizado com 403 antes de consultar Prisma", async () => {
    h.session!.user.storeModules = { [STORE]: ["pdv"] }
    const res = await GET(new Request(
      "http://local/api/ops/vendas/by-client-sale-id?storeId=loja-1&clientSaleId=cs_attempt_aaaaaa",
    ))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ ok: false, error: "Sem permissão para este módulo ou unidade." })
    expect(prismaEnsureConnected).not.toHaveBeenCalled()
    expect(prisma.venda.findFirst).not.toHaveBeenCalled()
  })
})
