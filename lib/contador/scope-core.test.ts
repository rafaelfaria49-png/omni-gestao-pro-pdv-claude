import { describe, it, expect } from "vitest"
import type { Session } from "next-auth"
import { avaliarEscopoContador } from "./scope-core"

function sessao(over: Partial<Session["user"]> | null): Session | null {
  if (over === null) return null
  return { user: { ...over }, expires: "2999-01-01" } as unknown as Session
}

describe("avaliarEscopoContador (ACL multi-loja)", () => {
  it("sem sessão → nao_autenticado", () => {
    expect(avaliarEscopoContador(sessao(null), "loja-2")).toEqual({ ok: false, motivo: "nao_autenticado" })
  })

  it("sessão sem loja selecionada → sem_loja", () => {
    expect(avaliarEscopoContador(sessao({}), "")).toEqual({ ok: false, motivo: "sem_loja" })
    expect(avaliarEscopoContador(sessao({}), "   ")).toEqual({ ok: false, motivo: "sem_loja" })
  })

  it("acesso aberto (não restrito) libera qualquer loja", () => {
    const s = sessao({ storeAccess: "all" } as Partial<Session["user"]>)
    expect(avaliarEscopoContador(s, "loja-9")).toEqual({ ok: true, storeId: "loja-9" })
  })

  it("acesso restrito bloqueia loja fora da lista (cross-store)", () => {
    const s = sessao({ storeAccess: "restricted", allowedStoreIds: ["loja-2"] } as Partial<Session["user"]>)
    expect(avaliarEscopoContador(s, "loja-9")).toEqual({ ok: false, motivo: "sem_acesso" })
    expect(avaliarEscopoContador(s, "loja-2")).toEqual({ ok: true, storeId: "loja-2" })
  })
})
