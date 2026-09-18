/**
 * Observabilidade mínima do mount do PDV (P0 PDV-RAFACELL-LOAD-CRASH-P0-001).
 *
 * Permite distinguir, numa próxima falha de carga, em qual camada o mount
 * parou: loja → settings → terminal → pending-restore → catalog → capabilities.
 *
 * - Só contagens e nomes de etapa (NUNCA itens, valores, documentos ou PII);
 * - buffer em memória (anel de 50 eventos), sem persistência;
 * - exposto em `window.__PDV_MOUNT__` para diagnóstico em Production;
 * - o error boundary de `/dashboard/vendas` anexa o snapshot ao `console.error`.
 */

export type PdvMountStep =
  | "loja"
  | "settings"
  | "terminal"
  | "pending-restore"
  | "catalog"
  | "capabilities"

export type PdvMountMark = {
  step: PdvMountStep
  at: number
  storeId: string
  ok: boolean
  /** Contagens seguras (ex.: pendentes restauradas, itens de catálogo, quarentena). */
  counts?: Record<string, number>
  /** Código de erro curto e estável (ex.: `HTTP_500`, `fetch_failed`). Sem mensagens livres. */
  code?: string
}

const MAX_MARKS = 50
const marks: PdvMountMark[] = []

function snapshot(): PdvMountMark[] {
  return marks.slice()
}

function publish(): void {
  try {
    if (typeof window !== "undefined") {
      ;(window as unknown as Record<string, unknown>).__PDV_MOUNT__ = snapshot()
    }
  } catch {
    /* ignore */
  }
}

/** Registra uma etapa do mount. Nunca lança. */
export function markPdvMountStep(
  step: PdvMountStep,
  storeId: string,
  ok: boolean,
  extra?: { counts?: Record<string, number>; code?: string },
): void {
  try {
    marks.push({
      step,
      at: Date.now(),
      storeId: typeof storeId === "string" ? storeId.slice(0, 64) : "",
      ok,
      ...(extra?.counts ? { counts: { ...extra.counts } } : {}),
      ...(extra?.code ? { code: extra.code.slice(0, 64) } : {}),
    })
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS)
    publish()
  } catch {
    /* observabilidade nunca quebra o produto */
  }
}

/** Snapshot atual para o error boundary anexar ao log. Nunca lança. */
export function getPdvMountSnapshot(): PdvMountMark[] {
  try {
    return snapshot()
  } catch {
    return []
  }
}
