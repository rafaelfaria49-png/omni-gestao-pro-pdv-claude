"use server"

import { prisma } from "@/lib/prisma"
import type { OmniAgentInterpretacao } from "@/lib/omni-agent/types"
import { INTENT_MODULE } from "@/lib/omni-agent/types"
import { interpretOmniAgentCommand, intentRequiresConfirmation } from "@/lib/omni-agent/interpret"
import { executeOmniAgentIntent } from "@/lib/omni-agent/executor"
import { buildFiltroPreset, getResumoExecutivo } from "@/lib/financeiro/services/relatorios-financeiros-service"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { ensureDefaultOmniAgentAutomations } from "@/lib/omni-agent/omni-automation-engine"
import { omniAgentAuditMetadata } from "@/lib/omni-agent/audit-log"
import { isOmniAgentAutomationTriggerKey, type OmniAgentAutomationTriggerKey } from "@/lib/omni-agent/omni-automation-triggers"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { OmniAgentCommandStatus } from "@/generated/prisma"

export type OmniAgentCanal = "texto_interno" | "whatsapp" | "voz"

function assertOmniAgentModule(intent: OmniAgentInterpretacao["intent"], perms: EnterprisePermissions): string | null {
  const gate = INTENT_MODULE[intent]
  if (!gate) return intent === "UNKNOWN" ? null : "Módulo não disponível para este comando."
  if (!gate(perms)) return "Sem permissão enterprise para esta ação."
  return null
}

function assertStoreId(storeId: string): string {
  const sid = storeId.trim()
  if (!sid) throw new Error("Unidade ativa obrigatória para o Omni Agent HUB.")
  return sid
}

async function logExec(storeId: string, commandId: string, ok: boolean, detail: string) {
  const sid = storeId.trim()
  if (!sid) return
  try {
    await prisma.logsAuditoria.create({
      data: {
        action: ok ? "OMNI_AGENT_EXEC_OK" : "OMNI_AGENT_EXEC_ERRO",
        userLabel: "Omni Agent HUB",
        detail: detail.slice(0, 4000),
        metadata: omniAgentAuditMetadata(sid, { commandId }),
        source: "omni_agent",
      },
    })
  } catch {
    /* ignore */
  }
}

export type OmniAgentCommandDTO = {
  id: string
  storeId: string
  canal: string
  comandoOriginal: string
  interpretacao: OmniAgentInterpretacao
  status: OmniAgentCommandStatus
  resultado: Record<string, unknown> | null
  executadoEm: string | null
  createdAt: string
}

function toDto(row: {
  id: string
  storeId: string
  canal: string
  comandoOriginal: string
  interpretacao: unknown
  status: OmniAgentCommandStatus
  resultado: unknown
  executadoEm: Date | null
  createdAt: Date
}): OmniAgentCommandDTO {
  return {
    id: row.id,
    storeId: row.storeId,
    canal: row.canal,
    comandoOriginal: row.comandoOriginal,
    interpretacao: row.interpretacao as OmniAgentInterpretacao,
    status: row.status,
    resultado: row.resultado && typeof row.resultado === "object" ? (row.resultado as Record<string, unknown>) : null,
    executadoEm: row.executadoEm?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listOmniAgentCommands(storeId: string, take = 80): Promise<OmniAgentCommandDTO[]> {
  const sid = assertStoreId(storeId)
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const rows = await prisma.omniAgentCommand.findMany({
    where: { storeId: sid },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  })
  return rows.map(toDto)
}

export type OmniAgentHubStatsDTO = {
  todayCount: number
  executed: number
  pending: number
  awaitingConfirmation: number
  error: number
  total: number
  /** Taxa simples executados / (executados + erro); null se não houver amostra. */
  accuracyPercent: number | null
}

/** Contagens reais para a Visão Geral (sem offsets mock). */
export async function getOmniAgentHubStats(storeId: string): Promise<OmniAgentHubStatsDTO> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const base = { storeId: sid }
  const [todayCount, pending, awaitingConfirmation, executed, error, total] = await Promise.all([
    prisma.omniAgentCommand.count({ where: { ...base, createdAt: { gte: start } } }),
    prisma.omniAgentCommand.count({ where: { ...base, status: "PENDENTE" } }),
    prisma.omniAgentCommand.count({ where: { ...base, status: "AGUARDANDO_CONFIRMACAO" } }),
    prisma.omniAgentCommand.count({ where: { ...base, status: "EXECUTADO" } }),
    prisma.omniAgentCommand.count({ where: { ...base, status: "ERRO" } }),
    prisma.omniAgentCommand.count({ where: base }),
  ])

  const denom = executed + error
  const accuracyPercent = denom > 0 ? Math.round((100 * executed) / denom) : null

  return {
    todayCount,
    executed,
    pending,
    awaitingConfirmation,
    error,
    total,
    accuracyPercent,
  }
}

export type SubmitOmniAgentCommandInput = {
  storeId: string
  canal?: OmniAgentCanal
  comandoOriginal: string
  /** inbox: só grava; run: executa leituras na hora e coloca escritas em confirmação */
  mode: "inbox" | "run"
}

export async function submitOmniAgentCommand(input: SubmitOmniAgentCommandInput): Promise<OmniAgentCommandDTO> {
  const storeId = assertStoreId(input.storeId)
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const interp = interpretOmniAgentCommand(input.comandoOriginal)
  const modErr = assertOmniAgentModule(interp.intent, g.permissions)
  if (modErr && interp.intent !== "UNKNOWN") {
    const row = await prisma.omniAgentCommand.create({
      data: {
        storeId,
        canal: input.canal ?? "texto_interno",
        comandoOriginal: input.comandoOriginal.trim(),
        interpretacao: { ...interp, moduleError: modErr } as object,
        status: "ERRO",
        resultado: { error: modErr },
        executadoEm: new Date(),
      },
    })
    await logExec(storeId, row.id, false, modErr)
    return toDto(row)
  }

  const canal = input.canal ?? "texto_interno"
  const texto = input.comandoOriginal.trim()

  if (input.mode === "inbox") {
    const row = await prisma.omniAgentCommand.create({
      data: {
        storeId,
        canal,
        comandoOriginal: texto,
        interpretacao: interp as object,
        status: "PENDENTE",
      },
    })
    return toDto(row)
  }

  const needsConfirm = intentRequiresConfirmation(interp.intent) || interp.requiresConfirmation

  if (needsConfirm) {
    const row = await prisma.omniAgentCommand.create({
      data: {
        storeId,
        canal,
        comandoOriginal: texto,
        interpretacao: interp as object,
        status: "AGUARDANDO_CONFIRMACAO",
      },
    })
    return toDto(row)
  }

  const exec = await executeOmniAgentIntent(storeId, interp)
  const ok = exec.ok
  const row = await prisma.omniAgentCommand.create({
    data: {
      storeId,
      canal,
      comandoOriginal: texto,
      interpretacao: interp as object,
      status: ok ? "EXECUTADO" : "ERRO",
      resultado: ok
        ? { ...exec.payload, actionLabel: exec.actionLabel }
        : { error: (exec as { error?: string }).error, actionLabel: (exec as { actionLabel?: string }).actionLabel },
      executadoEm: new Date(),
    },
  })
  await logExec(
    storeId,
    row.id,
    ok,
    ok ? `OK: ${exec.actionLabel}` : String((exec as { error?: string }).error ?? "erro"),
  )
  return toDto(row)
}

export async function confirmOmniAgentCommand(
  commandId: string,
  storeId: string,
  opts?: { clienteId?: string },
): Promise<OmniAgentCommandDTO> {
  const sid = assertStoreId(storeId)
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const row = await prisma.omniAgentCommand.findFirst({
    where: { id: commandId, storeId: sid },
  })
  if (!row) throw new Error("Comando não encontrado.")
  if (row.status !== "PENDENTE" && row.status !== "AGUARDANDO_CONFIRMACAO") {
    throw new Error("Este comando não está aguardando execução.")
  }

  const interp = row.interpretacao as unknown as OmniAgentInterpretacao
  const modErr = assertOmniAgentModule(interp.intent, g.permissions)
  if (modErr) {
    const upd = await prisma.omniAgentCommand.update({
      where: { id: commandId },
      data: {
        status: "ERRO",
        resultado: { error: modErr },
        executadoEm: new Date(),
      },
    })
    await logExec(sid, commandId, false, modErr)
    return toDto(upd)
  }

  const exec = await executeOmniAgentIntent(sid, interp, { clienteId: opts?.clienteId })
  const ambiguous = !exec.ok && "ambiguousClientes" in exec && exec.ambiguousClientes
  if (ambiguous) {
    const upd = await prisma.omniAgentCommand.update({
      where: { id: commandId },
      data: {
        status: "AGUARDANDO_CONFIRMACAO",
        resultado: { ambiguousClientes: exec.ambiguousClientes, error: exec.error },
      },
    })
    return toDto(upd)
  }

  const ok = exec.ok
  const upd = await prisma.omniAgentCommand.update({
    where: { id: commandId },
    data: {
      status: ok ? "EXECUTADO" : "ERRO",
      resultado: ok
        ? { ...exec.payload, actionLabel: exec.actionLabel }
        : { error: (exec as { error?: string }).error, actionLabel: (exec as { actionLabel?: string }).actionLabel },
      executadoEm: new Date(),
    },
  })
  await logExec(sid, commandId, ok, ok ? `OK: ${exec.actionLabel}` : String((exec as { error?: string }).error ?? "erro"))
  return toDto(upd)
}

export async function rejectOmniAgentCommand(commandId: string, storeId: string): Promise<OmniAgentCommandDTO> {
  const sid = assertStoreId(storeId)
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const row = await prisma.omniAgentCommand.findFirst({ where: { id: commandId, storeId: sid } })
  if (!row) throw new Error("Comando não encontrado.")
  if (row.status !== "PENDENTE" && row.status !== "AGUARDANDO_CONFIRMACAO") {
    throw new Error("Somente pendentes podem ser recusados.")
  }
  const upd = await prisma.omniAgentCommand.update({
    where: { id: commandId },
    data: {
      status: "ERRO",
      resultado: { error: "Recusado pelo utilizador." },
      executadoEm: new Date(),
    },
  })
  await logExec(sid, commandId, false, "Recusado pelo utilizador.")
  return toDto(upd)
}

/** Indica se o ambiente tem credenciais WhatsApp Cloud API (Meta). Não implica número por loja. */
export type OmniAgentWhatsAppCloudStatusDTO = {
  configured: boolean
  phoneNumberIdLast4?: string
}

export async function getOmniAgentWhatsAppCloudStatus(storeId: string): Promise<OmniAgentWhatsAppCloudStatusDTO> {
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const id = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
  const token = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim()
  const configured = id.length > 0 && token.length > 0
  return {
    configured,
    phoneNumberIdLast4: configured && id.length >= 4 ? id.slice(-4) : configured ? id : undefined,
  }
}

export type OmniAgentIntentCountDTO = { intent: string; count: number }

export type OmniAgentReportsSnapshotDTO = {
  stats: OmniAgentHubStatsDTO
  intentCounts: OmniAgentIntentCountDTO[]
  financeiroHoje: Awaited<ReturnType<typeof getResumoExecutivo>> | null
  financeiroSemPermissao: boolean
}

export async function getOmniAgentReportsSnapshot(storeId: string): Promise<OmniAgentReportsSnapshotDTO> {
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const sid = storeId.trim()
  const [stats, rows] = await Promise.all([
    getOmniAgentHubStats(sid),
    prisma.omniAgentCommand.findMany({
      where: { storeId: sid },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: { interpretacao: true },
    }),
  ])

  const map = new Map<string, number>()
  for (const r of rows) {
    const inter = r.interpretacao as OmniAgentInterpretacao | null
    const k = inter?.intent ?? "UNKNOWN"
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const intentCounts = [...map.entries()]
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count)

  let financeiroHoje: Awaited<ReturnType<typeof getResumoExecutivo>> | null = null
  const financeGate = INTENT_MODULE.FINANCE_SUMMARY
  const financeiroSemPermissao = !financeGate?.(g.permissions)

  if (financeGate?.(g.permissions)) {
    try {
      financeiroHoje = await getResumoExecutivo(sid, buildFiltroPreset("hoje"))
    } catch {
      financeiroHoje = null
    }
  }

  return { stats, intentCounts, financeiroHoje, financeiroSemPermissao }
}

export type OmniAgentAutomationDTO = {
  id: string
  storeId: string
  name: string
  triggerKey: string
  enabled: boolean
  commandTemplate: string
  priority: number
  runCount: number
  createdAt: string
  updatedAt: string
}

export type OmniAgentAutomationRunDTO = {
  id: string
  automationId: string
  eventKey: string
  entityId: string | null
  comandoGerado: string
  commandId: string | null
  createdAt: string
}

function mapAutomationRow(r: {
  id: string
  storeId: string
  name: string
  triggerKey: string
  enabled: boolean
  commandTemplate: string
  priority: number
  createdAt: Date
  updatedAt: Date
  _count: { runs: number }
}): OmniAgentAutomationDTO {
  return {
    id: r.id,
    storeId: r.storeId,
    name: r.name,
    triggerKey: r.triggerKey,
    enabled: r.enabled,
    commandTemplate: r.commandTemplate,
    priority: r.priority,
    runCount: r._count.runs,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function listOmniAgentAutomations(storeId: string): Promise<OmniAgentAutomationDTO[]> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  await ensureDefaultOmniAgentAutomations(sid)

  const rows = await prisma.omniAgentAutomation.findMany({
    where: { storeId: sid },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { runs: true } } },
  })
  return rows.map(mapAutomationRow)
}

export async function createOmniAgentAutomation(
  storeId: string,
  input: {
    name: string
    triggerKey: OmniAgentAutomationTriggerKey
    commandTemplate: string
    enabled?: boolean
    priority?: number
  },
): Promise<OmniAgentAutomationDTO> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  if (!isOmniAgentAutomationTriggerKey(input.triggerKey)) {
    throw new Error("Gatilho inválido.")
  }
  const name = input.name.trim()
  if (!name) throw new Error("Nome obrigatório.")
  const tpl = input.commandTemplate.trim()
  if (!tpl) throw new Error("Modelo de comando obrigatório.")

  const row = await prisma.omniAgentAutomation.create({
    data: {
      storeId: sid,
      name,
      triggerKey: input.triggerKey,
      enabled: input.enabled ?? false,
      commandTemplate: tpl,
      priority: input.priority ?? 0,
    },
    include: { _count: { select: { runs: true } } },
  })
  return mapAutomationRow(row)
}

export async function updateOmniAgentAutomation(
  storeId: string,
  id: string,
  input: { name?: string; commandTemplate?: string; priority?: number },
): Promise<OmniAgentAutomationDTO> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const existing = await prisma.omniAgentAutomation.findFirst({ where: { id, storeId: sid } })
  if (!existing) throw new Error("Automação não encontrada.")

  const name = input.name !== undefined ? input.name.trim() : undefined
  if (name !== undefined && !name) throw new Error("Nome inválido.")
  const tpl = input.commandTemplate !== undefined ? input.commandTemplate.trim() : undefined
  if (tpl !== undefined && !tpl) throw new Error("Modelo de comando inválido.")

  const row = await prisma.omniAgentAutomation.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(tpl !== undefined ? { commandTemplate: tpl } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
    include: { _count: { select: { runs: true } } },
  })
  return mapAutomationRow(row)
}

export async function setOmniAgentAutomationEnabled(
  storeId: string,
  id: string,
  enabled: boolean,
): Promise<OmniAgentAutomationDTO> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const res = await prisma.omniAgentAutomation.updateMany({ where: { id, storeId: sid }, data: { enabled } })
  if (res.count === 0) throw new Error("Automação não encontrada.")

  const updated = await prisma.omniAgentAutomation.findFirstOrThrow({
    where: { id, storeId: sid },
    include: { _count: { select: { runs: true } } },
  })
  return mapAutomationRow(updated)
}

export async function deleteOmniAgentAutomation(storeId: string, id: string): Promise<void> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const r = await prisma.omniAgentAutomation.deleteMany({ where: { id, storeId: sid } })
  if (r.count === 0) throw new Error("Automação não encontrada.")
}

export async function listOmniAgentAutomationRuns(
  storeId: string,
  opts?: { automationId?: string; take?: number },
): Promise<OmniAgentAutomationRunDTO[]> {
  const sid = storeId.trim()
  const g = await requireEnterpriseWith(sid, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const take = Math.min(opts?.take ?? 40, 100)
  const rows = await prisma.omniAgentAutomationRun.findMany({
    where: {
      storeId: sid,
      ...(opts?.automationId ? { automationId: opts.automationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  })
  return rows.map((r) => ({
    id: r.id,
    automationId: r.automationId,
    eventKey: r.eventKey,
    entityId: r.entityId,
    comandoGerado: r.comandoGerado,
    commandId: r.commandId,
    createdAt: r.createdAt.toISOString(),
  }))
}
