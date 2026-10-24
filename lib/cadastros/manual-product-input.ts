import { parseValorDigitadoV3 } from "@/lib/operacoes-v3/recebimento-misto-model"

export type ManualNumber =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "valid"; value: number }

/** Texto do formulário: vazio é omissão; zero é uma intenção explícita. */
export function parseManualProductNumber(raw: string, kind: "money" | "integer"): ManualNumber {
  const text = raw.trim()
  if (!text) return { state: "empty" }
  if (kind === "integer") {
    if (!/^\d+$/.test(text)) return { state: "invalid" }
    const value = Number(text)
    return Number.isSafeInteger(value) && value <= 2_147_483_647
      ? { state: "valid", value }
      : { state: "invalid" }
  }
  // Mesmo parser estrito de dinheiro digitado já publicado (pt-BR e ponto decimal).
  const cents = parseValorDigitadoV3(text)
  return cents !== null && Number.isSafeInteger(cents)
    ? { state: "valid", value: cents / 100 }
    : { state: "invalid" }
}

/** Sem arredondar dados históricos só para apresentá-los no editor. */
export function manualProductNumberText(value: number | undefined): string {
  return value === undefined ? "" : String(value).replace(".", ",")
}
