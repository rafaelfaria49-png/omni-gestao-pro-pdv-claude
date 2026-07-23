import { prisma } from "@/lib/prisma"
import type {
  FiscalDocumentLocator,
  PersistedFiscalDocument,
  UncertainStatePersistence,
} from "./uncertain-state.types"

type UnknownRecord = Record<string, unknown>

type UncertainPrismaClient = {
  $transaction: <T>(fn: (tx: UncertainPrismaClient) => Promise<T>) => Promise<T>
  notaFiscal: {
    findFirst: (args: unknown) => Promise<unknown | null>
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  venda: {
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  fiscalEmissaoJob: {
    findFirst: (args: unknown) => Promise<unknown | null>
    update: (args: unknown) => Promise<unknown>
    updateMany: (args: unknown) => Promise<{ count: number }>
    upsert: (args: unknown) => Promise<unknown>
  }
  fiscalLog: {
    create: (args: unknown) => Promise<unknown>
  }
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function documentMetadata(document: {
  notaFiscalId: string
  chaveAcesso: string
  serie: number
  numero: number
  modelo: string
  ambiente: string
}, bytesSha256: string): UnknownRecord {
  return {
    notaFiscalId: document.notaFiscalId,
    chaveAcesso: document.chaveAcesso,
    serie: document.serie,
    numero: document.numero,
    modelo: document.modelo,
    ambiente: document.ambiente,
    bytesSha256,
  }
}

async function findEmissionJob(
  client: UncertainPrismaClient,
  locator: FiscalDocumentLocator,
): Promise<UnknownRecord> {
  return record(await client.fiscalEmissaoJob.findFirst({
    where: {
      storeId: locator.storeId,
      vendaId: locator.vendaId,
      notaFiscalId: locator.notaFiscalId,
      tipo: "EMISSAO",
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, payload: true },
  }))
}

async function loadDocument(
  client: UncertainPrismaClient,
  locator: FiscalDocumentLocator,
): Promise<PersistedFiscalDocument | null> {
  const [rawNote, job] = await Promise.all([
    client.notaFiscal.findFirst({
      where: {
        id: locator.notaFiscalId,
        storeId: locator.storeId,
        vendaId: locator.vendaId,
      },
      select: {
        id: true,
        storeId: true,
        vendaId: true,
        modelo: true,
        ambiente: true,
        status: true,
        serie: true,
        numero: true,
        chaveAcesso: true,
        xmlAssinado: true,
        xmlAutorizado: true,
        protocolo: true,
        cStat: true,
        xMotivo: true,
      },
    }),
    findEmissionJob(client, locator),
  ])
  const note = record(rawNote)
  if (!note.id) return null
  const payload = record(job.payload)
  const metadata = record(payload.document)
  return {
    notaFiscalId: String(note.id),
    storeId: String(note.storeId),
    vendaId: String(note.vendaId),
    modelo: String(note.modelo) as "NFCE",
    ambiente: String(note.ambiente) as "HOMOLOGACAO",
    status: String(note.status) as PersistedFiscalDocument["status"],
    serie: Number(note.serie),
    numero: Number(note.numero),
    chaveAcesso: String(note.chaveAcesso ?? ""),
    xmlAssinado: stringOrNull(note.xmlAssinado),
    xmlBytesSha256: stringOrNull(metadata.bytesSha256),
    xmlAutorizado: stringOrNull(note.xmlAutorizado),
    protocolo: stringOrNull(note.protocolo),
    cStat: stringOrNull(note.cStat),
    xMotivo: stringOrNull(note.xMotivo),
  }
}

function mergePayload(
  payloadValue: unknown,
  updates: UnknownRecord,
): UnknownRecord {
  return { ...record(payloadValue), ...updates }
}

export function createPrismaUncertainStatePersistence(
  client: UncertainPrismaClient = prisma as unknown as UncertainPrismaClient,
): UncertainStatePersistence {
  return {
    load: (locator) => loadDocument(client, locator),

    persistBeforeTransmission: async ({ document, bytesSha256, now }) => {
      await client.$transaction(async (tx) => {
        const updated = await tx.notaFiscal.updateMany({
          where: {
            id: document.notaFiscalId,
            storeId: document.storeId,
            vendaId: document.vendaId,
            modelo: "NFCE",
            ambiente: "HOMOLOGACAO",
            status: { in: ["RASCUNHO", "VALIDANDO", "ASSINADA"] },
          },
          data: {
            serie: document.serie,
            numero: document.numero,
            chaveAcesso: document.chaveAcesso,
            xmlAssinado: document.xmlAssinado,
            status: "TRANSMITINDO",
            ultimoErro: null,
          },
        })
        if (updated.count !== 1) {
          throw new Error(
            "Persistência pré-transmissão recusada: estado ou escopo da nota mudou.",
          )
        }
        const job = await findEmissionJob(tx, document)
        if (!job.id) {
          throw new Error("Job EMISSAO não encontrado para registrar os bytes exatos.")
        }
        await tx.fiscalEmissaoJob.update({
          where: { id: String(job.id) },
          data: {
            notaFiscalId: document.notaFiscalId,
            payload: mergePayload(job.payload, {
              document: documentMetadata(document, bytesSha256),
            }),
          },
        })
        await tx.fiscalLog.create({
          data: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            jobId: String(job.id),
            nivel: "INFO",
            acao: "fiscal.emission.persisted_before_transmission",
            mensagem: "Identidade e bytes assinados persistidos antes do provider.",
            operador: "fiscal-goal-012",
            detalhe: {
              bytesSha256,
              serie: document.serie,
              numero: document.numero,
              ambiente: document.ambiente,
              modelo: document.modelo,
              persistedAt: now.toISOString(),
            },
          },
        })
      })
      const persisted = await loadDocument(client, document)
      if (!persisted) throw new Error("Nota desapareceu após persistência pré-transmissão.")
      return persisted
    },

    recordUncertainAndEnsureConsultation: async ({
      document,
      code,
      message,
      now,
    }) =>
      client.$transaction(async (tx) => {
        const emissionJob = await findEmissionJob(tx, document)
        if (!emissionJob.id) {
          throw new Error("Job EMISSAO ausente ao registrar resultado incerto.")
        }
        const dedupeKey = `fiscal:consulta:v1:nota:${document.notaFiscalId}`
        const existing = record(await tx.fiscalEmissaoJob.findFirst({
          where: { storeId: document.storeId, dedupeKey },
          select: { id: true, status: true, payload: true },
        }))
        const reactivatingTerminalQuery = [
          "CONCLUIDO",
          "FALHA",
          "CANCELADO",
        ].includes(String(existing.status ?? ""))
        const queryPayload = {
          version: 2,
          operation: "CONSULTA",
          requestedAt: now.toISOString(),
          document: documentMetadata(document, document.xmlBytesSha256 ?? ""),
        }
        const queryJob = record(await tx.fiscalEmissaoJob.upsert({
          where: {
            storeId_dedupeKey: { storeId: document.storeId, dedupeKey },
          },
          create: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            tipo: "CONSULTA",
            status: "PENDENTE",
            tentativas: 0,
            maxTentativas: 10,
            prioridade: 100,
            proximaTentativaEm: now,
            dedupeKey,
            payload: queryPayload,
          },
          update: reactivatingTerminalQuery
            ? {
                notaFiscalId: document.notaFiscalId,
                status: "PENDENTE",
                tentativas: 0,
                proximaTentativaEm: now,
                concluidoEm: null,
                ultimoErro: null,
                lockOwner: null,
                lockedAt: null,
                lockExpiresAt: null,
                payload: queryPayload,
              }
            : { notaFiscalId: document.notaFiscalId },
          select: { id: true },
        }))
        const payload = record(emissionJob.payload)
        await tx.fiscalEmissaoJob.update({
          where: { id: String(emissionJob.id) },
          data: {
            payload: mergePayload(payload, {
              document: documentMetadata(document, document.xmlBytesSha256 ?? ""),
              transmission: {
                ...record(payload.transmission),
                uncertainAt: now.toISOString(),
                uncertainCode: code,
                consultationJobId: String(queryJob.id),
              },
            }),
          },
        })
        await tx.notaFiscal.updateMany({
          where: {
            id: document.notaFiscalId,
            storeId: document.storeId,
            vendaId: document.vendaId,
            status: "TRANSMITINDO",
          },
          data: { ultimoErro: message, tentativas: { increment: 1 } },
        })
        await tx.fiscalLog.create({
          data: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            jobId: String(emissionJob.id),
            nivel: "WARN",
            acao: "fiscal.emission.uncertain",
            mensagem: "Resultado incerto; consulta deduplicada é a única autoridade.",
            operador: "fiscal-goal-012",
            detalhe: {
              code,
              consultationJobId: String(queryJob.id),
              bytesSha256: document.xmlBytesSha256,
            },
          },
        })
        return {
          consultationJobId: String(queryJob.id),
          created: !existing.id,
        }
      }),

    markAuthorized: async ({ document, result, now, source }) => {
      await client.$transaction(async (tx) => {
        const updated = await tx.notaFiscal.updateMany({
          where: {
            id: document.notaFiscalId,
            storeId: document.storeId,
            vendaId: document.vendaId,
            status: { in: ["TRANSMITINDO", "AUTORIZADA"] },
          },
          data: {
            status: "AUTORIZADA",
            protocolo: result.protocolo,
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            dataAutorizacao: now,
            xmlAutorizado: result.xmlAutorizado,
            ultimoErro: null,
          },
        })
        if (updated.count !== 1) throw new Error("Nota autorizada fora do escopo esperado.")
        await tx.venda.updateMany({
          where: { id: document.vendaId, storeId: document.storeId },
          data: { fiscalStatus: "AUTORIZADA" },
        })
        if (source === "CONSULTATION") {
          await tx.fiscalEmissaoJob.updateMany({
            where: {
              storeId: document.storeId,
              vendaId: document.vendaId,
              notaFiscalId: document.notaFiscalId,
              tipo: "EMISSAO",
              status: { in: ["PROCESSANDO", "AGUARDANDO_RETRY", "PENDENTE"] },
            },
            data: {
              status: "CONCLUIDO",
              concluidoEm: now,
              proximaTentativaEm: null,
              ultimoErro: null,
              lockOwner: null,
              lockedAt: null,
              lockExpiresAt: null,
            },
          })
        }
        await tx.fiscalLog.create({
          data: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            nivel: "INFO",
            acao:
              source === "CONSULTATION"
                ? "fiscal.reconciliation.authorized"
                : "fiscal.emission.authorized",
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            mensagem: "Autorização simulada persistida.",
            operador: "fiscal-goal-012",
            detalhe: { source, protocoloPersistido: true, xmlAutorizadoPersistido: true },
          },
        })
      })
    },

    markRejected: async ({ document, result, now, source, requiresInutilizacao }) => {
      await client.$transaction(async (tx) => {
        const updated = await tx.notaFiscal.updateMany({
          where: {
            id: document.notaFiscalId,
            storeId: document.storeId,
            vendaId: document.vendaId,
            status: { in: ["TRANSMITINDO", "REJEITADA"] },
          },
          data: {
            status: "REJEITADA",
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            ultimoErro: result.xMotivo,
          },
        })
        if (updated.count !== 1) throw new Error("Rejeição fora do escopo esperado.")
        await tx.venda.updateMany({
          where: { id: document.vendaId, storeId: document.storeId },
          data: { fiscalStatus: "REJEITADA" },
        })
        if (source === "CONSULTATION") {
          const emissionJob = await findEmissionJob(tx, document)
          if (emissionJob.id) {
            await tx.fiscalEmissaoJob.update({
              where: { id: String(emissionJob.id) },
              data: {
                status: "FALHA",
                proximaTentativaEm: null,
                ultimoErro: result.xMotivo,
                lockOwner: null,
                lockedAt: null,
                lockExpiresAt: null,
                payload: mergePayload(emissionJob.payload, {
                  requiresInutilizacao,
                  rejectedAt: now.toISOString(),
                }),
              },
            })
          }
        }
        await tx.fiscalLog.create({
          data: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            nivel: "WARN",
            acao: "fiscal.reconciliation.rejected_requires_inutilizacao",
            cStat: result.cStat,
            xMotivo: result.xMotivo,
            mensagem: "Número consumido; não reutilizar. Inutilização futura no GOAL-019.",
            operador: "fiscal-goal-012",
            detalhe: {
              source,
              requiresInutilizacao,
              serie: document.serie,
              numero: document.numero,
            },
          },
        })
      })
    },

    authorizeExactRetransmission: async ({ document, now }) => {
      await client.$transaction(async (tx) => {
        const emissionJob = await findEmissionJob(tx, document)
        if (!emissionJob.id) throw new Error("Job EMISSAO ausente para autorizar retomada.")
        const payload = record(emissionJob.payload)
        const transmission = record(payload.transmission)
        await tx.fiscalEmissaoJob.update({
          where: { id: String(emissionJob.id) },
          data: {
            status: "PENDENTE",
            proximaTentativaEm: now,
            ultimoErro: null,
            lockOwner: null,
            lockedAt: null,
            lockExpiresAt: null,
            payload: mergePayload(payload, {
              transmission: {
                ...transmission,
                consultationOutcome: "NOT_FOUND",
                consultationCompletedAt: now.toISOString(),
                retryAuthorizedAt: now.toISOString(),
                retryAuthorizationConsumedAt: null,
              },
            }),
          },
        })
        await tx.fiscalLog.create({
          data: {
            storeId: document.storeId,
            vendaId: document.vendaId,
            notaFiscalId: document.notaFiscalId,
            jobId: String(emissionJob.id),
            nivel: "INFO",
            acao: "fiscal.reconciliation.not_found_retry_authorized",
            mensagem: "Consulta não encontrou a nota; uma retomada dos bytes exatos foi autorizada.",
            operador: "fiscal-goal-012",
            detalhe: {
              bytesSha256: document.xmlBytesSha256,
              chaveAcesso: document.chaveAcesso,
              authorizedAt: now.toISOString(),
            },
          },
        })
      })
    },
  }
}
