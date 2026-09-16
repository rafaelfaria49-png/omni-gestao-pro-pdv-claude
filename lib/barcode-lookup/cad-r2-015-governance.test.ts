import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  MENSAGEM_OFF_INDISPONIVEL,
  construirProvenienciaBarcode,
  validarProvenienciaSegura,
} from "@/lib/cadastros/provider-governance"
import { MemoLookup } from "./memo"
import { resolverCadeia } from "./orquestrador"
import { fabricaProvedorPadrao, resolverCodigoBarrasCore, type BarcodeEnv } from "./resolver"
import type { FabricaProvedorResult, ProvedorId, ResultadoCadeia } from "./types"

/**
 * CAD-R2-015 — barcode lookup obedece à governança canônica.
 * Sem rede real, sem banco. Segredos aqui são fictícios e só existem no teste.
 */

const GTIN = "7891000053508"
const GTIN_2 = "7890000000017"
const SEGREDO_TESTE = "CHAVE-SEGREDO-TESTE-015-XYZ"

function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...(headers ?? {}) } })
}

function lerArquivo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8")
}

/**
 * Remove comentários (bloco e linha) antes de varreduras estáticas: o guarda
 * é sobre dependência de código (import/chamada), não sobre documentação.
 */
function codigoSemComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
}

describe("fábrica honra a governança", () => {
  it("cosmos sem secret => erro_config honesto, sem fetch", () => {
    const r = fabricaProvedorPadrao("cosmos", { BARCODE_LOOKUP_PROVIDERS: "cosmos" })
    expect(r).toEqual({ erro: expect.stringContaining("COSMOS_API_KEY") })
  })

  it("openfoodfacts => indisponível honesto, sem adapter, sem fetch", () => {
    const r = fabricaProvedorPadrao("openfoodfacts", {
      COSMOS_API_KEY: SEGREDO_TESTE,
      BARCODE_LOOKUP_PROVIDERS: "openfoodfacts",
    })
    expect(r).toEqual({ erro: MENSAGEM_OFF_INDISPONIVEL })
    expect((r as { erro: string }).erro).toContain("não implementado")
  })
})

describe("núcleo governado (resolverCodigoBarrasCore)", () => {
  let memo: MemoLookup
  let fetchSpy: ReturnType<typeof vi.fn>
  let originalFetch: typeof fetch
  let chamadasFabrica: ProvedorId[]

  function fabricaEspia(id: ProvedorId, env: BarcodeEnv): FabricaProvedorResult {
    chamadasFabrica.push(id)
    return fabricaProvedorPadrao(id, env)
  }

  beforeEach(() => {
    memo = new MemoLookup()
    chamadasFabrica = []
    originalFetch = globalThis.fetch
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function hostsChamados(): string[] {
    return fetchSpy.mock.calls.map(([url]) => String(url))
  }

  it("provider ativo/configurado executa (cosmos com chave)", async () => {
    fetchSpy.mockResolvedValue(mockResponse(200, { description: "Produto X", brand: "Marca" }))
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    if (resultado.status === "encontrado") {
      expect(resultado.provedor).toBe("cosmos")
      expect(resultado.dados.nome).toBe("Produto X")
    }
    expect(chamadasFabrica).toEqual(["cosmos"])
    expect(hostsChamados()).toHaveLength(1)
  })

  it("provider sem secret obrigatório executa (upcitemdb FREE, sem chave)", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, { code: "OK", total: 1, items: [{ title: "Produto Free" }] }),
    )
    const env = { BARCODE_LOOKUP_PROVIDERS: "upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    if (resultado.status === "encontrado") expect(resultado.provedor).toBe("upcitemdb")
    expect(chamadasFabrica).toEqual(["upcitemdb"])
  })

  it("sem config => erro_config honesto, fábrica registra tentativa, fetch nunca chamado", async () => {
    const env = { BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("erro_config")
    if (resultado.status === "erro_config") {
      expect(resultado.mensagem).toContain("COSMOS_API_KEY")
      expect(resultado.tentativas).toEqual([
        { provedor: "cosmos", status: "erro", em: expect.any(String), tipo: "config" },
      ])
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("desconhecido => erro_config explícito, nada executa", async () => {
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos,google" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("erro_config")
    if (resultado.status === "erro_config") expect(resultado.mensagem).toContain("google")
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(chamadasFabrica).toEqual([])
  })

  it("conhecido mas não implementado => erro_config honesto, adapter nunca construído, fetch zero", async () => {
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "openfoodfacts" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("erro_config")
    if (resultado.status === "erro_config") {
      expect(resultado.mensagem).toContain("não implementado")
      expect(resultado.tentativas).toEqual([
        { provedor: "openfoodfacts", status: "erro", em: expect.any(String), tipo: "config" },
      ])
    }
    // Gate da governança no orquestrador: a fábrica NEM é chamada para OFF.
    expect(chamadasFabrica).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("OFF listado + upcitemdb funcional => fallback honesto, OFF nunca executado", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, { code: "OK", total: 1, items: [{ title: "Fallback OFF" }] }),
    )
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "openfoodfacts,upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    if (resultado.status === "encontrado") {
      expect(resultado.provedor).toBe("upcitemdb")
      expect(resultado.tentativas[0]).toMatchObject({ provedor: "openfoodfacts", status: "erro" })
      expect(resultado.tentativas[1]).toMatchObject({ provedor: "upcitemdb", status: "encontrado" })
    }
    expect(chamadasFabrica).toEqual(["upcitemdb"])
    expect(hostsChamados()).toHaveLength(1)
    expect(hostsChamados()[0]).toContain("upcitemdb")
  })

  it("provider fora da ordem é desabilitado para a chamada (nunca executado)", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, { code: "OK", total: 1, items: [{ title: "Só UPC" }] }),
    )
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    expect(chamadasFabrica).toEqual(["upcitemdb"])
    expect(hostsChamados().every((u) => !u.includes("cosmos"))).toBe(true)
    if (resultado.status === "encontrado") {
      expect(resultado.tentativas.some((t) => t.provedor === "cosmos")).toBe(false)
    }
  })

  it("fallback preservado: cosmos 404 => upcitemdb encontrado", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(404, { error: "not found" }))
      .mockResolvedValueOnce(mockResponse(200, { code: "OK", total: 1, items: [{ title: "Produto UPC" }] }))
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos,upcitemdb" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    if (resultado.status === "encontrado") {
      expect(resultado.provedor).toBe("upcitemdb")
      expect(resultado.dados).not.toHaveProperty("ncm")
      expect(resultado.dados).not.toHaveProperty("cest")
    }
    expect(hostsChamados()).toHaveLength(2)
  })

  it("rate-limit preservado: cosmos 429 => upcitemdb; cosmos skipado no GTIN seguinte (memo)", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(429, { error: "rate limit" }, { "Retry-After": "60" }))
      .mockResolvedValueOnce(mockResponse(200, { code: "OK", total: 1, items: [{ title: "Fallback" }] }))
      .mockResolvedValue(mockResponse(200, { code: "OK", total: 1, items: [{ title: "Outro" }] }))
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos,upcitemdb" }
    const r1 = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(r1.resultado.status).toBe("encontrado")
    if (r1.resultado.status === "encontrado") {
      expect(r1.resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "limite_excedido" })
    }
    const cosmosCalls = hostsChamados().filter((u) => u.includes("cosmos")).length
    const r2 = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN_2)
    expect(r2.resultado.status).toBe("encontrado")
    // Cosmos esgotado: nenhuma nova chamada ao host do Cosmos no 2º GTIN.
    expect(hostsChamados().filter((u) => u.includes("cosmos")).length).toBe(cosmosCalls)
    if (r2.resultado.status === "encontrado") {
      expect(r2.resultado.tentativas[0]).toMatchObject({ provedor: "cosmos", status: "limite_excedido" })
    }
  })

  it("payload bruto do provider não é persistido no resultado", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, {
        description: "Produto X",
        items: [{ title: "lixo" }],
        results: [1, 2, 3],
        payload_bruto: { segredo: true },
        "JUNK-MARKER-015": "JUNK-015-ABC",
      }),
    )
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    const serializado = JSON.stringify(resultado)
    expect(serializado).not.toContain("JUNK-015-ABC")
    expect(serializado).not.toContain("payload_bruto")
    expect(serializado).not.toContain(SEGREDO_TESTE)
    if (resultado.status === "encontrado") {
      expect(Object.keys(resultado.dados).sort()).toEqual(["nome"])
    }
  })

  it("segredo nunca vaza em nenhum status (response/trace/mensagem)", async () => {
    const cenarios: Array<{ ordem: string; mock: () => void }> = [
      { ordem: "cosmos", mock: () => fetchSpy.mockResolvedValue(mockResponse(404, {})) },
      { ordem: "cosmos", mock: () => fetchSpy.mockResolvedValue(mockResponse(500, {})) },
      { ordem: "cosmos", mock: () => fetchSpy.mockResolvedValue(mockResponse(429, {}, { "Retry-After": "30" })) },
      {
        ordem: "cosmos",
        mock: () => fetchSpy.mockResolvedValue(mockResponse(200, { description: "X", brand: "Y" })),
      },
    ]
    for (const { ordem, mock } of cenarios) {
      memo.limpar()
      fetchSpy.mockReset()
      mock()
      const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: ordem }
      const { resultado } = (await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)) as {
        resultado: ResultadoCadeia
      }
      const serializado = JSON.stringify(resultado)
      expect(serializado).not.toContain(SEGREDO_TESTE)
      expect(serializado).not.toContain("X-Cosmos-Token")
      const tentativas = "tentativas" in resultado ? resultado.tentativas : []
      for (const t of tentativas) {
        expect(Object.keys(t).sort()).toEqual(
          expect.arrayContaining(["em", "provedor", "status"]),
        )
        expect(JSON.stringify(t)).not.toContain(SEGREDO_TESTE)
      }
    }
  })

  it("log de auth do cosmos não carrega segredo", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      fetchSpy.mockResolvedValue(mockResponse(401, { error: "unauthorized" }))
      const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos" }
      await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
      const tudo = JSON.stringify(warnSpy.mock.calls)
      expect(warnSpy).toHaveBeenCalled()
      expect(tudo).not.toContain(SEGREDO_TESTE)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("proveniência do resultado encontrado é válida e sem segredo", async () => {
    fetchSpy.mockResolvedValue(
      mockResponse(200, { description: "Produto X", brand: "Marca", ncm: { code: "12345678" } }),
    )
    const env = { COSMOS_API_KEY: SEGREDO_TESTE, BARCODE_LOOKUP_PROVIDERS: "cosmos" }
    const { resultado } = await resolverCodigoBarrasCore(env, { criarProvedor: fabricaEspia, memo }, GTIN)
    expect(resultado.status).toBe("encontrado")
    if (resultado.status !== "encontrado") return
    const prov = construirProvenienciaBarcode({
      gtin: GTIN,
      formato: "gtin-13",
      consultadoEm: new Date().toISOString(),
      status: "encontrado",
      provedor: resultado.provedor,
      sugestoes: resultado.dados,
      tentativas: resultado.tentativas,
      aplicacao: { aplicadoEm: new Date().toISOString(), camposAplicados: ["nome", "marca", "ncm"] },
      segredosConhecidos: [SEGREDO_TESTE],
    })
    expect(validarProvenienciaSegura(prov, { segredos: [SEGREDO_TESTE] })).toEqual({ ok: true })
    expect(prov.sugestoes?.ncm).toBe("12345678")
  })
})

describe("timeout via gate da governança (orquestrador)", () => {
  it("provider lento é abortado; OFF lento sequer é construído", async () => {
    const memo = new MemoLookup()
    const construidos: ProvedorId[] = []
    const lento = {
      id: "cosmos" as ProvedorId,
      async consultar(_gtin: string, signal: AbortSignal) {
        return new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(Object.assign(new Error("abort"), { name: "AbortError" })), { once: true })
        })
      },
    }
    const res = await resolverCadeia(GTIN, {
      ordem: ["openfoodfacts", "cosmos"],
      criarProvedor: (id) => {
        construidos.push(id)
        if (id === "cosmos") return lento as unknown as import("./types").ProvedorLookup
        return { erro: "não deveria ser chamado" }
      },
      decidirExecucao: (id) =>
        id === "openfoodfacts"
          ? { executable: false as const, id, motivo: "nao-implementado" as const, mensagem: MENSAGEM_OFF_INDISPONIVEL }
          : { executable: true as const, id },
      memo,
      timeoutMs: 50,
    })
    expect(res.status).toBe("erro")
    expect(construidos).toEqual(["cosmos"])
    if (res.status === "erro") {
      expect(res.tentativas[0]).toMatchObject({ provedor: "openfoodfacts", status: "erro" })
      expect(res.tentativas[1]).toMatchObject({ provedor: "cosmos", status: "erro" })
    }
  })
})

describe("revisão humana obrigatória: nenhum write direto de provider", () => {
  const FONTES_RUNTIME = [
    "lib/barcode-lookup/types.ts",
    "lib/barcode-lookup/registry.ts",
    "lib/barcode-lookup/resolver.ts",
    "lib/barcode-lookup/orquestrador.ts",
    "lib/barcode-lookup/memo.ts",
    "lib/barcode-lookup/index.ts",
    "lib/barcode-lookup/provedores/cosmos.ts",
    "lib/barcode-lookup/provedores/upcitemdb.ts",
    "lib/cadastros/provider-governance/types.ts",
    "lib/cadastros/provider-governance/registry.ts",
    "lib/cadastros/provider-governance/provenance.ts",
    "lib/cadastros/provider-governance/sugestao.ts",
    "lib/cadastros/provider-governance/secrets.ts",
    "lib/cadastros/provider-governance/index.ts",
  ]

  it("nenhum módulo de lookup/governança importa escrita (direct write = 0)", () => {
    for (const rel of FONTES_RUNTIME) {
      const src = codigoSemComentarios(lerArquivo(rel))
      expect(src, rel).not.toContain("prisma")
      expect(src, rel).not.toContain("upsertProduto")
      expect(src, rel).not.toContain("produto.create")
      expect(src, rel).not.toContain(".produto.update")
    }
  })

  it("governança não toca rede nem env (sem valores de segredo por construção)", () => {
    for (const rel of FONTES_RUNTIME.filter((f) => f.includes("provider-governance"))) {
      const src = codigoSemComentarios(lerArquivo(rel))
      expect(src, rel).not.toContain("fetch(")
      expect(src, rel).not.toContain("process.env")
    }
  })

  it("orquestrador consome a governança (timeout + gate)", () => {
    const src = lerArquivo("lib/barcode-lookup/orquestrador.ts")
    expect(src).toContain("POLITICA_TIMEOUT_MS")
    expect(src).toContain("decidirExecucao")
  })

  it("resolverCodigoBarras (server action) não salva Produto", () => {
    const src = lerArquivo("app/actions/cadastros.ts")
    const inicio = src.indexOf("export async function resolverCodigoBarras(")
    expect(inicio).toBeGreaterThan(-1)
    const fim = src.indexOf("\nexport ", inicio + 1)
    const corpo = fim === -1 ? src.slice(inicio) : src.slice(inicio, fim)
    expect(corpo).not.toContain("prisma.produto.create")
    expect(corpo).not.toContain("prisma.produto.update")
    expect(corpo).not.toContain("upsertProduto(")
  })

  it("upsertProduto (write path da Server Action) não aceita autoridade externa", () => {
    const src = lerArquivo("app/actions/cadastros.ts")
    const inicio = src.indexOf("export async function upsertProduto(")
    expect(inicio).toBeGreaterThan(-1)
    const fimAssinatura = src.indexOf("): Promise<UpsertProdutoResult>", inicio)
    expect(fimAssinatura).toBeGreaterThan(-1)
    const assinatura = src.slice(inicio, fimAssinatura)
    expect(assinatura).not.toMatch(/provedor/i)
    expect(assinatura).not.toMatch(/provider/i)
    expect(assinatura).not.toMatch(/authority/i)
    expect(assinatura).not.toMatch(/external/i)
  })

  it("ProductWriteService (boundary canônico) não aceita autoridade externa", () => {
    const src = codigoSemComentarios(lerArquivo("lib/cadastros/product-write-service.ts"))
    expect(src).not.toMatch(/provedor/i)
    expect(src).not.toMatch(/provider/i)
    expect(src).not.toMatch(/authority/i)
    expect(src).not.toMatch(/enriquecimento/i)
    expect(src).not.toMatch(/lookup/i)
  })
})

describe("bundle do Client Component: segredo nunca no client", () => {
  it("produto-ia.tsx não referencia secret, token, env ou fábrica server-side", () => {
    const src = lerArquivo("components/cadastros/lovable/components/cadastros/produto-ia.tsx")
    expect(src).not.toContain("COSMOS_API_KEY")
    expect(src).not.toContain("X-Cosmos-Token")
    expect(src).not.toContain("process.env")
    expect(src).not.toContain("lerEnvBarcode")
    expect(src).not.toContain("fabricaProvedorPadrao")
    // Consome a governança (contrato puro, sem segredos) para aplicar sugestões.
    expect(src).toContain("provider-governance")
  })
})
