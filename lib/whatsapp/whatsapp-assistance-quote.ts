/**
 * WhatsApp IA — F4 · Motor ASSISTIDO de orçamento de assistência técnica (somente leitura).
 *
 * Combina o resolver de aparelho (F4), o resolver de serviço (F4) e o catálogo REAL da loja
 * (Serviços + Produtos/peças) para SUGERIR um valor ao operador. Nunca envia, nunca cria OS,
 * nunca consulta fornecedor, nunca toca estoque/financeiro.
 *
 * Segurança (PARTE 5): expõe SOMENTE preço final sugerido / faixa de venda — nunca custo,
 * margem ou fornecedor. Lê apenas `Servico.preco` e `Produto.preco` (preços de venda).
 *
 * Origens (PARTE 4):
 *  - SERVICO_CADASTRADO  → há serviço cadastrado do tipo (valor exato quando casa o modelo).
 *  - PRODUTO_COMPATIVEL  → há peça compatível no catálogo (referência "a partir de").
 *  - ESTIMATIVA          → serviço reconhecido, sem preço no catálogo (revisar manual).
 *  - SEM_DADOS           → não foi possível identificar serviço.
 *
 * Loaders de banco são injetáveis (DI) para teste puro; produção usa import dinâmico.
 *
 * Referência: docs/whatsapp/WHATSAPP_IA_ORCAMENTOS_E_CATALOGO_BLUEPRINT.md (§4).
 */

import { normalizePdvSearchText } from "@/lib/pdv-product-search"
import {
  rankProducts,
  type ResolverInputProduct,
} from "@/lib/whatsapp/whatsapp-product-resolver"
import {
  resolveWhatsAppDevice,
  type WhatsAppDeviceResolution,
} from "@/lib/whatsapp/whatsapp-device-resolver"
import {
  resolveWhatsAppService,
  type WhatsAppServiceResolution,
} from "@/lib/whatsapp/whatsapp-service-resolver"

export type WhatsAppQuoteOrigin =
  | "SERVICO_CADASTRADO"
  | "PRODUTO_COMPATIVEL"
  | "ESTIMATIVA"
  | "SEM_DADOS"

export type WhatsAppQuoteBadge = "Real" | "Estimado" | "Revisar"

export type WhatsAppPriceRange = { min: number | null; max: number | null }

export type WhatsAppAssistanceQuote = {
  device: WhatsAppDeviceResolution
  service: WhatsAppServiceResolution
  /** Preço final SUGERIDO de venda (null quando não há valor exato confiável). */
  valorSugerido: number | null
  faixaPreco: WhatsAppPriceRange
  origem: WhatsAppQuoteOrigin
  badge: WhatsAppQuoteBadge
  confidence: number
  matchedServicoNome: string | null
  matchedProdutoNome: string | null
  resumo: string
  suggestedReply: string
  requiresHumanApproval: true
  safeToAutoSend: false
}

/** Item de serviço PÚBLICO — sem custo/margem. */
export type ServiceCatalogItem = { id: string; nome: string; preco: number }
export type WhatsAppServiceLoader = (storeId: string) => Promise<ServiceCatalogItem[]>
export type WhatsAppPartLoader = (storeId: string) => Promise<ResolverInputProduct[]>

const norm = (s: string) => normalizePdvSearchText(s)

function money(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

/** Token "chave" do modelo (o que tem dígito): g22, 11, a06, 13… */
function deviceKeyToken(device: WhatsAppDeviceResolution): string {
  const tokens = norm(device.modelo).split(/[^a-z0-9]+/).filter(Boolean)
  return tokens.find((t) => /\d/.test(t)) ?? ""
}

function rangeOf(prices: number[]): WhatsAppPriceRange {
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0)
  if (valid.length === 0) return { min: null, max: null }
  return { min: Math.min(...valid), max: Math.max(...valid) }
}

// ─── Resposta sugerida (PARTE 7) — soft, sem preço/estoque/prazo ──────────────────

function buildReply(
  origem: WhatsAppQuoteOrigin,
  device: WhatsAppDeviceResolution,
  service: WhatsAppServiceResolution
): string {
  if (origem === "SEM_DADOS") {
    return "Pode me contar qual é o aparelho e o que está acontecendo com ele? Assim consigo te ajudar com o orçamento."
  }
  const servicoTxt = service.label ? service.label.toLowerCase() : "esse serviço"
  if (device.modelo) {
    return `Para ${servicoTxt} do ${device.aparelhoTexto} temos atendimento disponível. Posso confirmar o modelo e verificar o valor atualizado para você?`
  }
  return `Para ${servicoTxt} temos atendimento disponível. Pode me confirmar o modelo do aparelho para eu verificar o valor certinho?`
}

// ─── Loaders de produção (import dinâmico) ───────────────────────────────────────

async function defaultLoadServicos(storeId: string): Promise<ServiceCatalogItem[]> {
  const { listServicos } = await import("@/app/actions/cadastros")
  const rows = await listServicos(storeId)
  return rows
    .filter((s) => s.status !== "Inativo")
    .map((s) => ({ id: s.id, nome: s.nome, preco: Number(s.preco ?? 0) }))
}

async function defaultLoadParts(storeId: string): Promise<ResolverInputProduct[]> {
  const { listProdutos } = await import("@/app/actions/cadastros")
  const rows = await listProdutos(storeId)
  return rows
    .filter((p) => p.status !== "Inativo")
    .map((p) => ({
      id: p.id,
      name: p.nome,
      sku: p.sku === "—" ? "" : p.sku,
      barcode: p.barras,
      category: p.categoria === "—" ? "" : p.categoria,
      price: p.preco,
      stock: p.estoque,
    }))
}

// ─── Motor ───────────────────────────────────────────────────────────────────────

export async function resolveAssistanceQuote(
  params: {
    storeId: string
    text: string
    /** Pré-resolvidos (ex.: pela F2). Quando ausentes, resolve do texto. */
    device?: WhatsAppDeviceResolution
    service?: WhatsAppServiceResolution
  },
  deps?: { loadServicos?: WhatsAppServiceLoader; loadParts?: WhatsAppPartLoader }
): Promise<WhatsAppAssistanceQuote> {
  const device = params.device ?? resolveWhatsAppDevice(params.text)
  const service = params.service ?? resolveWhatsAppService(params.text)

  const base = {
    device,
    service,
    requiresHumanApproval: true as const,
    safeToAutoSend: false as const,
  }

  // Sem serviço reconhecido → SEM_DADOS.
  if (!service.servico) {
    return {
      ...base,
      valorSugerido: null,
      faixaPreco: { min: null, max: null },
      origem: "SEM_DADOS",
      badge: "Revisar",
      confidence: 0.1,
      matchedServicoNome: null,
      matchedProdutoNome: null,
      resumo: "Não foi possível identificar o serviço solicitado — revisar manualmente.",
      suggestedReply: buildReply("SEM_DADOS", device, service),
    }
  }

  const loadServicos = deps?.loadServicos ?? defaultLoadServicos
  const loadParts = deps?.loadParts ?? defaultLoadParts

  // 1) SERVICO_CADASTRADO — serviços do tipo, com preço de venda > 0.
  const servicos = await loadServicos(params.storeId)
  const tokenSet = service.catalogTokens.map(norm)
  const matching = servicos.filter((s) => {
    if (!(s.preco > 0)) return false
    const n = norm(s.nome)
    return tokenSet.some((t) => t && n.includes(t))
  })

  if (matching.length > 0) {
    const keyTok = deviceKeyToken(device)
    const deviceSpecific = keyTok
      ? matching.filter((s) => norm(s.nome).includes(keyTok))
      : []

    if (deviceSpecific.length > 0) {
      const prices = deviceSpecific.map((s) => s.preco)
      const best = deviceSpecific.reduce((a, b) => (a.preco <= b.preco ? a : b))
      const faixa = rangeOf(prices)
      return {
        ...base,
        valorSugerido: best.preco,
        faixaPreco: faixa,
        origem: "SERVICO_CADASTRADO",
        badge: "Real",
        confidence: 0.88,
        matchedServicoNome: best.nome,
        matchedProdutoNome: null,
        resumo: `Serviço cadastrado: ${best.nome} — ${money(best.preco)}${
          faixa.min !== faixa.max && faixa.min != null && faixa.max != null
            ? ` (faixa ${money(faixa.min)}–${money(faixa.max)})`
            : ""
        }.`,
        suggestedReply: buildReply("SERVICO_CADASTRADO", device, service),
      }
    }

    // Sem casar o modelo: faixa do tipo de serviço na loja (sem valor exato).
    const faixa = rangeOf(matching.map((s) => s.preco))
    return {
      ...base,
      valorSugerido: null,
      faixaPreco: faixa,
      origem: "SERVICO_CADASTRADO",
      badge: "Estimado",
      confidence: 0.7,
      matchedServicoNome: matching.length === 1 ? matching[0]!.nome : null,
      matchedProdutoNome: null,
      resumo:
        faixa.min != null && faixa.max != null
          ? `Serviço de ${service.label.toLowerCase()} cadastrado na loja — faixa ${money(faixa.min)}–${money(faixa.max)} (confirmar o modelo).`
          : `Serviço de ${service.label.toLowerCase()} cadastrado na loja — confirmar o modelo.`,
      suggestedReply: buildReply("SERVICO_CADASTRADO", device, service),
    }
  }

  // 2) PRODUTO_COMPATIVEL — peça compatível no catálogo (referência "a partir de").
  if (service.partTokens.length > 0) {
    const produtos = await loadParts(params.storeId)
    const deviceTokens = norm(device.modelo)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2)
    const tokens = [...service.partTokens.map(norm), ...deviceTokens]
    const { ranked } = rankProducts(produtos, tokens)
    // Exige que a PEÇA case (algum partToken), não só o modelo.
    const partHit = ranked.find((r) => {
      const n = norm(r.product.name)
      return service.partTokens.some((pt) => n.includes(norm(pt))) && r.product.price > 0
    })
    if (partHit) {
      const preco = partHit.product.price
      return {
        ...base,
        valorSugerido: null,
        faixaPreco: { min: preco, max: null },
        origem: "PRODUTO_COMPATIVEL",
        badge: "Estimado",
        confidence: 0.6,
        matchedServicoNome: null,
        matchedProdutoNome: partHit.product.name,
        resumo: `Peça compatível no catálogo: ${partHit.product.name} — a partir de ${money(preco)} (valor do serviço a confirmar com o técnico).`,
        suggestedReply: buildReply("PRODUTO_COMPATIVEL", device, service),
      }
    }
  }

  // 3) ESTIMATIVA — serviço reconhecido, sem preço no catálogo.
  return {
    ...base,
    valorSugerido: null,
    faixaPreco: { min: null, max: null },
    origem: "ESTIMATIVA",
    badge: "Revisar",
    confidence: 0.4,
    matchedServicoNome: null,
    matchedProdutoNome: null,
    resumo: `Serviço reconhecido (${service.label}), sem preço cadastrado para este caso — montar orçamento manualmente.`,
    suggestedReply: buildReply("ESTIMATIVA", device, service),
  }
}
