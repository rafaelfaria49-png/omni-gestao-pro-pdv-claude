import { readTransmissionState } from "../queue/queue-policy"
import type {
  FiscalQueueExecutionResult,
  FiscalQueueJob,
} from "../queue/queue.types"
import {
  reconcileUncertainDocument,
  transmitWithUncertainStateSafety,
} from "./uncertain-state-coordinator"
import type {
  FinalizedDocumentPreparer,
  UncertainStateFiscalProvider,
  UncertainStatePersistence,
} from "./uncertain-state.types"

export type UncertainStateJobExecutorDependencies = {
  persistence: UncertainStatePersistence
  preparer: FinalizedDocumentPreparer
  provider: UncertainStateFiscalProvider
  now?: () => Date
}

export function createUncertainStateJobExecutor(
  dependencies: UncertainStateJobExecutorDependencies,
): (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult> {
  return async (job) => {
    if (!job.notaFiscalId) {
      return {
        kind: "terminal",
        code: "nota_fiscal_ausente",
        mensagem: "Job sem notaFiscalId; operação fail-closed.",
        simulado: true,
        externalTransmissionAttempted: false,
      }
    }
    const locator = {
      storeId: job.storeId,
      vendaId: job.vendaId,
      notaFiscalId: job.notaFiscalId,
    }
    if (job.tipo === "CONSULTA") {
      const outcome = await reconcileUncertainDocument({
        locator,
        persistence: dependencies.persistence,
        provider: dependencies.provider,
        now: dependencies.now?.(),
      })
      return {
        kind: "success",
        code: `consulta_${outcome.kind}`,
        mensagem:
          outcome.kind === "not_found"
            ? "Consulta não encontrou a nota; uma retransmissão exata foi autorizada."
            : `Consulta resolveu o documento como ${outcome.kind}.`,
        simulado: true,
        externalTransmissionAttempted: false,
        detalhe: {
          consultationOutcome:
            outcome.kind === "not_found"
              ? "NOT_FOUND"
              : outcome.kind === "authorized"
                ? "AUTHORIZED"
                : "REJECTED",
        },
      }
    }
    if (job.tipo !== "EMISSAO") {
      return {
        kind: "terminal",
        code: "tipo_nao_suportado_goal012",
        mensagem: `GOAL-012 não executa ${job.tipo}.`,
        simulado: true,
        externalTransmissionAttempted: false,
      }
    }

    const transmission = readTransmissionState(job.payload)
    const outcome = await transmitWithUncertainStateSafety({
      locator,
      persistence: dependencies.persistence,
      preparer: dependencies.preparer,
      provider: dependencies.provider,
      now: dependencies.now?.(),
      retryAuthorizedByConsultation:
        transmission.consultationOutcome === "NOT_FOUND" &&
        Boolean(transmission.retryAuthorizedAt) &&
        (
          !transmission.retryAuthorizationConsumedAt ||
          transmission.retryAuthorizationConsumedAt === transmission.lastStartedAt
        ),
    })
    if (outcome.kind === "blocked") {
      return {
        kind: "terminal",
        code: outcome.code.toLowerCase(),
        mensagem: outcome.message,
        simulado: true,
        externalTransmissionAttempted: false,
      }
    }
    const detalhe = {
      document: {
        notaFiscalId: outcome.document.notaFiscalId,
        chaveAcesso: outcome.document.chaveAcesso,
        serie: outcome.document.serie,
        numero: outcome.document.numero,
        modelo: outcome.document.modelo,
        ambiente: outcome.document.ambiente,
        bytesSha256: outcome.bytesSha256,
      },
      ...(outcome.kind === "rejected" ? { requiresInutilizacao: true } : {}),
    }
    if (outcome.kind === "uncertain") {
      return {
        kind: "uncertain",
        code: "resultado_transmissao_incerto",
        mensagem: outcome.message,
        simulado: true,
        externalTransmissionAttempted: false,
        detalhe: {
          ...detalhe,
          consultationJobId: outcome.consultationJobId,
        },
      }
    }
    if (outcome.kind === "rejected") {
      return {
        kind: "terminal",
        code: "rejeitada_numero_consumido",
        mensagem: "Rejeição simulada; número permanece consumido e aguarda GOAL-019.",
        simulado: true,
        externalTransmissionAttempted: false,
        detalhe,
      }
    }
    return {
      kind: "success",
      code: outcome.idempotent ? "ja_autorizada" : "autorizada",
      mensagem: outcome.idempotent
        ? "Documento já autorizado."
        : "Autorização simulada concluída.",
      simulado: true,
      externalTransmissionAttempted: false,
      detalhe,
    }
  }
}
