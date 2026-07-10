/**
 * Contratos puros do caminho de escrita de Produto no Cadastros HUB.
 *
 * `metadata` aceita namespaces extensíveis. O merge é deliberadamente limitado a
 * dois níveis: preserva namespaces e chaves não enviados, enquanto valores escalares
 * e arrays recebidos substituem os valores existentes.
 */
export type ProdutoMetadata = Record<string, unknown>

export function asProdutoMetadata(value: unknown): ProdutoMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as ProdutoMetadata
}

/** Mantém o contrato de identidade: vazio ou whitespace nunca vai para a unique constraint. */
export function normalizeProdutoIdentifier(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim()
  return normalized || null
}

/**
 * Merge aditivo de dois níveis. `incoming: null` é tratado como omissão para que uma
 * edição nunca apague acidentalmente todo o metadata já persistido.
 */
export function mergeProdutoMetadataTwoLevels(
  current: unknown,
  incoming: ProdutoMetadata | null | undefined,
): ProdutoMetadata {
  const base = { ...(asProdutoMetadata(current) ?? {}) }
  if (!incoming) return base

  const merged: ProdutoMetadata = { ...base }
  for (const [namespace, nextValue] of Object.entries(incoming)) {
    const currentNamespace = asProdutoMetadata(base[namespace])
    const nextNamespace = asProdutoMetadata(nextValue)
    merged[namespace] = currentNamespace && nextNamespace
      ? { ...currentNamespace, ...nextNamespace }
      : nextValue
  }
  return merged
}

/** Normaliza tags do formulário sem vazios ou duplicatas (case-insensitive). */
export function normalizeProdutoTags(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase("pt-BR")
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/**
 * Só inclui estoque em um patch quando o caller mandou um inteiro não negativo.
 * A ausência de estoque deve preservar o saldo existente em edições.
 */
export function produtoStockPatch(estoque: number | undefined): { stock?: number } {
  if (estoque === undefined) return {}
  const normalized = Math.trunc(Number(estoque))
  return Number.isFinite(normalized) && normalized >= 0 ? { stock: normalized } : {}
}
