/**
 * Nome de Cliente — sinal FRACO.
 *
 * Reusa `normalizeNameForMatch` (`lib/import-normalize.ts`), já usado pelo
 * importador avançado de clientes. Equivalente a `normalizeNomeCliente`
 * (dívida: dois helpers irmãos; não unificados neste GOAL).
 *
 * Nome igual/semelhante NUNCA gera auto-merge nem EXACT_DOCUMENT_MATCH.
 * Sem fuzzy, sem IA.
 */
import { normalizeNameForMatch } from "@/lib/import-normalize"
import type { ClientNameSignal } from "./types"

export function normalizeClientName(raw: unknown): string {
  return normalizeNameForMatch(String(raw ?? ""))
}

export function toNameSignal(raw: unknown): ClientNameSignal {
  const normalized = normalizeClientName(raw)
  if (!normalized) return { present: false }
  return { present: true, normalized }
}
