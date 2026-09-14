import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  pdvBlackCupomKey,
  pdvBlackTurnoKey,
  readPdvBlackCupom,
  readPdvBlackTurno,
  resolveTerminalId,
  writePdvBlackCupom,
  writePdvBlackTurno,
} from "./pdv-black-storage"

function installLocalStorageShim() {
  const store = new Map<string, string>()
  const fakeLocalStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = fakeLocalStorage
}

function uninstallLocalStorageShim() {
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { localStorage?: unknown }).localStorage
}

describe("pdv-black-storage", () => {
  beforeEach(() => {
    installLocalStorageShim()
  })

  afterEach(() => {
    uninstallLocalStorageShim()
  })

  it("resolveTerminalId usa 'default' quando terminalId for vazio ou ausente", () => {
    expect(resolveTerminalId(undefined)).toBe("default")
    expect(resolveTerminalId(null)).toBe("default")
    expect(resolveTerminalId("")).toBe("default")
    expect(resolveTerminalId("   ")).toBe("default")
    expect(resolveTerminalId("term-1")).toBe("term-1")
  })

  it("constrói chaves escopadas por storeId e terminalIdOrDefault", () => {
    expect(pdvBlackTurnoKey("loja-a", "term-1")).toBe("@omnigestao:pdv-black-turno:loja-a:term-1")
    expect(pdvBlackTurnoKey("loja-a", null)).toBe("@omnigestao:pdv-black-turno:loja-a:default")
    expect(pdvBlackCupomKey("loja-b", "term-2")).toBe("@omnigestao:pdv-black-cupom:loja-b:term-2")
    expect(pdvBlackCupomKey(null, "term-1")).toBeNull()
  })

  it("isola turno entre Loja A e Loja B", () => {
    writePdvBlackTurno("loja-a", "term-1", 5)
    writePdvBlackTurno("loja-b", "term-1", 12)

    expect(readPdvBlackTurno("loja-a", "term-1")).toBe(5)
    expect(readPdvBlackTurno("loja-b", "term-1")).toBe(12)
  })

  it("isola turno entre Terminal 1 e Terminal 2 na mesma loja", () => {
    writePdvBlackTurno("loja-a", "term-1", 3)
    writePdvBlackTurno("loja-a", "term-2", 7)

    expect(readPdvBlackTurno("loja-a", "term-1")).toBe(3)
    expect(readPdvBlackTurno("loja-a", "term-2")).toBe(7)
  })

  it("isola cupom entre Loja A e Loja B e entre terminais", () => {
    writePdvBlackCupom("loja-a", "term-1", 1005)
    writePdvBlackCupom("loja-b", "term-1", 2040)
    writePdvBlackCupom("loja-a", "term-2", 1088)

    expect(readPdvBlackCupom("loja-a", "term-1")).toBe(1005)
    expect(readPdvBlackCupom("loja-b", "term-1")).toBe(2040)
    expect(readPdvBlackCupom("loja-a", "term-2")).toBe(1088)
  })

  it("retorna defaults seguros (turno 1, cupom 1000) se chave não existir", () => {
    expect(readPdvBlackTurno("loja-x", "term-1")).toBe(1)
    expect(readPdvBlackCupom("loja-x", "term-1")).toBe(1000)
  })

  it("não grava nem vaza para chaves globais legadas", () => {
    writePdvBlackTurno("loja-a", "term-1", 9)
    writePdvBlackCupom("loja-a", "term-1", 1050)

    expect((globalThis as unknown as { localStorage: { getItem: (k: string) => string | null } }).localStorage.getItem("@omnigestao:pdv-black-turno")).toBeNull()
    expect((globalThis as unknown as { localStorage: { getItem: (k: string) => string | null } }).localStorage.getItem("@omnigestao:pdv-black-cupom")).toBeNull()
  })
})
