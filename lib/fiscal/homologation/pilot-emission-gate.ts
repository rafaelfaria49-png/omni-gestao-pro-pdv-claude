/**
 * Gate efêmero da transmissão NORMAL de EMISSAO do piloto de homologação (GOAL 022).
 *
 * Reutiliza o PADRÃO de segurança provado em
 * `lib/fiscal/contingencia/contingency-homologation-gate.ts` — NÃO a sua semântica:
 * aquele gate autoriza o drill de CONTINGÊNCIA; este autoriza UMA execução do job
 * `EMISSAO` normal da loja-piloto em `NFeAutorizacao4`/HOMOLOGACAO.
 *
 * Este gate nasce DORMENTE e separado:
 *
 *   PILOT_EMISSION_HOMOLOGATION_WINDOW = { activationId: null, notBeforeUtc: null, expiresAtUtc: null }
 *
 * Ativar exige commit revisado preenchendo os três valores (UTC estrito,
 * `notBefore < expiresAt`, janela ≤ 15 minutos). Nenhuma env/feature flag é chave de
 * ativação. Config ausente, parcial, inválida, futura ou expirada falha FECHADA antes
 * de cofre, A1 e rede.
 *
 * Consumo GLOBAL e PERSISTENTE antes da rede — transação única (ledger
 * `FiscalEmissaoJob` + `FiscalLog`) usando o primitive `@@unique([storeId, dedupeKey])`
 * já provado. O `dedupeKey` NÃO inclui jobId: é one-shot POR ATIVAÇÃO — exatamente um
 * documento transmitido por acionamento (`MAX_DOCUMENT_TRANSMISSIONS = 1` como
 * enforcement de runtime persistente, não constante documental). Replay, cold start,
 * concorrência e falha de persistência colapsam no mesmo bloqueio: nenhum segundo
 * transporte nasce.
 *
 * Pós-commit nasce a capability POSITIVA por execução (binding opaco WeakMap, par
 * (loja, job)) e a authority externa do transporte — jamais flags globais.
 */
import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"
import type { FiscalExternalExecutionCapability } from "@/lib/fiscal/emission/uncertain-state.types"
import {
  createSefazExternalConsultationAuthority,
  createSefazExternalTransmissionAuthority,
  type SefazExternalTransmissionAuthority,
} from "@/lib/fiscal/provider/sefaz/sefaz-external-transmission-authority"

/** Configuração versionada — DORMENTE por nascimento. Preencher só em commit de ativação revisado. */
export const PILOT_EMISSION_HOMOLOGATION_WINDOW = Object.freeze({
  activationId: null,
  notBeforeUtc: null,
  expiresAtUtc: null,
}) satisfies PilotEmissionWindowConfig

export type PilotEmissionWindowConfig = {
  readonly activationId: string | null
  readonly notBeforeUtc: string | null
  readonly expiresAtUtc: string | null
}

export const PILOT_EMISSION_MAX_WINDOW_MS = 15 * 60 * 1_000

export type ActivePilotEmissionWindow = {
  readonly activationId: string
  readonly notBefore: Date
  readonly expiresAt: Date
}

export type PilotEmissionWindowStatus =
  | { readonly active: true; readonly window: ActivePilotEmissionWindow }
  | {
      readonly active: false
      readonly reason: "disabled" | "invalid" | "not_started" | "expired"
    }

const ACTIVATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/
const STRICT_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

/** Parse UTC ESTRICTO: `2026-02-30` e `24:00` são inválidos (nunca normalizados por Date). */
function parseStrictUtc(value: string): Date | null {
  if (!STRICT_UTC_PATTERN.test(value)) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const canonical = parsed.toISOString()
  const expected = value.includes(".") ? value : value.replace("Z", ".000Z")
  return canonical === expected ? parsed : null
}

export function evaluatePilotEmissionWindow(
  config: PilotEmissionWindowConfig,
  now: Date,
): PilotEmissionWindowStatus {
  const activationId = config.activationId?.trim() ?? ""
  const notBeforeRaw = config.notBeforeUtc?.trim() ?? ""
  const expiresAtRaw = config.expiresAtUtc?.trim() ?? ""
  if (!activationId && !notBeforeRaw && !expiresAtRaw) return { active: false, reason: "disabled" }
  if (
    !ACTIVATION_ID_PATTERN.test(activationId) ||
    !notBeforeRaw ||
    !expiresAtRaw ||
    Number.isNaN(now.getTime())
  ) {
    return { active: false, reason: "invalid" }
  }
  const notBefore = parseStrictUtc(notBeforeRaw)
  const expiresAt = parseStrictUtc(expiresAtRaw)
  if (
    !notBefore ||
    !expiresAt ||
    expiresAt.getTime() <= notBefore.getTime() ||
    expiresAt.getTime() - notBefore.getTime() > PILOT_EMISSION_MAX_WINDOW_MS
  ) {
    return { active: false, reason: "invalid" }
  }
  if (now.getTime() < notBefore.getTime()) return { active: false, reason: "not_started" }
  if (now.getTime() >= expiresAt.getTime()) return { active: false, reason: "expired" }
  return {
    active: true,
    window: Object.freeze({ activationId, notBefore, expiresAt }),
  }
}

export function configuredPilotEmissionWindowStatus(): PilotEmissionWindowStatus {
  return evaluatePilotEmissionWindow(PILOT_EMISSION_HOMOLOGATION_WINDOW, new Date())
}

/* ========================================================================== *
 * Consumo one-shot persistente + capability + authority por execução
 * ========================================================================== */

type PilotEmissionLedgerTransaction = {
  fiscalEmissaoJob: {
    create: (args: unknown) => Promise<{ id: string }>
  }
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
  }
}

export type PilotEmissionLedgerClient = {
  $transaction: <T>(operation: (tx: PilotEmissionLedgerTransaction) => Promise<T>) => Promise<T>
}

const PILOT_EMISSION_ACTIVATION = Symbol("pilot-emission-activation")

/** Ativação opaca: incapaz de ser forjada fora deste módulo. */
export type PilotEmissionActivation = {
  readonly [PILOT_EMISSION_ACTIVATION]: true
}

type PilotActivationBinding = {
  readonly activationId: string
  readonly storeId: string
  readonly jobIdHash: string
  readonly notBeforeMs: number
  readonly expiresAtMs: number
  readonly clock: () => Date
}

const pilotActivationBindings = new WeakMap<object, PilotActivationBinding>()

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/**
 * dedupeKey GLOBAL POR ATIVAÇÃO (sem jobId): `@@unique([storeId, dedupeKey])` garante, no
 * banco, que UMA ativação libere no máximo UM documento — qualquer segundo consumo (outro
 * job, replay, cold start, concorrência) colide na unicidade.
 */
export function pilotEmissionDedupeKey(activationId: string): string {
  return `fiscal:homologacao:emissao:v1:${sha256Hex(activationId)}`
}

export type ConsumePilotEmissionActivationResult =
  | { readonly ok: true; readonly activation: PilotEmissionActivation }
  | {
      readonly ok: false
      readonly code: "window_unavailable" | "already_consumed_or_persistence_unavailable"
    }

/**
 * Consumo GLOBAL one-shot da ativação — transação única (ledger FiscalEmissaoJob +
 * FiscalLog) executada ANTES de qualquer rede. Conflito de unicidade (replay/cold
 * start/concorrência/segundo documento) ou falha de persistência colapsa no mesmo
 * bloqueio: nenhum transporte nasce.
 */
export async function consumePilotEmissionActivation(
  client: PilotEmissionLedgerClient,
  config: PilotEmissionWindowConfig,
  input: {
    readonly jobId: string
    readonly storeId: string
    readonly notaFiscalId: string | null
    readonly operatorId: string
  },
  clock: () => Date = () => new Date(),
): Promise<ConsumePilotEmissionActivationResult> {
  const status = evaluatePilotEmissionWindow(config, clock())
  if (!status.active) return { ok: false, code: "window_unavailable" }

  const activationId = status.window.activationId
  const hash = sha256Hex(activationId)
  const jobIdHash = sha256Hex(input.jobId)
  const dedupeKey = pilotEmissionDedupeKey(activationId)
  const now = clock()
  try {
    await client.$transaction(async (tx) => {
      const ledgerJob = await tx.fiscalEmissaoJob.create({
        data: {
          storeId: input.storeId,
          vendaId: `homologacao-emissao:${hash.slice(0, 16)}`,
          notaFiscalId: input.notaFiscalId,
          tipo: "EMISSAO",
          status: "CONCLUIDO",
          tentativas: 1,
          maxTentativas: 1,
          proximaTentativaEm: null,
          prioridade: 0,
          lockOwner: null,
          lockedAt: null,
          lockExpiresAt: null,
          dedupeKey,
          payload: {
            version: 1,
            operation: "PILOT_HOMOLOGATION_EMISSION_ACTIVATION",
            activationHash: hash,
            emissionJobHash: jobIdHash,
            consumedAt: now.toISOString(),
            transmission: { environment: "HOMOLOGACAO", maxDocumentTransmissions: 1 },
          },
          ultimoErro: null,
          concluidoEm: now,
        },
        select: { id: true },
      })
      await tx.fiscalLog.create({
        data: {
          storeId: input.storeId,
          vendaId: `homologacao-emissao:${hash.slice(0, 16)}`,
          notaFiscalId: input.notaFiscalId,
          jobId: ledgerJob.id,
          nivel: "INFO",
          acao: "fiscal.homologacao.emissao.activation_consumed",
          cStat: null,
          xMotivo: null,
          mensagem:
            "Ativação da transmissão única de homologação consumida de forma global e one-shot (1 documento por acionamento).",
          detalhe: {
            activationHash: hash,
            emissionJobHash: jobIdHash,
            notBeforeUtc: status.window.notBefore.toISOString(),
            expiresAtUtc: status.window.expiresAt.toISOString(),
            maxDocumentTransmissions: 1,
          },
          operador: input.operatorId,
        },
      })
    })
  } catch {
    // Conflito de unicidade e indisponibilidade de persistência bloqueiam igual:
    // nenhum dos dois pode nascer segunda tentativa de transporte.
    return { ok: false, code: "already_consumed_or_persistence_unavailable" }
  }

  // A transação pode terminar no limite da janela: consumo persistido, rede não.
  const afterCommit = evaluatePilotEmissionWindow(config, clock())
  if (!afterCommit.active || afterCommit.window.activationId !== activationId) {
    return { ok: false, code: "window_unavailable" }
  }

  const activation: PilotEmissionActivation = Object.freeze({
    [PILOT_EMISSION_ACTIVATION]: true as const,
  })
  pilotActivationBindings.set(activation, {
    activationId,
    storeId: input.storeId,
    jobIdHash,
    notBeforeMs: afterCommit.window.notBefore.getTime(),
    expiresAtMs: afterCommit.window.expiresAt.getTime(),
    clock,
  })
  return { ok: true, activation }
}

/** Revalidação final — a última barreira antes de montar capability/authority. */
export function pilotEmissionActivationStillActive(
  activation: PilotEmissionActivation,
): boolean {
  const binding = pilotActivationBindings.get(activation)
  if (!binding) return false
  const now = binding.clock().getTime()
  return now >= binding.notBeforeMs && now < binding.expiresAtMs
}

/**
 * Capability POSITIVA por EXECUÇÃO — nasce somente do binding opaco pós-commit, para o par
 * (loja, job) consumido, e somente dentro da janela. Objeto novo a cada chamada: não há
 * fábrica global, não há reuso entre jobs.
 */
export function pilotEmissionCapability(
  activation: PilotEmissionActivation,
  input: { readonly jobId: string; readonly storeId: string },
): FiscalExternalExecutionCapability | null {
  const binding = pilotActivationBindings.get(activation)
  if (!binding) return null
  if (binding.storeId !== input.storeId) return null
  if (binding.jobIdHash !== sha256Hex(input.jobId)) return null
  if (!pilotEmissionActivationStillActive(activation)) return null
  return {
    allowExternalProviderExecution: true,
    concedidaPor: `homologacao-emissao:v1:${sha256Hex(binding.jobIdHash).slice(0, 12)}:execucao-unica`,
  }
}

/**
 * Authority externa do transporte DESTA execução — vinculada à mesma ativação consumida
 * (activationId + loja + job + NFeAutorizacao4 + HOMOLOGACAO + janela). O transporte só
 * libera `nodeSefazHttpsRuntimePorts` consumindo esta authority exatamente uma vez.
 */
export function createPilotEmissionExternalAuthority(
  activation: PilotEmissionActivation,
  input: { readonly jobId: string; readonly storeId: string },
): SefazExternalTransmissionAuthority | null {
  const binding = pilotActivationBindings.get(activation)
  if (!binding) return null
  if (binding.storeId !== input.storeId) return null
  if (binding.jobIdHash !== sha256Hex(input.jobId)) return null
  if (!pilotEmissionActivationStillActive(activation)) return null
  try {
    return createSefazExternalTransmissionAuthority({
      activationId: binding.activationId,
      storeId: input.storeId,
      jobId: input.jobId,
      servico: "NFeAutorizacao4",
      ambiente: "HOMOLOGACAO",
      notBeforeMs: binding.notBeforeMs,
      expiresAtMs: binding.expiresAtMs,
    })
  } catch {
    return null
  }
}

/**
 * Capability POSITIVA de CONSULTA (leitura) — não consome o ledger de documento.
 * Exige janela vigente e o par (loja, job CONSULTA). Nunca autoriza NFeAutorizacao4.
 */
export function pilotConsultationCapability(
  config: PilotEmissionWindowConfig,
  input: { readonly jobId: string; readonly storeId: string },
  now: Date = new Date(),
): FiscalExternalExecutionCapability | null {
  const status = evaluatePilotEmissionWindow(config, now)
  if (!status.active) return null
  const jobId = input.jobId.trim()
  const storeId = input.storeId.trim()
  if (!jobId || !storeId) return null
  return {
    allowExternalProviderExecution: true,
    concedidaPor: `homologacao-consulta:v1:${sha256Hex(jobId).slice(0, 12)}:leitura`,
  }
}

/**
 * Authority externa one-shot de CONSULTA (`NFeConsultaProtocolo4`) na janela vigente.
 * Não nasce do consumo do ledger de emissão — a transmissão de documento já ocorreu.
 */
export function createPilotConsultationExternalAuthority(
  config: PilotEmissionWindowConfig,
  input: { readonly jobId: string; readonly storeId: string },
  now: Date = new Date(),
): SefazExternalTransmissionAuthority | null {
  const status = evaluatePilotEmissionWindow(config, now)
  if (!status.active) return null
  const jobId = input.jobId.trim()
  const storeId = input.storeId.trim()
  if (!jobId || !storeId) return null
  try {
    return createSefazExternalConsultationAuthority({
      activationId: status.window.activationId,
      storeId,
      jobId,
      servico: "NFeConsultaProtocolo4",
      ambiente: "HOMOLOGACAO",
      notBeforeMs: status.window.notBefore.getTime(),
      expiresAtMs: status.window.expiresAt.getTime(),
    })
  } catch {
    return null
  }
}

/** Seam somente de teste: config e relógio controlados, mesmo ledger. */
export function createPilotEmissionGateTestHarness(options: {
  readonly client: PilotEmissionLedgerClient
  readonly config: PilotEmissionWindowConfig
  readonly clock: () => Date
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Harness do gate de emissão do piloto disponível somente em testes.")
  }
  return {
    status: () => evaluatePilotEmissionWindow(options.config, options.clock()),
    consume: (input: {
      readonly jobId: string
      readonly storeId: string
      readonly notaFiscalId: string | null
      readonly operatorId: string
    }) =>
      consumePilotEmissionActivation(options.client, options.config, input, options.clock),
  }
}

/** Cliente padrão do ledger one-shot. */
export function defaultPilotEmissionLedgerClient(): PilotEmissionLedgerClient {
  return prisma as unknown as PilotEmissionLedgerClient
}
