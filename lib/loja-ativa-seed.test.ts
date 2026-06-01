/**
 * Unit do helper puro de semente da loja ativa (F-11 / DT-16).
 * Cobre o bug-raiz: primeira carga sem lojas NÃO deve semear `loja-1`.
 */
import { describe, expect, it } from "vitest"
import { resolveSeedStoreId, LEGACY_SESSION_SENTINEL } from "./loja-ativa-seed"

describe("resolveSeedStoreId — semente sem fallback loja-1 (DT-16)", () => {
  it("LS vazio + sem lojas → null (NÃO semeia loja-1) — bug-raiz F-11", () => {
    expect(resolveSeedStoreId(null, [])).toBeNull()
    expect(resolveSeedStoreId("", [])).toBeNull()
    expect(resolveSeedStoreId("   ", [])).toBeNull()
  })

  it("LS vazio + lojas cuja primeira NÃO é loja-1 → primeira loja real", () => {
    expect(resolveSeedStoreId(null, [{ id: "loja-7" }, { id: "loja-9" }])).toBe("loja-7")
  })

  it("LS com id salvo → mantém o id salvo (persistência forte)", () => {
    expect(resolveSeedStoreId("loja-9", [{ id: "loja-7" }, { id: "loja-9" }])).toBe("loja-9")
  })

  it("LS com id salvo é mantido mesmo antes da lista carregar", () => {
    expect(resolveSeedStoreId("loja-42", [])).toBe("loja-42")
  })

  it("sentinela legado 'loja-antiga' + lojas → migra para a primeira loja real (não loja-1)", () => {
    expect(resolveSeedStoreId(LEGACY_SESSION_SENTINEL, [{ id: "loja-7" }])).toBe("loja-7")
  })

  it("sentinela legado 'loja-antiga' sem lojas ainda → null (aguarda carga, não semeia loja-1)", () => {
    expect(resolveSeedStoreId(LEGACY_SESSION_SENTINEL, [])).toBeNull()
  })

  it("ignora lojas com id vazio/whitespace ao escolher a primeira real", () => {
    expect(resolveSeedStoreId(null, [{ id: "" }, { id: "  " }, { id: "loja-3" }])).toBe("loja-3")
    expect(resolveSeedStoreId(null, [{ id: null }, { id: undefined }])).toBeNull()
  })

  it("trim no id salvo", () => {
    expect(resolveSeedStoreId("  loja-5  ", [])).toBe("loja-5")
  })
})
