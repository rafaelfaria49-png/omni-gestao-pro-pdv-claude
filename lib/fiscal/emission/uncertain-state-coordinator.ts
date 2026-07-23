import { createHash } from "node:crypto"
import type {
  ConsultationOutcome,
  FinalizedFiscalDocument,
  FiscalDocumentLocator,
  PersistedFiscalDocument,
  SafeEmissionOutcome,
  UncertainStateFiscalProvider,
  UncertainStatePersistence,
  FinalizedDocumentPreparer,
} from "./uncertain-state.types"

export function fiscalXmlBytes(xmlAssinado: string): Uint8Array {
  return new TextEncoder().encode(xmlAssinado)
}

export function fiscalBytesSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function sameLocator(
  locator: FiscalDocumentLocator,
  document: PersistedFiscalDocument | FinalizedFiscalDocument,
): boolean {
  return (
    document.storeId === locator.storeId &&
    document.vendaId === locator.vendaId &&
    document.notaFiscalId === locator.notaFiscalId
  )
}

function validFiscalIdentity(document: FinalizedFiscalDocument | PersistedFiscalDocument): boolean {
  return (
    document.modelo === "NFCE" &&
    document.ambiente === "HOMOLOGACAO" &&
    Number.isInteger(document.serie) &&
    document.serie > 0 &&
    Number.isInteger(document.numero) &&
    document.numero > 0 &&
    document.numero <= 999_999_999 &&
    /^\d{44}$/.test(document.chaveAcesso)
  )
}

function persistedBytes(
  document: PersistedFiscalDocument,
): { bytes: Uint8Array; sha256: string } | null {
  if (!document.xmlAssinado || !document.xmlBytesSha256) return null
  const bytes = fiscalXmlBytes(document.xmlAssinado)
  const sha256 = fiscalBytesSha256(bytes)
  return sha256 === document.xmlBytesSha256 ? { bytes, sha256 } : null
}

function assertPersistedDocument(
  locator: FiscalDocumentLocator,
  document: PersistedFiscalDocument,
): Extract<SafeEmissionOutcome, { kind: "blocked" }> | null {
  if (!sameLocator(locator, document) || !validFiscalIdentity(document)) {
    return {
      kind: "blocked",
      code: "SCOPE_MISMATCH",
      message: "Documento persistido não pertence ao escopo fiscal solicitado.",
    }
  }
  if (!document.xmlAssinado || !document.xmlBytesSha256) {
    return {
      kind: "blocked",
      code: "PERSISTED_BYTES_MISSING",
      message: "XML assinado exato não está persistido; transmissão bloqueada.",
    }
  }
  if (!persistedBytes(document)) {
    return {
      kind: "blocked",
      code: "PERSISTED_BYTES_MISMATCH",
      message: "SHA-256 diverge dos bytes persistidos; transmissão bloqueada.",
    }
  }
  return null
}

/**
 * A única fronteira que pode chamar `provider.transmit` no GOAL-012.
 * Em retomada, jamais chama preparer: relê e transmite os bytes persistidos.
 */
export async function transmitWithUncertainStateSafety(input: {
  locator: FiscalDocumentLocator
  persistence: UncertainStatePersistence
  preparer: FinalizedDocumentPreparer
  provider: UncertainStateFiscalProvider
  now?: Date
  retryAuthorizedByConsultation?: boolean
}): Promise<SafeEmissionOutcome> {
  const now = input.now ?? new Date()
  if (!input.provider.simulado) {
    return {
      kind: "blocked",
      code: "REAL_PROVIDER_BLOCKED",
      message: "GOAL-012 permite somente provider stub/teste.",
    }
  }

  let document = await input.persistence.load(input.locator)
  if (document?.status === "AUTORIZADA") {
    const invalid = assertPersistedDocument(input.locator, document)
    if (invalid) return invalid
    return {
      kind: "authorized",
      document,
      idempotent: true,
      bytesSha256: document.xmlBytesSha256!,
    }
  }
  if (document?.status === "REJEITADA") {
    return {
      kind: "blocked",
      code: "DOCUMENT_ALREADY_REJECTED",
      message: "Número consumido por rejeição; reutilização bloqueada.",
    }
  }

  if (document?.status === "TRANSMITINDO") {
    const invalid = assertPersistedDocument(input.locator, document)
    if (invalid) return invalid
    if (!input.retryAuthorizedByConsultation) {
      return {
        kind: "blocked",
        code: "CONSULTATION_REQUIRED",
        message: "Consulta obrigatória antes de qualquer retransmissão.",
      }
    }
  } else {
    const prepared = await input.preparer.prepare(input.locator)
    if (
      !sameLocator(input.locator, prepared) ||
      !validFiscalIdentity(prepared) ||
      !prepared.xmlAssinado
    ) {
      return {
        kind: "blocked",
        code: "SCOPE_MISMATCH",
        message: "Documento finalizado é inválido ou não pertence ao escopo solicitado.",
      }
    }
    const bytes = fiscalXmlBytes(prepared.xmlAssinado)
    document = await input.persistence.persistBeforeTransmission({
      document: prepared,
      bytesSha256: fiscalBytesSha256(bytes),
      now,
    })
    const invalid = assertPersistedDocument(input.locator, document)
    if (invalid) return invalid
  }

  const exact = persistedBytes(document)
  if (!exact) {
    return {
      kind: "blocked",
      code: "PERSISTED_BYTES_MISMATCH",
      message: "Bytes persistidos não puderam ser verificados.",
    }
  }
  const result = await input.provider.transmit({
    document,
    exactBytes: exact.bytes,
    bytesSha256: exact.sha256,
  })
  if (result.outcome === "AUTHORIZED") {
    await input.persistence.markAuthorized({
      document,
      result,
      now,
      source: "TRANSMISSION",
    })
    return {
      kind: "authorized",
      document,
      idempotent: false,
      bytesSha256: exact.sha256,
    }
  }
  if (result.outcome === "REJECTED") {
    await input.persistence.markRejected({
      document,
      result,
      now,
      source: "TRANSMISSION",
      requiresInutilizacao: true,
    })
    return {
      kind: "rejected",
      document,
      requiresInutilizacao: true,
      bytesSha256: exact.sha256,
    }
  }
  const consultation = await input.persistence.recordUncertainAndEnsureConsultation({
    document,
    code: result.code,
    message: result.message,
    now,
  })
  return {
    kind: "uncertain",
    document,
    consultationJobId: consultation.consultationJobId,
    consultationJobCreated: consultation.created,
    bytesSha256: exact.sha256,
    message: result.message,
  }
}

/** CONSULTA é a única autoridade que resolve o estado incerto. */
export async function reconcileUncertainDocument(input: {
  locator: FiscalDocumentLocator
  persistence: UncertainStatePersistence
  provider: UncertainStateFiscalProvider
  now?: Date
}): Promise<ConsultationOutcome> {
  const now = input.now ?? new Date()
  const document = await input.persistence.load(input.locator)
  if (!document || document.status !== "TRANSMITINDO") {
    throw new Error("Consulta exige NotaFiscal TRANSMITINDO no mesmo storeId.")
  }
  const invalid = assertPersistedDocument(input.locator, document)
  if (invalid) throw new Error(invalid.message)
  if (!input.provider.simulado) {
    throw new Error("GOAL-012 bloqueia consulta por provider real.")
  }

  const result = await input.provider.consult({ document })
  if (result.outcome === "AUTHORIZED") {
    await input.persistence.markAuthorized({
      document,
      result,
      now,
      source: "CONSULTATION",
    })
    return { kind: "authorized", document }
  }
  if (result.outcome === "REJECTED") {
    await input.persistence.markRejected({
      document,
      result,
      now,
      source: "CONSULTATION",
      requiresInutilizacao: true,
    })
    return { kind: "rejected", document, requiresInutilizacao: true }
  }
  await input.persistence.authorizeExactRetransmission({ document, now })
  return { kind: "not_found", document, retransmissionAuthorized: true }
}
