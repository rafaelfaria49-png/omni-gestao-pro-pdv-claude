import { describe, expect, it } from "vitest"
import { lerOrdemProvedores } from "./registry"

describe("lerOrdemProvedores", () => {
  it("env vazia => default cosmos", () => {
    expect(lerOrdemProvedores(undefined)).toEqual({ ok: true, provedores: ["cosmos"] })
    expect(lerOrdemProvedores("")).toEqual({ ok: true, provedores: ["cosmos"] })
    expect(lerOrdemProvedores("   ")).toEqual({ ok: true, provedores: ["cosmos"] })
  })

  it("cosmos simples => [cosmos]", () => {
    expect(lerOrdemProvedores("cosmos")).toEqual({ ok: true, provedores: ["cosmos"] })
  })

  it("CSV multiplo => ordem preservada", () => {
    expect(lerOrdemProvedores("cosmos,upcitemdb")).toEqual({ ok: true, provedores: ["cosmos", "upcitemdb"] })
    expect(lerOrdemProvedores("upcitemdb,cosmos")).toEqual({ ok: true, provedores: ["upcitemdb", "cosmos"] })
  })

  it("remove duplicatas preservando a primeira ocorrencia", () => {
    expect(lerOrdemProvedores("cosmos,cosmos,upcitemdb")).toEqual({ ok: true, provedores: ["cosmos", "upcitemdb"] })
  })

  it("espacos sao trimados", () => {
    expect(lerOrdemProvedores(" cosmos , upcitemdb ")).toEqual({ ok: true, provedores: ["cosmos", "upcitemdb"] })
  })

  it("provedor desconhecido => erro claro (nao crash)", () => {
    const r = lerOrdemProvedores("cosmos,google")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.erro).toContain("google")
      expect(r.erro).toContain("BARCODE_LOOKUP_PROVIDERS")
    }
  })

  it("openfoodfacts é aceito (mesmo ainda nao implementado)", () => {
    expect(lerOrdemProvedores("cosmos,openfoodfacts")).toEqual({ ok: true, provedores: ["cosmos", "openfoodfacts"] })
  })
})
