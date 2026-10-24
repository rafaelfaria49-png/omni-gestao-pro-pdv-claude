/**
 * Patches de Configurações → `PUT /api/stores/:id/settings`.
 *
 * O servidor (`mergePrinterConfigServerSide`) preserva as chaves de `printerConfig`
 * não enviadas e funde `pdvParams` em um nível. Por isso cada seção envia somente o
 * que o operador alterou: nunca o snapshot carregado na montagem, que apagaria em
 * silêncio o que outra aba/seção gravou depois (impressão, aparência, recursos...).
 * `false` e `0` legítimos são enviados quando diferem do valor lido.
 */

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Chaves cujo valor final difere do lido. Retorna `null` quando não há mudança. */
export function changedFields<T extends Record<string, unknown>>(
  initial: T,
  next: T,
  equal: Partial<{ [K in keyof T]: (a: T[K], b: T[K]) => boolean }> = {},
): Partial<T> | null {
  const patch: Partial<T> = {}
  for (const key of Object.keys(next) as Array<keyof T>) {
    const eq = equal[key] ?? sameValue
    if (!eq(initial[key], next[key])) patch[key] = next[key]
  }
  return Object.keys(patch).length ? patch : null
}

/**
 * `impressao` é substituída inteira pelo merge do servidor. A base é a releitura feita
 * imediatamente antes do PUT (não a da montagem), preservando chaves desconhecidas e
 * as editadas por outra sessão; só os campos alterados aqui são sobrepostos.
 */
export function mergeImpressaoPatch(
  freshPrinterConfig: unknown,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const root = freshPrinterConfig && typeof freshPrinterConfig === "object" && !Array.isArray(freshPrinterConfig)
    ? (freshPrinterConfig as Record<string, unknown>)
    : {}
  const current = root.impressao && typeof root.impressao === "object" && !Array.isArray(root.impressao)
    ? (root.impressao as Record<string, unknown>)
    : {}
  return { impressao: { ...current, ...changes } }
}
