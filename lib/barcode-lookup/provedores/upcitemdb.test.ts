import { describe, expect, it, vi } from "vitest"
import {
  criarProvedorUpcItemdb,
  extrairPrimeiroItemUpcItemdb,
  normalizarItemUpcItemdb,
} from "./upcitemdb"
import type { ResultadoLookup } from "../types"

/**
 * Testes do adapter UPCitemdb (GOAL 004B).
 * Nenhuma chamada externa real: fetch é injetada via fetchImpl.
 */

/** Cria uma Response mínima compatível com o que o adapter lê. */
function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const json = JSON.stringify(body)
  const h = new Headers(headers)
  return new Response(json, { status, headers: h })
}

/** AbortError compatível cross-env. */
function abortError(): Error {
  const e = new Error("The operation was aborted")
  e.name = "AbortError"
  return e
}

/** Cria um AbortSignal já abortado para simular timeout. */
function abortedSignal(): AbortSignal {
  const c = new AbortController()
  c.abort()
  return c.signal
}

const GTIN = "7891000053508"

describe("extrairPrimeiroItemUpcItemdb", () => {
  it("retorna o primeiro item quando items é não-vazio", () => {
    const body = { code: "OK", total: 1, items: [{ title: "X" }, { title: "Y" }] }
    const item = extrairPrimeiroItemUpcItemdb(body)
    expect(item).toEqual({ title: "X" })
  })

  it("retorna null quando items é vazio", () => {
    expect(extrairPrimeiroItemUpcItemdb({ code: "OK", total: 0, items: [] })).toBeNull()
  })

  it("retorna null quando total=0 mesmo com items não-vazio (defensivo)", () => {
    expect(extrairPrimeiroItemUpcItemdb({ code: "OK", total: 0, items: [{ title: "X" }] })).toBeNull()
  })

  it("retorna null quando não há items (malformado)", () => {
    expect(extrairPrimeiroItemUpcItemdb({ code: "OK" })).toBeNull()
    expect(extrairPrimeiroItemUpcItemdb(null)).toBeNull()
    expect(extrairPrimeiroItemUpcItemdb("string")).toBeNull()
    expect(extrairPrimeiroItemUpcItemdb([])).toBeNull()
  })
})

describe("normalizarItemUpcItemdb", () => {
  it("normaliza item completo mantendo todos os campos", () => {
    const item = {
      title: "Wireless Mouse",
      brand: "Logitech",
      category: "Electronics > Computer Accessories",
      description: "Ergonomic wireless mouse with USB receiver",
      images: ["https://cdn/mouse1.jpg", "https://cdn/mouse2.jpg"],
    }
    expect(normalizarItemUpcItemdb(item)).toEqual({
      nome: "Wireless Mouse",
      marca: "Logitech",
      categoria: "Electronics > Computer Accessories",
      descricao: "Ergonomic wireless mouse with USB receiver",
      imagemUrl: "https://cdn/mouse1.jpg",
    })
  })

  it("encontrado parcial (só title) => campos ausentes permanecem ausentes", () => {
    const n = normalizarItemUpcItemdb({ title: "Product X" })
    expect(n).toEqual({ nome: "Product X" })
    expect(n).not.toHaveProperty("marca")
    expect(n).not.toHaveProperty("categoria")
    expect(n).not.toHaveProperty("descricao")
    expect(n).not.toHaveProperty("imagemUrl")
  })

  it("images vazio => sem imagemUrl", () => {
    expect(normalizarItemUpcItemdb({ title: "X", images: [] })).toEqual({ nome: "X" })
    expect(normalizarItemUpcItemdb({ title: "X", images: null })).toEqual({ nome: "X" })
  })

  it("images com primeira string vazia => pega próxima válida", () => {
    const n = normalizarItemUpcItemdb({ title: "X", images: ["", "  ", "https://cdn/real.jpg"] })
    expect(n?.imagemUrl).toBe("https://cdn/real.jpg")
  })

  it("rejeita item sem title retornando null", () => {
    expect(normalizarItemUpcItemdb({ brand: "Sem title" })).toBeNull()
    expect(normalizarItemUpcItemdb(null)).toBeNull()
    expect(normalizarItemUpcItemdb("string")).toBeNull()
    expect(normalizarItemUpcItemdb([])).toBeNull()
  })

  it("JAMAIS inclui ncm/cest mesmo se o item trouxer esses campos (constraint fiscal)", () => {
    const item = {
      title: "Produto com fiscal fake",
      ncm: "12345678",
      cest: "1234567",
    }
    const n = normalizarItemUpcItemdb(item)
    expect(n).toEqual({ nome: "Produto com fiscal fake" })
    expect(n).not.toHaveProperty("ncm")
    expect(n).not.toHaveProperty("cest")
  })
})

describe("criarProvedorUpcItemdb", () => {
  it("encontrado completo => status encontrado com dados normalizados", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, {
        code: "OK",
        total: 1,
        offset: 0,
        items: [
          {
            title: "USB Cable",
            brand: "Anker",
            category: "Electronics",
            description: "USB-C to USB-A cable",
            images: ["https://cdn/cable.jpg"],
          },
        ],
      }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res.status).toBe("encontrado")
    if (res.status === "encontrado") {
      expect(res.dados.nome).toBe("USB Cable")
      expect(res.dados.marca).toBe("Anker")
      expect(res.dados.imagemUrl).toBe("https://cdn/cable.jpg")
    }
  })

  it("não envia header de auth (FREE/trial sem token)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { code: "OK", total: 1, items: [{ title: "X" }] }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await provedor.consultar(GTIN, new AbortController().signal)
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    const init = calls[0][1]
    const headers = init.headers as Record<string, string>
    expect(headers["X-Cosmos-Token"]).toBeUndefined()
    expect(headers["Authorization"]).toBeUndefined()
    expect(headers["user_key"]).toBeUndefined()
    expect(headers["Accept"]).toBe("application/json")
  })

  it("encontrado parcial (só title) => campos ausentes permanecem ausentes", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { code: "OK", total: 1, items: [{ title: "Generic Product" }] }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal) as Extract<ResultadoLookup, { status: "encontrado" }>
    expect(res.status).toBe("encontrado")
    expect(res.dados).toEqual({ nome: "Generic Product" })
    expect(res.dados).not.toHaveProperty("marca")
    expect(res.dados).not.toHaveProperty("imagemUrl")
  })

  it("items vazio / total=0 => status nao_encontrado", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { code: "OK", total: 0, items: [] }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "nao_encontrado" })
  })

  it("404 => status nao_encontrado", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(404, { code: "NOT_FOUND" }))
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "nao_encontrado" })
  })

  it("429 com X-RateLimit-Reset => limite_excedido com resetEm", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(429, { code: "RATE_LIMIT" }, { "X-RateLimit-Reset": "3600" }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res.status).toBe("limite_excedido")
    if (res.status === "limite_excedido") {
      expect(res.resetEm).toBeInstanceOf(Date)
    }
  })

  it("429 com Retry-After => limite_excedido com resetEm", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(429, { code: "RATE_LIMIT" }, { "Retry-After": "120" }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res.status).toBe("limite_excedido")
    if (res.status === "limite_excedido") {
      expect(res.resetEm).toBeInstanceOf(Date)
    }
  })

  it("429 sem header de reset => limite_excedido sem resetEm", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(429, { code: "RATE_LIMIT" }))
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "limite_excedido" })
  })

  it("timeout/abort => status erro tipo timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      throw abortError()
    })
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, abortedSignal())
    expect(res).toEqual({ status: "erro", tipo: "timeout" })
  })

  it("payload malformado (JSON inválido) => status erro tipo parse", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not-json{", { status: 200, headers: { "Content-Type": "application/json" } }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "parse" })
  })

  it("payload 200 com items mas item sem title => erro tipo parse", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { code: "OK", total: 1, items: [{ brand: "No title" }] }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "parse" })
  })

  it("401/403 => status erro tipo auth (defensivo: FREE não deve retornar)", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(403, { code: "FORBIDDEN" }))
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "auth" })
  })

  it("erro de rede (fetch rejeita sem abort) => status erro tipo rede", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: ENOTFOUND")
    })
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "rede" })
  })

  it("JAMAIS retorna ncm/cest mesmo se o payload trouxer (constraint fiscal)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, {
        code: "OK",
        total: 1,
        items: [
          {
            title: "Produto com fiscal fake",
            ncm: "12345678",
            cest: "1234567",
          },
        ],
      }),
    )
    const provedor = criarProvedorUpcItemdb({ fetchImpl })
    const res = await provedor.consultar(GTIN, new AbortController().signal) as Extract<ResultadoLookup, { status: "encontrado" }>
    expect(res.status).toBe("encontrado")
    expect(res.dados).not.toHaveProperty("ncm")
    expect(res.dados).not.toHaveProperty("cest")
  })

  it("funciona sem nenhuma env/chave (prova: FREE sem token)", () => {
    const provedor = criarProvedorUpcItemdb()
    expect(provedor.id).toBe("upcitemdb")
    expect(typeof provedor.consultar).toBe("function")
  })
})
