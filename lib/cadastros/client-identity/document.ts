/**
 * Documento de Cliente (CPF/CNPJ) — normalização determinística.
 *
 * Reuso:
 * - `digitsOnly` de `lib/import-normalize.ts` (já usado pelos importadores de Cliente);
 * - `isValidCnpj` de `lib/fiscal/fiscal-validators.ts` (dígitos verificadores canônicos).
 *
 * CPF não tinha validador de DV reutilizável no repo (`lib/cpf.ts` só corta dígitos).
 * A validação de CPF vive aqui; não “corrige” dígito inventando DV.
 *
 * Dívida (não refatorada neste GOAL): `docDigitsForDedupe` trata qualquer 11/14
 * dígitos como chave de dedupe, sem DV — insuficiente para identidade forte.
 */
import { digitsOnly } from "@/lib/import-normalize"
import { isValidCnpj } from "@/lib/fiscal/fiscal-validators"
import type { ClientDocumentKind, ClientDocumentSignal } from "./types"

/** Remove só formatação previsível (não-dígitos). Não completa DV. */
export function normalizeDocumentDigits(raw: unknown): string {
  return digitsOnly(raw)
}

/**
 * CPF — algoritmo clássico de dígitos verificadores.
 * Rejeita vazio, comprimento ≠ 11 e sequências repetidas (`000…`, `111…`).
 */
export function isValidCpf(raw: unknown): boolean {
  const d = normalizeDocumentDigits(raw)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i += 1) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function isValidClientDocument(raw: unknown): boolean {
  const d = normalizeDocumentDigits(raw)
  if (d.length === 11) return isValidCpf(d)
  if (d.length === 14) return isValidCnpj(d)
  return false
}

export function detectDocumentKind(digits: string): ClientDocumentKind {
  if (digits.length === 11) return "CPF"
  if (digits.length === 14) return "CNPJ"
  return "UNKNOWN"
}

/**
 * Sinal de documento a partir do campo real `Cliente.document`.
 * Vazio/null → ausência (dois vazios NUNCA casam).
 * 11/14 dígitos inválidos permanecem representáveis (compat. histórica) mas
 * `strong: false` — não autorizam EXACT_DOCUMENT_MATCH.
 */
export function toDocumentSignal(raw: unknown): ClientDocumentSignal {
  const digits = normalizeDocumentDigits(raw)
  if (!digits) return { present: false }
  const kind = detectDocumentKind(digits)
  const strong =
    (kind === "CPF" && isValidCpf(digits)) || (kind === "CNPJ" && isValidCnpj(digits))
  return { present: true, digits, kind, strong }
}
