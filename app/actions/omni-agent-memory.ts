"use server"

import { prisma } from "@/lib/prisma"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { omniAgentAuditMetadata } from "@/lib/omni-agent/audit-log"
import { writeOmniAgentMemory } from "@/lib/omni-agent/memory-writer"
import {
  isOmniAgentMemoryType,
  sanitizeMemoryTags,
  OMNI_AGENT_MEMORY_MAX_TITULO,
  OMNI_AGENT_MEMORY_MAX_CONTEUDO,
  type OmniAgentMemoryDTO,
  type OmniAgentMemoryType,
} from "@/lib/omni-agent/memory"

function assertStoreId(storeId: string): string {
  const sid = storeId.trim()
  if (!sid) throw new Error("Unidade ativa obrigatória para o Omni Agent HUB.")
  return sid
}

async function guard(storeId: string) {
  const sid = assertStoreId(storeId)
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)
  return { sid, g }
}

function toMemoryDto(row: {
  id: string
  storeId: string
  clienteId: string | null
  tipo: string
  titulo: string
  conteudo: string
  tags: string[]
  origem: string
  criadoPor: string
  status: string
  createdAt: Date
  updatedAt: Date
}): OmniAgentMemoryDTO {
  return {
    id: row.id,
    storeId: row.storeId,
    clienteId: row.clienteId,
    tipo: isOmniAgentMemoryType(row.tipo) ? row.tipo : "observacao",
    titulo: row.titulo,
    conteudo: row.conteudo,
    tags: row.tags,
    origem: row.origem,
    criadoPor: row.criadoPor,
    status: row.status === "arquivado" ? "arquivado" : "ativo",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function logMemoryAudit(
  storeId: string,
  action: "OMNI_AGENT_MEMORY_CREATE" | "OMNI_AGENT_MEMORY_UPDATE" | "OMNI_AGENT_MEMORY_ARCHIVE",
  detail: string,
  extra: Record<string, unknown>,
) {
  try {
    await prisma.logsAuditoria.create({
      data: {
        action,
        userLabel: "Omni Agent HUB",
        detail: detail.slice(0, 4000),
        metadata: omniAgentAuditMetadata(storeId, extra),
        source: "omni_agent",
      },
    })
  } catch {
    /* ignore */
  }
}

export type CreateOmniAgentMemoryInput = {
  clienteId?: string | null
  tipo: OmniAgentMemoryType
  titulo: string
  conteudo: string
  tags?: string[]
  origem?: string
}

export async function createOmniAgentMemory(
  storeId: string,
  input: CreateOmniAgentMemoryInput,
): Promise<OmniAgentMemoryDTO> {
  const { sid, g } = await guard(storeId)

  if (!isOmniAgentMemoryType(input.tipo)) throw new Error("Tipo de memória inválido.")
  const titulo = input.titulo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_TITULO)
  if (!titulo) throw new Error("Título obrigatório.")
  const conteudo = input.conteudo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_CONTEUDO)
  if (!conteudo) throw new Error("Conteúdo obrigatório.")

  const clienteId = input.clienteId?.trim() || null
  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, storeId: sid }, select: { id: true } })
    if (!cliente) throw new Error("Cliente não encontrado nesta loja.")
  }

  const criadoPor = g.session.user.name || g.session.user.email || "Omni Agent HUB"

  const row = await writeOmniAgentMemory({
    storeId: sid,
    clienteId,
    tipo: input.tipo,
    titulo,
    conteudo,
    tags: input.tags,
    origem: input.origem?.trim() || "manual",
    criadoPor,
  })
  await logMemoryAudit(sid, "OMNI_AGENT_MEMORY_CREATE", `Memória criada: ${titulo}`, { memoryId: row.id, clienteId })
  return toMemoryDto(row)
}

export type UpdateOmniAgentMemoryInput = {
  tipo?: OmniAgentMemoryType
  titulo?: string
  conteudo?: string
  tags?: string[]
}

export async function updateOmniAgentMemory(
  storeId: string,
  id: string,
  input: UpdateOmniAgentMemoryInput,
): Promise<OmniAgentMemoryDTO> {
  const { sid } = await guard(storeId)

  const existing = await prisma.omniAgentMemory.findFirst({ where: { id, storeId: sid } })
  if (!existing) throw new Error("Memória não encontrada.")
  if (existing.status === "arquivado") throw new Error("Memória arquivada não pode ser editada.")

  if (input.tipo !== undefined && !isOmniAgentMemoryType(input.tipo)) throw new Error("Tipo de memória inválido.")
  const titulo = input.titulo !== undefined ? input.titulo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_TITULO) : undefined
  if (titulo !== undefined && !titulo) throw new Error("Título inválido.")
  const conteudo =
    input.conteudo !== undefined ? input.conteudo.trim().slice(0, OMNI_AGENT_MEMORY_MAX_CONTEUDO) : undefined
  if (conteudo !== undefined && !conteudo) throw new Error("Conteúdo inválido.")

  const row = await prisma.omniAgentMemory.update({
    where: { id },
    data: {
      ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
      ...(titulo !== undefined ? { titulo } : {}),
      ...(conteudo !== undefined ? { conteudo } : {}),
      ...(input.tags !== undefined ? { tags: sanitizeMemoryTags(input.tags) } : {}),
    },
  })
  await logMemoryAudit(sid, "OMNI_AGENT_MEMORY_UPDATE", `Memória editada: ${row.titulo}`, {
    memoryId: row.id,
    clienteId: row.clienteId,
  })
  return toMemoryDto(row)
}

export async function archiveOmniAgentMemory(storeId: string, id: string): Promise<OmniAgentMemoryDTO> {
  const { sid } = await guard(storeId)

  const existing = await prisma.omniAgentMemory.findFirst({ where: { id, storeId: sid } })
  if (!existing) throw new Error("Memória não encontrada.")

  const row = await prisma.omniAgentMemory.update({
    where: { id },
    data: { status: "arquivado" },
  })
  await logMemoryAudit(sid, "OMNI_AGENT_MEMORY_ARCHIVE", `Memória arquivada: ${row.titulo}`, {
    memoryId: row.id,
    clienteId: row.clienteId,
  })
  return toMemoryDto(row)
}

export async function listOmniAgentMemoriesByCliente(
  storeId: string,
  clienteId: string,
  opts?: { includeArchived?: boolean; take?: number },
): Promise<OmniAgentMemoryDTO[]> {
  const { sid } = await guard(storeId)
  const cid = clienteId.trim()
  if (!cid) return []

  const rows = await prisma.omniAgentMemory.findMany({
    where: {
      storeId: sid,
      clienteId: cid,
      ...(opts?.includeArchived ? {} : { status: "ativo" }),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts?.take ?? 100, 300),
  })
  return rows.map(toMemoryDto)
}

export async function listRecentOmniAgentMemories(
  storeId: string,
  opts?: { take?: number },
): Promise<OmniAgentMemoryDTO[]> {
  const { sid } = await guard(storeId)

  const rows = await prisma.omniAgentMemory.findMany({
    where: { storeId: sid, status: "ativo" },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts?.take ?? 30, 100),
  })
  return rows.map(toMemoryDto)
}

export async function searchOmniAgentMemories(
  storeId: string,
  term: string,
  opts?: { take?: number },
): Promise<OmniAgentMemoryDTO[]> {
  const { sid } = await guard(storeId)
  const q = term.trim()
  if (!q) return listRecentOmniAgentMemories(sid, opts)

  const rows = await prisma.omniAgentMemory.findMany({
    where: {
      storeId: sid,
      status: "ativo",
      OR: [
        { titulo: { contains: q, mode: "insensitive" } },
        { conteudo: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts?.take ?? 50, 150),
  })
  return rows.map(toMemoryDto)
}
