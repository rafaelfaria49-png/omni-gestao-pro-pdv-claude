import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  calcularEntitlementsSombra,
  contadoresEntitlementSombra,
  reiniciarObservabilidadeSombra,
  type EntitlementDb,
} from "@/lib/saas/entitlement-sombra"

const AGORA = new Date("2026-12-10T12:00:00.000Z")
const assinatura = (organizationId: string, p: Record<string, unknown> = {}) => ({
  organizationId, planoId: "vendas-e-estoque", status: "trialing", trialEndsAt: new Date("2026-12-08T12:00:00.000Z"),
  currentPeriodEnd: null, graceEndsAt: null, suspendedMode: null, limitedSince: null, limiteUsuariosPorLoja: 2, cortesiaAte: null, ...p,
})

function dbCom(linhas: Awaited<ReturnType<EntitlementDb["store"]["findMany"]>>) {
  const findMany = vi.fn(async (_args: unknown) => linhas)
  return { db: { store: { findMany } } as unknown as EntitlementDb, findMany }
}

beforeEach(() => reiniciarObservabilidadeSombra())

describe("lojas legadas", () => {
  it("lojas sem organização = mapa calculado e vazio (ausência = legado/pleno; custo zero no JWT)", async () => {
    const { db } = dbCom([])
    const claims = await calcularEntitlementsSombra(db, ["loja-1", "loja-2", "cliente-x"], { agora: AGORA, log: vi.fn() })
    expect(claims).toEqual({})
    expect(claims).not.toBeUndefined()
  })
  it("uma consulta só, filtrada por organizationId NOT NULL e pelos ids da sessão", async () => {
    const { db, findMany } = dbCom([])
    await calcularEntitlementsSombra(db, ["loja-1", "loja-1", "loja-2"], { agora: AGORA, log: vi.fn() })
    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: ["loja-1", "loja-2"] }, organizationId: { not: null } } })
  })
  it("sem lojas não consulta o banco", async () => {
    const { db, findMany } = dbCom([])
    expect(await calcularEntitlementsSombra(db, [], { agora: AGORA })).toEqual({})
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe("organizações em modo sombra", () => {
  it("teste vencido é calculado e registrado, mas só como observação", async () => {
    const log = vi.fn()
    const { db } = dbCom([{ id: "nova", organizationId: "org-1", organization: { subscription: assinatura("org-1") } }])
    const claims = await calcularEntitlementsSombra(db, ["nova", "loja-1"], { agora: AGORA, log })
    expect(claims?.nova).toEqual({ modo: "limitado", motivo: "teste_vencido", limitedSince: "2026-12-08T12:00:00.000Z" })
    expect(claims && "loja-1" in claims).toBe(false)
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({ event: "saas_entitlement_shadow", v: 1, storeId: "nova", modo: "limitado", motivo: "teste_vencido", applied: false, suppressed: 0 })
    expect(contadoresEntitlementSombra()).toEqual({ "limitado:teste_vencido": 1 })
  })
  it("loga a mesma decisão no máximo uma vez a cada 15 min por loja (conta todas)", async () => {
    const log = vi.fn()
    const { db } = dbCom([{ id: "nova", organizationId: "org-1", organization: { subscription: assinatura("org-1") } }])
    for (let i = 0; i < 5; i++) await calcularEntitlementsSombra(db, ["nova"], { agora: new Date(AGORA.getTime() + i * 60_000), log })
    expect(log).toHaveBeenCalledTimes(1)
    await calcularEntitlementsSombra(db, ["nova"], { agora: new Date(AGORA.getTime() + 16 * 60_000), log })
    expect(log).toHaveBeenCalledTimes(2)
    // A 2ª linha informa as 4 decisões caladas: somar 1 + suppressed por linha = 6 resoluções.
    expect(JSON.parse(log.mock.calls[1][0])).toMatchObject({ suppressed: 4 })
    expect(contadoresEntitlementSombra()["limitado:teste_vencido"]).toBe(6)
  })
  it("organização sem assinatura → bloqueado (ausência não concede)", async () => {
    const { db } = dbCom([{ id: "nova", organizationId: "org-1", organization: { subscription: null } }])
    expect((await calcularEntitlementsSombra(db, ["nova"], { agora: AGORA, log: vi.fn() }))?.nova).toEqual({ modo: "bloqueado", motivo: "sem_assinatura" })
  })
  it("isolamento: assinatura de outra organização não vale para a loja", async () => {
    const { db } = dbCom([{ id: "a", organizationId: "org-a", organization: { subscription: assinatura("org-b", { status: "active" }) } }])
    expect((await calcularEntitlementsSombra(db, ["a"], { agora: AGORA, log: vi.fn() }))?.a).toEqual({ modo: "bloqueado", motivo: "inconsistente" })
  })
  it("pleno não gera log", async () => {
    const log = vi.fn()
    const { db } = dbCom([{ id: "a", organizationId: "org-a", organization: { subscription: assinatura("org-a", { status: "active" }) } }])
    await calcularEntitlementsSombra(db, ["a"], { agora: AGORA, log })
    expect(log).not.toHaveBeenCalled()
  })
})

describe("falha nunca afeta o login", () => {
  it("erro do banco (ex.: coluna ausente sem a migration) devolve undefined e loga sem detalhes", async () => {
    const logErro = vi.fn()
    const db = { store: { findMany: vi.fn(async () => { throw new Error('column "organizationId" does not exist — Failing row contains (segredo)') }) } } as unknown as EntitlementDb
    await expect(calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, logErro })).resolves.toBeUndefined()
    expect(logErro).toHaveBeenCalledWith(JSON.stringify({ event: "saas_entitlement_shadow_failed", v: 1, suppressed: 0 }))
    expect(JSON.stringify(logErro.mock.calls)).not.toContain("segredo")
  })
  it("falhas em série logam no máximo 1 linha por minuto por instância, com a contagem calada", async () => {
    const logErro = vi.fn()
    const db = { store: { findMany: vi.fn(async () => { throw new Error("x") }) } } as unknown as EntitlementDb
    vi.useFakeTimers()
    try {
      for (let i = 0; i < 10; i++) await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, logErro })
      expect(logErro).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(61_000)
      await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, logErro })
      expect(JSON.parse(logErro.mock.calls[1][0])).toEqual({ event: "saas_entitlement_shadow_failed", v: 1, suppressed: 9 })
      expect(contadoresEntitlementSombra().falha).toBe(11)
    } finally { vi.useRealTimers() }
  })
  it("SAAS_ENTITLEMENT_ENFORCE=on só avisa (uma vez) e não muda o resultado", async () => {
    const log = vi.fn()
    const { db } = dbCom([])
    const a = await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, env: { SAAS_ENTITLEMENT_ENFORCE: "on" }, log })
    await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, env: { SAAS_ENTITLEMENT_ENFORCE: "on" }, log })
    expect(a).toEqual({})
    expect(log.mock.calls.filter(([l]) => String(l).includes("saas_entitlement_enforce_ignored"))).toHaveLength(1)
  })
})

describe("tempo limite da consulta sombra", () => {
  it("banco lento: devolve undefined no prazo (login segue) e registra a falha", async () => {
    const logErro = vi.fn()
    const db = { store: { findMany: vi.fn(() => new Promise(() => {})) } } as unknown as EntitlementDb
    const t0 = Date.now()
    await expect(calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, logErro, tempoLimiteMs: 50 })).resolves.toBeUndefined()
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(logErro).toHaveBeenCalledWith(JSON.stringify({ event: "saas_entitlement_shadow_failed", v: 1, suppressed: 0 }))
  })
})

describe("tamanho do JWT", () => {
  it("50 lojas legadas não acrescentam nada ao claim ({} = 2 bytes); limitado com data < 100 bytes", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `cliente-${"0".repeat(8)}-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const legados = await calcularEntitlementsSombra(dbCom([]).db, ids, { agora: AGORA })
    expect(JSON.stringify(legados)).toBe("{}")
    const { db } = dbCom([{ id: "nova", organizationId: "o", organization: { subscription: assinatura("o") } }])
    const um = await calcularEntitlementsSombra(db, ["nova"], { agora: AGORA, log: vi.fn() })
    expect(JSON.stringify(um?.nova).length).toBeLessThan(100)
  })
})
