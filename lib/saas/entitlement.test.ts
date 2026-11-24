import { describe, expect, it } from "vitest"
import { paraClaim, resolverEntitlement, STATUS_ASSINATURA, type AssinaturaEntitlementInput } from "@/lib/saas/entitlement"

// Tabela-verdade do resolvedor central (OMNI-SAAS-001A). Relógio sempre injetado.
const ORG = "org-a"
const T0 = new Date("2026-12-01T12:00:00.000Z")
const ms = (d: Date, delta: number) => new Date(d.getTime() + delta)
const H = 3_600_000
const DIA = 24 * H
const loja = { organizationId: ORG }

function sub(p: Partial<AssinaturaEntitlementInput> = {}): AssinaturaEntitlementInput {
  return {
    organizationId: ORG,
    planoId: "vendas-e-estoque",
    status: "trialing",
    trialEndsAt: ms(T0, 7 * DIA),
    currentPeriodEnd: null,
    graceEndsAt: null,
    suspendedMode: null,
    limitedSince: null,
    limiteUsuariosPorLoja: 2,
    cortesiaAte: null,
    ...p,
  }
}
const r = (s: AssinaturaEntitlementInput | null, agora: Date, l: { organizationId: string | null } = loja) => resolverEntitlement(l, s, agora)

describe("loja legada (organizationId NULL)", () => {
  it("é sempre pleno, sem limite de usuários, qualquer que seja a assinatura passada", () => {
    for (const s of [null, sub({ status: "suspended", suspendedMode: "bloqueado" }), sub({ status: "trial_expired" })]) {
      expect(r(s, T0, { organizationId: null })).toEqual({ modo: "pleno", origem: "legado", motivo: "legado", planoId: null, limiteUsuariosPorLoja: null, trialEndsAt: null, limitedSince: null })
    }
  })
  it("independe do relógio (mesmo inválido)", () => {
    expect(r(null, new Date(Number.NaN), { organizationId: null }).modo).toBe("pleno")
  })
})

describe("ausência e inconsistência nunca concedem acesso comercial", () => {
  it("organização sem assinatura → bloqueado/sem_assinatura", () => {
    expect(r(null, T0)).toMatchObject({ modo: "bloqueado", origem: "assinatura", motivo: "sem_assinatura", limiteUsuariosPorLoja: null })
  })
  it("assinatura de OUTRA organização (isolamento multi-tenant) → bloqueado/inconsistente sem vazar dados", () => {
    const e = r(sub({ organizationId: "org-b", status: "active" }), T0)
    expect(e).toEqual({ modo: "bloqueado", origem: "assinatura", motivo: "inconsistente", planoId: null, limiteUsuariosPorLoja: null, trialEndsAt: null, limitedSince: null })
  })
  it("relógio inválido → bloqueado", () => {
    expect(r(sub({ status: "active" }), new Date(Number.NaN))).toMatchObject({ modo: "bloqueado", motivo: "inconsistente" })
  })
  it("status desconhecido → limitado/inconsistente (nunca pleno)", () => {
    for (const status of ["", "ativo", "ACTIVE", "trial", "unpaid"]) expect(r(sub({ status }), T0)).toMatchObject({ modo: "limitado", motivo: "inconsistente" })
  })
  it("trialing sem trialEndsAt → limitado/inconsistente", () => {
    expect(r(sub({ trialEndsAt: null }), T0)).toMatchObject({ modo: "limitado", motivo: "inconsistente" })
  })
  it("trialing com data inválida → limitado/inconsistente", () => {
    expect(r(sub({ trialEndsAt: new Date("x") }), T0)).toMatchObject({ modo: "limitado", motivo: "inconsistente" })
  })
})

describe("teste gratuito — instante exato de vencimento", () => {
  const fim = ms(T0, 7 * DIA)
  it.each([
    ["início do teste", T0, "pleno", "teste"],
    ["dia 6", ms(T0, 6 * DIA), "pleno", "teste"],
    ["1 ms antes do fim", ms(fim, -1), "pleno", "teste"],
    ["instante exato do fim", fim, "limitado", "teste_vencido"],
    ["1 ms depois", ms(fim, 1), "limitado", "teste_vencido"],
    ["fim + 1 s", ms(fim, 1000), "limitado", "teste_vencido"],
    ["30 dias depois", ms(fim, 30 * DIA), "limitado", "teste_vencido"],
  ])("%s", (_n, agora, modo, motivo) => {
    const e = r(sub({ trialEndsAt: fim }), agora as Date)
    expect(e).toMatchObject({ modo, motivo, trialEndsAt: fim.toISOString() })
    expect(e.limitedSince).toBe(modo === "pleno" ? null : fim.toISOString())
  })
  it("trial_expired materializado pelo cron continua limitado; limitedSince gravado prevalece", () => {
    const gravado = ms(fim, 5 * 60_000)
    expect(r(sub({ status: "trial_expired", trialEndsAt: fim }), ms(fim, H))).toMatchObject({ modo: "limitado", motivo: "teste_vencido", limitedSince: fim.toISOString() })
    expect(r(sub({ status: "trial_expired", trialEndsAt: fim, limitedSince: gravado }), ms(fim, H)).limitedSince).toBe(gravado.toISOString())
  })
})

describe("assinatura paga", () => {
  it("active → pleno/ok, com o limite contratado", () => {
    expect(r(sub({ status: "active", limiteUsuariosPorLoja: 2 }), T0)).toMatchObject({ modo: "pleno", motivo: "ok", limiteUsuariosPorLoja: 2, planoId: "vendas-e-estoque" })
  })
  it("pending_payment → limitado/pagamento_pendente", () => {
    expect(r(sub({ status: "pending_payment" }), T0)).toMatchObject({ modo: "limitado", motivo: "pagamento_pendente" })
  })
  const graca = ms(T0, 3 * DIA)
  it.each([
    ["dentro da carência", ms(graca, -1), "pleno", "carencia"],
    ["instante exato do fim da carência", graca, "limitado", "inadimplente"],
    ["após a carência", ms(graca, DIA), "limitado", "inadimplente"],
  ])("past_due — %s", (_n, agora, modo, motivo) => {
    expect(r(sub({ status: "past_due", graceEndsAt: graca }), agora as Date)).toMatchObject({ modo, motivo })
  })
  it("past_due sem graceEndsAt → limitado (sem carência implícita)", () => {
    expect(r(sub({ status: "past_due", graceEndsAt: null }), T0)).toMatchObject({ modo: "limitado", motivo: "inadimplente", limitedSince: null })
  })
  const fimPeriodo = ms(T0, 10 * DIA)
  it.each([
    ["período pago vigente", ms(fimPeriodo, -1), "pleno"],
    ["instante exato do fim do período", fimPeriodo, "limitado"],
    ["depois do período", ms(fimPeriodo, DIA), "limitado"],
  ])("canceled — %s", (_n, agora, modo) => {
    const e = r(sub({ status: "canceled", currentPeriodEnd: fimPeriodo }), agora as Date)
    expect(e).toMatchObject({ modo, motivo: "cancelado" })
    expect(e.limitedSince).toBe(modo === "pleno" ? null : fimPeriodo.toISOString())
  })
  it("canceled sem currentPeriodEnd → limitado", () => {
    expect(r(sub({ status: "canceled" }), T0)).toMatchObject({ modo: "limitado", motivo: "cancelado" })
  })
})

describe("suspensão", () => {
  it("padrão → limitado/suspenso", () => {
    expect(r(sub({ status: "suspended" }), T0)).toMatchObject({ modo: "limitado", motivo: "suspenso" })
  })
  it("modo bloqueado explícito → bloqueado", () => {
    expect(r(sub({ status: "suspended", suspendedMode: "bloqueado" }), T0)).toMatchObject({ modo: "bloqueado", motivo: "suspenso" })
  })
  it("modo desconhecido cai no limitado (nunca pleno)", () => {
    expect(r(sub({ status: "suspended", suspendedMode: "xyz" }), T0).modo).toBe("limitado")
  })
  it("suspensão prevalece sobre cortesia vigente (falha segura)", () => {
    expect(r(sub({ status: "suspended", suspendedMode: "bloqueado", cortesiaAte: ms(T0, DIA) }), T0)).toMatchObject({ modo: "bloqueado", motivo: "suspenso" })
  })
})

describe("cortesia", () => {
  const ate = ms(T0, 5 * DIA)
  it.each(STATUS_ASSINATURA.filter((s) => s !== "suspended"))("sobrepõe %s enquanto vigente", (status) => {
    expect(r(sub({ status, trialEndsAt: ms(T0, -DIA), graceEndsAt: ms(T0, -DIA), currentPeriodEnd: ms(T0, -DIA), cortesiaAte: ate }), T0)).toMatchObject({ modo: "pleno", motivo: "cortesia", limitedSince: null })
  })
  it("no instante exato do fim da cortesia volta ao estado da assinatura", () => {
    expect(r(sub({ status: "trial_expired", trialEndsAt: ms(T0, -DIA), cortesiaAte: ate }), ate)).toMatchObject({ modo: "limitado", motivo: "teste_vencido" })
  })
  it("cortesia vencida não concede nada", () => {
    expect(r(sub({ status: "pending_payment", cortesiaAte: ms(T0, -1) }), T0)).toMatchObject({ modo: "limitado", motivo: "pagamento_pendente" })
  })
})

describe("transições relevantes (mesma assinatura, relógio avançando)", () => {
  it("teste → vencido → contratou (active) → past_due em carência → limitado → reativado", () => {
    const fim = ms(T0, 7 * DIA)
    const seq: Array<[AssinaturaEntitlementInput, Date, string]> = [
      [sub(), ms(T0, DIA), "pleno"],
      [sub(), fim, "limitado"],
      [sub({ status: "active", currentPeriodEnd: ms(fim, 30 * DIA) }), ms(fim, H), "pleno"],
      [sub({ status: "past_due", graceEndsAt: ms(fim, 33 * DIA) }), ms(fim, 31 * DIA), "pleno"],
      [sub({ status: "past_due", graceEndsAt: ms(fim, 33 * DIA) }), ms(fim, 33 * DIA), "limitado"],
      [sub({ status: "active", currentPeriodEnd: ms(fim, 64 * DIA) }), ms(fim, 34 * DIA), "pleno"],
    ]
    expect(seq.map(([s, t]) => r(s, t).modo)).toEqual(seq.map(([, , m]) => m))
  })
  it("é determinístico: mesma entrada, mesma saída", () => {
    const s = sub({ status: "past_due", graceEndsAt: ms(T0, DIA) })
    expect(r(s, T0)).toEqual(r(s, new Date(T0.getTime())))
  })
})

describe("claim compacto do JWT", () => {
  it("omite limitedSince quando pleno e inclui quando limitado", () => {
    expect(paraClaim(r(null, T0, { organizationId: null }))).toEqual({ modo: "pleno", motivo: "legado" })
    const fim = ms(T0, 7 * DIA)
    expect(paraClaim(r(sub({ trialEndsAt: fim }), fim))).toEqual({ modo: "limitado", motivo: "teste_vencido", limitedSince: fim.toISOString() })
  })
})
