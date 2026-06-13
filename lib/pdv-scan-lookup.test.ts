import { afterEach, describe, expect, it, vi } from "vitest"
import type { Dispatch, SetStateAction } from "react"
import { findPdvProductByScan } from "./pdv-scan-product"
import { lookupPdvScanRemote } from "./pdv-scan-lookup"
import type { PdvCatalogProduct } from "./pdv-catalog"
import type { InventoryItem } from "./operations-store"

function makeCatalog(n: number): PdvCatalogProduct[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `SKU-${String(i).padStart(4, "0")}`,
    name: `Produto ${i}`,
    barcode: `789000000${String(i).padStart(4, "0")}`,
    price: 10 + i,
    stock: 5,
    category: "Brinquedos",
  }))
}

describe("findPdvProductByScan — catálogo inteiro (sem paginação)", () => {
  it("encontra produto bem além da 'primeira página' pelo código de barras", () => {
    const catalog = makeCatalog(300)
    const target = catalog[250]!
    const hit = findPdvProductByScan(target.barcode!, catalog)
    expect(hit?.id).toBe(target.id)
  })

  it("encontra o último produto da lista pelo SKU", () => {
    const catalog = makeCatalog(300)
    const target = catalog[299]!
    const hit = findPdvProductByScan(target.id, catalog)
    expect(hit?.id).toBe(target.id)
  })
})

function fakeSetInventory(store: { current: InventoryItem[] }): Dispatch<SetStateAction<InventoryItem[]>> {
  return (updater) => {
    store.current =
      typeof updater === "function"
        ? (updater as (v: InventoryItem[]) => InventoryItem[])(store.current)
        : updater
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("lookupPdvScanRemote — fallback autoritativo no backend", () => {
  it("encontra produto fora do snapshot e o injeta no estoque local", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "SKU-NOVO",
            name: "Boneca recém-cadastrada",
            barcode: "7891234567890",
            sku: "SKU-NOVO",
            dbId: "ckxyz",
            codigo: "SKU-NOVO",
            codigoBarras: "7891234567890",
            stock: 7,
            cost: 4,
            price: 19.9,
            category: "Brinquedos",
          },
        ],
      }),
    }))
    vi.stubGlobal("fetch", fetchMock)

    const store = { current: [] as InventoryItem[] }
    const res = await lookupPdvScanRemote({
      code: "7891234567890",
      storeId: "loja-2",
      setInventory: fakeSetInventory(store),
    })

    expect(res.kind).toBe("single")
    if (res.kind === "single") {
      expect(res.product.id).toBe("SKU-NOVO")
      expect(res.product.barcode).toBe("7891234567890")
    }
    // injetado no estoque local para que carrinho/fechamento funcionem
    expect(store.current.map((i) => i.id)).toContain("SKU-NOVO")

    // multi-loja: storeId vai na query e no header
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("lojaId=loja-2")
    expect(url).toContain("code=7891234567890")
    expect((init.headers as Record<string, string>)["x-assistec-loja-id"]).toBe("loja-2")
  })

  it("retorna 'none' quando o backend não encontra o código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })))
    const store = { current: [] as InventoryItem[] }
    const res = await lookupPdvScanRemote({ code: "0000", storeId: "loja-2", setInventory: fakeSetInventory(store) })
    expect(res.kind).toBe("none")
  })

  it("retorna 'error' quando a rota falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })))
    const store = { current: [] as InventoryItem[] }
    const res = await lookupPdvScanRemote({ code: "0000", storeId: "loja-2", setInventory: fakeSetInventory(store) })
    expect(res.kind).toBe("error")
  })

  it("não consulta o backend sem storeId (degrada para 'none')", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const store = { current: [] as InventoryItem[] }
    const res = await lookupPdvScanRemote({ code: "789", storeId: "", setInventory: fakeSetInventory(store) })
    expect(res.kind).toBe("none")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
