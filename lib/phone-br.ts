/** Apenas dígitos (máx. 11 para telefone BR). */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 11)
}

/** Todos os dígitos (ex.: WhatsApp com DDI 55 — até 13). */
export function phoneDigitsAll(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "")
}

/**
 * Compara telefone WhatsApp (pode ter 55 + DDD + número) com telefone do cadastro.
 * Evita falso positivo: exige match de 11 dígitos (celular) ou 10 (fixo), não só 8/9 soltos.
 */
export function phonesAreCompatibleBr(waRaw: string, clienteRaw: string): boolean {
  const wa = phoneDigitsAll(waRaw)
  const cl = phoneDigitsAll(clienteRaw)
  if (wa.length < 10 || cl.length < 8) return false

  const wa11 = wa.length >= 11 ? wa.slice(-11) : ""
  const cl11 = cl.length >= 11 ? cl.slice(-11) : ""
  if (wa11.length === 11 && cl11.length === 11 && wa11 === cl11) return true

  const wa10 = wa.length >= 10 ? wa.slice(-10) : ""
  const cl10 = cl.length >= 10 ? cl.slice(-10) : ""
  if (wa10.length === 10 && cl10.length === 10 && wa10 === cl10) return true

  if (wa.length === 9 && cl.length === 9 && wa === cl) return true

  return false
}

/** Tokens para busca na API de clientes (contains), priorizando sufixo de 11 dígitos. */
export function buildClientePhoneSearchTokens(waRaw: string): string[] {
  const d = phoneDigitsAll(waRaw)
  const tokens = new Set<string>()
  if (d.length >= 11) tokens.add(d.slice(-11))
  if (d.length >= 10) tokens.add(d.slice(-10))
  if (d.length >= 13) tokens.add(d.slice(-11))
  return [...tokens].filter((t) => t.length >= 8)
}

/** Rótulo legível para exibição (aceita número com DDI). */
export function formatPhoneBrDisplay(raw: string): string {
  const d = phoneDigitsAll(raw)
  if (d.length === 0) return ""
  if (d.length === 13 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return d
}

/**
 * Máscara dinâmica estilo loja: (XX) XXXXX-XXXX (celular) ou (XX) XXXX-XXXX (fixo).
 */
export function formatPhoneBrInput(raw: string): string {
  const d = phoneDigitsOnly(raw)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function isValidPhoneBr(raw: string): boolean {
  const n = phoneDigitsOnly(raw).length
  return n >= 10 && n <= 11
}
