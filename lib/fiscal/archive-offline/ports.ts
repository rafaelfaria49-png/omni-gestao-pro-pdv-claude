import { canonicalJson, frozenJsonCopy, isSha256, keys, requireArchive, sha256, textField, timestamp } from "./canonical"
import type { Sha256 } from "./canonical"
import { BUNDLE_FORMAT, SERIALIZER, decodeArchiveBundle } from "./bundle"
import type { BundleHashes, DecodedArchive } from "./bundle"
import { attemptIdFor, privateKeyFor, validateIdentity, validateLineage } from "./contracts"
import type { ArchiveIdentity, AttemptId, Lineage, SourceFingerprint } from "./contracts"

export const OFFLINE_CAPABILITY = frozenJsonCopy({
  mode: "OFFLINE_ONLY" as const,
  productionEvidence: false as const,
  retry: false as const, transmission: false as const, rearm: false as const,
  activation: false as const, write: false as const,
})
export type OfflineCapability = typeof OFFLINE_CAPABILITY

export interface ExactLocator {
  readonly backend: string
  readonly account: string
  readonly storeId: string
  readonly key: string
  readonly versionId: string
}
export interface RetentionRequirement {
  readonly checkedAt: string
  readonly minimumRetainUntil: string
}
export type RetentionProof =
  | { readonly status: "UNKNOWN" }
  | {
    readonly status: "VERIFIED_SIMULATION"
    readonly locator: ExactLocator
    readonly mode: "COMPLIANCE_SIMULATED"
    readonly retainUntil: string
    readonly checkedAt: string
    readonly proofId: string
  }
export interface ProtectedArchiveReference extends BundleHashes {
  readonly format: "ProtectedArchiveReference/v1"
  readonly archiveFormat: typeof BUNDLE_FORMAT
  readonly serializer: typeof SERIALIZER
  readonly referenceId: string
  readonly identity: ArchiveIdentity
  readonly attemptId: AttemptId
  readonly sourceFingerprint: SourceFingerprint
  readonly lineage: Lineage
  readonly locator: ExactLocator
  readonly byteLength: number
  readonly custody: {
    readonly capturedAt: string
    readonly receiptId: string
    readonly mode: "COMPLIANCE_SIMULATED"
    readonly retainUntil: string
  }
}
export interface PutRequest extends BundleHashes {
  readonly identity: ArchiveIdentity
  readonly attemptId: AttemptId
  readonly sourceFingerprint: SourceFingerprint
  readonly key: string
  readonly bytes: Uint8Array
  readonly retainUntil: string
  readonly capturedAt: string
}
export interface PutReceipt {
  readonly outcome: "CREATED" | "EXISTING_IDENTICAL"
  readonly locator: ExactLocator
  readonly receiptId: string
  readonly capturedAt: string
}
export interface ExactRead {
  readonly locator: ExactLocator
  readonly bytes: Uint8Array
}
export interface IntegrityProof extends BundleHashes {
  readonly status: "VERIFIED_SIMULATION"
  readonly locator: ExactLocator
  readonly byteLength: number
}
export interface ReferenceQuery extends BundleHashes {
  readonly identity: ArchiveIdentity
  readonly attemptId: AttemptId
  readonly sourceFingerprint: SourceFingerprint
  readonly locator: ExactLocator
}
export interface ArchiveStoragePort {
  putIfAbsent(request: PutRequest): Promise<PutReceipt>
  readExactVersion(locator: ExactLocator): Promise<ExactRead>
  verifyRetention(locator: ExactLocator, requirement: RetentionRequirement): Promise<RetentionProof>
  verifyArchiveIntegrity(locator: ExactLocator, expected: BundleHashes): Promise<IntegrityProof>
}
export interface ProtectedReferencePort {
  resolveProtectedReference(query: ReferenceQuery): Promise<ProtectedArchiveReference>
}
/** Abstract future CAS boundary; implemented only by the memory fake here. */
export interface ProtectedReferenceCasPort extends ProtectedReferencePort {
  putReferenceIfAbsent(
    reference: ProtectedArchiveReference,
    expectedFingerprint: SourceFingerprint,
    observedFingerprint: SourceFingerprint,
  ): Promise<ProtectedArchiveReference>
}

export function validateLocator(value: unknown): asserts value is ExactLocator {
  canonicalJson(value)
  keys(value, ["backend", "account", "storeId", "key", "versionId"])
  for (const field of ["backend", "account", "storeId", "key", "versionId"] as const) textField(value[field])
  requireArchive(typeof value.versionId === "string" && !/^(latest|null|undefined)$/i.test(value.versionId), "EXACT_VERSION_REQUIRED")
  requireArchive(typeof value.key === "string" && /^archive-v1\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(value.key), "PRIVATE_OPAQUE_KEY")
}

export function validateReference(value: unknown): asserts value is ProtectedArchiveReference {
  canonicalJson(value)
  keys(value, ["format", "archiveFormat", "serializer", "referenceId", "identity", "attemptId", "sourceFingerprint", "lineage", "locator", "byteLength", "bundleSha256", "manifestSha256", "custody"])
  requireArchive(value.format === "ProtectedArchiveReference/v1" && value.archiveFormat === BUNDLE_FORMAT && value.serializer === SERIALIZER, "REFERENCE_FORMAT")
  validateIdentity(value.identity)
  validateLineage(value.lineage)
  validateLocator(value.locator)
  requireArchive(value.identity.storeId === value.locator.storeId && value.locator.key === privateKeyFor(value.identity), "REFERENCE_SCOPE")
  requireArchive(value.attemptId === attemptIdFor(value.identity), "REFERENCE_ATTEMPT")
  requireArchive(value.lineage.parentAttemptId !== value.attemptId, "REFERENCE_SELF_LINEAGE")
  requireArchive(isSha256(value.sourceFingerprint) && isSha256(value.bundleSha256) && isSha256(value.manifestSha256), "REFERENCE_HASH")
  requireArchive(Number.isSafeInteger(value.byteLength) && Number(value.byteLength) > 24, "REFERENCE_LENGTH")
  requireArchive(value.referenceId === "protected-v1:" + sha256(canonicalJson({ storeId: value.identity.storeId, attemptId: value.attemptId })), "REFERENCE_ID")
  keys(value.custody, ["capturedAt", "receiptId", "mode", "retainUntil"])
  timestamp(value.custody.capturedAt)
  timestamp(value.custody.retainUntil)
  textField(value.custody.receiptId)
  requireArchive(value.custody.mode === "COMPLIANCE_SIMULATED", "REFERENCE_RETENTION_MODE")
}

export function validateQuery(query: unknown): asserts query is ReferenceQuery {
  canonicalJson(query)
  keys(query, ["identity", "attemptId", "sourceFingerprint", "locator", "bundleSha256", "manifestSha256"])
  validateIdentity(query.identity)
  validateLocator(query.locator)
  requireArchive(query.identity.storeId === query.locator.storeId && query.locator.key === privateKeyFor(query.identity), "REFERENCE_SCOPE")
  requireArchive(query.attemptId === attemptIdFor(query.identity) && isSha256(query.sourceFingerprint) && isSha256(query.bundleSha256) && isSha256(query.manifestSha256), "REFERENCE_QUERY")
}

export function queryFor(reference: ProtectedArchiveReference): ReferenceQuery {
  validateReference(reference)
  return frozenJsonCopy({
    identity: reference.identity, attemptId: reference.attemptId, sourceFingerprint: reference.sourceFingerprint,
    locator: reference.locator, bundleSha256: reference.bundleSha256, manifestSha256: reference.manifestSha256,
  })
}

export function verifyReadback(reference: ProtectedArchiveReference, bytes: Uint8Array): DecodedArchive {
  validateReference(reference)
  const decoded = decodeArchiveBundle(bytes, { bundleSha256: reference.bundleSha256, manifestSha256: reference.manifestSha256 })
  requireArchive(decoded.bytes.byteLength === reference.byteLength, "REFERENCE_LENGTH_MISMATCH")
  requireArchive(canonicalJson(decoded.manifest.identity) === canonicalJson(reference.identity), "REFERENCE_IDENTITY_MISMATCH")
  requireArchive(decoded.manifest.attemptId === reference.attemptId && decoded.manifest.sourceFingerprint === reference.sourceFingerprint, "REFERENCE_FINGERPRINT_MISMATCH")
  requireArchive(canonicalJson(decoded.manifest.lineage) === canonicalJson(reference.lineage), "REFERENCE_LINEAGE_MISMATCH")
  return decoded
}

export function validateRetention(proof: RetentionProof, locator: ExactLocator, requirement: RetentionRequirement): void {
  validateLocator(locator)
  keys(requirement, ["checkedAt", "minimumRetainUntil"])
  timestamp(requirement.checkedAt)
  timestamp(requirement.minimumRetainUntil)
  requireArchive(Date.parse(requirement.minimumRetainUntil) > Date.parse(requirement.checkedAt), "RETENTION_REQUIREMENT")
  requireArchive(proof?.status === "VERIFIED_SIMULATION", "RETENTION_UNKNOWN")
  keys(proof, ["status", "locator", "mode", "retainUntil", "checkedAt", "proofId"])
  validateLocator(proof.locator)
  timestamp(proof.retainUntil)
  timestamp(proof.checkedAt)
  textField(proof.proofId)
  requireArchive(proof.mode === "COMPLIANCE_SIMULATED", "RETENTION_MODE")
  requireArchive(canonicalJson(proof.locator) === canonicalJson(locator) && proof.checkedAt === requirement.checkedAt, "RETENTION_SCOPE_OR_STALE")
  requireArchive(Date.parse(proof.retainUntil) >= Date.parse(requirement.minimumRetainUntil), "RETENTION_SHORT")
}
