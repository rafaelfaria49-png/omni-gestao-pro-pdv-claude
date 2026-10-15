import { ArchiveError, canonicalJson, frozenJsonCopy, requireArchive, sha256, timestamp } from "./canonical"
import { createArchiveBundle, decodeArchiveBundle } from "./bundle"
import type { BundleHashes } from "./bundle"
import { freezeSource, privateKeyFor } from "./contracts"
import type { ArchiveSource, SourceFingerprint } from "./contracts"
import { OFFLINE_CAPABILITY, queryFor, validateLocator, validateQuery, validateReference, validateRetention, verifyReadback } from "./ports"
import type {
  ArchiveStoragePort, ExactLocator, ExactRead, IntegrityProof, OfflineCapability,
  ProtectedArchiveReference, ProtectedReferenceCasPort, PutReceipt, PutRequest,
  ReferenceQuery, RetentionProof, RetentionRequirement,
} from "./ports"

export type MemoryFault =
  | "BEFORE_PUT" | "AFTER_PUT_RESPONSE_LOST" | "BEFORE_REFERENCE"
  | "CAS_MISMATCH" | "AFTER_REFERENCE_RESPONSE_LOST"

interface StoredObject {
  readonly locator: ExactLocator
  readonly bytes: Buffer
  readonly fingerprint: SourceFingerprint
  readonly retainUntil: string
  readonly receiptId: string
  readonly capturedAt: string
}
export type SimulationResult =
  | { readonly status: "SEALED_SIMULATION" | "REPLAY_SIMULATION"; readonly reference: ProtectedArchiveReference; readonly capability: OfflineCapability }
  | { readonly status: "BLOCKED"; readonly reason: string; readonly capability: OfflineCapability }

export interface SimulationCustody extends RetentionRequirement {
  readonly capturedAt: string
  readonly retainUntil: string
  readonly observedFingerprint?: SourceFingerprint
}

/**
 * Exclusively an in-memory double. It proves neither WORM, real retention,
 * permissions, transactional CAS, authentication nor production isolation.
 * No disk, client, environment lookup, network, deletion or compensating PUT.
 */
export class MemoryArchiveFake implements ArchiveStoragePort, ProtectedReferenceCasPort {
  readonly kind = "MEMORY_FAKE_OFFLINE_ONLY"
  private readonly objects = new Map<string, StoredObject>()
  private readonly references = new Map<string, ProtectedArchiveReference>()
  private readonly faults: MemoryFault[] = []
  private retentionKnown = true
  private readCorrupted = false
  private creations = 0

  injectFault(fault: MemoryFault): void { this.faults.push(fault) }
  simulateUnknownRetention(unknown: boolean): void { this.retentionKnown = !unknown }
  simulateCorruptRead(corrupted: boolean): void { this.readCorrupted = corrupted }
  get stats(): Readonly<{ objects: number; references: number; putCreations: number }> {
    return Object.freeze({ objects: this.objects.size, references: this.references.size, putCreations: this.creations })
  }
  private failAt(fault: MemoryFault): void {
    if (this.faults[0] === fault) {
      this.faults.shift()
      throw new ArchiveError(fault === "AFTER_PUT_RESPONSE_LOST" ? "PUT_OUTCOME_UNKNOWN" : fault)
    }
  }
  private objectKey(storeId: string, key: string): string { return canonicalJson([storeId, key]) }
  private referenceKey(storeId: string, attemptId: string): string { return canonicalJson([storeId, attemptId]) }

  async putIfAbsent(request: PutRequest): Promise<PutReceipt> {
    const decoded = decodeArchiveBundle(request.bytes, { bundleSha256: request.bundleSha256, manifestSha256: request.manifestSha256 })
    requireArchive(canonicalJson(request.identity) === canonicalJson(decoded.manifest.identity), "PUT_IDENTITY")
    requireArchive(request.attemptId === decoded.manifest.attemptId && request.sourceFingerprint === decoded.manifest.sourceFingerprint, "PUT_FINGERPRINT")
    requireArchive(request.key === privateKeyFor(decoded.manifest.identity), "PUT_PRIVATE_KEY")
    timestamp(request.retainUntil)
    timestamp(request.capturedAt)
    requireArchive(Date.parse(request.retainUntil) > Date.parse(request.capturedAt), "PUT_RETENTION")
    const key = this.objectKey(decoded.manifest.identity.storeId, request.key)
    const existing = this.objects.get(key)
    if (existing) {
      requireArchive(existing.fingerprint === request.sourceFingerprint && existing.bytes.equals(decoded.bytes), "ATTEMPT_CONTENT_CONFLICT")
      return frozenJsonCopy({ outcome: "EXISTING_IDENTICAL", locator: existing.locator, receiptId: existing.receiptId, capturedAt: existing.capturedAt })
    }
    this.failAt("BEFORE_PUT")
    const locator: ExactLocator = frozenJsonCopy({
      backend: "MEMORY_FAKE_ONLY", account: "offline-simulation", storeId: request.identity.storeId,
      key: request.key, versionId: "memory-version-" + (this.creations + 1),
    })
    // No await between exclusive check and insertion: one winner in this fake.
    const object: StoredObject = Object.freeze({
      locator, bytes: Buffer.from(decoded.bytes), fingerprint: request.sourceFingerprint,
      retainUntil: request.retainUntil, capturedAt: request.capturedAt,
      receiptId: "memory-receipt:" + sha256(canonicalJson(locator)),
    })
    this.objects.set(key, object)
    this.creations++
    this.failAt("AFTER_PUT_RESPONSE_LOST")
    return frozenJsonCopy({ outcome: "CREATED", locator, receiptId: object.receiptId, capturedAt: object.capturedAt })
  }

  private exactObject(locator: ExactLocator): StoredObject {
    validateLocator(locator)
    const object = this.objects.get(this.objectKey(locator.storeId, locator.key))
    requireArchive(object && canonicalJson(locator) === canonicalJson(object.locator), "EXACT_VERSION_NOT_FOUND")
    return object
  }

  async readExactVersion(locator: ExactLocator): Promise<ExactRead> {
    const object = this.exactObject(locator)
    const bytes = Buffer.from(object.bytes)
    if (this.readCorrupted) bytes[bytes.length - 1] ^= 1
    return Object.freeze({ locator: frozenJsonCopy(object.locator), bytes })
  }

  async verifyRetention(locator: ExactLocator, requirement: RetentionRequirement): Promise<RetentionProof> {
    const object = this.exactObject(locator)
    if (!this.retentionKnown) return Object.freeze({ status: "UNKNOWN" })
    const proof: RetentionProof = frozenJsonCopy<RetentionProof>({
      status: "VERIFIED_SIMULATION", locator: object.locator, mode: "COMPLIANCE_SIMULATED",
      retainUntil: object.retainUntil, checkedAt: requirement.checkedAt,
      proofId: "memory-retention:" + sha256(canonicalJson({ locator, requirement })),
    })
    validateRetention(proof, locator, requirement)
    return proof
  }

  async verifyArchiveIntegrity(locator: ExactLocator, expected: BundleHashes): Promise<IntegrityProof> {
    const read = await this.readExactVersion(locator)
    const decoded = decodeArchiveBundle(read.bytes, expected)
    return frozenJsonCopy({
      status: "VERIFIED_SIMULATION", locator: read.locator, byteLength: decoded.bytes.byteLength,
      bundleSha256: decoded.bundleSha256, manifestSha256: decoded.manifestSha256,
    })
  }

  async putReferenceIfAbsent(
    reference: ProtectedArchiveReference,
    expectedFingerprint: SourceFingerprint,
    observedFingerprint: SourceFingerprint,
  ): Promise<ProtectedArchiveReference> {
    validateReference(reference)
    requireArchive(expectedFingerprint === reference.sourceFingerprint && observedFingerprint === expectedFingerprint, "REFERENCE_CAS_MISMATCH")
    this.failAt("BEFORE_REFERENCE")
    this.failAt("CAS_MISMATCH")
    const key = this.referenceKey(reference.identity.storeId, reference.attemptId)
    const existing = this.references.get(key)
    if (existing) {
      requireArchive(canonicalJson(queryFor(existing)) === canonicalJson(queryFor(reference)), "REFERENCE_CONFLICT")
      requireArchive(canonicalJson(existing.lineage) === canonicalJson(reference.lineage), "REFERENCE_LINEAGE_CONFLICT")
      return frozenJsonCopy(existing) // Retain the original receipt/timestamps.
    }
    const object = this.exactObject(reference.locator)
    verifyReadback(reference, object.bytes)
    requireArchive(reference.custody.receiptId === object.receiptId && reference.custody.capturedAt === object.capturedAt && reference.custody.retainUntil === object.retainUntil, "REFERENCE_CUSTODY_MISMATCH")
    // One atomic memory insertion; an injected failure cannot leave half a reference.
    const stored = frozenJsonCopy(reference)
    this.references.set(key, stored)
    this.failAt("AFTER_REFERENCE_RESPONSE_LOST")
    return frozenJsonCopy(stored)
  }

  async resolveProtectedReference(query: ReferenceQuery): Promise<ProtectedArchiveReference> {
    validateQuery(query)
    const reference = this.references.get(this.referenceKey(query.identity.storeId, query.attemptId))
    requireArchive(reference && canonicalJson(query) === canonicalJson(queryFor(reference)), "PROTECTED_REFERENCE_MISMATCH")
    const read = await this.readExactVersion(reference.locator)
    verifyReadback(reference, read.bytes)
    return frozenJsonCopy(reference)
  }

  async simulateArchive(input: ArchiveSource, custody: SimulationCustody): Promise<SimulationResult> {
    try {
      const source = freezeSource(input)
      const bundle = createArchiveBundle(source)
      timestamp(custody.capturedAt)
      timestamp(custody.retainUntil)
      const requirement = { checkedAt: custody.checkedAt, minimumRetainUntil: custody.minimumRetainUntil }
      timestamp(requirement.checkedAt)
      timestamp(requirement.minimumRetainUntil)
      requireArchive(Date.parse(requirement.minimumRetainUntil) > Date.parse(requirement.checkedAt) && Date.parse(custody.retainUntil) >= Date.parse(requirement.minimumRetainUntil), "RETENTION_REQUIREMENT")
      const request: PutRequest = {
        identity: source.identity, attemptId: bundle.manifest.attemptId, sourceFingerprint: bundle.manifest.sourceFingerprint,
        key: privateKeyFor(source.identity), bytes: bundle.bytes, bundleSha256: bundle.bundleSha256,
        manifestSha256: bundle.manifestSha256, retainUntil: custody.retainUntil, capturedAt: custody.capturedAt,
      }
      // Recovery inspects the exclusive winner and its known exact version first.
      // An unknown PUT outcome never causes an unconditional retry or deletion.
      const existingObject = this.objects.get(this.objectKey(source.identity.storeId, request.key))
      let receipt: PutReceipt
      if (existingObject) {
        requireArchive(existingObject.fingerprint === request.sourceFingerprint && existingObject.bytes.equals(bundle.bytes), "ATTEMPT_CONTENT_CONFLICT")
        receipt = { outcome: "EXISTING_IDENTICAL", locator: existingObject.locator, receiptId: existingObject.receiptId, capturedAt: existingObject.capturedAt }
      } else {
        receipt = await this.putIfAbsent(request)
      }
      const read = await this.readExactVersion(receipt.locator)
      const integrity = await this.verifyArchiveIntegrity(receipt.locator, { bundleSha256: bundle.bundleSha256, manifestSha256: bundle.manifestSha256 })
      requireArchive(Buffer.from(read.bytes).equals(bundle.bytes) && integrity.byteLength === bundle.bytes.length, "ARCHIVE_READBACK_MISMATCH")
      const retention = await this.verifyRetention(receipt.locator, requirement)
      validateRetention(retention, receipt.locator, requirement)
      requireArchive(retention.status === "VERIFIED_SIMULATION", "RETENTION_UNKNOWN")
      const reference: ProtectedArchiveReference = frozenJsonCopy({
        format: "ProtectedArchiveReference/v1", archiveFormat: "ArchiveBundle/v1", serializer: "ArchiveCanonicalJson/v1",
        referenceId: "protected-v1:" + sha256(canonicalJson({ storeId: source.identity.storeId, attemptId: request.attemptId })),
        identity: source.identity, attemptId: request.attemptId, sourceFingerprint: request.sourceFingerprint,
        lineage: source.privateState.lineage, locator: receipt.locator, byteLength: bundle.bytes.length,
        bundleSha256: bundle.bundleSha256, manifestSha256: bundle.manifestSha256,
        custody: { capturedAt: receipt.capturedAt, receiptId: receipt.receiptId, mode: "COMPLIANCE_SIMULATED", retainUntil: retention.retainUntil },
      })
      const existedReference = this.references.has(this.referenceKey(source.identity.storeId, request.attemptId))
      const stored = await this.putReferenceIfAbsent(reference, request.sourceFingerprint, custody.observedFingerprint ?? request.sourceFingerprint)
      const resolved = await this.resolveProtectedReference(queryFor(stored))
      return Object.freeze({
        status: existedReference ? "REPLAY_SIMULATION" : "SEALED_SIMULATION",
        reference: resolved, capability: OFFLINE_CAPABILITY,
      })
    } catch (error: unknown) {
      return Object.freeze({
        status: "BLOCKED", reason: error instanceof ArchiveError ? error.code : "OFFLINE_SIMULATION_FAILED",
        capability: OFFLINE_CAPABILITY,
      })
    }
  }
}
