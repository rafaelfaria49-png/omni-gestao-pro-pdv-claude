"use server"

import { prisma } from "@/lib/prisma"
import type { OmniAgentInterpretacao } from "@/lib/omni-agent/types"
import { INTENT_MODULE } from "@/lib/omni-agent/types"
import { interpretOmniAgentCommand, intentRequiresConfirmation } from "@/lib/omni-agent/interpret"
import { executeOmniAgentIntent } from "@/lib/omni-agent/executor"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import type { OmniAgentCommandStatus } from "@/generated/prisma"

export type OmniAgentCanal = "texto_interno" | "whatsapp" | "voz"

function assertOmniAgentModule(intent: OmniAgentInterpretacao["intent"], perms: EnterprisePermissions): string | null {
  const gate = INTENT_MODULE[intent]
  if (!gate) return intent === "UNKNOWN" ? null : "Módulo não disponível para este comando."
  if (!gate(perms)) return "Sem permissão enterprise para esta ação."
  return null
}

async function logExec(storeId: string, commandId: string, ok: boolean, detail: string) {
  try {
    await prisma.logsAuditoria.create({
      data: {
        action: ok ? "OMNI_AGENT_EXEC_OK" : "OMNI_AGENT_EXEC_ERRO",
        userLabel: "Omni Agent HUB",
        detail: detail.slice(0, 4000),
        metadata: JSON.stringify({ storeId, commandId }),
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
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const rows = await prisma.omniAgentCommand.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
  })
  return rows.map(toDto)
}

export type SubmitOmniAgentCommandInput = {
  storeId: string
  canal?: OmniAgentCanal
  comandoOriginal: string
  /** inbox: só grava; run: executa leituras na hora e coloca escritas em confirmação */
  mode: "inbox" | "run"
}

export async function submitOmniAgentCommand(input: SubmitOmniAgentCommandInput): Promise<OmniAgentCommandDTO> {
  const storeId = input.storeId.trim()
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
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const row = await prisma.omniAgentCommand.findFirst({
    where: { id: commandId, storeId },
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
    await logExec(storeId, commandId, false, modErr)
    return toDto(upd)
  }

  const exec = await executeOmniAgentIntent(storeId, interp, { clienteId: opts?.clienteId })
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
  await logExec(storeId, commandId, ok, ok ? `OK: ${exec.actionLabel}` : String((exec as { error?: string }).error ?? "erro"))
  return toDto(upd)
}

export async function rejectOmniAgentCommand(commandId: string, storeId: string): Promise<OmniAgentCommandDTO> {
  const g = await requireEnterpriseWith(storeId, (p) => p.workspace.omniAgent, "Sem permissão para o Omni Agent HUB.")
  if (!g.ok) throw new Error(g.error)

  const row = await prisma.omniAgentCommand.findFirst({ where: { id: commandId, storeId } })
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
  await logExec(storeId, commandId, false, "Recusado pelo utilizador.")
  return toDto(upd)
}
