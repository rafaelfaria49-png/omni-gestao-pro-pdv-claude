export type AiApiErrorKind =
  | "credits"
  | "daily_limit"
  | "forbidden"
  | "server"
  | "unknown"

export function interpretAiApiError(params: {
  status: number
  message?: string
  error?: string
}): {
  kind: AiApiErrorKind
  title: string
  description: string
} {
  const status = params.status
  const code = (params.error || "").trim()
  const msg = (params.message || "").trim()

  if (status === 402 || code === "insufficient_credits" || code === "sem_creditos") {
    return {
      kind: "credits",
      title: "Créditos insuficientes",
      description:
        msg ||
        "Saldo insuficiente para esta ação. Recarregue créditos em Configurações → Créditos antes de tentar de novo.",
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

  if (status === 401 || code === "auth_required") {
    return {
      kind: "forbidden",
      title: "Login necessário",
      description: msg || "Faça login para usar a IA Mestre.",
    }
  }

  if (status === 403) {
    if (code === "store_required") {
      return {
        kind: "forbidden",
        title: "Unidade não selecionada",
        description: msg || "Selecione uma loja ativa no painel antes de usar a IA Mestre.",
      }
    }
    if (code === "forbidden_ia_mestre") {
      return {
        kind: "forbidden",
        title: "Sem permissão — IA Mestre",
        description: msg || "O seu perfil não inclui acesso à IA Mestre.",
      }
    }
    if (code === "store_forbidden") {
      return {
        kind: "forbidden",
        title: "Unidade não permitida",
        description: msg || "Sem permissão para a unidade selecionada.",
      }
    }
    return {
      kind: "forbidden",
      title: msg.toLowerCase().includes("ia mestre") ? "Sem permissão — IA Mestre" : "Sem permissão",
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

