/**
 * Parser canônico de prefixo multiplicador de bipe do PDV.
 *
 * Suporta formatos tradicionais e modernos de automação comercial:
 * - "3x78912345"
 * - "3*78912345"
 * - "3×78912345" (caractere de multiplicação unicode)
 *
 * Se não houver prefixo, retorna quantidade 1 e a query normalizada (trim).
 */

export type PdvScanPrefixResult = {
  qty: number
  query: string
  hasPrefix: boolean
}

export function parsePdvScanPrefix(raw: string): PdvScanPrefixResult {
  const t = raw.trim()
  if (!t) return { qty: 1, query: "", hasPrefix: false }

  const match = t.match(/^(\d+)\s*[x*×]\s*(.+)/i)
  if (match) {
    const parsedQty = parseInt(match[1], 10)
    const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1
    const query = match[2].trim()
    return { qty, query, hasPrefix: true }
  }

  return { qty: 1, query: t, hasPrefix: false }
}
