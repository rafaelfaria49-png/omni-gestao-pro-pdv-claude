/** Rejeita storeId vazio — evita fallback silencioso para loja primária legada. */
export function assertActiveStoreId(storeId: string, context = "Operações"): void {
  const id = storeId?.trim();
  if (!id) {
    throw new Error(`Selecione uma unidade ativa para continuar (${context}).`);
  }
}

/** Variante para API routes — retorna null em vez de lançar. */
export function resolveActiveStoreId(storeId: string | null | undefined): string | null {
  const id = storeId?.trim();
  return id && id.length > 0 ? id : null;
}
