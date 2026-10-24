/**
 * Patches de Configurações → `PUT /api/stores/:id/settings`.
 *
 * O servidor (`mergePrinterConfigServerSide`, sob o lock transacional da loja) preserva
 * as chaves de `printerConfig` não enviadas e funde `pdvParams` e `impressao` por chave.
 * Por isso cada seção envia somente o que o operador editou: nunca o snapshot carregado
 * na montagem, que apagaria em silêncio o que outra aba/seção gravou depois.
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
