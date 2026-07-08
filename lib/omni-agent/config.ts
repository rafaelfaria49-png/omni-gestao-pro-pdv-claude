import type { OmniAgentIntentKind } from "./types"
import type { OmniAgentCanal } from "./canal"
import { intentRequiresConfirmation } from "./interpret"

export const OMNI_AGENT_TONES = ["formal", "consultivo", "amigável"] as const
export type OmniAgentTone = (typeof OMNI_AGENT_TONES)[number]

export const OMNI_AGENT_AUTONOMY_LEVELS = ["baixo", "medio", "alto"] as const
export type OmniAgentAutonomyLevel = (typeof OMNI_AGENT_AUTONOMY_LEVELS)[number]

export const OMNI_AGENT_WEEK_DAYS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const
export type OmniAgentWeekDay = (typeof OMNI_AGENT_WEEK_DAYS)[number]

/**
 * Intenções de leitura elegíveis para exigir confirmação extra por decisão do admin.
 * As intenções de escrita (OS_OPEN, REMINDER_CREATE, EXPENSE_CREATE, RECEIVABLE_CREATE)
 * já exigem confirmação sempre (ver `intentRequiresConfirmation`) e não entram aqui —
 * essa lista nunca pode ser usada para *reduzir* segurança, só para aumentar.
 */
export const OMNI_AGENT_CONFIRMABLE_READ_INTENTS: readonly OmniAgentIntentKind[] = [
  "CLIENT_SEARCH",
  "PRODUCT_SEARCH",
  "CASHBOX_QUERY",
  "FINANCE_SUMMARY",
]

export type OmniAgentConfigDTO = {
  agentName: string
  tone: string
  basePrompt: string
  autonomyLevel: string
  defaultChannel: OmniAgentCanal
  businessHoursStart: string
  businessHoursEnd: string
  businessHoursDays: string[]
  extraConfirmIntents: OmniAgentIntentKind[]
  updatedAt: string | null
}

export const DEFAULT_OMNI_AGENT_CONFIG: OmniAgentConfigDTO = {
  agentName: "Omni",
  tone: "consultivo",
  basePrompt: "Responda de forma clara, objetiva e profissional. Sempre confirme antes de executar ações financeiras.",
  autonomyLevel: "medio",
  defaultChannel: "texto_interno",
  businessHoursStart: "08:00",
  businessHoursEnd: "18:00",
  businessHoursDays: ["seg", "ter", "qua", "qui", "sex"],
  extraConfirmIntents: [],
  updatedAt: null,
}

export function sanitizeExtraConfirmIntents(intents: string[]): OmniAgentIntentKind[] {
  return intents.filter((i): i is OmniAgentIntentKind =>
    OMNI_AGENT_CONFIRMABLE_READ_INTENTS.includes(i as OmniAgentIntentKind),
  )
}

export function sanitizeBusinessHoursDays(days: string[]): string[] {
  return days.filter((d) => (OMNI_AGENT_WEEK_DAYS as readonly string[]).includes(d))
}

export function sanitizeTone(tone: string | undefined, fallback: string): string {
  return tone && (OMNI_AGENT_TONES as readonly string[]).includes(tone) ? tone : fallback
}

export function sanitizeAutonomyLevel(level: string | undefined, fallback: string): string {
  return level && (OMNI_AGENT_AUTONOMY_LEVELS as readonly string[]).includes(level) ? level : fallback
}

/**
 * Decide se um comando precisa de confirmação humana antes de executar.
 * Escritas (`intentRequiresConfirmation` / `interp.requiresConfirmation`) exigem SEMPRE —
 * `config` só pode ADICIONAR confirmação (autonomia "baixo" ou `extraConfirmIntents"), nunca remover.
 */
export function omniAgentNeedsConfirmation(
  interp: { intent: OmniAgentIntentKind; requiresConfirmation: boolean },
  config: Pick<OmniAgentConfigDTO, "autonomyLevel" | "extraConfirmIntents">,
): boolean {
  const forcedReadConfirm =
    config.autonomyLevel === "baixo" && OMNI_AGENT_CONFIRMABLE_READ_INTENTS.includes(interp.intent)
  return (
    intentRequiresConfirmation(interp.intent) ||
    interp.requiresConfirmation ||
    config.extraConfirmIntents.includes(interp.intent) ||
    forcedReadConfirm
  )
}
