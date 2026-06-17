import { describe, it, expect } from "vitest"
import {
  orderProdutoMedia,
  pickPrimaryImage,
  pickSecondaryImages,
  resolveProdutoImagens,
  PLACEHOLDER_PRODUTO_IMAGE,
  type ProdutoMediaInput,
} from "@/lib/catalog/produto-media"

const m = (url: string, p?: boolean, createdAt?: string, type?: string): ProdutoMediaInput => ({
  url,
  isPrimary: p,
  createdAt,
  type,
})

describe("orderProdutoMedia", () => {
  it("primary primeiro, depois mais antigo, ignorando vídeos e urls vazias", () => {
    const out = orderProdutoMedia([
      m("b.jpg", false, "2026-01-02"),
      m("a.jpg", true, "2026-01-03"),
      m("c.jpg", false, "2026-01-01"),
      m("v.mp4", false, "2026-01-01", "video"),
      m("", false),
    ])
    expect(out.map((x) => x.url)).toEqual(["a.jpg", "c.jpg", "b.jpg"])
  })

  it("dedup por url", () => {
    const out = orderProdutoMedia([m("a.jpg"), m("a.jpg")])
    expect(out).toHaveLength(1)
  })

  it("lista inválida → []", () => {
    expect(orderProdutoMedia(null)).toEqual([])
    expect(orderProdutoMedia(undefined)).toEqual([])
  })
})

describe("pickPrimaryImage / pickSecondaryImages", () => {
  it("principal = isPrimary; secundárias = resto", () => {
    const list = [m("a.jpg"), m("b.jpg", true), m("c.jpg")]
    expect(pickPrimaryImage(list)).toBe("b.jpg")
    expect(pickSecondaryImages(list)).toEqual(["a.jpg", "c.jpg"])
    expect(pickSecondaryImages(list, 1)).toEqual(["a.jpg"])
  })
  it("sem imagens → null/[]", () => {
    expect(pickPrimaryImage([])).toBeNull()
    expect(pickSecondaryImages([])).toEqual([])
  })
})

describe("resolveProdutoImagens", () => {
  it("usa placeholder quando vazio (default)", () => {
    const r = resolveProdutoImagens([])
    expect(r.vazio).toBe(true)
    expect(r.principal).toBe(PLACEHOLDER_PRODUTO_IMAGE)
    expect(r.secundaria).toBeNull()
  })
  it("não usa placeholder quando desativado", () => {
    const r = resolveProdutoImagens([], { usarPlaceholder: false })
    expect(r.principal).toBeNull()
  })
  it("monta principal + secundária + todas", () => {
    const r = resolveProdutoImagens([m("a.jpg", true), m("b.jpg")])
    expect(r.principal).toBe("a.jpg")
    expect(r.secundaria).toBe("b.jpg")
    expect(r.todas).toEqual(["a.jpg", "b.jpg"])
    expect(r.vazio).toBe(false)
  })
})
