export const OMNI_AGENT_MEMORY_TYPES = [
  "nota",
  "decisao",
  "lembrete",
  "incidente",
  "preferencia",
  "observacao",
] as const
export type OmniAgentMemoryType = (typeof OMNI_AGENT_MEMORY_TYPES)[number]

export const OMNI_AGENT_MEMORY_STATUSES = ["ativo", "arquivado"] as const
export type OmniAgentMemoryStatus = (typeof OMNI_AGENT_MEMORY_STATUSES)[number]

export const OMNI_AGENT_MEMORY_ORIGENS = ["manual", "omni_agent"] as const
export type OmniAgentMemoryOrigem = (typeof OMNI_AGENT_MEMORY_ORIGENS)[number]

export function isOmniAgentMemoryType(v: string): v is OmniAgentMemoryType {
  return (OMNI_AGENT_MEMORY_TYPES as readonly string[]).includes(v)
}

export const OMNI_AGENT_MEMORY_MAX_TAGS = 10
export const OMNI_AGENT_MEMORY_MAX_TAG_LENGTH = 40
export const OMNI_AGENT_MEMORY_MAX_TITULO = 140
export const OMNI_AGENT_MEMORY_MAX_CONTEUDO = 4000

/** Normaliza tags: trim, descarta vazias, remove duplicatas, limita tamanho e quantidade. */
export function sanitizeMemoryTags(tags: string[] | undefined | null): string[] {
  if (!tags) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().slice(0, OMNI_AGENT_MEMORY_MAX_TAG_LENGTH)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= OMNI_AGENT_MEMORY_MAX_TAGS) break
  }
  return out
}

export type OmniAgentMemoryDTO = {
  id: string
  storeId: string
  clienteId: string | null
  tipo: OmniAgentMemoryType
  titulo: string
  conteudo: string
  tags: string[]
  origem: string
  criadoPor: string
  status: OmniAgentMemoryStatus
  createdAt: string
  updatedAt: string
}
