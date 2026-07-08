import type { OmniAgentMemoryDTO } from "./memory"
import { canalDisplayLabel } from "./hub-display"

/**
 * Timeline Operacional Real — agrega fatos já persistidos de fontes existentes
 * (memória, comandos, auditoria de configuração, eventos de OS, cadastro de cliente).
 * Sem IA, sem inferência, sem resumo automático: cada evento é um registro real,
 * com origem e referência rastreáveis. Não é a futura Timeline Inteligente do Omni Core.
 */
export const OMNI_TIMELINE_ORIGINS = ["memoria", "comando", "auditoria", "ordem_servico", "cliente"] as const
export type OmniTimelineOrigin = (typeof OMNI_TIMELINE_ORIGINS)[number]

export const OMNI_TIMELINE_TYPES = [
  "memoria_criada",
  "memoria_arquivada",
  "comando_executado",
  "comando_erro",
  "comando_pendente",
  "comando_aguardando_confirmacao",
  "configuracao_atualizada",
  "os_criacao",
  "os_evento",
  "cliente_cadastrado",
] as const
export type OmniTimelineEventType = (typeof OMNI_TIMELINE_TYPES)[number]

export const OMNI_TIMELINE_PRIORITIES = ["baixa", "media", "alta"] as const
export type OmniTimelinePriority = (typeof OMNI_TIMELINE_PRIORITIES)[number]

export type OmniTimelineReference = { kind: string; id: string } | null

export type OmniTimelineEvent = {
  id: string
  storeId: string
  clienteId: string | null
  origem: OmniTimelineOrigin
  tipo: OmniTimelineEventType
  titulo: string
  descricao: string
  referencia: OmniTimelineReference
  data: string
  responsavel: string
  icone: string
  prioridade: OmniTimelinePriority
  payloadResumo: Record<string, unknown> | null
}

/* ---------- Mapeadores (fonte real → evento de timeline) ---------- */

export function mapMemoryToTimelineEvent(m: OmniAgentMemoryDTO): OmniTimelineEvent {
  const arquivada = m.status === "arquivado"
  return {
    id: `memoria:${m.id}`,
    storeId: m.storeId,
    clienteId: m.clienteId,
    origem: "memoria",
    tipo: arquivada ? "memoria_arquivada" : "memoria_criada",
    titulo: m.titulo,
    descricao: m.conteudo,
    referencia: { kind: "omni_agent_memory", id: m.id },
    data: arquivada ? m.updatedAt : m.createdAt,
    responsavel: m.criadoPor || "—",
    icone: "brain",
    prioridade: m.tipo === "incidente" ? "alta" : m.tipo === "lembrete" || m.tipo === "decisao" ? "media" : "baixa",
    payloadResumo: { tipoMemoria: m.tipo, tags: m.tags, origem: m.origem },
  }
}

export type OmniAgentCommandLike = {
  id: string
  storeId: string
  canal: string
  comandoOriginal: string
  interpretacao: { intent: string; action: string }
  status: string
  resultado: Record<string, unknown> | null
  executadoEm: string | null
  createdAt: string
}

function commandTipo(status: string): OmniTimelineEventType {
  if (status === "ERRO") return "comando_erro"
  if (status === "AGUARDANDO_CONFIRMACAO") return "comando_aguardando_confirmacao"
  if (status === "PENDENTE") return "comando_pendente"
  return "comando_executado"
}

export function mapCommandToTimelineEvent(cmd: OmniAgentCommandLike): OmniTimelineEvent {
  const clienteId = typeof cmd.resultado?.clienteId === "string" ? (cmd.resultado.clienteId as string) : null
  return {
    id: `comando:${cmd.id}`,
    storeId: cmd.storeId,
    clienteId,
    origem: "comando",
    tipo: commandTipo(cmd.status),
    titulo: cmd.interpretacao.action || cmd.interpretacao.intent,
    descricao: cmd.comandoOriginal,
    referencia: { kind: "omni_agent_command", id: cmd.id },
    data: cmd.executadoEm ?? cmd.createdAt,
    responsavel: canalDisplayLabel(cmd.canal),
    icone: "terminal",
    prioridade: cmd.status === "ERRO" ? "alta" : cmd.status === "AGUARDANDO_CONFIRMACAO" ? "media" : "baixa",
    payloadResumo: { intent: cmd.interpretacao.intent, status: cmd.status, canal: cmd.canal },
  }
}

export type OmniAgentConfigAuditLike = {
  id: string
  storeId: string
  action: string
  detail: string
  createdAt: string
}

export function mapConfigAuditToTimelineEvent(row: OmniAgentConfigAuditLike): OmniTimelineEvent {
  return {
    id: `auditoria:${row.id}`,
    storeId: row.storeId,
    clienteId: null,
    origem: "auditoria",
    tipo: "configuracao_atualizada",
    titulo: row.action === "OMNI_AGENT_CONFIG_RESET" ? "Configuração restaurada ao padrão" : "Configuração do agente atualizada",
    descricao: row.detail,
    referencia: { kind: "logs_auditoria", id: row.id },
    data: row.createdAt,
    responsavel: "Omni Agent HUB",
    icone: "settings",
    prioridade: "baixa",
    payloadResumo: null,
  }
}

const OS_EVENTO_LABELS: Record<string, string> = {
  criacao: "OS aberta",
  mudanca_status: "Status alterado",
  atribuicao_tecnico: "Técnico atribuído",
  orcamento_criado: "Orçamento criado",
  orcamento_enviado: "Orçamento enviado",
  orcamento_item_adicionado: "Item de orçamento adicionado",
  orcamento_item_removido: "Item de orçamento removido",
  orcamento_atualizado: "Orçamento atualizado",
  orcamento_aprovado: "Orçamento aprovado",
  orcamento_recusado: "Orçamento recusado",
  diagnostico_registrado: "Diagnóstico registrado",
  servico_iniciado: "Serviço iniciado",
  servico_concluido: "Serviço concluído",
}

function humanizeOSEventoTipo(tipo: string): string {
  return OS_EVENTO_LABELS[tipo] ?? tipo.replace(/_/g, " ")
}

export type OSEventoTimelineLike = {
  id: string
  tipo: string
  titulo?: string
  autor: string
  conteudo: string
  criadoEm: string
}

export function mapOSEventToTimelineEvent(params: {
  storeId: string
  clienteId: string | null
  osId: string
  osNumero: string | null
  evento: OSEventoTimelineLike
}): OmniTimelineEvent {
  return {
    id: `os:${params.osId}:${params.evento.id}`,
    storeId: params.storeId,
    clienteId: params.clienteId,
    origem: "ordem_servico",
    tipo: "os_evento",
    titulo: params.evento.titulo || humanizeOSEventoTipo(params.evento.tipo),
    descricao: params.evento.conteudo,
    referencia: { kind: "ordem_servico", id: params.osId },
    data: params.evento.criadoEm,
    responsavel: params.evento.autor,
    icone: "wrench",
    prioridade: /cancel|recusad/i.test(params.evento.conteudo + params.evento.tipo) ? "media" : "baixa",
    payloadResumo: { osNumero: params.osNumero, eventoTipo: params.evento.tipo },
  }
}

export function mapOSFallbackCreationEvent(params: {
  storeId: string
  clienteId: string | null
  osId: string
  osNumero: string | null
  createdAt: string
}): OmniTimelineEvent {
  return {
    id: `os:${params.osId}:criacao`,
    storeId: params.storeId,
    clienteId: params.clienteId,
    origem: "ordem_servico",
    tipo: "os_criacao",
    titulo: "Ordem de serviço aberta",
    descricao: params.osNumero ? `OS ${params.osNumero}` : `OS ${params.osId}`,
    referencia: { kind: "ordem_servico", id: params.osId },
    data: params.createdAt,
    responsavel: "Sistema",
    icone: "wrench",
    prioridade: "baixa",
    payloadResumo: { osNumero: params.osNumero },
  }
}

export function mapClienteCadastradoEvent(c: {
  id: string
  storeId: string
  nome: string
  createdAt: string
}): OmniTimelineEvent {
  return {
    id: `cliente:${c.id}:cadastro`,
    storeId: c.storeId,
    clienteId: c.id,
    origem: "cliente",
    tipo: "cliente_cadastrado",
    titulo: "Cliente cadastrado",
    descricao: c.nome,
    referencia: { kind: "cliente", id: c.id },
    data: c.createdAt,
    responsavel: "Cadastro",
    icone: "user",
    prioridade: "baixa",
    payloadResumo: null,
  }
}

/* ---------- Agregação pura: filtro + ordenação + paginação ---------- */

export type OmniTimelineFilters = {
  clienteId?: string | null
  origens?: OmniTimelineOrigin[]
  tipos?: string[]
  de?: string
  ate?: string
  q?: string
  page?: number
  pageSize?: number
}

export type OmniTimelinePage = {
  events: OmniTimelineEvent[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export const OMNI_TIMELINE_DEFAULT_PAGE_SIZE = 30
export const OMNI_TIMELINE_MAX_PAGE_SIZE = 100

/**
 * Só organiza fatos já mapeados — filtra, ordena por data desc e pagina.
 * Não busca dados, não infere, não gera conteúdo.
 */
export function aggregateOmniAgentTimeline(
  all: OmniTimelineEvent[],
  filters: OmniTimelineFilters = {},
): OmniTimelinePage {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = Math.min(Math.max(1, Math.trunc(filters.pageSize ?? OMNI_TIMELINE_DEFAULT_PAGE_SIZE)), OMNI_TIMELINE_MAX_PAGE_SIZE)

  const deTime = filters.de ? new Date(filters.de).getTime() : null
  const ateTime = filters.ate ? new Date(filters.ate).getTime() : null
  const q = filters.q?.trim().toLowerCase() || null

  const filtered = all.filter((ev) => {
    if (filters.clienteId && ev.clienteId !== filters.clienteId) return false
    if (filters.origens && filters.origens.length > 0 && !filters.origens.includes(ev.origem)) return false
    if (filters.tipos && filters.tipos.length > 0 && !filters.tipos.includes(ev.tipo)) return false
    if (deTime !== null || ateTime !== null) {
      const t = new Date(ev.data).getTime()
      if (deTime !== null && t < deTime) return false
      if (ateTime !== null && t > ateTime) return false
    }
    if (q && !(ev.titulo.toLowerCase().includes(q) || ev.descricao.toLowerCase().includes(q))) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  const total = sorted.length
  const start = (page - 1) * pageSize
  const events = sorted.slice(start, start + pageSize)

  return { events, total, page, pageSize, hasMore: start + events.length < total }
}
