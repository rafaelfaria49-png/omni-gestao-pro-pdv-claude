/**
 * GOAL CONTADOR-HUB-DOCUMENTOS-REAL-010B · Etapa 12 (permissão dedicada).
 *
 * `hubs.contador` decide o acesso à seção Documentos: admin e gerente PODEM;
 * caixa, técnico e vendedor NÃO. O gate `avaliarAcessoContador` traduz isso em
 * `sem_permissao` (403) preservando 401 e cross-store (403).
 */
import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { avaliarAcessoContador } from "@/lib/contador/scope-core"

function sessao(over: Partial<Session["user"]>): Session {
  return { user: { id: "user-1", ...over }, expires: "2999-01-01" } as unknown as Session
}

describe("hubs.contador · matriz de papéis", () => {
  it("admin e gerente têm acesso; caixa/técnico/vendedor não", () => {
    expect(getEnterprisePermissions("ADMIN").hubs.contador).toBe(true)
    expect(getEnterprisePermissions("GERENTE").hubs.contador).toBe(true)
    expect(getEnterprisePermissions("CAIXA").hubs.contador).toBe(false)
    expect(getEnterprisePermissions("TECNICO").hubs.contador).toBe(false)
    expect(getEnterprisePermissions("VENDEDOR").hubs.contador).toBe(false)
  })
})

describe("avaliarAcessoContador · autorização por papel", () => {
  it("admin autorizado na loja acessível", () => {
    const r = avaliarAcessoContador(sessao({ role: "ADMIN", storeAccess: "all" }), "loja-1")
    expect(r).toEqual({ ok: true, storeId: "loja-1", userId: "user-1", permissaoContador: true })
  })

  it("gerente autorizado", () => {
    const r = avaliarAcessoContador(sessao({ role: "GERENTE", storeAccess: "all" }), "loja-1")
    expect(r.ok).toBe(true)
  })

  it.each(["CAIXA", "TECNICO", "VENDEDOR"])("%s → sem_permissao (403)", (role) => {
    expect(avaliarAcessoContador(sessao({ role, storeAccess: "all" }), "loja-1")).toEqual({
      ok: false,
      motivo: "sem_permissao",
    })
  })

  it("sem sessão → nao_autenticado (401)", () => {
    expect(avaliarAcessoContador(null, "loja-1")).toEqual({ ok: false, motivo: "nao_autenticado" })
  })

  it("loja não acessível (cross-store) → sem_acesso_loja (403), mesmo com permissão", () => {
    const s = sessao({ role: "ADMIN", storeAccess: "restricted", allowedStoreIds: ["loja-2"] })
    expect(avaliarAcessoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_acesso_loja" })
  })
})
