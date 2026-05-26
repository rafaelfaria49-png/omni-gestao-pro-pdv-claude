import type { OmniAgentInterpretacao } from "@/lib/omni-agent/types"

export type ParsedExpense = {
  valor: number
  descricao: string
  categoria: string
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
    /\b(?:gastei|paguei|despesa|gasto)\s+(?:de\s+)?(?:[\p{L}\s]{0,40}\s+)?(\d[\d.,]*)/iu,
    /\b(?:despesa|gasto)\s+(?:de\s+)?[\p{L}\s]*?(\d[\d.,]*)/iu,
    /\b(?:lan[cç]ar|registr(?:ar)?)\s+(?:gasto|despesa)\s+(?:de\s+)?[\p{L}\s]*?(\d[\d.,]*)/iu,
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

const CATEGORY_HINTS: { re: RegExp; label: string }[] = [
  { re: /\baluguel\b/i, label: "Aluguel" },
  { re: /\benergia\b|\bluz\b|\bconta\s+de\s+luz\b/i, label: "Energia" },
  { re: /\bcombust[ií]vel\b|\bgasolina\b|\b[dé]iesel\b/i, label: "Combustível" },
  { re: /\buber\b/i, label: "Transporte" },
  { re: /\bmotoboy\b|\bentrega\b/i, label: "Entrega" },
  { re: /\bpel[ií]cula\b|\bcapa\b/i, label: "Insumos" },
  { re: /\balmo[cç]o\b|\blanche\b|\brefei[cç][aã]o\b/i, label: "Alimentação" },
]

function inferCategoria(text: string): string {
  for (const { re, label } of CATEGORY_HINTS) {
    if (re.test(text)) return label
  }
  return ""
}

function extractDescricao(text: string, valor: number): string {
  let d = text.trim()
  d = d.replace(/r\$\s*[\d.,]+/gi, " ")
  d = d.replace(/[\d.,]+\s*reais?\b/gi, " ")
  d = d.replace(
    /^\s*(?:gastei|paguei|despesa\s+de|gasto\s+de|lan[cç]ar\s+(?:gasto|despesa)|registr(?:ar)?\s+despesa)\s+/i,
    "",
  )
  d = d.replace(/\b(?:com|no|na|em|de|por)\s+/gi, " ")
  d = d.replace(/\b\d[\d.,]*\b/g, " ")
  d = d.replace(/\s+/g, " ").trim()

  if (!d || d.length < 2) {
    return `Despesa Omni Agent — R$ ${valor.toFixed(2)}`
  }
  return d.length > 120 ? `${d.slice(0, 117)}…` : d
}

export function looksLikeExpenseCommand(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (/(financeiro\s+hoje|resumo\s+financeiro|faturamento)/i.test(t)) return false
  return (
    /\b(gastei|paguei)\b/.test(t) ||
    /\b(despesa\s+de|gasto\s+de)\b/.test(t) ||
    /\b(lan[cç]ar|registr(?:ar)?)\s+(gasto|despesa)\b/.test(t) ||
    /\bregistrar\s+despesa\b/.test(t)
  )
}

export function parseExpenseFromCommand(text: string): ParsedExpense | null {
  if (!looksLikeExpenseCommand(text)) return null
  const valor = extractValor(text)
  if (valor == null) return null
  const descricao = extractDescricao(text, valor)
  const categoria = inferCategoria(text)
  return { valor, descricao, categoria }
}

export function buildExpenseInterpretation(text: string, parsed: ParsedExpense): OmniAgentInterpretacao {
  const valorFmt = parsed.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  return {
    intent: "EXPENSE_CREATE",
    action: `Registrar despesa ${valorFmt}`,
    confidence: 0.9,
    fields: {
      valor: String(parsed.valor),
      descricao: parsed.descricao,
      ...(parsed.categoria ? { categoria: parsed.categoria } : {}),
    },
    requiresConfirmation: true,
  }
}
