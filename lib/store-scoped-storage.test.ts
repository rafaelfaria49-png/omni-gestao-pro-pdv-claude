import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  readStoreScopedString,
  storeScopedKey,
  writeStoreScopedString,
} from "./store-scoped-storage"

describe("store-scoped-storage", () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal("window", {})
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
      removeItem: (k: string) => {
        storage.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("não gera chave sem storeId", () => {
    expect(storeScopedKey("@omnigestao:pdv-layout", "")).toBeNull()
    expect(storeScopedKey("@omnigestao:pdv-layout", "  ")).toBeNull()
  })

  it("não lê nem grava sem storeId", () => {
    expect(readStoreScopedString("@omnigestao:pdv-layout", null)).toBeNull()
    expect(writeStoreScopedString("@omnigestao:pdv-layout", undefined, "classic")).toBe(false)
    expect(storage.size).toBe(0)
  })

  it("isola valores por unidade", () => {
    writeStoreScopedString("omnigestao-pdv-modo", "loja-a", "rapido")
    writeStoreScopedString("omnigestao-pdv-modo", "loja-b", "normal")
    expect(readStoreScopedString("omnigestao-pdv-modo", "loja-a")).toBe("rapido")
    expect(readStoreScopedString("omnigestao-pdv-modo", "loja-b")).toBe("normal")
    expect(storage.get("omnigestao-pdv-modo::loja-a")).toBe("rapido")
    expect(storage.get("omnigestao-pdv-modo::loja-b")).toBe("normal")
  })

  it("migra chave legada global uma vez para scoped", () => {
    storage.set("legacy-global", "supermercado")
    expect(readStoreScopedString("@omnigestao:pdv-layout", "loja-1", "legacy-global")).toBe(
      "supermercado",
    )
    expect(storage.get("@omnigestao:pdv-layout::loja-1")).toBe("supermercado")
  })
})
