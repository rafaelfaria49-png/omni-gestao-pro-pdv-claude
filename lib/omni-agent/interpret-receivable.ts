import type { OmniAgentInterpretacao } from "@/lib/omni-agent/types"

export type ParsedReceivable = {
  valor: number
  descricao: string
  pagador: string
  formaPagamento: string
}

function parseBrlAmount(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

function extractValor(text: string): number | null {
  const t = text.trim()
  if (!t) return null

  const patterns = [
    /r\$\s*([\d.,]+)/i,
    /([\d.,]+)\s*reais?\b/i,
    /\b(?:recebi|recebemos|entrou|pagou|pagamento)\s+(?:de\s+)?(?:[\p{L}\s]{0,40}\s+)?(\d[\d.,]*)/iu,
    /\b(?:recebimento|entrada)\s+(?:avuls[oa]\s+)?(?:de\s+)?[\p{L}\s]*?(\d[\d.,]*)/iu,
    /\b(?:lan[cç]ar|registr(?:ar)?)\s+recebimento\s+(?:de\s+)?[\p{L}\s]*?(\d[\d.,]*)/iu,
    /\b(\d[\d.,]+)\s*(?:reais?|r\$)?/i,
  ]

  for (const re of patterns) {
    const m = t.match(re)
    if (m?.[1]) {
      const v = parseBrlAmount(m[1])
      if (v != null) return v
    }
  }
  return null
}

/** Evita confundir com venda PDV/produto. */
export function looksLikeSaleCommand(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  return (
    /\bvendi\b/.test(t) ||
    /\bregist(rar)?\s+venda\b/.test(t) ||
    /\bvenda\s+(?:de|no|da|do)\b/.test(t) ||
    /\bno\s+pdv\b/.test(t) ||
    /\bcupom\b|\bnota\s+fiscal\b|\bnfe\b|\bcomprovante\s+de\s+venda\b/.test(t) ||
    /\b\d+\s*(?:un|unid|unidades?)\s+(?:de|da|do)\b/.test(t)
  )
}

function looksLikeStockEntry(text: string): boolean {
  const t = text.trim().toLowerCase()
  return (
    /\bentrada\s+de\b/.test(t) &&
    (/\bestoque\b/.test(t) ||
      /\bpel[ií]cul|\bcapa\b|\bpe[çc]as?\b|\bunidades?\b|\bprodutos?\b/i.test(text))
  )
}

export function looksLikeReceivableCommand(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (/(financeiro\s+hoje|resumo\s+financeiro|faturamento)/i.test(t)) return false
  if (looksLikeSaleCommand(text)) return false
  if (looksLikeStockEntry(text)) return false
  if (/\b(gastei|paguei|despesa|gasto)\b/.test(t)) return false

  return (
    /\b(recebi|recebemos|recebimento)\b/.test(t) ||
    /\bentrou\b/.test(t) ||
    /\bcliente\s+pagou\b/.test(t) ||
    /\b(?:lan[cç]ar|registr(?:ar)?)\s+recebimento\b/.test(t) ||
    /\brecebimento\s+avuls[oa]\b/.test(t) ||
    /\bentrada\s+(?:financeira|de\s+dinheiro)\b/.test(t) ||
    (/\bpagou\b/.test(t) && /\b(?:cliente|jo[aã]o|maria|\bde\s+|\bdo\s+)/i.test(text))
  )
}

function inferFormaPagamento(text: string): string {
  const t = text.toLowerCase()
  if (/\bpix\b/.test(t)) return "Pix"
  if (/\bdinheiro\b|\besp[eé]cie\b|\bem\s+dinheiro\b/.test(t)) return "Dinheiro"
  if (/\bcart[aã]o\b|\bcr[eé]dito\b/.test(t)) return "Cartão"
  if (/\bd[eé]bito\b/.test(t)) return "Débito"
  if (/\btransfer[eê]ncia\b|\bted\b|\bdoc\b/.test(t)) return "Transferência"
  if (/\bboleto\b/.test(t)) return "Boleto"
  return ""
}

function extractPagador(text: string): string {
  const patterns = [
    /\brecebi\s+[\d.,\s]+(?:reais?|r\$)?\s+(?:de|do|da)\s+([\p{L}][\p{L}\s.'-]{1,48})/iu,
    /\bcliente\s+([\p{L}][\p{L}\s.'-]{1,48})\s+pagou\b/iu,
    /\bpagamento\s+(?:de|do|da)\s+([\p{L}][\p{L}\s.'-]{1,48})/iu,
    /\b([\p{L}][\p{L}\s.'-]{1,48})\s+pagou\b/iu,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const name = m[1].trim().replace(/\s+(?:no|na|em|via|por)\s+.*$/i, "").trim()
      if (name.length >= 2 && !/^\d+$/.test(name)) return name.length > 48 ? `${name.slice(0, 45)}…` : name
    }
  }
  return ""
}

function extractDescricao(text: string, valor: number, pagador: string): string {
  let d = text.trim()
  d = d.replace(/r\$\s*[\d.,]+/gi, " ")
  d = d.replace(/[\d.,]+\s*reais?\b/gi, " ")
  d = d.replace(
    /^\s*(?:recebi|recebemos|entrou|cliente\s+pagou|lan[cç]ar\s+recebimento|registr(?:ar)?\s+recebimento|recebimento\s+avuls[oa]|recebimento\s+de|entrada\s+financeira)\s+/i,
    "",
  )
  if (pagador) {
    const esc = pagador.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    d = d.replace(new RegExp(`\\b(?:de|do|da)\\s+${esc}`, "i"), " ")
    d = d.replace(new RegExp(`\\b${esc}\\s+pagou`, "i"), " ")
  }
  d = d.replace(/\b(?:no|na|em|via|por)\s+(?:pix|dinheiro|cart[aã]o|d[eé]bito|transfer[eê]ncia)\b/gi, " ")
  d = d.replace(/\b\d[\d.,]*\b/g, " ")
  d = d.replace(/\s+/g, " ").trim()

  if (!d || d.length < 2) {
    const who = pagador ? ` — ${pagador}` : ""
    return `Recebimento avulso${who} — R$ ${valor.toFixed(2)}`
  }
  return d.length > 120 ? `${d.slice(0, 117)}…` : d
}

export function parseReceivableFromCommand(text: string): ParsedReceivable | null {
  if (!looksLikeReceivableCommand(text)) return null
  const valor = extractValor(text)
  if (valor == null) return null
  const pagador = extractPagador(text)
  const formaPagamento = inferFormaPagamento(text)
  const descricao = extractDescricao(text, valor, pagador)
  return { valor, descricao, pagador, formaPagamento }
}

export function buildReceivableInterpretation(
  text: string,
  parsed: ParsedReceivable,
): OmniAgentInterpretacao {
  const valorFmt = parsed.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  return {
    intent: "RECEIVABLE_CREATE",
    action: `Registrar recebimento ${valorFmt}`,
    confidence: 0.9,
    fields: {
      valor: String(parsed.valor),
      descricao: parsed.descricao,
      ...(parsed.pagador ? { pagador: parsed.pagador } : {}),
      ...(parsed.formaPagamento ? { formaPagamento: parsed.formaPagamento } : {}),
    },
    requiresConfirmation: true,
  }
}
