/** Formatos aceitos pelo scanner local. UPC-A é normalizado como EAN-13 com zero à esquerda. */
export type GtinFormato = "EAN-8" | "EAN-13" | "UPC-A" | "interno-2xx"

export type GtinValidado = {
  valid: true
  gtin: string
  formato: GtinFormato
  interno: boolean
  /** Candidatos equivalentes para encontrar registros legados de UPC-A. */
  lookupCandidates: string[]
}

export type GtinInvalido = { valid: false; message: string }
export type ValidacaoGtin = GtinValidado | GtinInvalido

function checkDigitIsValid(value: string): boolean {
  const digits = value.split("").map(Number)
  const supplied = digits.pop()
  if (supplied === undefined) return false

  let sum = 0
  for (let index = digits.length - 1, multiplier = 3; index >= 0; index -= 1) {
    sum += digits[index] * multiplier
    multiplier = multiplier === 3 ? 1 : 3
  }
  return (10 - (sum % 10)) % 10 === supplied
}

/**
 * Valida EAN-8, EAN-13 e UPC-A pelo dígito verificador.
 * Prefixos 20–29 continuam aptos à consulta local, mas são marcados como internos
 * para que nenhuma fase futura os envie a provedores externos.
 */
export function validarGtin(raw: string): ValidacaoGtin {
  const scanned = typeof raw === "string" ? raw.trim() : ""
  if (!/^\d+$/.test(scanned)) {
    return { valid: false, message: "Informe somente dígitos do código de barras." }
  }
  if (![8, 12, 13].includes(scanned.length)) {
    return { valid: false, message: "Use um EAN-8, EAN-13 ou UPC-A válido." }
  }

  const gtin = scanned.length === 12 ? `0${scanned}` : scanned
  if (!checkDigitIsValid(gtin)) {
    return { valid: false, message: "Código de barras inválido: dígito verificador não confere." }
  }

  const interno = gtin.length === 13 && /^2[0-9]/.test(gtin)
  const formato: GtinFormato = interno
    ? "interno-2xx"
    : scanned.length === 8
      ? "EAN-8"
      : scanned.length === 12
        ? "UPC-A"
        : "EAN-13"

  return {
    valid: true,
    gtin,
    formato,
    interno,
    lookupCandidates: scanned.length === 12 ? [gtin, scanned] : [gtin],
  }
}
