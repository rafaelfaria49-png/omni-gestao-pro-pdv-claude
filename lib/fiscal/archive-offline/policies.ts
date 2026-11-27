import { ArchiveError, canonicalJson, frozenJsonCopy, isSha256, keys, requireArchive, sha256, timestamp } from "./canonical"
import { createArchiveBundle } from "./bundle"
import { attemptIdFor, validateIdentity, validateLineage, validatePrivateState, validateVersions } from "./contracts"
import type { ArchiveIdentity, ArchiveSource, Lineage, ObservedVersions } from "./contracts"
import { assertB1Inventory, assertB3Inventory } from "./inventories"
import type { B1Inventory, B3Inventory, RuntimeRequirement } from "./inventories"
import { OFFLINE_CAPABILITY, validateReference, validateRetention, verifyReadback } from "./ports"
import type { OfflineCapability, ProtectedArchiveReference, RetentionProof, RetentionRequirement } from "./ports"

export interface OfflinePolicyResult {
  readonly ok: boolean
  readonly reasons: readonly string[]
  readonly capability: OfflineCapability
}
function evaluate(check: () => void): OfflinePolicyResult {
  try {
    check()
    return frozenJsonCopy({ ok: true, reasons: [], capability: OFFLINE_CAPABILITY })
  } catch (error: unknown) {
    return frozenJsonCopy({
      ok: false, reasons: [error instanceof ArchiveError ? error.code : "OFFLINE_PROOF_INVALID"],
      capability: OFFLINE_CAPABILITY,
    })
  }
}
function same(left: unknown, right: unknown, code: string): void {
  requireArchive(canonicalJson(left) === canonicalJson(right), code)
}

export function validateHistorical588(source: ArchiveSource): OfflinePolicyResult {
  return evaluate(() => {
    validateIdentity(source.identity)
    validatePrivateState(source.privateState)
    requireArchive(source.xml instanceof Uint8Array && source.xml.length > 0, "B2_ORIGINAL_BYTES_MISSING")
    const identity = source.identity
    const state = source.privateState
    const originalIdentity = validateFiscalIdentity(source, { identity, emissionJobIds: [identity.jobId], notaFiscalIds: [identity.notaFiscalId], lineage: state.lineage, versions: state.observedVersions })
    requireArchive(originalIdentity.ok, originalIdentity.reasons[0] ?? "B2_ORIGINAL_IDENTITY")
    const evidence = state.historical588
    const { persisted, uncertain, execution, consultation } = evidence
    for (const eventIdentity of [persisted.identity, uncertain.identity, consultation.identity]) same(eventIdentity, identity, "B2_IDENTITY_DIVERGENCE")
    requireArchive(persisted.id === identity.historicalDiscriminator.eventId && state.lineage.historicalCorrelation === persisted.id, "B2_HISTORICAL_DISCRIMINATOR")
    requireArchive(uncertain.persistedEventId === persisted.id && consultation.consulted.uncertainEventId === uncertain.id, "B2_EVENT_CORRELATION")
    requireArchive(consultation.completed.consultedEventId === consultation.consulted.id, "B2_CONSULT_COMPLETION_CORRELATION")
    requireArchive(new Set([persisted.id, uncertain.id, consultation.consulted.id, consultation.completed.id]).size === 4, "B2_DUPLICATE_EVENT")
    const xmlHash = sha256(source.xml)
    requireArchive(persisted.xmlSha256 === xmlHash && uncertain.xmlSha256 === xmlHash, "B2_ORIGINAL_HASH_DIVERGENCE")
    requireArchive(uncertain.errorExact === state.historicalError.errorExact && uncertain.detailCode === state.historicalError.detailCode, "B2_EXACT_ERROR_DIVERGENCE")
    const { historicalExecutionProven: _proven, operation: _operation, ...executedVersions } = execution
    same(executedVersions, state.observedVersions, "B2_EXECUTED_VERSION_DIVERGENCE")
    requireArchive(
      uncertain.executedSha === state.observedVersions.executedSha
      && uncertain.serviceVersion === state.observedVersions.serviceVersion
      && uncertain.matrixVersion === state.observedVersions.matrixVersion
      && state.frozenSource.version === state.observedVersions.sourceVersion,
      "B2_EXECUTED_VERSION_DIVERGENCE",
    )
    requireArchive(consultation.originalJobId === identity.jobId && consultation.jobId !== identity.jobId, "B2_ORIGINAL_JOB")
    requireArchive(state.originalState.consulta.id === consultation.jobId && state.originalState.consulta.dedupeKey === consultation.dedupeKey, "B2_CONSULTATION_ORIGINAL")
    requireArchive(
      Date.parse(persisted.at) < Date.parse(uncertain.at)
      && Date.parse(uncertain.at) < Date.parse(consultation.consulted.at)
      && Date.parse(consultation.consulted.at) <= Date.parse(consultation.completed.at),
      "B2_CHRONOLOGY",
    )
    same(state.originalState.nota.xMotivo, { status: "NOT_PERSISTED" }, "B2_ORIGINAL_XMOTIVO_DIVERGENCE")
    // xMotivo is validated as exactly {status: NOT_PERSISTED}; no current matrix import.
  })
}

export interface IdentityObservation {
  readonly identity: ArchiveIdentity
  readonly emissionJobIds: readonly string[]
  readonly notaFiscalIds: readonly string[]
  readonly lineage: Lineage
  readonly versions: ObservedVersions
}
export function validateFiscalIdentity(source: ArchiveSource, observed: IdentityObservation): OfflinePolicyResult {
  return evaluate(() => {
    validateIdentity(source.identity)
    validatePrivateState(source.privateState)
    keys(observed, ["identity", "emissionJobIds", "notaFiscalIds", "lineage", "versions"])
    validateIdentity(observed.identity)
    validateLineage(observed.lineage)
    validateVersions(observed.versions)
    same(source.identity, observed.identity, "FISCAL_IDENTITY_CHANGED")
    same(observed.emissionJobIds, [source.identity.jobId], "SECOND_EMISSAO_JOB")
    same(observed.notaFiscalIds, [source.identity.notaFiscalId], "SECOND_NOTA_FISCAL")
    same(source.privateState.lineage, observed.lineage, "FISCAL_LINEAGE_CHANGED")
    same(source.privateState.observedVersions, observed.versions, "FISCAL_VERSION_CHANGED")
    const { identity: i, privateState: { originalState: original } } = source
    for (const [field, expected] of Object.entries({
      id: i.notaFiscalId, storeId: i.storeId, vendaId: i.vendaId,
      serieFiscalId: i.serieFiscalId, serie: i.serie, numero: i.numero, chave: i.chave,
      modelo: i.modelo, ambiente: i.ambiente, provider: i.provider,
    })) requireArchive(original.nota[field] === expected, "FISCAL_ORIGINAL_NOTA")
    for (const [field, expected] of Object.entries({
      id: i.jobId, storeId: i.storeId, vendaId: i.vendaId, notaFiscalId: i.notaFiscalId, tipo: "EMISSAO", dedupeKey: i.dedupeKey,
    })) requireArchive(original.job[field] === expected, "FISCAL_ORIGINAL_JOB")
    requireArchive(original.venda.id === i.vendaId && original.venda.storeId === i.storeId && original.venda.notaFiscalId === i.notaFiscalId, "FISCAL_ORIGINAL_VENDA")
    requireArchive(original.serie.id === i.serieFiscalId && original.serie.storeId === i.storeId && original.serie.serie === i.serie, "FISCAL_ORIGINAL_SERIE")
    requireArchive(source.privateState.lineage.parentAttemptId !== attemptIdFor(i), "FISCAL_SELF_LINEAGE")
  })
}

export function validateInutilizacaoInventory(inventory: B1Inventory, identity: ArchiveIdentity, checkedAt: string): OfflinePolicyResult {
  return evaluate(() => assertB1Inventory(inventory, identity, checkedAt))
}
export function validateRuntimeInventory(inventory: B3Inventory, identity: ArchiveIdentity, checkedAt: string, requirement: RuntimeRequirement): OfflinePolicyResult {
  return evaluate(() => assertB3Inventory(inventory, identity, checkedAt, requirement))
}

export interface OfflineArchiveProof {
  readonly reference: ProtectedArchiveReference
  readonly readbackBytes: Uint8Array
  readonly retention: RetentionProof
  readonly protectedReference: {
    readonly kind: "SIMULATED_PROTECTED_REFERENCE"
    readonly referenceSha256: string
    readonly observedFingerprint: string
    readonly revalidatedAt: string
  }
}
export interface OfflinePreflightInput {
  readonly source: ArchiveSource
  readonly observedIdentity: IdentityObservation
  readonly archive: OfflineArchiveProof
  readonly b1: B1Inventory
  readonly b3: B3Inventory
  readonly retentionRequirement: RetentionRequirement
  readonly runtimeRequirement: RuntimeRequirement
}
export function preflightOffline(input: OfflinePreflightInput): OfflinePolicyResult {
  return evaluate(() => {
    keys(input, ["source", "observedIdentity", "archive", "b1", "b3", "retentionRequirement", "runtimeRequirement"])
    const b2 = validateHistorical588(input.source)
    requireArchive(b2.ok, b2.reasons[0] ?? "B2_MISSING")
    const identity = validateFiscalIdentity(input.source, input.observedIdentity)
    requireArchive(identity.ok, identity.reasons[0] ?? "FISCAL_IDENTITY_MISSING")
    keys(input.archive, ["reference", "readbackBytes", "retention", "protectedReference"])
    const { reference, readbackBytes, retention, protectedReference } = input.archive
    validateReference(reference)
    const expected = createArchiveBundle(input.source)
    requireArchive(reference.bundleSha256 === expected.bundleSha256 && reference.manifestSha256 === expected.manifestSha256, "PREFLIGHT_ARCHIVE_DIVERGENCE")
    requireArchive(reference.attemptId === expected.manifest.attemptId && reference.sourceFingerprint === expected.manifest.sourceFingerprint, "PREFLIGHT_FINGERPRINT_DIVERGENCE")
    verifyReadback(reference, readbackBytes)
    validateRetention(retention, reference.locator, input.retentionRequirement)
    requireArchive(retention.status === "VERIFIED_SIMULATION" && retention.retainUntil === reference.custody.retainUntil, "PREFLIGHT_RETENTION_DIVERGENCE")
    keys(protectedReference, ["kind", "referenceSha256", "observedFingerprint", "revalidatedAt"])
    timestamp(protectedReference.revalidatedAt)
    requireArchive(protectedReference.kind === "SIMULATED_PROTECTED_REFERENCE", "PREFLIGHT_PROTECTED_REFERENCE_UNPROVEN")
    requireArchive(isSha256(protectedReference.referenceSha256) && protectedReference.referenceSha256 === sha256(canonicalJson(reference)), "PREFLIGHT_REFERENCE_DIVERGENCE")
    requireArchive(protectedReference.observedFingerprint === reference.sourceFingerprint && protectedReference.revalidatedAt === input.retentionRequirement.checkedAt, "PREFLIGHT_REFERENCE_STALE")
    assertB1Inventory(input.b1, input.source.identity, input.retentionRequirement.checkedAt)
    assertB3Inventory(input.b3, input.source.identity, input.retentionRequirement.checkedAt, input.runtimeRequirement)
    // All inputs are assertions about fixtures. Even success cannot authorize a write.
  })
}
