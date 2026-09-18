/**
 * Barrel público da fundação de identidade/dedupe de Cliente (CAD-R2-018-A).
 *
 * Puro: pode ser importado por testes e pelo ClientWriteService futuro.
 * O adapter Prisma (`lookup-prisma.ts`) NÃO é reexportado daqui — é server-only.
 */

export type {
  ClientIdentityScope,
  ClientIdentityInput,
  ClientDocumentKind,
  ClientDocumentSignal,
  ClientPhoneSignal,
  ClientEmailSignal,
  ClientNameSignal,
  ClientIdentitySignals,
  ClientIdentityOutcome,
  ClientIdentityMatchReason,
  ClientIdentityPairOutcome,
  ClientIdentityRecord,
  ClientIdentityCandidateRef,
  ClientIdentityTelemetry,
  ClientIdentityVerdict,
  ClientWriteIdentityHandoff,
} from "./types"
export {
  CLIENT_IDENTITY_AUTO_MERGE,
  CLIENT_IDENTITY_AI_DECISION,
  CLIENT_WRITE_SERVICE_IMPLEMENTED,
  CLIENT_MERGE_IMPLEMENTED,
} from "./types"

export {
  normalizeDocumentDigits,
  isValidCpf,
  isValidClientDocument,
  detectDocumentKind,
  toDocumentSignal,
  toStrongDocumentKey,
} from "./document"

export { normalizeClientEmail, toEmailSignal } from "./email"
export { normalizeClientPhoneDigits, toPhoneSignal } from "./phone"
export { normalizeClientName, toNameSignal } from "./name"

export {
  toClientIdentitySignals,
  signalsFromRecord,
  hasStrongIdentityKey,
  hasContactSignal,
  hasAnyIdentitySignal,
} from "./signals"

export type { PairClassification } from "./policy"
export { classifyIdentityPair, classifyClientIdentity } from "./policy"

export type { ClientIdentityLookupKeys, ClientIdentityRecordSource } from "./lookup"
export {
  lookupKeysFromSignals,
  createMemoryClientIdentitySource,
  discoverClientIdentityCandidates,
} from "./lookup"

export { sanitizedClientIdentityTelemetry, CLIENT_IDENTITY_ERRORS } from "./telemetry"

export type { ClientWriterKind, ClientWriterInventoryEntry } from "./writers-inventory"
export {
  CLIENT_WRITER_INVENTORY,
  ACTIVE_CLIENT_WRITERS,
  CLIENT_IDENTITY_FIELDS,
} from "./writers-inventory"
