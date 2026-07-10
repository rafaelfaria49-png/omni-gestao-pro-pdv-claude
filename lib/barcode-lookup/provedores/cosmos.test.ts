import { describe, expect, it, vi } from "vitest"
import { criarProvedorCosmos, normalizarCosmos } from "./cosmos"
import type { ResultadoLookup } from "../types"

/**
 * Testes do adapter Cosmos/Bluesoft (GOAL 004A).
 * Nenhuma chamada externa real: fetch é injetada via fetchImpl.
 */

/** Cria uma Response mínima compatível com o que o adapter lê. */
function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  const json = JSON.stringify(body)
  const h = new Headers(headers)
  return new Response(json, { status, headers: h })
}

/** AbortError compatível cross-env (Node/before). */
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

describe("normalizarCosmos", () => {
  it("normaliza payload completo mantendo todos os campos", () => {
    const body = {
      description: "Coca-Cola Lata 350ml",
      brand: { name: "Coca-Cola" },
      gpc_category: "Bebidas",
      full_description: "Refrigerante cola lata 350ml",
      ncm: { code: "22021000", full_description: "Águas... adicionadas de açúcar" },
      cest: "0301800",
      photo: "https://example.com/foto.jpg",
    }
    expect(normalizarCosmos(body)).toEqual({
      nome: "Coca-Cola Lata 350ml",
      marca: "Coca-Cola",
      categoria: "Bebidas",
      descricao: "Refrigerante cola lata 350ml",
      ncm: "22021000",
      cest: "0301800",
      imagemUrl: "https://example.com/foto.jpg",
    })
  })

  it("encontrado parcial sem NCM/CEST mantém campos ausentes", () => {
    const body = { description: "Pilhas AA", brand: "Duracell" }
    const n = normalizarCosmos(body)
    expect(n).toEqual({ nome: "Pilhas AA", marca: "Duracell" })
    expect(n).not.toHaveProperty("ncm")
    expect(n).not.toHaveProperty("cest")
    expect(n).not.toHaveProperty("imagemUrl")
  })

  it("rejeita payload sem nome retornando null", () => {
    expect(normalizarCosmos({ brand: "Sem nome" })).toBeNull()
    expect(normalizarCosmos(null)).toBeNull()
    expect(normalizarCosmos("string")).toBeNull()
    expect(normalizarCosmos([])).toBeNull()
  })

  it("limpa NCM para 8 dígitos e CEST para 7; rejeita comprimento errado", () => {
    expect(normalizarCosmos({ description: "X", ncm: "2202.10.00" })).toEqual({ nome: "X", ncm: "22021000" })
    expect(normalizarCosmos({ description: "X", ncm: "220" })).not.toHaveProperty("ncm")
    expect(normalizarCosmos({ description: "X", cest: "03.01.8-00" })).toEqual({ nome: "X", cest: "0301800" })
    expect(normalizarCosmos({ description: "X", cest: "030" })).not.toHaveProperty("cest")
  })
})

describe("criarProvedorCosmos", () => {
  const apiKey = "token-teste-123"

  it("encontrado completo => status encontrado com dados normalizados", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, {
        description: "Leite Integral 1L",
        brand: "Italac",
        gpc_category: "Laticínios",
        ncm: { code: "04011010" },
        cest: "1701900",
        photo: "https://cdn/leite.jpg",
      }),
    )
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl: fetchImpl as unknown as typeof fetch })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res.status).toBe("encontrado")
    if (res.status === "encontrado") {
      expect(res.dados.nome).toBe("Leite Integral 1L")
      expect(res.dados.marca).toBe("Italac")
      expect(res.dados.ncm).toBe("04011010")
      expect(res.dados.imagemUrl).toBe("https://cdn/leite.jpg")
    }
    // Confirma headers obrigatórios.
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    const init = calls[0][1]
    expect((init.headers as Record<string, string>)["X-Cosmos-Token"]).toBe(apiKey)
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Cosmos-API-Request")
  })

  it("encontrado parcial sem NCM => campos ausentes permanecem ausentes", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, { description: "Brinquedo Mini", brand: "Xalingo" }),
    )
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891234567890", new AbortController().signal) as Extract<ResultadoLookup, { status: "encontrado" }>
    expect(res.status).toBe("encontrado")
    expect(res.dados).toEqual({ nome: "Brinquedo Mini", marca: "Xalingo" })
    expect(res.dados).not.toHaveProperty("ncm")
  })

  it("404 => status nao_encontrado", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(404, { error: "not found" }))
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7890000000000", new AbortController().signal)
    expect(res).toEqual({ status: "nao_encontrado" })
  })

  it("429 => status limite_excedido (com resetEm se header presente)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse(429, { error: "rate limit" }, { "X-RateLimit-Reset": "3600" }),
    )
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res.status).toBe("limite_excedido")
    if (res.status === "limite_excedido") {
      expect(res.resetEm).toBeInstanceOf(Date)
    }
  })

  it("429 sem header de reset => limite_excedido sem resetEm", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(429, { error: "rate limit" }))
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "limite_excedido" })
  })

  it("timeout/abort => status erro tipo timeout", async () => {
    const fetchImpl = vi.fn(async () => {
      throw abortError()
    })
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", abortedSignal())
    expect(res).toEqual({ status: "erro", tipo: "timeout" })
  })

  it("payload malformado (JSON inválido) => status erro tipo parse", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("not-json{", { status: 200, headers: { "Content-Type": "application/json" } }),
    )
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "parse" })
  })

  it("payload 200 mas sem campos válidos => erro tipo parse", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(200, { foo: "bar" }))
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "parse" })
  })

  it("401/403 => status erro tipo auth", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => mockResponse(401, { error: "unauthorized" }))
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "auth" })
    warnSpy.mockRestore()
  })

  it("normaliza token com espaço/quebra de linha antes de enviar (trim)", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(200, { description: "X" }))
    const provedor = criarProvedorCosmos({
      apiKey: "  token-teste \n",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await provedor.consultar("7891000053508", new AbortController().signal)
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    const headers = calls[0][1].headers as Record<string, string>
    expect(headers["X-Cosmos-Token"]).toBe("token-teste")
    expect(headers["User-Agent"]).toBe("Cosmos-API-Request")
    expect(headers["Content-Type"]).toBe("application/json")
  })

  it("token vazio após trim => erro auth sem chamada externa", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => mockResponse(200, { description: "X" }))
    const provedor = criarProvedorCosmos({ apiKey: " \n ", fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "auth" })
    expect(fetchImpl).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("aviso de auth rejeitada informa o status HTTP e não contém o token", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => mockResponse(403, { error: "forbidden" }))
    const provedor = criarProvedorCosmos({ apiKey: "CHAVE-SECRETA-XYZ", fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "auth" })
    const warns = warnSpy.mock.calls.flat().join(" ")
    expect(warns).toContain("403")
    expect(warns).not.toContain("CHAVE-SECRETA-XYZ")
    warnSpy.mockRestore()
  })

  it("erro de rede (fetch rejeita sem abort) => status erro tipo rede", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed: ENOTFOUND")
    })
    const provedor = criarProvedorCosmos({ apiKey, fetchImpl })
    const res = await provedor.consultar("7891000053508", new AbortController().signal)
    expect(res).toEqual({ status: "erro", tipo: "rede" })
  })

  it("nunca loga a chave de API", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => mockResponse(500, {}))
    const provedor = criarProvedorCosmos({ apiKey: "CHAVE-SECRETA-XYZ", fetchImpl })
    await provedor.consultar("7891000053508", new AbortController().signal)
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .join(" ")
    expect(allCalls).not.toContain("CHAVE-SECRETA-XYZ")
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
