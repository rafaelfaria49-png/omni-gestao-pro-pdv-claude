import { describe, expect, it } from "vitest"
import type { Session } from "next-auth"
import { avaliarAcessoContador } from "./scope-core"

function sessao(over: Partial<Session["user"]> | null): Session | null {
  if (over === null) return null
  return { user: { id: "user-1", ...over }, expires: "2999-01-01" } as unknown as Session
}

describe("avaliarAcessoContador (ACL multi-loja)", () => {
  it("sem sessão → nao_autenticado", () => {
    expect(avaliarAcessoContador(sessao(null), "loja-2")).toEqual({
      ok: false,
      motivo: "nao_autenticado",
    })
  })

  it("sessao sem userId nao produz decisao autorizada", () => {
    expect(avaliarAcessoContador(sessao({ id: "" }), "loja-2")).toEqual({
      ok: false,
      motivo: "nao_autenticado",
    })
  })

  it("sessão sem loja selecionada → loja_ausente", () => {
    const s = sessao({ role: "ADMIN" })
    expect(avaliarAcessoContador(s, "")).toEqual({ ok: false, motivo: "loja_ausente" })
    expect(avaliarAcessoContador(s, "   ")).toEqual({ ok: false, motivo: "loja_ausente" })
  })

  // Contrato desde 52c01c3: `storeAccess: "all"` sozinho não concede loja; só a autoridade da
  // plataforma (`platformAuthority`) ou membership explícita (`allowedStoreIds`).
  it('storeAccess="all" sem autoridade de plataforma não concede loja → sem_acesso_loja', () => {
    for (const role of ["VENDEDOR", "ADMIN"]) {
      const s = sessao({ storeAccess: "all", role } as Partial<Session["user"]>)
      expect(avaliarAcessoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_acesso_loja" })
    }
  })

  it("membro da loja sem permissão Contador (papel ou módulo) → sem_permissao", () => {
    const vendedor = sessao({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-9"],
      storeModules: { "loja-9": ["accountant"] },
      role: "VENDEDOR",
    } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(vendedor, "loja-9")).toEqual({ ok: false, motivo: "sem_permissao" })
    const adminSemModulo = sessao({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-9"],
      storeModules: { "loja-9": ["finance"] },
      role: "ADMIN",
    } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(adminSemModulo, "loja-9")).toEqual({ ok: false, motivo: "sem_permissao" })
  })

  it("autoridade da plataforma segue o contrato real da plataforma", () => {
    const s = sessao({ storeAccess: "all", role: "SUPER_ADMIN", platformAuthority: true } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(s, "loja-9")).toEqual({
      ok: true,
      storeId: "loja-9",
      userId: "user-1",
      permissaoContador: true,
    })
  })

  it("acesso restrito permite somente IDs autorizados (cross-store)", () => {
    const s = sessao({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-2"],
      storeModules: { "loja-2": ["accountant"] },
      role: "GERENTE",
    } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_acesso_loja" })
    expect(avaliarAcessoContador(s, "loja-2")).toEqual({
      ok: true,
      storeId: "loja-2",
      userId: "user-1",
      permissaoContador: true,
    })
  })

  it("avalia a loja antes da permissão e não revela dados cross-store", () => {
    const s = sessao({
      storeAccess: "restricted",
      allowedStoreIds: ["loja-2"],
      role: "VENDEDOR",
    } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_acesso_loja" })
  })
})
