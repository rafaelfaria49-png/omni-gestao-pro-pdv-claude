import { ArchiveError, canonicalBytes, canonicalJson, frozenJsonCopy, isSha256, keys, parseCanonical, requireArchive, sha256 } from "./canonical"
import type { Sha256 } from "./canonical"
import { attemptIdFor, fingerprintFor, freezeSource, validateIdentity, validateLineage, validatePrivateState } from "./contracts"
import type { ArchiveIdentity, ArchiveSource, AttemptId, Lineage, PrivateState, SourceFingerprint } from "./contracts"

export const BUNDLE_FORMAT = "ArchiveBundle/v1" as const
export const SERIALIZER = "ArchiveCanonicalJson/v1" as const
export const HEADER_BYTES = 24
const MAGIC = Buffer.from("OMNIARCV", "ascii")
export const SEGMENT_LIMITS = Object.freeze({ manifest: 1_048_576, xml: 33_554_432, privateState: 16_777_216 })

export interface SegmentDescriptor {
  readonly byteLength: number
  readonly sha256: Sha256
}
export interface ArchiveManifest {
  readonly format: typeof BUNDLE_FORMAT
  readonly version: 1
  readonly serializer: typeof SERIALIZER
  readonly identity: ArchiveIdentity
  readonly attemptId: AttemptId
  readonly sourceFingerprint: SourceFingerprint
  readonly lineage: Lineage
  readonly xml: SegmentDescriptor & { readonly encoding: "UTF-8" }
  readonly privateState: SegmentDescriptor
}
export interface BundleHashes {
  readonly bundleSha256: Sha256
  readonly manifestSha256: Sha256
}
export interface ArchiveBundle extends BundleHashes {
  readonly bytes: Buffer
  readonly manifestBytes: Buffer
  readonly manifest: ArchiveManifest
}
export interface DecodedArchive extends ArchiveBundle {
  readonly xml: Buffer
  readonly privateStateBytes: Buffer
  readonly privateState: PrivateState
}

function validateXmlEncoding(bytes: Uint8Array): void {
  try { new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new ArchiveError("XML_INVALID_UTF8") }
}
function descriptor(bytes: Uint8Array): SegmentDescriptor {
  return { byteLength: bytes.byteLength, sha256: sha256(bytes) }
}
function length(value: unknown, limit: number): asserts value is number {
  requireArchive(Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= limit, "BUNDLE_SEGMENT_LENGTH")
}
function validateManifest(value: unknown): asserts value is ArchiveManifest {
  keys(value, ["format", "version", "serializer", "identity", "attemptId", "sourceFingerprint", "lineage", "xml", "privateState"])
  requireArchive(value.format === BUNDLE_FORMAT && value.version === 1 && value.serializer === SERIALIZER, "BUNDLE_MANIFEST_VERSION")
  validateIdentity(value.identity)
  validateLineage(value.lineage)
  requireArchive(value.attemptId === attemptIdFor(value.identity), "BUNDLE_ATTEMPT_ID")
  requireArchive(isSha256(value.sourceFingerprint), "BUNDLE_SOURCE_FINGERPRINT")
  keys(value.xml, ["byteLength", "sha256", "encoding"])
  keys(value.privateState, ["byteLength", "sha256"])
  requireArchive(value.xml.encoding === "UTF-8", "BUNDLE_XML_ENCODING")
  requireArchive(isSha256(value.xml.sha256) && isSha256(value.privateState.sha256), "BUNDLE_SEGMENT_HASH")
  length(value.xml.byteLength, SEGMENT_LIMITS.xml)
  length(value.privateState.byteLength, SEGMENT_LIMITS.privateState)
}

export function createArchiveBundle(input: ArchiveSource): ArchiveBundle {
  const source = freezeSource(input)
  const xml = source.xml
  const privateStateBytes = canonicalBytes(source.privateState)
  length(xml.byteLength, SEGMENT_LIMITS.xml)
  validateXmlEncoding(xml)
  requireArchive(source.privateState.lineage.parentAttemptId !== attemptIdFor(source.identity), "BUNDLE_SELF_LINEAGE")
  length(privateStateBytes.byteLength, SEGMENT_LIMITS.privateState)
  const xmlDescriptor = descriptor(xml)
  const privateDescriptor = descriptor(privateStateBytes)
  const manifest: ArchiveManifest = frozenJsonCopy<ArchiveManifest>({
    format: BUNDLE_FORMAT, version: 1, serializer: SERIALIZER,
    identity: source.identity, attemptId: attemptIdFor(source.identity),
    sourceFingerprint: fingerprintFor(source.identity, xmlDescriptor, privateDescriptor),
    lineage: source.privateState.lineage,
    xml: { ...xmlDescriptor, encoding: "UTF-8" }, privateState: privateDescriptor,
  })
  const manifestBytes = canonicalBytes(manifest)
  length(manifestBytes.byteLength, SEGMENT_LIMITS.manifest)
  const header = Buffer.alloc(HEADER_BYTES)
  MAGIC.copy(header)
  header.writeUInt16BE(1, 8)
  header.writeUInt16BE(0, 10) // Reserved flags: must be zero.
  header.writeUInt32BE(manifestBytes.byteLength, 12)
  header.writeUInt32BE(xml.byteLength, 16)
  header.writeUInt32BE(privateStateBytes.byteLength, 20)
  const bytes = Buffer.concat([header, manifestBytes, xml, privateStateBytes])
  return Object.freeze({ bytes, manifestBytes, manifest, bundleSha256: sha256(bytes), manifestSha256: sha256(manifestBytes) })
}

export function decodeArchiveBundle(input: Uint8Array, expected?: BundleHashes): DecodedArchive {
  requireArchive(input instanceof Uint8Array, "BUNDLE_BYTES_REQUIRED")
  requireArchive(input.byteLength >= HEADER_BYTES && input.byteLength <= HEADER_BYTES + SEGMENT_LIMITS.manifest + SEGMENT_LIMITS.xml + SEGMENT_LIMITS.privateState, "BUNDLE_TOTAL_LENGTH")
  const bytes = Buffer.from(input) // Isolate caller-owned memory.
  requireArchive(bytes.subarray(0, 8).equals(MAGIC), "BUNDLE_MAGIC")
  requireArchive(bytes.readUInt16BE(8) === 1 && bytes.readUInt16BE(10) === 0, "BUNDLE_HEADER_VERSION")
  const manifestLength = bytes.readUInt32BE(12)
  const xmlLength = bytes.readUInt32BE(16)
  const privateLength = bytes.readUInt32BE(20)
  length(manifestLength, SEGMENT_LIMITS.manifest)
  length(xmlLength, SEGMENT_LIMITS.xml)
  length(privateLength, SEGMENT_LIMITS.privateState)
  requireArchive(bytes.length === HEADER_BYTES + manifestLength + xmlLength + privateLength, "BUNDLE_TRUNCATED_OR_EXTRA")
  const manifestBytes = bytes.subarray(HEADER_BYTES, HEADER_BYTES + manifestLength)
  const xml = bytes.subarray(HEADER_BYTES + manifestLength, HEADER_BYTES + manifestLength + xmlLength)
  const privateStateBytes = bytes.subarray(HEADER_BYTES + manifestLength + xmlLength)
  validateXmlEncoding(xml)
  const bundleSha256 = sha256(bytes)
  const manifestSha256 = sha256(manifestBytes)
  if (expected) {
    keys(expected, ["bundleSha256", "manifestSha256"])
    requireArchive(isSha256(expected.bundleSha256) && isSha256(expected.manifestSha256), "BUNDLE_EXPECTED_HASH")
    requireArchive(expected.bundleSha256 === bundleSha256 && expected.manifestSha256 === manifestSha256, "BUNDLE_EXTERNAL_HASH_MISMATCH")
  }
  const manifest = parseCanonical(manifestBytes)
  validateManifest(manifest)
  requireArchive(manifest.xml.byteLength === xmlLength && manifest.privateState.byteLength === privateLength, "BUNDLE_MANIFEST_LENGTH")
  requireArchive(manifest.xml.sha256 === sha256(xml) && manifest.privateState.sha256 === sha256(privateStateBytes), "BUNDLE_SEGMENT_CORRUPTED")
  requireArchive(
    manifest.sourceFingerprint === fingerprintFor(manifest.identity, descriptor(xml), descriptor(privateStateBytes)),
    "BUNDLE_FINGERPRINT_MISMATCH",
  )
  const privateState = parseCanonical(privateStateBytes)
  validatePrivateState(privateState)
  requireArchive(canonicalJson(manifest.lineage) === canonicalJson(privateState.lineage), "BUNDLE_LINEAGE_MISMATCH")
  requireArchive(manifest.lineage.parentAttemptId !== manifest.attemptId, "BUNDLE_SELF_LINEAGE")
  return Object.freeze({
    bytes, manifestBytes: Buffer.from(manifestBytes), xml: Buffer.from(xml),
    privateStateBytes: Buffer.from(privateStateBytes), manifest: frozenJsonCopy(manifest),
    privateState: frozenJsonCopy(privateState), bundleSha256, manifestSha256,
  })
}
