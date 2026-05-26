export type OmniAgentCanal = "texto_interno" | "whatsapp" | "voz"

const OMNI_AGENT_CANAIS: readonly OmniAgentCanal[] = ["texto_interno", "whatsapp", "voz"]

/** Fallback seguro para valores inválidos ou vazios. */
export function normalizeOmniAgentCanal(canal?: string | null): OmniAgentCanal {
  const c = (canal ?? "").trim() as OmniAgentCanal
  if (OMNI_AGENT_CANAIS.includes(c)) return c
  return "texto_interno"
}
