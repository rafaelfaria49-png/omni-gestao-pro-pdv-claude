import { describe, expect, it, vi } from "vitest"
import { gestorMoneyAtivo } from "./ativacao"

vi.mock("server-only", () => ({}))

describe("Gestor Money — ativação controlada", () => {
  it.each([undefined, "", "false", "1", "TRUE", "yes", " true"])("desligado por padrão / valor não exato: %j", (v) => {
    expect(gestorMoneyAtivo({ GESTOR_MONEY_ENABLED: v })).toBe(false)
  })

  it("liga somente com o valor exato \"true\"", () => {
    expect(gestorMoneyAtivo({ GESTOR_MONEY_ENABLED: "true" })).toBe(true)
  })
})

describe("Gestor Money desligado — writers canônicos não criam perfil", () => {
  it("dadosFinanceirosEmpresa sem perfil existente: não cria, não trava, só precisão", async () => {
    vi.stubEnv("GESTOR_MONEY_ENABLED", "")
    vi.resetModules()
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
    const { dadosFinanceirosEmpresa } = await import("./financeiro-scope")
    const createMany = vi.fn(), queryRaw = vi.fn(), update = vi.fn()
    const db = {
      financeiroPerfil: { findUnique: vi.fn(async () => null), createMany },
      $queryRaw: queryRaw,
      carteiraFinanceira: { findFirst: vi.fn(), update },
      contaPagarTitulo: { findFirst: vi.fn(), update },
      contaReceberTitulo: { findFirst: vi.fn(), update },
    }
    const out = await dadosFinanceirosEmpresa(db as never, "L1", 365.01, { carteiraId: "C1", pagarTituloId: "T1" })
    expect(out).toEqual({ valorCentavos: "36501", valorOriginalLegado: null, precisaoStatus: "CENTAVOS" })
    expect("perfilId" in out).toBe(false)
    expect(createMany).not.toHaveBeenCalled()
    expect(queryRaw).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("ligado: o mesmo writer provisiona o perfil EMPRESA (contrato G002 preservado)", async () => {
    vi.stubEnv("GESTOR_MONEY_ENABLED", "true")
    vi.resetModules()
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }))
    const { dadosFinanceirosEmpresa } = await import("./financeiro-scope")
    let perfil: { id: string; tipo: string; storeId: string; ativo: boolean } | null = null
    const db = {
      financeiroPerfil: {
        findUnique: vi.fn(async () => perfil),
        createMany: vi.fn(async () => { perfil = { id: "P1", tipo: "EMPRESA", storeId: "L1", ativo: true }; return { count: 1 } }),
      },
      $queryRaw: vi.fn(async () => []),
    }
    const out = await dadosFinanceirosEmpresa(db as never, "L1", 10)
    expect(out).toMatchObject({ perfilId: "P1", valorCentavos: "1000" })
    expect(db.financeiroPerfil.createMany).toHaveBeenCalledOnce()
    vi.unstubAllEnvs()
  })
})
