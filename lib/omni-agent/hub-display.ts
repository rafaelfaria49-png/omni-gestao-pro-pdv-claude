import type { OmniAgentCommandDTO } from "@/app/actions/omni-agent"
import type { OmniAgentIntentKind } from "@/lib/omni-agent/types"
import type { OmniAgentCommandStatus } from "@/generated/prisma"

/**
 * Rótulos de UI para o Omni Agent HUB (Fase 2+).
 * Mantém o interpretador em `interpret.ts`; aqui só mapeamento para apresentação.
 */
export type HubFeedBadgeKind = "ok" | "pending" | "awaiting" | "error"

export type HubFeedRow = {
  id: string
  text: string
  category: string
  module: string
  statusLabel: string
  badgeKind: HubFeedBadgeKind
  confidence: number
  ts: number
  time: string
  intent: OmniAgentIntentKind
  prismaStatus: OmniAgentCommandStatus
  dto: OmniAgentCommandDTO
}

export function intentDisplayLabel(intent: OmniAgentIntentKind): string {
  switch (intent) {
    case "OS_OPEN":
      return "Operações"
    case "CLIENT_SEARCH":
      return "Clientes"
    case "PRODUCT_SEARCH":
      return "Cadastros"
    case "REMINDER_CREATE":
      return "Lembretes"
    case "CASHBOX_QUERY":
      return "Caixa"
    case "FINANCE_SUMMARY":
      return "Financeiro"
    case "UNKNOWN":
    default:
      return "Geral"
  }
}

export function prismaStatusLabelPt(status: OmniAgentCommandStatus): string {
  switch (status) {
    case "EXECUTADO":
      return "executado"
    case "PENDENTE":
      return "pendente"
    case "AGUARDANDO_CONFIRMACAO":
      return "aguardando confirmação"
    case "ERRO":
      return "erro"
    default:
      return status
  }
}

function badgeKindForStatus(status: OmniAgentCommandStatus): HubFeedBadgeKind {
  if (status === "EXECUTADO") return "ok"
  if (status === "PENDENTE") return "pending"
  if (status === "AGUARDANDO_CONFIRMACAO") return "awaiting"
  return "error"
}

export function dtoToHubFeedRow(dto: OmniAgentCommandDTO): HubFeedRow {
  const created = new Date(dto.createdAt)
  return {
    id: dto.id,
    text: dto.comandoOriginal,
    category: dto.interpretacao.action,
    module: intentDisplayLabel(dto.interpretacao.intent),
    statusLabel: prismaStatusLabelPt(dto.status),
    badgeKind: badgeKindForStatus(dto.status),
    confidence: dto.interpretacao.confidence,
    ts: created.getTime(),
    time: created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    intent: dto.interpretacao.intent,
    prismaStatus: dto.status,
    dto,
  }
}

export type HubPendingBellItem = {
  id: string
  desc: string
  module: string
  confidence: number
}

export function dtoToBellItem(dto: OmniAgentCommandDTO): HubPendingBellItem | null {
  if (dto.status !== "PENDENTE" && dto.status !== "AGUARDANDO_CONFIRMACAO") return null
  return {
    id: dto.id,
    desc: `${dto.interpretacao.action} — ${dto.comandoOriginal}`,
    module: intentDisplayLabel(dto.interpretacao.intent),
    confidence: dto.interpretacao.confidence,
  }
}
