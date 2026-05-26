import {
  buildClientePhoneSearchTokens,
  formatPhoneBrDisplay,
  phoneDigitsAll,
} from "@/lib/phone-br"

/** Texto de busca para `?q=` no cadastro de clientes (prioriza sufixo 11 dígitos). */
export function buildClientesDashboardSearchQuery(phoneDigits: string): string {
  const tokens = buildClientePhoneSearchTokens(phoneDigits)
  if (tokens[0]) return tokens[0]
  const display = formatPhoneBrDisplay(phoneDigits)
  if (display) return display
  const d = phoneDigitsAll(phoneDigits)
  return d.length >= 8 ? d : ""
}

export function clientesDashboardHref(phoneDigits: string): string {
  const q = buildClientesDashboardSearchQuery(phoneDigits)
  if (!q) return "/dashboard/clientes"
  return `/dashboard/clientes?q=${encodeURIComponent(q)}`
}
