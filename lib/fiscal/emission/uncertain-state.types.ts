export type FiscalDocumentLocator = {
  storeId: string
  vendaId: string
  notaFiscalId: string
}

export type FiscalDocumentIdentity = FiscalDocumentLocator & {
  modelo: "NFCE"
  ambiente: "HOMOLOGACAO"
  serie: number
  numero: number
  chaveAcesso: string
}

export type PersistedFiscalDocument = FiscalDocumentIdentity & {
  status:
    | "RASCUNHO"
    | "VALIDANDO"
    | "ASSINADA"
    | "TRANSMITINDO"
    | "AUTORIZADA"
    | "REJEITADA"
    | "DENEGADA"
    | "CONTINGENCIA"
    | "CANCELADA"
    | "INUTILIZADA"
    | "ERRO"
  xmlAssinado: string | null
  xmlBytesSha256: string | null
  protocolo?: string | null
  xmlAutorizado?: string | null
  cStat?: string | null
  xMotivo?: string | null
}

export type FinalizedFiscalDocument = FiscalDocumentIdentity & {
  xmlAssinado: string
}

export type FiscalTransmissionResult =
  | {
      outcome: "AUTHORIZED"
      protocolo: string
      cStat: string
      xMotivo: string
      xmlAutorizado: string
    }
  | {
      outcome: "UNCERTAIN"
      code: "TIMEOUT" | "CONNECTION_LOST" | "UNKNOWN"
      message: string
    }
  | {
      outcome: "REJECTED"
      cStat: string
      xMotivo: string
    }

export type FiscalConsultationResult =
  | {
      outcome: "AUTHORIZED"
      protocolo: string
      cStat: string
      xMotivo: string
      xmlAutorizado: string
    }
  | {
      outcome: "NOT_FOUND"
      cStat: string
      xMotivo: string
    }
  | {
      outcome: "REJECTED"
      cStat: string
      xMotivo: string
    }

/**
 * Contrato exclusivo do drill/adapter. Não representa transporte SOAP nem
 * autoriza provider real neste GOAL.
 */
export interface UncertainStateFiscalProvider {
  readonly simulado: true
  transmit(input: {
    document: FiscalDocumentIdentity
    exactBytes: Uint8Array
    bytesSha256: string
  }): Promise<FiscalTransmissionResult>
  consult(input: {
    document: FiscalDocumentIdentity
  }): Promise<FiscalConsultationResult>
}

export interface FinalizedDocumentPreparer {
  prepare(locator: FiscalDocumentLocator): Promise<FinalizedFiscalDocument>
}

export interface UncertainStatePersistence {
  load(locator: FiscalDocumentLocator): Promise<PersistedFiscalDocument | null>
  /**
   * Persiste identidade, numeração, chave, XML assinado e TRANSMITINDO em uma
   * única fronteira local. Deve devolver o registro relido do armazenamento.
   */
  persistBeforeTransmission(input: {
    document: FinalizedFiscalDocument
    bytesSha256: string
    now: Date
  }): Promise<PersistedFiscalDocument>
  /**
   * Mantém a nota em TRANSMITINDO e cria/reencontra o job CONSULTA na mesma
   * unidade atômica. Nunca agenda retransmissão.
   */
  recordUncertainAndEnsureConsultation(input: {
    document: PersistedFiscalDocument
    code: string
    message: string
    now: Date
  }): Promise<{ consultationJobId: string; created: boolean }>
  markAuthorized(input: {
    document: PersistedFiscalDocument
    result: Extract<FiscalTransmissionResult | FiscalConsultationResult, { outcome: "AUTHORIZED" }>
    now: Date
    source: "TRANSMISSION" | "CONSULTATION"
  }): Promise<void>
  markRejected(input: {
    document: PersistedFiscalDocument
    result: Extract<FiscalTransmissionResult | FiscalConsultationResult, { outcome: "REJECTED" }>
    now: Date
    source: "TRANSMISSION" | "CONSULTATION"
    requiresInutilizacao: boolean
  }): Promise<void>
  authorizeExactRetransmission(input: {
    document: PersistedFiscalDocument
    now: Date
  }): Promise<void>
}

export type SafeEmissionOutcome =
  | {
      kind: "authorized"
      document: PersistedFiscalDocument
      idempotent: boolean
      bytesSha256: string
    }
  | {
      kind: "uncertain"
      document: PersistedFiscalDocument
      consultationJobId: string
      consultationJobCreated: boolean
      bytesSha256: string
      message: string
    }
  | {
      kind: "rejected"
      document: PersistedFiscalDocument
      requiresInutilizacao: true
      bytesSha256: string
    }
  | {
      kind: "blocked"
      code:
        | "CONSULTATION_REQUIRED"
        | "DOCUMENT_ALREADY_REJECTED"
        | "PERSISTED_BYTES_MISSING"
        | "PERSISTED_BYTES_MISMATCH"
        | "SCOPE_MISMATCH"
        | "REAL_PROVIDER_BLOCKED"
      message: string
    }

export type ConsultationOutcome =
  | { kind: "authorized"; document: PersistedFiscalDocument }
  | { kind: "not_found"; document: PersistedFiscalDocument; retransmissionAuthorized: true }
  | { kind: "rejected"; document: PersistedFiscalDocument; requiresInutilizacao: true }
