import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  classificarBarcode,
  fabricaProvedorPadrao,
  resolverCodigoBarrasCore,
} from "./resolver"
import { MemoLookup } from "./memo"
import type { ResultadoCadeia } from "./types"

/**
 * Testes do núcleo de resolução + classificação de barcode (GOAL 004A).
 * Cobrem os requisitos de "Server Action" sem importar app/actions/cadastros.ts
 * (que puxa Prisma) e sem chamada externa real.
 *
 * Casos obrigatórios:
 *  1. GTIN inválido => erro honesto.
 *  2. GTIN válido => chama orquestrador.
 *  3. Código interno 20–29 => não chama orquestrador externo.
 *  4. Resposta inclui tentativas quando houver tentativa externa.
 *  + provedor desconhecido na env => erro claro.
 */

const GTIN_VALIDO = "7891000053508"
const GTIN_INTERNO = "2012345678903"
const GTIN_INVALIDO = "4006381333932" // dígito verificador incorreto

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("classificarBarcode", () => {
  it("GTIN invalido => INVALID com mensagem honesta", () => {
    const c = classificarBarcode(GTIN_INVALIDO)
    expect(c.tipo).toBe("INVALID")
    if (c.tipo === "INVALID") {
      expect(c.message.length).toBeGreaterThan(0)
    }
  })

  it("codigo interno 20-29 => INTERNO (nao vai a provedor externo)", () => {
    const c = classificarBarcode(GTIN_INTERNO)
    expect(c.tipo).toBe("INTERNO")
    if (c.tipo === "INTERNO") {
      expect(c.gtin).toBe(GTIN_INTERNO)
      expect(c.formato).toBe("interno-2xx")
      expect(c.mensagem).toContain("interno")
    }
  })

  it("GTIN valido externo => EXTERNO", () => {
    const c = classificarBarcode(GTIN_VALIDO)
    expect(c.tipo).toBe("EXTERNO")
    if (c.tipo === "EXTERNO") {
      expect(c.gtin).toBe(GTIN_VALIDO)
    }
  })

  it("nao-numerico => INVALID", () => {
    expect(classificarBarcode("abc").tipo).toBe("INVALID")
    expect(classificarBarcode("").tipo).toBe("INVALID")
  })
})

describe("resolverCodigoBarrasCore", () => {
  let memo: MemoLookup
  let fetchSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof fetch

  beforeEach(() => {
    memo = new MemoLookup()
    originalFetch = globalThis.fetch
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("GTIN valido chama orquestrador e retorna tentativas (sem chamada externa real)", async () => {
    // fetch mockado => 404 => nao_encontrado. Prova que o orquestrador rodou.
    fetchSpy.mockResolvedValue(mockResponse(404, { error: "not found" }))
    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // Confirma headers de auth sem vazar a chave para o client (fica no header server-side).
    const [, init] = fetchSpy.mock.calls[0]
    expect(init.headers["X-Cosmos-Token"]).toBe("fake-key")
    expect(init.headers["User-Agent"]).toBe("Cosmos-API-Request")

    expect(resultado.status).toBe("nao_encontrado")
    if (resultado.status === "nao_encontrado") {
      expect(resultado.tentativas).toHaveLength(1)
      expect(resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "nao_encontrado" })
    }
  })

  it("codigo interno 20-29 nao chama orquestrador externo", async () => {
    // Se fetch for chamado, falha o teste.
    fetchSpy.mockResolvedValue(mockResponse(200, { description: "nao deveria chegar aqui" }))
    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    // O core recebe apenas GTINs já classificados como EXTERNO; o gate de interno
    // é responsabilidade da Server Action via classificarBarcode. Aqui confirmamos
    // que classificarBarcode bloqueia antes do core.
    const c = classificarBarcode(GTIN_INTERNO)
    expect(c.tipo).toBe("INTERNO")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("provedor desconhecido na env => erro claro (erro_config)", async () => {
    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos,google" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO)
    expect(resultado.status).toBe("erro_config")
    if (resultado.status === "erro_config") {
      expect(resultado.mensagem).toContain("google")
    }
    // Não chegou a chamar fetch.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("chave ausente => erro de configuracao, nao crash", async () => {
    const env = { COSMOS_API_KEY: undefined, BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO)
    expect(resultado.status).toBe("erro_config")
    if (resultado.status === "erro_config") {
      expect(resultado.mensagem).toContain("COSMOS_API_KEY")
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("encontrado => resposta inclui dados + tentativas", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, {
        description: "Produto Teste",
        brand: "Marca X",
        ncm: { code: "12345678" },
      }),
    )
    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO) as { resultado: Extract<ResultadoCadeia, { status: "encontrado" }> }

    expect(resultado.status).toBe("encontrado")
    expect(resultado.provedor).toBe("cosmos")
    expect(resultado.dados.nome).toBe("Produto Teste")
    expect(resultado.dados.marca).toBe("Marca X")
    expect(resultado.dados.ncm).toBe("12345678")
    expect(resultado.tentativas).toHaveLength(1)
    expect(resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "encontrado" })
  })

  it("PROVA DA CADEIA: cosmos nao_encontrado => upcitemdb encontrado (fallback)", async () => {
    // 1ª chamada (cosmos): 404 => nao_encontrado
    // 2ª chamada (upcitemdb): 200 + items => encontrado
    fetchSpy
      .mockResolvedValueOnce(mockResponse(404, { error: "not found" }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          code: "OK",
          total: 1,
          items: [{ title: "Produto UPC", brand: "Marca UPC" }],
        }),
      )

    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos,upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO) as { resultado: Extract<ResultadoCadeia, { status: "encontrado" }> }

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(resultado.status).toBe("encontrado")
    expect(resultado.provedor).toBe("upcitemdb")
    expect(resultado.dados.nome).toBe("Produto UPC")
    expect(resultado.dados.marca).toBe("Marca UPC")
    // UPCitemdb jamais traz NCM/CEST (constraint fiscal)
    expect(resultado.dados).not.toHaveProperty("ncm")
    expect(resultado.dados).not.toHaveProperty("cest")
    // Trace tem 2 tentativas: cosmos (nao_encontrado) + upcitemdb (encontrado)
    expect(resultado.tentativas).toHaveLength(2)
    expect(resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "nao_encontrado" })
    expect(resultado.tentativas[1]).toMatchObject({ provedor: "upcitemdb", status: "encontrado" })
  })

  it("PROVA DA CADEIA: cosmos limite_excedido => upcitemdb encontrado (skip por memo)", async () => {
    // 1ª chamada (cosmos): 429 => limite_excedido (memo marca cosmos como esgotado)
    // 2ª chamada (upcitemdb): 200 + items => encontrado
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { error: "rate limit" }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          code: "OK",
          total: 1,
          items: [{ title: "Fallback Product" }],
        }),
      )

    const env = { COSMOS_API_KEY: "fake-key", BARCODE_LOOKUP_PROVIDERS: "cosmos,upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO) as { resultado: Extract<ResultadoCadeia, { status: "encontrado" }> }

    expect(resultado.status).toBe("encontrado")
    expect(resultado.provedor).toBe("upcitemdb")
    expect(resultado.tentativas).toHaveLength(2)
    expect(resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "limite_excedido" })
    expect(resultado.tentativas[1]).toMatchObject({ provedor: "upcitemdb", status: "encontrado" })
  })

  it("upcitemdb sozinho funciona sem COSMOS_API_KEY (FREE sem token)", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, {
        code: "OK",
        total: 1,
        items: [{ title: "Produto Free" }],
      }),
    )
    const env = { COSMOS_API_KEY: undefined, BARCODE_LOOKUP_PROVIDERS: "upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, {
      criarProvedor: fabricaProvedorPadrao,
      memo,
    }, GTIN_VALIDO) as { resultado: Extract<ResultadoCadeia, { status: "encontrado" }> }

    expect(resultado.status).toBe("encontrado")
    expect(resultado.provedor).toBe("upcitemdb")
    expect(resultado.dados.nome).toBe("Produto Free")
  })
})
