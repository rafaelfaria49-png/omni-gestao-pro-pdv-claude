/**
 * Compõe as linhas corrigidas de uma venda sem perder extensões JSON da linha
 * original. A associação usa a mesma ordem de ItemVenda/payload.lines do F4,
 * mas confirma inventoryId + nome e consome cada origem uma única vez.
 */

export type CorrectedSaleLine = {
  inventoryId: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  desconto?: number
  isAvulso?: boolean
  /** Referência interna do planner; nunca é persistida no payload. */
  sourceIndex?: number
}

const canonicalLineKeys = new Set([
  "inventoryId",
  "name",
  "quantity",
  "unitPrice",
  "lineTotal",
  "desconto",
  "isAvulso",
  "qtyReturned",
  "custoUnitario",
  "cartLineKey",
])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function extrasFrom(line: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(line).filter(([key]) => !canonicalLineKeys.has(key)))
}

/**
 * Preserva somente extensões da linha original correspondente. Uma linha nova
 * ou substituída não encontra origem e, portanto, nasce sem extras. `cartLineKey`
 * é deliberadamente transitória e nunca volta ao payload persistido.
 */
export function composeCorrectedSalePayloadLines(input: {
  existingPayloadLines: unknown
  correctedLines: CorrectedSaleLine[]
}): Array<Record<string, unknown>> {
  const payloadLines = Array.isArray(input.existingPayloadLines) ? input.existingPayloadLines : []

  return input.correctedLines.map((line) => {
    const source = typeof line.sourceIndex === "number" && line.sourceIndex >= 0
      ? extrasFrom(asRecord(payloadLines[line.sourceIndex]))
      : {}

    return {
      ...source,
      inventoryId: line.inventoryId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      ...(line.desconto && line.desconto > 0 ? { desconto: line.desconto } : {}),
      ...(line.isAvulso ? { isAvulso: true } : {}),
    }
  })
}
