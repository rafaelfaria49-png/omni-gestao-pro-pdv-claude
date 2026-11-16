/**
 * Identidade IMEI/serial dos aparelhos físicos (OMNI-APARELHOS-ENDTOEND-001).
 *
 * IMEI = 15 dígitos, o último é o dígito verificador Luhn (3GPP TS 23.003).
 * Validação de FORMATO e DÍGITO apenas — nunca afirma situação de restrição
 * (roubo/bloqueio): isso exige consulta a fonte oficial, registrada à parte.
 */

export function normalizeImei(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : ""
}

/** Serial: maiúsculas, sem espaços; aceita letras, dígitos, hífen e barra. */
export function normalizeSerial(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "").slice(0, 64) : ""
}

export function luhnCheckDigit(body14: string): number {
  let sum = 0
  for (let i = 0; i < body14.length; i++) {
    let d = body14.charCodeAt(i) - 48
    // Da direita para a esquerda (desconsiderando o DV), dobra as posições ímpares.
    if ((body14.length - i) % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

export type ImeiCheck =
  | { ok: true; imei: string }
  | { ok: false; reason: "VAZIO" | "TAMANHO" | "DIGITO_VERIFICADOR" | "SEQUENCIA_INVALIDA"; message: string }

export function validateImei(raw: unknown): ImeiCheck {
  const imei = normalizeImei(raw)
  if (!imei) return { ok: false, reason: "VAZIO", message: "Informe o IMEI." }
  if (imei.length !== 15) {
    return { ok: false, reason: "TAMANHO", message: `O IMEI tem 15 dígitos; este tem ${imei.length}.` }
  }
  if (/^(\d)\1{14}$/.test(imei)) {
    return { ok: false, reason: "SEQUENCIA_INVALIDA", message: "IMEI com todos os dígitos iguais não é válido." }
  }
  if (luhnCheckDigit(imei.slice(0, 14)) !== Number(imei[14])) {
    return { ok: false, reason: "DIGITO_VERIFICADOR", message: "Dígito verificador do IMEI não confere. Confira a digitação (*#06#)." }
  }
  return { ok: true, imei }
}

/** 35 678912 345678 9 — agrupamento TAC/serial/DV para leitura humana. */
export function formatImei(imei: string): string {
  const d = normalizeImei(imei)
  if (d.length !== 15) return d
  return `${d.slice(0, 2)} ${d.slice(2, 8)} ${d.slice(8, 14)} ${d[14]}`
}

/** Exibição para quem não tem permissão de dados sensíveis: só os 5 finais. */
export function maskImei(imei: string | null | undefined): string {
  const d = normalizeImei(imei ?? "")
  if (!d) return ""
  if (d.length <= 5) return "•".repeat(d.length)
  return `${"•".repeat(d.length - 5)}${d.slice(-5)}`
}

export function maskSerial(serial: string | null | undefined): string {
  const s = (serial ?? "").trim()
  if (!s) return ""
  if (s.length <= 4) return "•".repeat(s.length)
  return `${"•".repeat(s.length - 4)}${s.slice(-4)}`
}

/** Termo de busca parece IMEI (≥ 5 dígitos puros) — usado para casar por sufixo. */
export function looksLikeImeiQuery(q: string): boolean {
  return /^\d{5,15}$/.test(q.replace(/\s/g, ""))
}
