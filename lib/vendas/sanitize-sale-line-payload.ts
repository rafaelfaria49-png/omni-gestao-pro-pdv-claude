/**
 * Saneia `sale.lines[]` recebido do client antes de gravar em `Venda.payload`
 * (PDV-ACESSORIOS-SELECAO-PERSISTENCIA-SERVER-004B).
 *
 * Cirúrgico: preserva todo campo operacional já existente na linha (nome,
 * quantidade, avulso, custo, metadata F4, etc.) — só intervém em dois campos
 * complementares não confiáveis:
 *   - `accessorySelection`: sempre reprocessada por `sanitizeAccessorySelection`
 *     (fonte da verdade, `lib/acessorios/selection.ts`). Inválida é descartada
 *     com warning — nunca bloqueia a venda (produto/preço/pagamento/estoque são
 *     independentes da seleção complementar).
 *   - `cartLineKey`: removida defensivamente. É derivável a partir de
 *     (inventoryId, seleção saneada) e só serve para agrupar linhas no carrinho —
 *     nunca deve virar uma segunda fonte de verdade persistida.
 * Não muta a entrada.
 */
import { sanitizeAccessorySelection } from "@/lib/acessorios/selection"

export type SaleLineSanitizeWarning = Readonly<{
  code: "ACCESSORY_SELECTION_INVALID_DROPPED"
  index: number
}>

export type SanitizeSaleLinesPayloadResult = Readonly<{
  lines: Record<string, unknown>[]
  warnings: readonly SaleLineSanitizeWarning[]
}>

export function sanitizeSaleLinesPayload(rawLines: unknown): SanitizeSaleLinesPayloadResult {
  if (!Array.isArray(rawLines)) return { lines: [], warnings: [] }

  const warnings: SaleLineSanitizeWarning[] = []
  const lines = rawLines.map((rawLine, index) => {
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      return {} as Record<string, unknown>
    }

    const { cartLineKey: _cartLineKey, accessorySelection: rawSelection, ...rest } =
      rawLine as Record<string, unknown>

    if (rawSelection === undefined || rawSelection === null) return rest

    const selection = sanitizeAccessorySelection(rawSelection)
    if (selection) return { ...rest, accessorySelection: selection }

    warnings.push({ code: "ACCESSORY_SELECTION_INVALID_DROPPED", index })
    return rest
  })

  return { lines, warnings }
}
