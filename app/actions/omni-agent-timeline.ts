"use server"

import { prisma } from "@/lib/prisma"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { isOmniAgentMemoryType } from "@/lib/omni-agent/memory"
import {
  aggregateOmniAgentTimeline,
  mapClienteCadastradoEvent,
  mapCommandToTimelineEvent,
  mapConfigAuditToTimelineEvent,
  mapMemoryToTimelineEvent,
  mapOSEventToTimelineEvent,
  mapOSFallbackCreationEvent,
  OMNI_TIMELINE_ORIGINS,
  type OmniTimelineEvent,
  type OmniTimelineOrigin,
  type OmniTimelinePage,
  type OSEventoTimelineLike,
} from "@/lib/omni-agent/timeline"

function assertStoreId(storeId: string): string {
  const sid = storeId.trim()
  if (!sid) throw new Error("Unidade ativa obrigatória para o Omni Agent HUB.")
  return sid
}

/** Cap por fonte antes da agregação — mantém a leitura previsível mesmo em lojas com muito volume. */
const SOURCE_TAKE = 100
const OS_SOURCE_TAKE = 60
/** logs_auditoria não tem coluna storeId (só metadata JSON); usa o índice de `action` e filtra o storeId em memória. */
const CONFIG_AUDIT_TAKE = 100

export type GetOmniAgentTimelineInput = {
  clienteId?: string | null
  origens?: OmniTimelineOrigin[]
  tipos?: string[]
  de?: string
  ate?: string
  q?: string
  page?: number
  pageSize?: number
}

function isJsonArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

function isOSEventoLike(v: unknown): v is OSEventoTimelineLike {
  if (!v || typeof v !== "object") return false
  const r = v as Record<string, unknown>
  return typeof r.id === "string" && typeof r.tipo === "string" && typeof r.autor === "string" && typeof r.conteudo === "string" && typeof r.criadoEm === "string"
}

export async function getOmniAgentTimeline(
  storeId: string,
  input: GetOmniAgentTimelineInput = {},
): Promise<OmniTimelinePage> {
  const sid = assertStoreId(storeId)
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const clienteId = input.clienteId?.trim() || null
  const wantedOrigins = input.origens && input.origens.length > 0 ? input.origens : OMNI_TIMELINE_ORIGINS
  const wants = (o: OmniTimelineOrigin) => wantedOrigins.includes(o)

  const events: OmniTimelineEvent[] = []

  if (wants("memoria")) {
    const rows = await prisma.omniAgentMemory.findMany({
      where: { storeId: sid, ...(clienteId ? { clienteId } : {}) },
      orderBy: { createdAt: "desc" },
      take: SOURCE_TAKE,
    })
    for (const r of rows) {
      events.push(
        mapMemoryToTimelineEvent({
          id: r.id,
          storeId: r.storeId,
          clienteId: r.clienteId,
          tipo: isOmniAgentMemoryType(r.tipo) ? r.tipo : "observacao",
          titulo: r.titulo,
          conteudo: r.conteudo,
          tags: r.tags,
          origem: r.origem,
          criadoPor: r.criadoPor,
          status: r.status === "arquivado" ? "arquivado" : "ativo",
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }),
      )
    }
  }

  if (wants("comando")) {
    const rows = await prisma.omniAgentCommand.findMany({
      where: { storeId: sid },
      orderBy: { createdAt: "desc" },
      take: SOURCE_TAKE,
    })
    for (const r of rows) {
      const interp = r.interpretacao as { intent?: string; action?: string } | null
      events.push(
        mapCommandToTimelineEvent({
          id: r.id,
          storeId: r.storeId,
          canal: r.canal,
          comandoOriginal: r.comandoOriginal,
          interpretacao: { intent: interp?.intent ?? "UNKNOWN", action: interp?.action ?? "Comando" },
          status: r.status,
          resultado: r.resultado && typeof r.resultado === "object" ? (r.resultado as Record<string, unknown>) : null,
          executadoEm: r.executadoEm?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        }),
      )
    }
  }

  if (wants("auditoria")) {
    const rows = await prisma.logsAuditoria.findMany({
      where: { action: { in: ["OMNI_AGENT_CONFIG_SAVE", "OMNI_AGENT_CONFIG_RESET"] } },
      orderBy: { createdAt: "desc" },
      take: CONFIG_AUDIT_TAKE,
    })
    for (const r of rows) {
      let meta: Record<string, unknown> | null = null
      try {
        meta = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null
      } catch {
        meta = null
      }
      if (!meta || meta.storeId !== sid) continue
      events.push(
        mapConfigAuditToTimelineEvent({
          id: r.id,
          storeId: sid,
          action: r.action,
          detail: r.detail,
          createdAt: r.createdAt.toISOString(),
        }),
      )
    }
  }

  if (wants("ordem_servico")) {
    const rows = await prisma.ordemServico.findMany({
      where: { storeId: sid, ...(clienteId ? { clienteId } : {}) },
      orderBy: { createdAt: "desc" },
      take: OS_SOURCE_TAKE,
      select: { id: true, numero: true, clienteId: true, payload: true, createdAt: true },
    })
    for (const os of rows) {
      const payload = os.payload && typeof os.payload === "object" ? (os.payload as Record<string, unknown>) : null
      const timeline = payload && isJsonArray(payload.timeline) ? payload.timeline : null
      if (timeline && timeline.length > 0) {
        for (const raw of timeline) {
          if (!isOSEventoLike(raw)) continue
          events.push(
            mapOSEventToTimelineEvent({
              storeId: sid,
              clienteId: os.clienteId,
              osId: os.id,
              osNumero: os.numero,
              evento: raw,
            }),
          )
        }
      } else {
        events.push(
          mapOSFallbackCreationEvent({
            storeId: sid,
            clienteId: os.clienteId,
            osId: os.id,
            osNumero: os.numero,
            createdAt: os.createdAt.toISOString(),
          }),
        )
      }
    }
  }

  if (wants("cliente") && clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: clienteId, storeId: sid },
      select: { id: true, name: true, createdAt: true },
    })
    if (cliente) {
      events.push(
        mapClienteCadastradoEvent({
          id: cliente.id,
          storeId: sid,
          nome: cliente.name,
          createdAt: cliente.createdAt.toISOString(),
        }),
      )
    }
  }

  return aggregateOmniAgentTimeline(events, {
    clienteId,
    origens: input.origens,
    tipos: input.tipos,
    de: input.de,
    ate: input.ate,
    q: input.q,
    page: input.page,
    pageSize: input.pageSize,
  })
}
