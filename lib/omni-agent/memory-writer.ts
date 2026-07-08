import { prisma } from "@/lib/prisma"
import { sanitizeMemoryTags, OMNI_AGENT_MEMORY_MAX_TITULO, OMNI_AGENT_MEMORY_MAX_CONTEUDO, type OmniAgentMemoryType } from "./memory"

/**
 * Escrita direta (sem gate de permissão próprio) — usar apenas a partir de código
 * já executando dentro de um comando Omni Agent autorizado (ex.: executor.ts).
 */
export async function writeOmniAgentMemory(params: {
  storeId: string
  clienteId?: string | null
  tipo: OmniAgentMemoryType
  titulo: string
  conteudo: string
  tags?: string[]
  origem?: string
  criadoPor?: string
}) {
  return prisma.omniAgentMemory.create({
    data: {
      storeId: params.storeId,
      clienteId: params.clienteId ?? null,
      tipo: params.tipo,
      titulo: params.titulo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_TITULO) || "Registro Omni Agent",
      conteudo: params.conteudo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_CONTEUDO),
      tags: sanitizeMemoryTags(params.tags),
      origem: params.origem ?? "omni_agent",
      criadoPor: params.criadoPor ?? "Omni Agent HUB",
      status: "ativo",
    },
  })
}
