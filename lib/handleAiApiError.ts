export type AiApiErrorKind =
  | "credits"
  | "daily_limit"
  | "forbidden"
  | "server"
  | "unknown"

export function interpretAiApiError(params: {
  status: number
  message?: string
}): {
  kind: AiApiErrorKind
  title: string
  description: string
} {
  const status = params.status
  const msg = (params.message || "").trim()

  if (status === 402) {
    return {
      kind: "credits",
      title: "Créditos insuficientes",
      description:
        "Você ainda pode continuar usando o chat de texto, mas recursos como imagem, vídeo, voz e avatar precisam de créditos.",
    }
  }

  if (status === 429) {
    return {
      kind: "daily_limit",
      title: "Limite diário atingido",
      description:
        "Você atingiu o limite diário para este recurso. Tente novamente amanhã ou faça upgrade do plano.",
    }
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      title: "Sem permissão",
      description: msg || "Você não tem permissão para usar este recurso agora.",
    }
  }

  if (status >= 500) {
    return {
      kind: "server",
      title: "Instabilidade temporária",
      description:
        msg || "O servidor está instável no momento. Tente novamente em instantes.",
    }
  }

  return {
    kind: "unknown",
    title: "Não foi possível concluir",
    description: msg || `Erro HTTP ${status}.`,
  }
}

