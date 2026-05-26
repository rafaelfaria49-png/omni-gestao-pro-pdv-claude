import { prisma } from "@/lib/prisma"

/** Heurística server-side (espelha agentic-ui) — fallback honesto, não é LLM. */
export function detectIntentFromPreview(preview: string): string | null {
  const t = preview.toLowerCase().trim()
  if (!t) return null
  if (/orçamento|orcamento|preço|preco|quanto custa|valor/.test(t))
    return "Solicita orçamento"
  if (/cancelar|desistir|reembolso|devolver/.test(t))
    return "Risco de desistência"
  if (/pronto|status|andamento|quando fica/.test(t))
    return "Consulta status / OS"
  if (/garantia|defeito|não funciona|nao funciona|problema/.test(t))
    return "Suporte pós-venda"
  if (/obrigad|valeu|perfeito/.test(t)) return "Satisfação / encerramento"
  if (/oi|olá|ola|bom dia|boa tarde/.test(t)) return "Abertura de conversa"
  return null
}

export function buildLocalSuggestReply(
  intent: string | null,
  humanMode: boolean,
  contactName?: string
): string {
  if (humanMode)
    return "Olá! Estou verificando seu caso com a equipe e retorno em instantes."
  if (!intent) {
    const nome = contactName?.trim()
    return nome
      ? `Olá, ${nome}! Como posso ajudar você hoje?`
      : "Olá! Como posso ajudar você hoje?"
  }
  if (intent.includes("orçamento"))
    return "Claro! Para montar o orçamento, pode me informar o modelo do aparelho e o defeito relatado?"
  if (intent.includes("status"))
    return "Vou consultar o status da sua OS e já te retorno com a previsão de entrega."
  if (intent.includes("Risco"))
    return "Sinto muito pelo transtorno. Pode me contar o que aconteceu para resolvermos o quanto antes?"
  if (intent.includes("Suporte"))
    return "Entendi. Vamos resolver isso — o aparelho apresenta o defeito desde quando?"
  return "Obrigado pela mensagem! Já estou analisando e retorno em seguida."
}

export async function buildLocalWhatsAppSuggestion(
  storeId: string,
  conversationId: string
): Promise<string> {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
    include: { contact: { select: { displayName: true } } },
  })
  if (!conv) throw new Error("Conversa não encontrada nesta loja")

  const preview = conv.lastMessagePreview ?? ""
  const intent = detectIntentFromPreview(preview)
  const nome = conv.contact.displayName?.trim()
  return buildLocalSuggestReply(intent, conv.humanMode, nome)
}
