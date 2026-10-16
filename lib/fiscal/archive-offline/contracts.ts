import { canonicalJson, frozenJsonCopy, isSha256, keys, record, requireArchive, sha256, textField, timestamp } from "./canonical"
import type { JsonObject, Sha256 } from "./canonical"

export type AttemptId = string & { readonly __attemptId: unique symbol }
export type SourceFingerprint = Sha256 & { readonly __sourceFingerprint: unique symbol }

export interface ArchiveIdentity {
  readonly storeId: string
  readonly vendaId: string
  readonly notaFiscalId: string
  readonly jobId: string
  readonly jobType: "EMISSAO"
  readonly dedupeKey: string
  readonly historicalAttempt: 1
  readonly modelo: "NFCE"
  readonly ambiente: "HOMOLOGACAO"
  readonly provider: "SEFAZ_DIRETO"
  readonly serieFiscalId: string
  readonly serie: number
  readonly numero: number
  readonly chave: string
  readonly historicalDiscriminator: { readonly eventId: string; readonly proven: true }
}

export type HistoricalValue<T> =
  | { readonly status: "PRESENT"; readonly value: T }
  | { readonly status: "NULL" }
  | { readonly status: "NOT_PERSISTED" }

export interface Lineage {
  readonly parentAttemptId: AttemptId | null
  readonly noParentProven: boolean
  readonly historicalCorrelation: string
}

export interface ObservedVersions {
  readonly sourceVersion: string
  readonly serviceVersion: string
  readonly matrixVersion: string
  readonly executedSha: string
}

export interface HistoricalEvent {
  readonly id: string
  readonly at: string
  readonly identity: ArchiveIdentity
  readonly xmlSha256: Sha256
}

export interface Historical588Evidence {
  readonly evidenceKind: "SYNTHETIC_OFFLINE"
  readonly persisted: HistoricalEvent & { readonly type: "persisted_before_transmission" }
  readonly uncertain: HistoricalEvent & {
    readonly type: "uncertain"
    readonly persistedEventId: string
    readonly cStat: 588
    readonly errorExact: string
    readonly detailCode: string
    readonly operation: "NFeAutorizacao4"
    readonly serviceVersion: string
    readonly matrixVersion: string
    readonly executedSha: string
  }
  readonly execution: ObservedVersions & {
    readonly historicalExecutionProven: true
    readonly operation: "NFeAutorizacao4"
  }
  readonly consultation: {
    readonly jobId: string
    readonly jobType: "CONSULTA"
    readonly originalJobId: string
    readonly dedupeKey: string
    readonly identity: ArchiveIdentity
    readonly status: "CONCLUIDO"
    readonly outcome: "NOT_FOUND"
    readonly consulted: { readonly id: string; readonly at: string; readonly uncertainEventId: string }
    readonly completed: { readonly id: string; readonly at: string; readonly consultedEventId: string }
  }
  readonly xMotivoHistorical: { readonly status: "NOT_PERSISTED" }
}

export interface PrivateState {
  readonly version: 1
  readonly metadata: {
    readonly digestValue: HistoricalValue<string>
    readonly qrCodeData: HistoricalValue<string>
    readonly urlConsulta: HistoricalValue<string>
    readonly ultimoErro: HistoricalValue<string>
  }
  readonly frozenSource: {
    readonly version: string
    readonly emitente: JsonObject
    readonly destinatario: JsonObject
    readonly pagamento: JsonObject
    readonly tributacao: JsonObject
    readonly diagnostico: JsonObject
    readonly itens: readonly { readonly id: string; readonly ordinal: number; readonly snapshot: JsonObject }[]
  }
  readonly originalState: {
    readonly nota: JsonObject
    readonly job: JsonObject
    readonly consulta: JsonObject
    readonly serie: JsonObject
    readonly venda: JsonObject
  }
  /** Pinned from the historical source, never from the current cStat matrix. */
  readonly historicalError: { readonly errorExact: string; readonly detailCode: string }
  readonly historical588: Historical588Evidence
  readonly observedVersions: ObservedVersions
  readonly lineage: Lineage
}

export interface ArchiveSource {
  readonly identity: ArchiveIdentity
  readonly xml: Uint8Array
  readonly privateState: PrivateState
}

export const IDENTITY_KEYS = [
  "storeId", "vendaId", "notaFiscalId", "jobId", "jobType", "dedupeKey", "historicalAttempt",
  "modelo", "ambiente", "provider", "serieFiscalId", "serie", "numero", "chave", "historicalDiscriminator",
] as const

export function validateIdentity(value: unknown): asserts value is ArchiveIdentity {
  canonicalJson(value)
  keys(value, IDENTITY_KEYS)
  for (const field of ["storeId", "vendaId", "notaFiscalId", "jobId", "dedupeKey", "serieFiscalId"] as const) textField(value[field])
  requireArchive(value.jobType === "EMISSAO" && value.historicalAttempt === 1, "IDENTITY_ORIGINAL_JOB")
  requireArchive(value.modelo === "NFCE" && value.ambiente === "HOMOLOGACAO" && value.provider === "SEFAZ_DIRETO", "IDENTITY_SCOPE")
  requireArchive(Number.isInteger(value.serie) && Number(value.serie) >= 0 && Number(value.serie) <= 999, "IDENTITY_SERIE")
  requireArchive(Number.isInteger(value.numero) && Number(value.numero) >= 1 && Number(value.numero) <= 999_999_999, "IDENTITY_NUMERO")
  requireArchive(typeof value.chave === "string" && /^\d{44}$/.test(value.chave), "IDENTITY_CHAVE")
  keys(value.historicalDiscriminator, ["eventId", "proven"])
  textField(value.historicalDiscriminator.eventId)
  requireArchive(value.historicalDiscriminator.proven === true, "IDENTITY_DISCRIMINATOR_UNPROVEN")
}

export function attemptIdFor(identity: ArchiveIdentity): AttemptId {
  validateIdentity(identity)
  return ("ab1_" + sha256(canonicalJson({ domain: "ArchiveAttempt/v1", identity }))) as AttemptId
}

export function privateKeyFor(identity: ArchiveIdentity): string {
  return "archive-v1/" + sha256(identity.storeId) + "/" + sha256(attemptIdFor(identity))
}

export function validateLineage(value: unknown): asserts value is Lineage {
  keys(value, ["parentAttemptId", "noParentProven", "historicalCorrelation"])
  requireArchive(
    value.parentAttemptId === null
      ? value.noParentProven === true
      : typeof value.parentAttemptId === "string" && /^ab1_[a-f0-9]{64}$/.test(value.parentAttemptId) && value.noParentProven === false,
    "LINEAGE_UNPROVEN",
  )
  textField(value.historicalCorrelation)
}

export function validateVersions(value: unknown): asserts value is ObservedVersions {
  keys(value, ["sourceVersion", "serviceVersion", "matrixVersion", "executedSha"])
  for (const field of ["sourceVersion", "serviceVersion", "matrixVersion"] as const) textField(value[field])
  requireArchive(typeof value.executedSha === "string" && /^[a-f0-9]{40}$/.test(value.executedSha), "VERSION_EXECUTED_SHA")
}

function historicalValue(value: unknown): void {
  record(value)
  if (value.status === "PRESENT") {
    keys(value, ["status", "value"])
    textField(value.value)
  } else {
    keys(value, ["status"])
    requireArchive(value.status === "NULL" || value.status === "NOT_PERSISTED", "HISTORICAL_VALUE")
  }
}

/** Defense in depth; the producer must supply an inventoried, secret-free selection. */
function rejectSecretFields(value: unknown): void {
  if (!value || typeof value !== "object") return
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase()
    requireArchive(!/^(password|senha|csc|token|accesstoken|refreshtoken|authtoken|secret|authsecret|pfx|certificate|certificado|privatekey|dsn|databaseurl|directurl|credentials|credential)$/.test(normalized), "PRIVATE_SECRET_FIELD")
    rejectSecretFields(child)
  }
}

export function validatePrivateState(value: unknown): asserts value is PrivateState {
  canonicalJson(value) // Reject exotic values before property inspection.
  keys(value, ["version", "metadata", "frozenSource", "originalState", "historicalError", "historical588", "observedVersions", "lineage"])
  requireArchive(value.version === 1, "PRIVATE_VERSION")
  keys(value.metadata, ["digestValue", "qrCodeData", "urlConsulta", "ultimoErro"])
  Object.values(value.metadata).forEach(historicalValue)
  keys(value.frozenSource, ["version", "emitente", "destinatario", "pagamento", "tributacao", "diagnostico", "itens"])
  textField(value.frozenSource.version)
  for (const field of ["emitente", "destinatario", "pagamento", "tributacao", "diagnostico"] as const) {
    record(value.frozenSource[field])
    requireArchive(Object.keys(value.frozenSource[field]).length > 0, "PRIVATE_MISSING_SNAPSHOT")
  }
  requireArchive(Array.isArray(value.frozenSource.itens) && value.frozenSource.itens.length > 0, "PRIVATE_ITEMS")
  const ids = new Set<string>()
  value.frozenSource.itens.forEach((item: unknown, index: number) => {
    keys(item, ["id", "ordinal", "snapshot"])
    textField(item.id)
    requireArchive(item.ordinal === index + 1 && !ids.has(item.id), "PRIVATE_ITEM_ORDER")
    ids.add(item.id)
    record(item.snapshot)
    requireArchive(Object.keys(item.snapshot).length > 0, "PRIVATE_MISSING_ITEM_SNAPSHOT")
  })
  keys(value.originalState, ["nota", "job", "consulta", "serie", "venda"])
  Object.values(value.originalState).forEach((state) => {
    record(state)
    requireArchive(Object.keys(state).length > 0, "PRIVATE_MISSING_STATE")
  })
  keys(value.historicalError, ["errorExact", "detailCode"])
  textField(value.historicalError.errorExact)
  textField(value.historicalError.detailCode)
  requireArchive(canonicalJson(value.metadata.ultimoErro) === canonicalJson({ status: "PRESENT", value: value.historicalError.errorExact }), "PRIVATE_ERROR_DIVERGENCE")
  validateVersions(value.observedVersions)
  validateLineage(value.lineage)
  validateHistorical588Shape(value.historical588)
  rejectSecretFields(value)
}

export function validateHistorical588Shape(value: unknown): asserts value is Historical588Evidence {
  keys(value, ["evidenceKind", "persisted", "uncertain", "execution", "consultation", "xMotivoHistorical"])
  requireArchive(value.evidenceKind === "SYNTHETIC_OFFLINE", "OFFLINE_EVIDENCE_ONLY")
  for (const name of ["persisted", "uncertain"] as const) {
    const event = value[name]
    keys(event, name === "persisted"
      ? ["id", "at", "identity", "xmlSha256", "type"]
      : ["id", "at", "identity", "xmlSha256", "type", "persistedEventId", "cStat", "errorExact", "detailCode", "operation", "serviceVersion", "matrixVersion", "executedSha"])
    textField(event.id)
    timestamp(event.at)
    validateIdentity(event.identity)
    requireArchive(isSha256(event.xmlSha256), "B2_HASH")
    requireArchive(event.type === (name === "persisted" ? "persisted_before_transmission" : "uncertain"), "B2_EVENT_TYPE")
  }
  record(value.uncertain)
  for (const field of ["persistedEventId", "errorExact", "detailCode", "serviceVersion", "matrixVersion"] as const) textField(value.uncertain[field])
  requireArchive(value.uncertain.cStat === 588 && value.uncertain.operation === "NFeAutorizacao4", "B2_CSTAT_OPERATION")
  requireArchive(typeof value.uncertain.executedSha === "string" && /^[a-f0-9]{40}$/.test(value.uncertain.executedSha), "B2_EXECUTED_SHA")
  keys(value.execution, ["sourceVersion", "serviceVersion", "matrixVersion", "executedSha", "historicalExecutionProven", "operation"])
  const { historicalExecutionProven, operation, ...versions } = value.execution
  validateVersions(versions)
  requireArchive(historicalExecutionProven === true && operation === "NFeAutorizacao4", "B2_EXECUTION_UNPROVEN")
  keys(value.consultation, ["jobId", "jobType", "originalJobId", "dedupeKey", "identity", "status", "outcome", "consulted", "completed"])
  for (const field of ["jobId", "originalJobId", "dedupeKey"] as const) textField(value.consultation[field])
  validateIdentity(value.consultation.identity)
  requireArchive(value.consultation.jobType === "CONSULTA" && value.consultation.status === "CONCLUIDO" && value.consultation.outcome === "NOT_FOUND", "B2_CONSULTATION")
  keys(value.consultation.consulted, ["id", "at", "uncertainEventId"])
  keys(value.consultation.completed, ["id", "at", "consultedEventId"])
  textField(value.consultation.consulted.id)
  textField(value.consultation.consulted.uncertainEventId)
  timestamp(value.consultation.consulted.at)
  textField(value.consultation.completed.id)
  textField(value.consultation.completed.consultedEventId)
  timestamp(value.consultation.completed.at)
  keys(value.xMotivoHistorical, ["status"])
  requireArchive(value.xMotivoHistorical.status === "NOT_PERSISTED", "B2_XMOTIVO_NOT_PERSISTED")
}

export function freezeSource(source: ArchiveSource): ArchiveSource {
  validateIdentity(source.identity)
  validatePrivateState(source.privateState)
  requireArchive(source.xml instanceof Uint8Array && source.xml.byteLength > 0, "XML_BYTES_REQUIRED")
  return Object.freeze({
    identity: frozenJsonCopy(source.identity),
    xml: Buffer.from(source.xml),
    privateState: frozenJsonCopy(source.privateState),
  })
}

export function fingerprintFor(identity: ArchiveIdentity, xml: { byteLength: number; sha256: Sha256 }, privateState: { byteLength: number; sha256: Sha256 }): SourceFingerprint {
  validateIdentity(identity)
  return sha256(canonicalJson({ domain: "ArchiveSource/v1", identity, xml, privateState })) as SourceFingerprint
}
