/**
 * Telefone de Cliente — reusa o normalizador canônico `phone-br`.
 *
 * `phoneDigitsAll` preserva DDI; não inventa DDD/país.
 * Se (e só se) o número tiver 12+ dígitos começando com `55` e o restante
 * tiver 10 ou 11 dígitos, o prefixo BR é removido — mesma convenção já
 * praticada em `normalizeTelefone` (`lib/contas-receber-cliente-match.ts`).
 *
 * `phoneDigitsOnly` (máx. 11, máscara de input) NÃO é chave de identidade:
 * truncaria um E.164 `55…`. Dívida documentada, sem refatoração global.
 */
import { phoneDigitsAll } from "@/lib/phone-br"
import type { ClientPhoneSignal } from "./types"

export function normalizeClientPhoneDigits(raw: unknown): string {
  const d = phoneDigitsAll(String(raw ?? ""))
  if (!d) return ""
  if (d.length >= 12 && d.startsWith("55")) {
    const national = d.slice(2)
    if (national.length === 10 || national.length === 11) return national
  }
  return d
}

/**
 * Sinal de telefone. Exige 10 ou 11 dígitos nacionais após a normalização.
 * Números mais curtos não são identidade (não inventamos DDD).
 */
export function toPhoneSignal(raw: unknown): ClientPhoneSignal {
  const digits = normalizeClientPhoneDigits(raw)
  if (digits.length !== 10 && digits.length !== 11) return { present: false }
  return { present: true, digits }
}
