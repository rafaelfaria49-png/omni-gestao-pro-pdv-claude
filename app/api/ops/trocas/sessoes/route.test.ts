import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireModuleApi: vi.fn(async () => null),
  auth: vi.fn(async () => ({ user: { id: "u1", role: "ADMIN" } })),
  canAccessStore: vi.fn(() => true),
  opsLojaIdFromRequest: vi.fn(() => "loja-b"),
  apiGuardEnterpriseOrOps: vi.fn(async () => null),
  findMany: vi.fn(async () => []),
}))

vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: mocks.requireModuleApi }))
vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: mocks.canAccessStore }))
vi.mock("@/lib/ops-api-gate", () => ({ opsLojaIdFromRequest: mocks.opsLojaIdFromRequest }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: mocks.apiGuardEnterpriseOrOps }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sessaoCaixa: {
      findMany: mocks.findMany,
    },
  },
}))

import { GET } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireModuleApi.mockResolvedValue(null)
  mocks.auth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } })
  mocks.canAccessStore.mockReturnValue(true)
  mocks.opsLojaIdFromRequest.mockReturnValue("loja-b")
  mocks.apiGuardEnterpriseOrOps.mockResolvedValue(null)
  mocks.findMany.mockResolvedValue([])
})

describe("GET /api/ops/trocas/sessoes — limites canônicos em America/Sao_Paulo e isolamento multiloja", () => {
  it("consulta 2026-11-26 com limites exatos [2026-11-26T03:00:00.000Z, 2026-11-27T02:59:59.999Z] e storeId isolado", async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: "sessao-noite-26",
        abertaEm: new Date("2026-11-27T00:37:12.000Z"),
        fechadaEm: new Date("2026-11-27T00:40:10.000Z"),
        operador: "Caixa E2E",
        terminalId: "t1",
      },
    ])

    const res = await GET(new Request("http://127.0.0.1:3000/api/ops/trocas/sessoes?dia=2026-11-26"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sessoes).toHaveLength(1)
    expect(body.sessoes[0].id).toBe("sessao-noite-26")

    expect(mocks.findMany).toHaveBeenCalledTimes(1)
    const query = mocks.findMany.mock.calls[0]![0] as {
      where: { storeId: string; status: string; abertaEm: { lte: Date }; fechadaEm: { gte: Date } }
    }
    expect(query.where.storeId).toBe("loja-b")
    expect(query.where.status).toBe("FECHADA")
    expect(query.where.abertaEm.lte.toISOString()).toBe("2026-11-27T02:59:59.999Z")
    expect(query.where.fechadaEm.gte.toISOString()).toBe("2026-11-26T03:00:00.000Z")
  })

  it("respeita horário de verão histórico (2018-11-15 = UTC-2) sem offset fixo -03:00", async () => {
    const res = await GET(new Request("http://127.0.0.1:3000/api/ops/trocas/sessoes?dia=2018-11-15"))
    expect(res.status).toBe(200)
    const query = mocks.findMany.mock.calls[0]![0] as {
      where: { abertaEm: { lte: Date }; fechadaEm: { gte: Date } }
    }
    expect(query.where.fechadaEm.gte.toISOString()).toBe("2018-11-15T02:00:00.000Z")
    expect(query.where.abertaEm.lte.toISOString()).toBe("2018-11-16T01:59:59.999Z")
  })

  it("rejeita data civil inexistente (2026-02-30) com 400 sem consultar o banco", async () => {
    const res = await GET(new Request("http://127.0.0.1:3000/api/ops/trocas/sessoes?dia=2026-02-30"))
    expect(res.status).toBe(400)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it("nega acesso a loja não autorizada (403) sem vazar sessões de outra unidade", async () => {
    mocks.canAccessStore.mockReturnValueOnce(false)
    const res = await GET(new Request("http://127.0.0.1:3000/api/ops/trocas/sessoes?dia=2026-11-26"))
    expect(res.status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
