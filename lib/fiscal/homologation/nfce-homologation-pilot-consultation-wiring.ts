/**
 * Wiring ARMADO da CONSULTA de reconciliação do piloto (GOAL 022B).
 *
 * Não é uma segunda EMISSAO: o ledger one-shot de documento já foi consumido.
 * Drena EXATAMENTE o job `CONSULTA` apontado via `NFeConsultaProtocolo4` / HOMOLOGACAO.
 * `authorizeExactRetransmission` é no-op — 217 não revive o job EMISSAO.
 */
import { prisma } from "@/lib/prisma"
import { resolveActiveCertificate } from "@/lib/fiscal/certificate/resolve-active-certificate"
import { createPrismaUncertainStatePersistence } from "@/lib/fiscal/emission/prisma-uncertain-state-persistence"
import { createUncertainStateJobExecutor } from "@/lib/fiscal/emission/uncertain-state-job-executor"
import type {
  FinalizedDocumentPreparer,
  UncertainStatePersistence,
} from "@/lib/fiscal/emission/uncertain-state.types"
import { SefazDiretoProvider } from "@/lib/fiscal/provider/sefaz/sefaz-direto-provider"
import { SefazSoapTransport } from "@/lib/fiscal/provider/sefaz/sefaz-soap-transport"
import { createPrismaFiscalQueueWorkerPorts, eligibleWhere } from "@/lib/fiscal/queue/prisma-queue-worker"
import { drainFiscalQueue } from "@/lib/fiscal/queue/queue-worker"
import type {
  FiscalQueueExecutionResult,
  FiscalQueueJob,
  FiscalQueueWorkerPorts,
} from "@/lib/fiscal/queue/queue.types"
import {
  createArmedPilotSefazGuardPorts,
  type ArmedPilotEmissionDeps,
  type PilotEmissionRunReport,
} from "./nfce-homologation-pilot-armed-wiring"
import {
  createPilotConsultationExternalAuthority,
  evaluatePilotEmissionWindow,
  PILOT_EMISSION_HOMOLOGATION_WINDOW,
  pilotConsultationCapability,
} from "./pilot-emission-gate"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

const CONSULTA_PREPARER: FinalizedDocumentPreparer = {
  async prepare() {
    throw new Error("CONSULTA do piloto não recompõe o XML; retranmissão de EMISSAO é vedada.")
  },
}

function withoutExactRetransmission(
  base: UncertainStatePersistence,
  auditNotFound: UncertainStatePersistence["authorizeExactRetransmission"],
): UncertainStatePersistence {
  return {
    ...base,
    authorizeExactRetransmission: auditNotFound,
  }
}

function toQueueJob(locked: Record<string, unknown>): FiscalQueueJob {
  return {
    id: String(locked.id ?? ""),
    storeId: String(locked.storeId ?? ""),
    vendaId: String(locked.vendaId ?? ""),
    notaFiscalId: locked.notaFiscalId == null ? null : String(locked.notaFiscalId),
    tipo: String(locked.tipo ?? "") as FiscalQueueJob["tipo"],
    status: String(locked.status ?? "") as FiscalQueueJob["status"],
    tentativas: Number(locked.tentativas ?? 0),
    maxTentativas: Number(locked.maxTentativas ?? 1),
    proximaTentativaEm: locked.proximaTentativaEm instanceof Date ? locked.proximaTentativaEm : null,
    prioridade: Number(locked.prioridade ?? 0),
    lockOwner: locked.lockOwner == null ? null : String(locked.lockOwner),
    lockedAt: locked.lockedAt instanceof Date ? locked.lockedAt : null,
    lockExpiresAt: locked.lockExpiresAt instanceof Date ? locked.lockExpiresAt : null,
    dedupeKey: locked.dedupeKey == null ? null : String(locked.dedupeKey),
    payload: Object.keys(record(locked.payload)).length > 0 ? record(locked.payload) : null,
    ultimoErro: locked.ultimoErro == null ? null : String(locked.ultimoErro),
    concluidoEm: locked.concluidoEm instanceof Date ? locked.concluidoEm : null,
    createdAt: locked.createdAt instanceof Date ? locked.createdAt : new Date(0),
    updatedAt: locked.updatedAt instanceof Date ? locked.updatedAt : new Date(0),
  }
}

export function createArmedNfceHomologationPilotConsultationWiring(input: {
  readonly jobId: string
  readonly storeId: string
  readonly deps?: ArmedPilotEmissionDeps
}): { readonly execute: (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult>; readonly ports: FiscalQueueWorkerPorts } {
  const client = input.deps?.client ?? (prisma as never)
  const windowConfig = input.deps?.window ?? PILOT_EMISSION_HOMOLOGATION_WINDOW
  const clock = input.deps?.clock ?? (() => new Date())
  const persistence = withoutExactRetransmission(
    input.deps?.persistence ?? createPrismaUncertainStatePersistence(client as never),
    async ({ document, now }) => {
      const logClient = client as {
        fiscalLog?: { create: (args: unknown) => Promise<unknown> }
      }
      await logClient.fiscalLog?.create?.({
        data: {
          storeId: document.storeId,
          vendaId: document.vendaId,
          notaFiscalId: document.notaFiscalId,
          nivel: "WARN",
          acao: "fiscal.pilot.consulta_not_found_sem_retransmissao",
          mensagem:
            "Consulta do piloto classificou NOT_FOUND; retranmissão de EMISSAO bloqueada neste GOAL.",
          operador: "fiscal-pilot-consulta",
          detalhe: { at: now.toISOString(), chaveLen: String(document.chaveAcesso ?? "").length },
        },
      })
    },
  )

  const execute = async (job: FiscalQueueJob): Promise<FiscalQueueExecutionResult> => {
    const negado = (code: string, mensagem: string): FiscalQueueExecutionResult => ({
      kind: "terminal",
      code,
      mensagem,
      simulado: false,
      externalTransmissionAttempted: false,
      providerInvoked: false,
    })
    if (job.tipo !== "CONSULTA") {
      return negado("pilot_consulta_tipo_nao_suportado", "Modo armado de consulta executa somente job CONSULTA.")
    }
    if (job.id !== input.jobId || job.storeId !== input.storeId) {
      return negado("pilot_consulta_job_incoerente", "Job não corresponde ao autorizado para esta consulta.")
    }
    if (!job.notaFiscalId) {
      return negado("nota_fiscal_ausente", "Job sem notaFiscalId; execução fail-closed.")
    }

    const guardPorts = createArmedPilotSefazGuardPorts(client, input.storeId, {
      jobId: input.jobId,
      resolveCertificate: input.deps?.resolveCertificate ?? resolveActiveCertificate,
      xsdAdapter: input.deps?.xsdAdapter,
    })
    const pilotStoreId = texto(await guardPorts.resolvePilotStoreId())
    if (!pilotStoreId || pilotStoreId !== job.storeId) {
      return negado("loja_fora_do_piloto", "Loja do job não é a loja-piloto resolvida.")
    }

    const config = record(
      await client.configuracaoFiscalLoja.findUnique({
        where: { storeId: job.storeId },
        select: { provider: true, ambiente: true, modeloFiscal: true, fiscalEnabled: true },
      }),
    )
    if (
      texto(config.provider) !== "SEFAZ_DIRETO" ||
      texto(config.ambiente) !== "HOMOLOGACAO" ||
      texto(config.modeloFiscal) !== "NFCE" ||
      config.fiscalEnabled !== true
    ) {
      return negado(
        "contexto_piloto_invalido",
        "Configuração da loja fora do piloto NFCE/HOMOLOGACAO/SEFAZ_DIRETO com kill-switch armado.",
      )
    }

    const windowStatus = evaluatePilotEmissionWindow(windowConfig, clock())
    if (!windowStatus.active) {
      return negado(
        `pilot_consulta_gate_${windowStatus.reason}`,
        "Gate efêmero da consulta do piloto não está vigente; execução bloqueada.",
      )
    }

    const capability = pilotConsultationCapability(
      windowConfig,
      { jobId: job.id, storeId: job.storeId },
      clock(),
    )
    if (!capability || capability.allowExternalProviderExecution !== true) {
      return negado(
        "pilot_consulta_capability_indisponivel",
        "Capability de consulta não nasceu da janela vigente; bloqueado.",
      )
    }

    const authority = createPilotConsultationExternalAuthority(
      windowConfig,
      { jobId: job.id, storeId: job.storeId },
      clock(),
    )
    const transport =
      input.deps?.transport ??
      (authority ? new SefazSoapTransport({ externalTransmissionAuthority: authority }) : null)
    if (!transport) {
      return negado(
        "pilot_consulta_authority_indisponivel",
        "Authority externa de NFeConsultaProtocolo4 não nasceu da janela; bloqueado.",
      )
    }

    const provider = new SefazDiretoProvider({ ports: guardPorts, transport })
    return createUncertainStateJobExecutor({
      persistence,
      preparer: CONSULTA_PREPARER,
      provider,
      now: clock,
      capability,
    })(job)
  }

  const basePorts = createPrismaFiscalQueueWorkerPorts(
    client as never,
    async () => {
      throw new Error("Emissor legado inacessível na consulta armada do piloto.")
    },
    execute,
  )
  const scopedPorts: FiscalQueueWorkerPorts = {
    ...basePorts,
    readPauseSnapshot: async () => ({
      globalPaused: false,
      globalSource: "none",
      pausedStoreIds: [],
    }),
    acquireNextJob: async (acquireInput) => {
      const where = {
        AND: [
          { id: input.jobId, storeId: input.storeId, tipo: "CONSULTA" },
          eligibleWhere(acquireInput.now, []),
        ],
      }
      const acquired = await client.fiscalEmissaoJob.updateMany({
        where,
        data: {
          status: "PROCESSANDO",
          lockOwner: acquireInput.workerId,
          lockedAt: acquireInput.now,
          lockExpiresAt: new Date(acquireInput.now.getTime() + acquireInput.leaseMs),
          tentativas: { increment: 1 },
        },
      })
      if (acquired.count !== 1) return null
      const locked = record(
        await client.fiscalEmissaoJob.findUnique({
          where: { id: input.jobId },
          select: {
            id: true, storeId: true, vendaId: true, notaFiscalId: true, tipo: true, status: true,
            tentativas: true, maxTentativas: true, proximaTentativaEm: true, prioridade: true,
            lockOwner: true, lockedAt: true, lockExpiresAt: true, dedupeKey: true, payload: true,
            ultimoErro: true, concluidoEm: true, createdAt: true, updatedAt: true,
          },
        }),
      )
      if (!locked.id) return null
      return { job: toQueueJob(locked), takeover: false }
    },
  }

  return { execute, ports: scopedPorts }
}

/**
 * Drena EXATAMENTE uma vez o job CONSULTA apontado. Recusa EMISSAO.
 */
export async function executePilotHomologationConsultationTransmission(
  input: {
    readonly jobId: string
    readonly storeId: string
    readonly workerId?: string
  },
  deps: ArmedPilotEmissionDeps = {},
): Promise<PilotEmissionRunReport> {
  const jobId = input.jobId.trim()
  const storeId = input.storeId.trim()
  if (!jobId || !storeId) {
    return { ok: false, code: "parametros_invalidos", mensagem: "jobId e storeId são obrigatórios.", outcome: null }
  }
  const client = deps.client ?? (prisma as never)
  const raw = await client.fiscalEmissaoJob.findUnique({
    where: { id: jobId },
    select: { id: true, storeId: true, tipo: true },
  })
  const jobRow = record(raw)
  if (!raw || String(jobRow.id ?? "") !== jobId) {
    return { ok: false, code: "job_nao_encontrado", mensagem: "Job da consulta do piloto não encontrado.", outcome: null }
  }
  if (String(jobRow.storeId ?? "") !== storeId) {
    return { ok: false, code: "pilot_consulta_job_incoerente", mensagem: "Job pertence a outra loja.", outcome: null }
  }
  if (String(jobRow.tipo ?? "") !== "CONSULTA") {
    return {
      ok: false,
      code: "pilot_consulta_tipo_nao_suportado",
      mensagem: "Somente job CONSULTA pode ser apontado à reconciliação do piloto.",
      outcome: null,
    }
  }

  const wiring = createArmedNfceHomologationPilotConsultationWiring({ jobId, storeId, deps })
  const report = await drainFiscalQueue(
    {
      workerId: input.workerId?.trim() || `homologacao-consulta:${jobId.slice(0, 8)}`,
      batchSize: 1,
      now: deps.clock,
    },
    wiring.ports,
  )
  const item = report.items[0]
  return {
    ok: item?.status === "concluido",
    code: item?.status ?? "pilot_consulta_sem_execucao",
    mensagem:
      item?.status === "concluido"
        ? "Consulta do piloto executada pelo pipeline da fila."
        : "Execução da consulta terminou sem conclusão; ver o desfecho do item drenado.",
    outcome: item ? { status: item.status, mensagem: item.mensagem } : null,
  }
}
