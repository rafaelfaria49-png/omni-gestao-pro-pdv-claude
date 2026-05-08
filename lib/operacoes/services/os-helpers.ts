export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Parser defensivo do payload JsonB da OS.
 * Mantém a mesma semântica do parser anterior (exige id/codigo/storeId).
 */
export function asOperacoesPayload<T extends { id: string; codigo: string; storeId: string }>(v: unknown): T | null {
  if (!isRecord(v)) return null;
  if (typeof v.id !== "string") return null;
  if (typeof v.codigo !== "string") return null;
  if (typeof v.storeId !== "string") return null;
  return v as unknown as T;
}

