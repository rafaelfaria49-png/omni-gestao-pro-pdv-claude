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
  const findMany = vi.fn(async () => linhas)
  return { db: { store: { findMany } } as unknown as EntitlementDb, findMany }
}

beforeEach(() => reiniciarObservabilidadeSombra())

describe("lojas legadas", () => {
  it("todas as lojas sem organização resolvem legado/pleno", async () => {
    const { db } = dbCom([])
    const claims = await calcularEntitlementsSombra(db, ["loja-1", "loja-2", "cliente-x"], { agora: AGORA, log: vi.fn() })
    expect(claims).toEqual({
      "loja-1": { modo: "pleno", motivo: "legado" },
      "loja-2": { modo: "pleno", motivo: "legado" },
      "cliente-x": { modo: "pleno", motivo: "legado" },
    })
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
    expect(claims?.["loja-1"]).toEqual({ modo: "pleno", motivo: "legado" })
    expect(log).toHaveBeenCalledWith("[saas] entitlement_sombra loja=nova modo=limitado motivo=teste_vencido aplicado=nao")
    expect(contadoresEntitlementSombra()).toEqual({ "limitado:teste_vencido": 1 })
  })
  it("loga a mesma decisão no máximo uma vez a cada 15 min por loja (conta todas)", async () => {
    const log = vi.fn()
    const { db } = dbCom([{ id: "nova", organizationId: "org-1", organization: { subscription: assinatura("org-1") } }])
    for (let i = 0; i < 5; i++) await calcularEntitlementsSombra(db, ["nova"], { agora: new Date(AGORA.getTime() + i * 60_000), log })
    expect(log).toHaveBeenCalledTimes(1)
    await calcularEntitlementsSombra(db, ["nova"], { agora: new Date(AGORA.getTime() + 16 * 60_000), log })
    expect(log).toHaveBeenCalledTimes(2)
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
    expect(logErro).toHaveBeenCalledWith("[saas] entitlement_sombra_falhou")
    expect(JSON.stringify(logErro.mock.calls)).not.toContain("segredo")
  })
  it("SAAS_ENTITLEMENT_ENFORCE=on só avisa (uma vez) e não muda o resultado", async () => {
    const log = vi.fn()
    const { db } = dbCom([])
    const a = await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, env: { SAAS_ENTITLEMENT_ENFORCE: "on" }, log })
    await calcularEntitlementsSombra(db, ["loja-1"], { agora: AGORA, env: { SAAS_ENTITLEMENT_ENFORCE: "on" }, log })
    expect(a).toEqual({ "loja-1": { modo: "pleno", motivo: "legado" } })
    expect(log.mock.calls.filter(([l]) => String(l).includes("ignorado"))).toHaveLength(1)
  })
})

describe("tamanho do JWT", () => {
  it("custo por loja = id + ≤ 40 bytes (legado); limitado com data < 100 bytes", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `cliente-${"0".repeat(8)}-0000-4000-8000-${String(i).padStart(12, "0")}`)
    const legados = await calcularEntitlementsSombra(dbCom([]).db, ids, { agora: AGORA })
    const soIds = ids.reduce((n, id) => n + id.length, 0)
    expect(JSON.stringify(legados).length - soIds).toBeLessThanOrEqual(ids.length * 40 + 2)
    const { db } = dbCom([{ id: "nova", organizationId: "o", organization: { subscription: assinatura("o") } }])
    const um = await calcularEntitlementsSombra(db, ["nova"], { agora: AGORA, log: vi.fn() })
    expect(JSON.stringify(um?.nova).length).toBeLessThan(100)
  })
})
