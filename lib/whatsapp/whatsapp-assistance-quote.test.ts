/**
 * WhatsApp IA — F4 · testes do motor de orçamento de assistência (DI, sem banco).
 * Cobre origens, multi-loja, confiança e os invariantes de segurança.
 */
import { describe, expect, it } from "vitest"
import {
  resolveAssistanceQuote,
  type ServiceCatalogItem,
  type WhatsAppPartLoader,
  type WhatsAppServiceLoader,
} from "./whatsapp-assistance-quote"
import type { ResolverInputProduct } from "./whatsapp-product-resolver"

// ─── Fixtures ────────────────────────────────────────────────────────────────────

const SERVICOS_L1: ServiceCatalogItem[] = [
  { id: "s1", nome: "Troca de tela Moto G22", preco: 220 },
  { id: "s2", nome: "Troca de tela iPhone 11", preco: 380 },
  { id: "s3", nome: "Troca de bateria iPhone 11", preco: 190 },
  { id: "s4", nome: "Troca de tela Samsung A15", preco: 260 },
]

const PARTS_L1: ResolverInputProduct[] = [
  { id: "p1", name: "Conector de carga Samsung A12", sku: "CON-A12", barcode: "111", category: "Peças", price: 45, stock: 4 },
  { id: "p2", name: "Tela Redmi Note 13", sku: "TELA-RN13", barcode: "222", category: "Peças", price: 150, stock: 2 },
]

function loaders(
  servicos: Record<string, ServiceCatalogItem[]>,
  parts: Record<string, ResolverInputProduct[]>
): { loadServicos: WhatsAppServiceLoader; loadParts: WhatsAppPartLoader } {
  return {
    loadServicos: async (storeId) => servicos[storeId] ?? [],
    loadParts: async (storeId) => parts[storeId] ?? [],
  }
}

const DEPS = loaders({ "loja-1": SERVICOS_L1 }, { "loja-1": PARTS_L1 })

// ─── Origens ─────────────────────────────────────────────────────────────────────

describe("resolveAssistanceQuote — origens e valores", () => {
  it("'trocar a tela do Moto G22' → SERVICO_CADASTRADO (valor exato, badge Real)", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "quanto fica trocar a tela do Moto G22?" },
      DEPS
    )
    expect(q.origem).toBe("SERVICO_CADASTRADO")
    expect(q.valorSugerido).toBe(220)
    expect(q.badge).toBe("Real")
    expect(q.matchedServicoNome).toBe("Troca de tela Moto G22")
    expect(q.confidence).toBeGreaterThan(0.8)
  })

  it("'bateria do iPhone 11' → SERVICO_CADASTRADO (valor exato)", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "quanto custa a bateria do iPhone 11?" },
      DEPS
    )
    expect(q.origem).toBe("SERVICO_CADASTRADO")
    expect(q.valorSugerido).toBe(190)
  })

  it("'conector Samsung A12' (sem serviço cadastrado) → PRODUTO_COMPATIVEL (a partir de)", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "troca de conector Samsung A12" },
      DEPS
    )
    expect(q.origem).toBe("PRODUTO_COMPATIVEL")
    expect(q.valorSugerido).toBeNull()
    expect(q.faixaPreco.min).toBe(45)
    expect(q.matchedProdutoNome).toBe("Conector de carga Samsung A12")
    expect(q.badge).toBe("Estimado")
  })

  it("serviço cadastrado de outro modelo → SERVICO_CADASTRADO faixa, sem valor exato (badge Estimado)", async () => {
    // troca de tela existe (Moto/iPhone/Samsung) mas não para 'Galaxy A99'
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "troca de tela Samsung A99" },
      DEPS
    )
    expect(q.origem).toBe("SERVICO_CADASTRADO")
    expect(q.valorSugerido).toBeNull()
    expect(q.faixaPreco.min).toBe(220)
    expect(q.faixaPreco.max).toBe(380)
    expect(q.badge).toBe("Estimado")
  })

  it("serviço reconhecido sem catálogo → ESTIMATIVA (badge Revisar)", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "preciso de desbloqueio de conta google" },
      DEPS
    )
    expect(q.origem).toBe("ESTIMATIVA")
    expect(q.valorSugerido).toBeNull()
    expect(q.faixaPreco).toEqual({ min: null, max: null })
    expect(q.badge).toBe("Revisar")
  })

  it("serviço inexistente → SEM_DADOS", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "bom dia, tudo bem?" },
      DEPS
    )
    expect(q.origem).toBe("SEM_DADOS")
    expect(q.service.servico).toBeNull()
    expect(q.badge).toBe("Revisar")
  })

  it("'caiu na água' → serviço LIMPEZA reconhecido (ESTIMATIVA sem catálogo)", async () => {
    const q = await resolveAssistanceQuote(
      { storeId: "loja-1", text: "meu celular caiu na água" },
      DEPS
    )
    expect(q.service.servico).toBe("LIMPEZA")
    expect(q.origem).toBe("ESTIMATIVA")
  })
})

// ─── Multi-loja ────────────────────────────────────────────────────────────────────

describe("resolveAssistanceQuote — multi-loja estrito (sem fallback loja-1)", () => {
  const DB = loaders(
    {
      "loja-1": [{ id: "a", nome: "Troca de tela Moto G22", preco: 220 }],
      "loja-2": [{ id: "b", nome: "Troca de tela Moto G22", preco: 300 }],
    },
    { "loja-1": [], "loja-2": [] }
  )

  it("Loja 1 usa o preço da Loja 1", async () => {
    const q = await resolveAssistanceQuote({ storeId: "loja-1", text: "troca de tela moto g22" }, DB)
    expect(q.valorSugerido).toBe(220)
  })

  it("Loja 2 usa o preço da Loja 2", async () => {
    const q = await resolveAssistanceQuote({ storeId: "loja-2", text: "troca de tela moto g22" }, DB)
    expect(q.valorSugerido).toBe(300)
  })

  it("Loja sem catálogo → não cai em outra loja (ESTIMATIVA)", async () => {
    const q = await resolveAssistanceQuote({ storeId: "loja-vazia", text: "troca de tela moto g22" }, DB)
    expect(q.origem).toBe("ESTIMATIVA")
    expect(q.valorSugerido).toBeNull()
  })
})

// ─── Segurança ─────────────────────────────────────────────────────────────────────

describe("resolveAssistanceQuote — segurança (F4)", () => {
  it("requiresHumanApproval sempre true e safeToAutoSend sempre false", async () => {
    const cases = ["trocar a tela do moto g22", "desbloqueio conta google", "bom dia"]
    for (const text of cases) {
      const q = await resolveAssistanceQuote({ storeId: "loja-1", text }, DEPS)
      expect(q.requiresHumanApproval).toBe(true)
      expect(q.safeToAutoSend).toBe(false)
    }
  })

  it("não expõe custo/margem/fornecedor no resultado", async () => {
    const q = await resolveAssistanceQuote({ storeId: "loja-1", text: "trocar a tela do moto g22" }, DEPS)
    const keys = Object.keys(q)
    expect(keys).not.toContain("custo")
    expect(keys).not.toContain("margem")
    expect(keys).not.toContain("fornecedor")
  })

  it("resposta sugerida não promete preço/estoque/prazo", async () => {
    const q = await resolveAssistanceQuote({ storeId: "loja-1", text: "trocar a tela do moto g22" }, DEPS)
    expect(q.suggestedReply).not.toMatch(/r\$\s*\d/i)
    expect(q.suggestedReply.toLowerCase()).not.toMatch(/\b\d+\s*(dias|horas)\b/)
  })

  it("confidence sempre em [0,1]", async () => {
    const cases = ["trocar a tela do moto g22", "desbloqueio", "bom dia"]
    for (const text of cases) {
      const q = await resolveAssistanceQuote({ storeId: "loja-1", text }, DEPS)
      expect(q.confidence).toBeGreaterThanOrEqual(0)
      expect(q.confidence).toBeLessThanOrEqual(1)
    }
  })
})
