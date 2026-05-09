const DEFAULT_MESSAGE =
  "Não foi possível concluir esta ação. Verifique sua conexão e tente de novo em instantes."

/**
 * Converte erros desconhecidos em texto seguro para exibir ao usuário
 * (evita "undefined", "[object Object]", strings vazias).
 */
export function humanizeUnknownError(error: unknown, fallback: string = DEFAULT_MESSAGE): string {
  if (error == null) return fallback

  if (typeof error === "string") {
    const t = error.trim()
    if (!t || t === "undefined" || t === "null" || t === "[object Object]") return fallback
    return t
  }

  if (error instanceof Error) {
    const m = (error.message ?? "").trim()
    if (!m || m === "undefined" || m === "[object Object]") return fallback
    return m
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>
    const msg = o.message
    const err = o.error
    if (typeof msg === "string" && msg.trim()) return msg.trim()
    if (typeof err === "string" && err.trim()) return err.trim()
  }

  return fallback
}
