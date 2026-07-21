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

  it('storeAccess="all" sem permissão Contador → sem_permissao', () => {
    const s = sessao({ storeAccess: "all", role: "VENDEDOR" } as Partial<Session["user"]>)
    expect(avaliarAcessoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_permissao" })
  })

  it('storeAccess="all" com permissão Contador segue o contrato real da plataforma', () => {
    const s = sessao({ storeAccess: "all", role: "ADMIN" } as Partial<Session["user"]>)
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
