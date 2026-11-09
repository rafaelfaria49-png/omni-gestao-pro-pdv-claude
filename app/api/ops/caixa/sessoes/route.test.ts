/**
 * GET /api/ops/caixa/sessoes — período, paginação e total (RELATORIOS-FASE-A-001 · A5).
 * Os guards de módulo/loja têm testes próprios; aqui são isolados para provar o `where`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  moduleDenied: null as Response | null,
  guardDenied: null as Response | null,
}))

vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: vi.fn(async () => h.moduleDenied) }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: vi.fn(async () => h.guardDenied) }))
vi.mock("@/lib/ops-api-gate", () => ({
  opsLojaIdFromRequest: (req: Request) => req.headers.get("x-assistec-loja-id"),
}))
vi.mock("@/lib/prisma", () => ({ prisma: { sessaoCaixa: { findMany: h.findMany, count: h.count } } }))

import { GET } from "./route"

const req = (qs: string, loja: string | null = "loja-a") =>
  new Request(`http://local/api/ops/caixa/sessoes${qs}`, { headers: loja ? { "x-assistec-loja-id": loja } : {} })

beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([{ id: "s1" }])
  h.count.mockReset().mockResolvedValue(137)
  h.moduleDenied = null
  h.guardDenied = null
})

describe("GET /api/ops/caixa/sessoes", () => {
  it("sem parâmetros novos: mesmo comportamento (50 mais recentes) + total", async () => {
    const res = await GET(req(""))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sessoes: [{ id: "s1" }], total: 137 })
    const arg = h.findMany.mock.calls[0]![0]
    expect(arg.where).toEqual({ storeId: "loja-a" })
    expect(arg.take).toBe(50)
    expect(arg.skip).toBe(0)
    expect(arg.orderBy).toEqual([{ abertaEm: "desc" }, { id: "desc" }])
    expect(h.count.mock.calls[0]![0]).toEqual({ where: { storeId: "loja-a" } })
  })

  it("lookup da sessão aberta do PDV continua igual (status + terminal + take=1)", async () => {
    await GET(req("?lojaId=loja-a&status=ABERTA&take=1&terminalId=t1"))
    const arg = h.findMany.mock.calls[0]![0]
    expect(arg.where).toEqual({ storeId: "loja-a", status: "ABERTA", terminalId: "t1" })
    expect(arg.take).toBe(1)
    expect(arg.skip).toBe(0)
  })

  it("período e paginação vão para o where/skip e o count usa o mesmo filtro", async () => {
    const from = "2026-11-07T03:00:00.000Z"
    const to = "2026-11-08T02:59:59.999Z"
    await GET(req(`?take=50&skip=100&from=${from}&to=${to}&status=FECHADA`))
    const arg = h.findMany.mock.calls[0]![0]
    expect(arg.where).toEqual({
      storeId: "loja-a",
      status: "FECHADA",
      abertaEm: { gte: new Date(from), lte: new Date(to) },
    })
    expect(arg.skip).toBe(100)
    expect(h.count.mock.calls[0]![0]).toEqual({ where: arg.where })
  })

  it("só início ou só fim", async () => {
    await GET(req("?from=2026-11-01T03:00:00.000Z"))
    expect(h.findMany.mock.calls[0]![0].where.abertaEm).toEqual({ gte: new Date("2026-11-01T03:00:00.000Z") })
    await GET(req("?to=2026-11-30T02:59:59.999Z"))
    expect(h.findMany.mock.calls[1]![0].where.abertaEm).toEqual({ lte: new Date("2026-11-30T02:59:59.999Z") })
  })

  it("data inválida = 400, sem consulta (nunca vira filtro silencioso)", async () => {
    const res = await GET(req("?from=ontem"))
    expect(res.status).toBe(400)
    expect(h.findMany).not.toHaveBeenCalled()
  })

  it("take/skip não numéricos ou fora da faixa são saneados (antes NaN virava 500)", async () => {
    await GET(req("?take=abc&skip=-5"))
    let arg = h.findMany.mock.calls[0]![0]
    expect(arg.take).toBe(50)
    expect(arg.skip).toBe(0)
    await GET(req("?take=9999&skip=0"))
    arg = h.findMany.mock.calls[1]![0]
    expect(arg.take).toBe(200)
  })

  it("guards continuam antes de qualquer consulta", async () => {
    h.moduleDenied = new Response(null, { status: 403 })
    expect((await GET(req(""))).status).toBe(403)
    h.moduleDenied = null
    h.guardDenied = new Response(null, { status: 403 })
    expect((await GET(req(""))).status).toBe(403)
    expect((await GET(req("", null))).status).toBe(400)
    expect(h.findMany).not.toHaveBeenCalled()
  })
})
