/** Synthetic offline fixtures. No record, identifier or event is production evidence. */
import { sha256, canonicalJson } from "./canonical"
import type { ArchiveIdentity, ArchiveSource, PrivateState } from "./contracts"
import { B1_COVERAGE, REQUIRED_GUARDS, RUNTIME_CATEGORIES } from "./inventories"
import type { B1Inventory, B3Inventory, RuntimeRequirement } from "./inventories"
import { MemoryArchiveFake } from "./memory-fake"
import type { SimulationCustody } from "./memory-fake"
import type { IdentityObservation, OfflinePreflightInput } from "./policies"

export const CHECKED_AT = "2030-01-02T00:00:00.000Z"
export const CUSTODY: SimulationCustody = {
  capturedAt: "2030-01-01T00:00:00.000Z",
  checkedAt: CHECKED_AT,
  minimumRetainUntil: "2030-02-01T00:00:00.000Z",
  retainUntil: "2030-03-01T00:00:00.000Z",
}
export const RUNTIME_REQUIREMENT: RuntimeRequirement = {
  primaryProjectId: "SYNTHETIC-project-primary",
  secondaryProjectId: "SYNTHETIC-project-secondary",
  requiredSha: "a".repeat(40), requiredVersion: "SYNTHETIC-guards-v1",
}
export function makeSource(patch: Partial<ArchiveIdentity> = {}): ArchiveSource {
  const identity: ArchiveIdentity = {
    storeId: "SYNTHETIC-store-A", vendaId: "SYNTHETIC-sale-A", notaFiscalId: "SYNTHETIC-note-A",
    jobId: "SYNTHETIC-original-job-A", jobType: "EMISSAO", dedupeKey: "SYNTHETIC-original-dedupe",
    historicalAttempt: 1, modelo: "NFCE", ambiente: "HOMOLOGACAO", provider: "SEFAZ_DIRETO",
    serieFiscalId: "SYNTHETIC-series-A", serie: 1, numero: 2, chave: "9".repeat(44),
    historicalDiscriminator: { eventId: "SYNTHETIC-persisted-event", proven: true }, ...patch,
  }
  const xml = Buffer.from("\uFEFF<synthetic fixture=\"offline-only\">\r\n  ação e\u0301\r\n</synthetic>  \r\n", "utf8")
  const hash = sha256(xml)
  const versions = {
    sourceVersion: "SYNTHETIC-source-v1", serviceVersion: "SYNTHETIC-service-v1",
    matrixVersion: "SYNTHETIC-historical-matrix-v0", executedSha: "b".repeat(40),
  }
  const historicalError = { errorExact: "SYNTHETIC exact historical failure [588]", detailCode: "SYNTHETIC_HISTORICAL_588" }
  const privateState: PrivateState = {
    version: 1,
    metadata: {
      digestValue: { status: "PRESENT", value: "SYNTHETIC-digest" },
      qrCodeData: { status: "NOT_PERSISTED" }, urlConsulta: { status: "NULL" },
      ultimoErro: { status: "PRESENT", value: historicalError.errorExact },
    },
    frozenSource: {
      version: versions.sourceVersion,
      emitente: { fixture: "SYNTHETIC-issuer" }, destinatario: { fixture: "SYNTHETIC-recipient" },
      pagamento: { fixture: "SYNTHETIC-payment" }, tributacao: { fixture: "SYNTHETIC-tax" },
      diagnostico: { fixture: true, optionalHistoricalValue: null },
      itens: [{ id: "SYNTHETIC-item", ordinal: 1, snapshot: { fixture: true, quantidade: 1, valor: 1.25 } }],
    },
    originalState: {
      nota: {
        id: identity.notaFiscalId, storeId: identity.storeId, vendaId: identity.vendaId, serieFiscalId: identity.serieFiscalId,
        serie: identity.serie, numero: identity.numero, chave: identity.chave, modelo: identity.modelo,
        ambiente: identity.ambiente, provider: identity.provider, status: "TRANSMITINDO", vigente: true,
        xMotivo: { status: "NOT_PERSISTED" }, protocolo: { status: "NOT_PERSISTED" },
      },
      job: {
        id: identity.jobId, storeId: identity.storeId, vendaId: identity.vendaId, notaFiscalId: identity.notaFiscalId,
        tipo: "EMISSAO", dedupeKey: identity.dedupeKey, tentativas: 1, maxTentativas: 1,
        locks: null, payload: { fixture: true },
      },
      consulta: { id: "SYNTHETIC-consult-job", dedupeKey: "SYNTHETIC-consult-dedupe", outcome: "NOT_FOUND", payload: { fixture: true } },
      serie: { id: identity.serieFiscalId, storeId: identity.storeId, serie: identity.serie, proximoNumero: 3 },
      venda: { id: identity.vendaId, storeId: identity.storeId, notaFiscalId: identity.notaFiscalId, fiscalStatus: "PENDENTE" },
    },
    historicalError,
    observedVersions: versions,
    lineage: { parentAttemptId: null, noParentProven: true, historicalCorrelation: identity.historicalDiscriminator.eventId },
    historical588: {
      evidenceKind: "SYNTHETIC_OFFLINE",
      persisted: {
        id: identity.historicalDiscriminator.eventId, at: "2020-01-01T00:00:00.000Z",
        type: "persisted_before_transmission", identity: structuredClone(identity), xmlSha256: hash,
      },
      uncertain: {
        id: "SYNTHETIC-uncertain-event", at: "2020-01-01T00:01:00.000Z", type: "uncertain",
        identity: structuredClone(identity), xmlSha256: hash, persistedEventId: identity.historicalDiscriminator.eventId,
        cStat: 588, ...historicalError, operation: "NFeAutorizacao4",
        serviceVersion: versions.serviceVersion, matrixVersion: versions.matrixVersion, executedSha: versions.executedSha,
      },
      execution: { ...versions, historicalExecutionProven: true, operation: "NFeAutorizacao4" },
      consultation: {
        jobId: "SYNTHETIC-consult-job", jobType: "CONSULTA", originalJobId: identity.jobId,
        dedupeKey: "SYNTHETIC-consult-dedupe", identity: structuredClone(identity), status: "CONCLUIDO", outcome: "NOT_FOUND",
        consulted: { id: "SYNTHETIC-consult-event", at: "2020-01-01T00:02:00.000Z", uncertainEventId: "SYNTHETIC-uncertain-event" },
        completed: { id: "SYNTHETIC-completed-event", at: "2020-01-01T00:03:00.000Z", consultedEventId: "SYNTHETIC-consult-event" },
      },
      xMotivoHistorical: { status: "NOT_PERSISTED" },
    },
  }
  return { identity, xml, privateState }
}
export function identityObservation(source: ArchiveSource): IdentityObservation {
  return {
    identity: source.identity, emissionJobIds: [source.identity.jobId], notaFiscalIds: [source.identity.notaFiscalId],
    lineage: source.privateState.lineage, versions: source.privateState.observedVersions,
  }
}
export function makeB1(source = makeSource()): B1Inventory {
  return {
    kind: "B1-R1", evidenceKind: "SYNTHETIC_OFFLINE", target: source.identity,
    completeness: Object.fromEntries(B1_COVERAGE.map((field) => [field, true])) as B1Inventory["completeness"],
    exhaustiveQueryProven: true, observations: [], observedVersion: "SYNTHETIC-b1-r1", revalidatedVersion: "SYNTHETIC-b1-r1", checkedAt: CHECKED_AT,
  }
}
export function makeB3(source = makeSource()): B3Inventory {
  return {
    kind: "B3-R1", evidenceKind: "SYNTHETIC_OFFLINE", target: source.identity,
    observedVersion: "SYNTHETIC-b3-r1", revalidatedVersion: "SYNTHETIC-b3-r1", checkedAt: CHECKED_AT,
    coverage: Object.fromEntries(RUNTIME_CATEGORIES.map((category) => [category, {
      complete: true, proofId: "SYNTHETIC-coverage-" + category, absent: null,
    }])) as B3Inventory["coverage"],
    runtimes: RUNTIME_CATEGORIES.map((category) => ({
      id: "SYNTHETIC-runtime-" + category, category,
      projectId: category === "PRODUCTION_PRIMARY" ? RUNTIME_REQUIREMENT.primaryProjectId : RUNTIME_REQUIREMENT.secondaryProjectId,
      deploymentId: "SYNTHETIC-deployment-" + category, effectiveSha: RUNTIME_REQUIREMENT.requiredSha,
      effectiveVersion: RUNTIME_REQUIREMENT.requiredVersion, credentialsVerified: true,
      productionStatus: category.startsWith("PRODUCTION_") ? "READY" : "NOT_APPLICABLE",
      proofId: "SYNTHETIC-runtime-proof-" + category,
      safety: { kind: "GUARDED", guards: Object.fromEntries(REQUIRED_GUARDS.map((guard) => [guard, true])) as Record<typeof REQUIRED_GUARDS[number], true> },
    })),
  }
}
export async function makePreflight(source = makeSource(), fake = new MemoryArchiveFake()): Promise<OfflinePreflightInput> {
  const result = await fake.simulateArchive(source, CUSTODY)
  if (result.status === "BLOCKED") throw new Error("SYNTHETIC_FIXTURE_SETUP_FAILED")
  const { reference } = result
  return {
    source, observedIdentity: identityObservation(source), b1: makeB1(source), b3: makeB3(source),
    archive: {
      reference, readbackBytes: (await fake.readExactVersion(reference.locator)).bytes,
      retention: await fake.verifyRetention(reference.locator, { checkedAt: CUSTODY.checkedAt, minimumRetainUntil: CUSTODY.minimumRetainUntil }),
      protectedReference: {
        kind: "SIMULATED_PROTECTED_REFERENCE", referenceSha256: sha256(canonicalJson(reference)),
        observedFingerprint: reference.sourceFingerprint, revalidatedAt: CUSTODY.checkedAt,
      },
    },
    retentionRequirement: { checkedAt: CUSTODY.checkedAt, minimumRetainUntil: CUSTODY.minimumRetainUntil },
    runtimeRequirement: RUNTIME_REQUIREMENT,
  }
}
export type Mutable<T> =
  T extends string | number | boolean | null | undefined ? T :
  T extends Uint8Array ? T :
  T extends readonly (infer U)[] ? Mutable<U>[] :
  T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T
export function mutable<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T> }
