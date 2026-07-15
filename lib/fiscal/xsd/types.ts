export const XSD_CONTRACT_VERSION = "1.0" as const
export const XSD_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024
export const XSD_MAX_OUTPUT_BYTES = 64 * 1024
export const XSD_DEFAULT_TIMEOUT_MS = 3_000
export const XSD_SCHEMA_PACKAGE = "PL_010e_v1.02/NFe/nfe_v4.00.xsd" as const

export type XsdValidationIssueCategory =
  | "XML_SYNTAX"
  | "XSD_VALIDATION"
  | "POLICY"
  | "INTEGRITY"
  | "INFRASTRUCTURE"

export type XsdValidationIssue = {
  message: string
  line?: number
  column?: number
  code?: string
  schemaPath?: string
  category?: XsdValidationIssueCategory
  retryable?: boolean
}

export type XsdValidationEngine = {
  name: "xmllint"
  xmllintVersion: string
  libxml2Version: string
  binaryHash: string
  schemaPackage: string
  schemaManifestHash: string
}

export type XsdValidationOutcome =
  | "VALIDACAO_APROVADA"
  | "XML_INVALIDO"
  | "XML_MALFORMADO"
  | "POLITICA_REJEITADA"
  | "FALHA_TRANSITORIA"
  | "FALHA_PERMANENTE"
  | "TIMEOUT"
  | "WORKER_INDISPONIVEL"
  | "VERSAO_NAO_PERMITIDA"
  | "HASH_DIVERGENTE"
  | "PACOTE_XSD_AUSENTE"
  | "RESPOSTA_INCERTA"

type XsdValidationBase = {
  outcome: XsdValidationOutcome
  engine: XsdValidationEngine | null
  durationMs: number
}

export type XsdValidationResult =
  | (XsdValidationBase & {
      valid: true
      outcome: "VALIDACAO_APROVADA"
      issues: []
      engine: XsdValidationEngine
    })
  | (XsdValidationBase & {
      valid: false
      issues: XsdValidationIssue[]
    })

export type XsdValidationRequest = {
  jobId: string
  storeId: string
  correlationId: string
  contractVersion: typeof XSD_CONTRACT_VERSION
  schemaVersion: typeof XSD_SCHEMA_PACKAGE
  schemaManifestHash: string
  xmlSha256: string
  xmlPayload: string
  payloadBytes: number
  maxPayloadBytes: number
  attempt: number
  requestedAt: string
  deadline: string
}

export type XsdValidationResponse = XsdValidationResult & {
  jobId: string
  storeId: string
  correlationId: string
  contractVersion: typeof XSD_CONTRACT_VERSION
  schemaVersion: typeof XSD_SCHEMA_PACKAGE
  xmlSha256: string
  completedAt: string
}

export type XsdValidationAdapter = {
  validate(request: XsdValidationRequest): Promise<XsdValidationResult>
}

export function infrastructureFailure(
  outcome: Exclude<XsdValidationOutcome, "VALIDACAO_APROVADA">,
  code: string,
  message: string,
  retryable = false,
): XsdValidationResult {
  return {
    valid: false,
    outcome,
    issues: [{ code, message, category: "INFRASTRUCTURE", retryable }],
    engine: null,
    durationMs: 0,
  }
}
