import { canonicalJson, keys, record, requireArchive, textField, timestamp } from "./canonical"
import { validateIdentity } from "./contracts"
import type { ArchiveIdentity } from "./contracts"

export const B1_COVERAGE = ["allStates", "aInutilizarMarks", "events", "ranges", "indirectLinks", "orphans", "ambiguities"] as const
export const RUNTIME_CATEGORIES = [
  "PRODUCTION_PRIMARY", "PRODUCTION_SECONDARY", "CRON_WORKER", "INTERNAL_QUEUE_ROUTE",
  "OLD_DEPLOYMENT", "PREVIEW_PRODUCTION_CREDENTIALS", "EXTERNAL_PROCESS",
] as const
export const REQUIRED_GUARDS = ["emission", "reconciliation", "queue", "inutilizacao", "admin", "ports"] as const
export type RuntimeCategory = typeof RUNTIME_CATEGORIES[number]

export interface InventoryRevision {
  readonly observedVersion: string
  readonly revalidatedVersion: string
  readonly checkedAt: string
}
export interface InutilizacaoObservation {
  readonly id: string
  readonly kind: "INUTILIZACAO" | "A_INUTILIZAR" | "EVENT" | "RANGE" | "INDIRECT_LINK" | "ORPHAN" | "AMBIGUITY"
  readonly state: string
  readonly storeId: string
  readonly modelo: string | null
  readonly ambiente: string | null
  readonly serieFiscalId: string | null
  readonly serie: number | null
  readonly from: number | null
  readonly to: number | null
  readonly notaFiscalIds: readonly string[]
  readonly vendaIds: readonly string[]
  readonly jobIds: readonly string[]
  readonly correlationProven: boolean
}
export interface B1Inventory extends InventoryRevision {
  readonly kind: "B1-R1"
  readonly evidenceKind: "SYNTHETIC_OFFLINE"
  readonly target: ArchiveIdentity
  readonly completeness: Readonly<Record<typeof B1_COVERAGE[number], true>>
  readonly exhaustiveQueryProven: true
  readonly observations: readonly InutilizacaoObservation[]
}
export interface RuntimeObservation {
  readonly id: string
  readonly category: RuntimeCategory
  readonly projectId: string
  readonly deploymentId: string
  readonly effectiveSha: string
  readonly effectiveVersion: string
  readonly credentialsVerified: true
  readonly productionStatus: "READY" | "NOT_APPLICABLE"
  readonly proofId: string
  readonly safety:
    | { readonly kind: "GUARDED"; readonly guards: Readonly<Record<typeof REQUIRED_GUARDS[number], true>> }
    | { readonly kind: "NO_WRITE_PROVEN"; readonly writingImpossible: true }
}
export interface RuntimeCoverage {
  readonly complete: true
  readonly proofId: string
  readonly absent:
    | null
    | { readonly kind: "NO_WRITERS_PROVEN"; readonly credentialsVerified: true; readonly proofId: string }
}
export interface B3Inventory extends InventoryRevision {
  readonly kind: "B3-R1"
  readonly evidenceKind: "SYNTHETIC_OFFLINE"
  readonly target: ArchiveIdentity
  readonly coverage: Readonly<Record<RuntimeCategory, RuntimeCoverage>>
  readonly runtimes: readonly RuntimeObservation[]
}
export interface RuntimeRequirement {
  readonly primaryProjectId: string
  readonly secondaryProjectId: string
  readonly requiredSha: string
  readonly requiredVersion: string
}

function revision(value: Record<string, unknown>, checkedAt: string): void {
  textField(value.observedVersion)
  textField(value.revalidatedVersion)
  timestamp(value.checkedAt)
  timestamp(checkedAt)
  requireArchive(value.observedVersion === value.revalidatedVersion && value.checkedAt === checkedAt, "INVENTORY_DRIFT_OR_STALE")
}
function targetScope(value: Record<string, unknown>, target: ArchiveIdentity): void {
  validateIdentity(target)
  validateIdentity(value.target)
  requireArchive(canonicalJson(value.target) === canonicalJson(target), "INVENTORY_TARGET_MISMATCH")
  requireArchive(value.evidenceKind === "SYNTHETIC_OFFLINE", "OFFLINE_EVIDENCE_ONLY")
}
function stringList(value: unknown): asserts value is string[] {
  requireArchive(Array.isArray(value), "INVENTORY_LINK_LIST")
  value.forEach(textField)
  requireArchive(new Set(value).size === value.length, "INVENTORY_DUPLICATE_LINK")
}

export function assertB1Inventory(input: unknown, target: ArchiveIdentity, checkedAt: string): asserts input is B1Inventory {
  canonicalJson(input)
  keys(input, ["kind", "evidenceKind", "target", "completeness", "exhaustiveQueryProven", "observations", "observedVersion", "revalidatedVersion", "checkedAt"])
  requireArchive(input.kind === "B1-R1" && input.exhaustiveQueryProven === true, "B1_INCOMPLETE")
  targetScope(input, target)
  revision(input, checkedAt)
  keys(input.completeness, B1_COVERAGE)
  requireArchive(Object.values(input.completeness).every((covered) => covered === true), "B1_INCOMPLETE")
  requireArchive(Array.isArray(input.observations), "B1_INCOMPLETE")
  const ids = new Set<string>()
  for (const row of input.observations) {
    keys(row, ["id", "kind", "state", "storeId", "modelo", "ambiente", "serieFiscalId", "serie", "from", "to", "notaFiscalIds", "vendaIds", "jobIds", "correlationProven"])
    textField(row.id)
    textField(row.state) // All states are inventoried, including terminal/unknown ones.
    requireArchive(!ids.has(row.id), "B1_DUPLICATE")
    ids.add(row.id)
    requireArchive(["INUTILIZACAO", "A_INUTILIZAR", "EVENT", "RANGE", "INDIRECT_LINK", "ORPHAN", "AMBIGUITY"].includes(String(row.kind)), "B1_UNKNOWN_KIND")
    requireArchive(row.storeId === target.storeId && row.correlationProven === true, "B1_AMBIGUOUS_SCOPE")
    requireArchive(row.kind !== "ORPHAN" && row.kind !== "AMBIGUITY", "B1_UNRESOLVED_OCCURRENCE")
    requireArchive(
      typeof row.modelo === "string" && typeof row.ambiente === "string" && typeof row.serieFiscalId === "string"
      && Number.isInteger(row.serie) && Number(row.serie) >= 0 && Number(row.serie) <= 999
      && Number.isSafeInteger(row.from) && Number(row.from) >= 1
      && Number.isSafeInteger(row.to) && Number(row.to) >= Number(row.from) && Number(row.to) <= 999_999_999,
      "B1_AMBIGUOUS_RANGE",
    )
    textField(row.modelo)
    textField(row.ambiente)
    textField(row.serieFiscalId)
    requireArchive(["NFCE", "NFE"].includes(row.modelo) && ["HOMOLOGACAO", "PRODUCAO"].includes(row.ambiente), "B1_AMBIGUOUS_SCOPE")
    requireArchive(row.serieFiscalId !== target.serieFiscalId || row.serie === target.serie, "B1_AMBIGUOUS_SERIE")
    stringList(row.notaFiscalIds)
    stringList(row.vendaIds)
    stringList(row.jobIds)
    const linked = row.notaFiscalIds.includes(target.notaFiscalId) || row.vendaIds.includes(target.vendaId) || row.jobIds.includes(target.jobId)
    const sameSeries = row.modelo === target.modelo && row.ambiente === target.ambiente
      && (row.serieFiscalId === target.serieFiscalId || row.serie === target.serie)
    const reaches = sameSeries && Number(row.from) <= target.numero && Number(row.to) >= target.numero
    requireArchive(!linked && !reaches, "B1_TARGET_REACHED")
  }
}

export function assertB3Inventory(input: unknown, target: ArchiveIdentity, checkedAt: string, requirement: RuntimeRequirement): asserts input is B3Inventory {
  canonicalJson(input)
  keys(requirement, ["primaryProjectId", "secondaryProjectId", "requiredSha", "requiredVersion"])
  textField(requirement.primaryProjectId)
  textField(requirement.secondaryProjectId)
  textField(requirement.requiredVersion)
  requireArchive(requirement.primaryProjectId !== requirement.secondaryProjectId && /^[a-f0-9]{40}$/.test(requirement.requiredSha), "B3_REQUIREMENT")
  keys(input, ["kind", "evidenceKind", "target", "coverage", "runtimes", "observedVersion", "revalidatedVersion", "checkedAt"])
  requireArchive(input.kind === "B3-R1", "B3_INCOMPLETE")
  targetScope(input, target)
  revision(input, checkedAt)
  keys(input.coverage, RUNTIME_CATEGORIES)
  requireArchive(Array.isArray(input.runtimes), "B3_INCOMPLETE")
  const ids = new Set<string>()
  for (const row of input.runtimes) {
    keys(row, ["id", "category", "projectId", "deploymentId", "effectiveSha", "effectiveVersion", "credentialsVerified", "productionStatus", "proofId", "safety"])
    textField(row.id)
    requireArchive(!ids.has(row.id), "B3_DUPLICATE_RUNTIME")
    ids.add(row.id)
    requireArchive(RUNTIME_CATEGORIES.includes(row.category as RuntimeCategory), "B3_UNKNOWN_RUNTIME")
    for (const field of ["projectId", "deploymentId", "effectiveVersion", "proofId"] as const) textField(row[field])
    requireArchive(typeof row.effectiveSha === "string" && /^[a-f0-9]{40}$/.test(row.effectiveSha), "B3_UNPROVEN_SHA")
    requireArchive(row.credentialsVerified === true, "B3_UNVERIFIED_CREDENTIALS")
    const production = row.category === "PRODUCTION_PRIMARY" || row.category === "PRODUCTION_SECONDARY"
    requireArchive(row.productionStatus === (production ? "READY" : "NOT_APPLICABLE"), "B3_DEPLOYMENT_NOT_READY")
    if (row.category === "PRODUCTION_PRIMARY") requireArchive(row.projectId === requirement.primaryProjectId, "B3_PROJECT_SCOPE")
    if (row.category === "PRODUCTION_SECONDARY") requireArchive(row.projectId === requirement.secondaryProjectId, "B3_PROJECT_SCOPE")
    record(row.safety)
    if (row.safety.kind === "GUARDED") {
      keys(row.safety, ["kind", "guards"])
      keys(row.safety.guards, REQUIRED_GUARDS)
      requireArchive(Object.values(row.safety.guards).every((guard) => guard === true), "B3_GUARD_MISSING")
      requireArchive(row.effectiveSha === requirement.requiredSha && row.effectiveVersion === requirement.requiredVersion, "B3_OLD_OR_DRIFTED_VERSION")
    } else {
      keys(row.safety, ["kind", "writingImpossible"])
      requireArchive(row.safety.kind === "NO_WRITE_PROVEN" && row.safety.writingImpossible === true, "B3_WRITER_UNSAFE")
    }
  }
  for (const category of RUNTIME_CATEGORIES) {
    const coverage = input.coverage[category]
    keys(coverage, ["complete", "proofId", "absent"])
    requireArchive(coverage.complete === true, "B3_INCOMPLETE")
    textField(coverage.proofId)
    const rows = input.runtimes.filter((row: RuntimeObservation) => row.category === category)
    if (coverage.absent === null) {
      requireArchive(rows.length > 0, "B3_MISSING_RUNTIME")
    } else {
      requireArchive(category !== "PRODUCTION_PRIMARY" && category !== "PRODUCTION_SECONDARY" && rows.length === 0, "B3_ABSENCE_CONTRADICTION")
      keys(coverage.absent, ["kind", "credentialsVerified", "proofId"])
      textField(coverage.absent.proofId)
      requireArchive(coverage.absent.kind === "NO_WRITERS_PROVEN" && coverage.absent.credentialsVerified === true, "B3_ABSENCE_UNPROVEN")
    }
  }
}
