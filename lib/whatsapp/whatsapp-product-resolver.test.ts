/**
 * WhatsApp IA — F3 · testes do resolver de catálogo/estoque/imagem.
 * Usa loaders injetados (DI) — prova multi-loja, status de estoque, imagens, limite e
 * os invariantes de segurança SEM tocar o banco.
 */
import { describe, expect, it } from "vitest"
import {
  buildSearchTokens,
  rankProducts,
  resolveWhatsAppProducts,
  stockStatus,
  type ResolverInputProduct,
  type WhatsAppMediaLoader,
  type WhatsAppProductLoader,
} from "./whatsapp-product-resolver"

// ─── Fixtures ────────────────────────────────────────────────────────────────────

const LOJA1: ResolverInputProduct[] = [
  { id: "p1", name: "Carregador iPhone Lightning", sku: "CAR-IPH-01", barcode: "789100001", category: "Carregadores", price: 49.9, stock: 10 },
  { id: "p2", name: "Carregador Turbo iPhone 20W", sku: "CAR-IPH-20", barcode: "789100002", category: "Carregadores", price: 79.9, stock: 3 },
  { id: "p3", name: "Kit Carregador iPhone", sku: "CAR-IPH-KIT", barcode: "789100003", category: "Carregadores", price: 99.9, stock: 0 },
  { id: "p4", name: "Capinha Samsung A06 Transparente", sku: "CAP-A06-T", barcode: "789100004", category: "Capas", price: 19.9, stock: 12 },
  { id: "p5", name: "Capa Anti-impacto A06", sku: "CAP-A06-AI", barcode: "789100005", category: "Capas", price: 29.9, stock: 2 },
  { id: "p6", name: "Película 3D Galaxy A15", sku: "PEL-A15", barcode: "789100006", category: "Películas", price: 15.0, stock: 7 },
  { id: "p7", name: "Copo Infantil Térmico 300ml", sku: "COPO-INF", barcode: "789100007", category: "Infantil", price: 24.9, stock: 4 },
  { id: "p8", name: "Cabo USB-C 1m", sku: "CABO-USBC", barcode: "789100008", category: "Cabos", price: 12.5, stock: 50 },
]

function loaders(
  db: Record<string, ResolverInputProduct[]>,
  media: Record<string, { url: string; isPrimary: boolean }[]> = {}
): { loadProducts: WhatsAppProductLoader; loadMedia: WhatsAppMediaLoader } {
  return {
    loadProducts: async (storeId) => db[storeId] ?? [],
    loadMedia: async (_storeId, ids) => {
      const map = new Map<string, { url: string; isPrimary: boolean }[]>()
      for (const id of ids) if (media[id]) map.set(id, media[id]!)
      return map
    },
  }
}

const DB1 = { "loja-1": LOJA1 }

// ─── Helpers puros ────────────────────────────────────────────────────────────────

describe("stockStatus — faixas de disponibilidade", () => {
  it("0 → SEM_ESTOQUE; 1 e 5 → BAIXO_ESTOQUE; 6+ → EM_ESTOQUE", () => {
    expect(stockStatus(0)).toBe("SEM_ESTOQUE")
    expect(stockStatus(-3)).toBe("SEM_ESTOQUE")
    expect(stockStatus(1)).toBe("BAIXO_ESTOQUE")
    expect(stockStatus(5)).toBe("BAIXO_ESTOQUE")
    expect(stockStatus(6)).toBe("EM_ESTOQUE")
    expect(stockStatus(100)).toBe("EM_ESTOQUE")
  })
})

describe("buildSearchTokens — remove stopwords e funde marca/modelo", () => {
  it("'capinha do a06' → ['capinha','a06']", () => {
    expect(buildSearchTokens({ termoProduto: "capinha do a06" })).toEqual(["capinha", "a06"])
  })
  it("funde marca/modelo e deduplica", () => {
    expect(buildSearchTokens({ termoProduto: "capinha", marca: "Samsung", modeloAparelho: "A06" })).toEqual([
      "capinha",
      "samsung",
      "a06",
    ])
  })
  it("termo vazio → sem tokens", () => {
    expect(buildSearchTokens({ termoProduto: "   " })).toEqual([])
  })
})

describe("rankProducts — tolerante a linguagem natural", () => {
  it("ordena por nº de tokens casados e mantém parciais", () => {
    const { ranked, total } = rankProducts(LOJA1, ["capinha", "a06"])
    expect(total).toBe(2)
    // p4 casa 2 tokens (capinha + a06); p5 casa só a06 → vem depois
    expect(ranked[0]!.product.id).toBe("p4")
    expect(ranked[0]!.matchedTokens).toBe(2)
    expect(ranked[1]!.product.id).toBe("p5")
    expect(ranked[1]!.matchedTokens).toBe(1)
  })
  it("sem tokens → vazio", () => {
    expect(rankProducts(LOJA1, []).total).toBe(0)
  })
})

// ─── Resolver (DI) ────────────────────────────────────────────────────────────────

describe("resolveWhatsAppProducts — consulta de catálogo", () => {
  it("'tem carregador de iphone' → encontra os 3 carregadores, ordenados por estoque", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem carregador de iphone", entities: { termoProduto: "carregador de iphone" } },
      loaders(DB1)
    )
    expect(r.total).toBe(3)
    expect(r.produtos.map((p) => p.id)).toEqual(["p1", "p2", "p3"])
    expect(r.produtos[0]!.estoqueStatus).toBe("EM_ESTOQUE")
    expect(r.produtos[1]!.estoqueStatus).toBe("BAIXO_ESTOQUE")
    expect(r.produtos[2]!.estoqueStatus).toBe("SEM_ESTOQUE")
    expect(r.confidence).toBeGreaterThan(0)
  })

  it("'tem capinha do a06' → encontra capas do A06", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem capinha do a06", entities: { termoProduto: "capinha do a06" } },
      loaders(DB1)
    )
    expect(r.total).toBe(2)
    expect(r.produtos[0]!.id).toBe("p4")
  })

  it("'tem película do a15' → encontra a película", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem pelicula do a15", entities: { termoProduto: "pelicula do a15" } },
      loaders(DB1)
    )
    expect(r.total).toBe(1)
    expect(r.produtos[0]!.id).toBe("p6")
  })

  it("'tem copo infantil' → encontra o copo", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem copo infantil", entities: { termoProduto: "copo infantil" } },
      loaders(DB1)
    )
    expect(r.total).toBe(1)
    expect(r.produtos[0]!.id).toBe("p7")
  })

  it("sem resultado → total 0 e resposta sugerida de fallback (sem prometer nada)", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem guarda-chuva amarelo", entities: { termoProduto: "guarda-chuva amarelo" } },
      loaders(DB1)
    )
    expect(r.total).toBe(0)
    expect(r.produtos).toHaveLength(0)
    expect(r.confidence).toBe(0)
    expect(r.suggestedReply.toLowerCase()).toContain("verificar")
    expect(r.suggestedReply).not.toMatch(/r\$\s*\d/)
  })

  it("produto SEM imagem → imagemPrincipalUrl null e imagens vazias", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem copo infantil", entities: { termoProduto: "copo infantil" } },
      loaders(DB1) // sem media
    )
    expect(r.produtos[0]!.imagemPrincipalUrl).toBeNull()
    expect(r.produtos[0]!.imagens).toEqual([])
  })

  it("produto COM imagem → usa a principal (isPrimary)", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem copo infantil", entities: { termoProduto: "copo infantil" } },
      loaders(DB1, {
        p7: [
          { url: "https://cdn/x/sec.jpg", isPrimary: false },
          { url: "https://cdn/x/principal.jpg", isPrimary: true },
        ],
      })
    )
    expect(r.produtos[0]!.imagemPrincipalUrl).toBe("https://cdn/x/principal.jpg")
    expect(r.produtos[0]!.imagens).toHaveLength(2)
  })

  it("produto SEM estoque continua aparecendo, mas marcado SEM_ESTOQUE", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem kit carregador iphone", entities: { termoProduto: "kit carregador iphone" } },
      loaders(DB1)
    )
    const p3 = r.produtos.find((p) => p.id === "p3")
    expect(p3).toBeDefined()
    expect(p3!.estoqueStatus).toBe("SEM_ESTOQUE")
  })

  it("limite de 5 itens → mostra 5 e calcula overflow", async () => {
    const many: ResolverInputProduct[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      name: `Carregador modelo ${i}`,
      sku: `CAR-${i}`,
      barcode: `999${i}`,
      category: "Carregadores",
      price: 10 + i,
      stock: 10,
    }))
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-x", text: "tem carregador", entities: { termoProduto: "carregador" } },
      loaders({ "loja-x": many })
    )
    expect(r.total).toBe(8)
    expect(r.produtos).toHaveLength(5)
    expect(r.overflow).toBe(3)
  })

  it("não expõe custo/margem/fornecedor — só campos públicos", async () => {
    const r = await resolveWhatsAppProducts(
      { storeId: "loja-1", text: "tem carregador de iphone", entities: { termoProduto: "carregador de iphone" } },
      loaders(DB1)
    )
    const keys = Object.keys(r.produtos[0]!)
    expect(keys).not.toContain("custo")
    expect(keys).not.toContain("margem")
    expect(keys).not.toContain("fornecedor")
  })
})

describe("resolveWhatsAppProducts — multi-loja estrito (sem fallback loja-1)", () => {
  const DB = {
    "loja-1": [{ id: "l1a", name: "Carregador iPhone Loja 1", sku: "L1-CAR", barcode: "111", category: "Carregadores", price: 50, stock: 5 }],
    "loja-2": [{ id: "l2a", name: "Carregador iPhone Loja 2", sku: "L2-CAR", barcode: "222", category: "Carregadores", price: 60, stock: 5 }],
  }

  it("Loja 1 só enxerga produtos da Loja 1", async () => {
    const r = await resolveWhatsAppProducts({ storeId: "loja-1", text: "tem carregador iphone", entities: { termoProduto: "carregador iphone" } }, loaders(DB))
    expect(r.produtos.map((p) => p.id)).toEqual(["l1a"])
    expect(r.produtos.some((p) => p.id === "l2a")).toBe(false)
  })

  it("Loja 2 só enxerga produtos da Loja 2", async () => {
    const r = await resolveWhatsAppProducts({ storeId: "loja-2", text: "tem carregador iphone", entities: { termoProduto: "carregador iphone" } }, loaders(DB))
    expect(r.produtos.map((p) => p.id)).toEqual(["l2a"])
    expect(r.produtos.some((p) => p.id === "l1a")).toBe(false)
  })

  it("Loja sem catálogo → total 0 (nunca cai em outra loja)", async () => {
    const r = await resolveWhatsAppProducts({ storeId: "loja-vazia", text: "tem carregador iphone", entities: { termoProduto: "carregador iphone" } }, loaders(DB))
    expect(r.total).toBe(0)
  })
})

describe("resolveWhatsAppProducts — invariantes de segurança (F3)", () => {
  it("requiresHumanApproval sempre true e safeToAutoSend sempre false", async () => {
    const com = await resolveWhatsAppProducts({ storeId: "loja-1", text: "tem carregador iphone", entities: { termoProduto: "carregador iphone" } }, loaders(DB1))
    const sem = await resolveWhatsAppProducts({ storeId: "loja-1", text: "tem foguete espacial", entities: { termoProduto: "foguete espacial" } }, loaders(DB1))
    for (const r of [com, sem]) {
      expect(r.requiresHumanApproval).toBe(true)
      expect(r.safeToAutoSend).toBe(false)
    }
  })

  it("resposta sugerida nunca cita preço em R$", async () => {
    const r = await resolveWhatsAppProducts({ storeId: "loja-1", text: "tem carregador de iphone", entities: { termoProduto: "carregador de iphone" } }, loaders(DB1))
    expect(r.suggestedReply).not.toMatch(/r\$\s*\d/i)
  })
})
