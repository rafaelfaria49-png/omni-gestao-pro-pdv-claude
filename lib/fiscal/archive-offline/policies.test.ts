import { describe, expect, it } from "vitest"
import { sha256 } from "./canonical"
import { CHECKED_AT, CUSTODY, makeB1, makeB3, makePreflight, makeSource, mutable, RUNTIME_REQUIREMENT } from "./fixtures"
import type { Mutable } from "./fixtures"
import type { ArchiveSource } from "./contracts"
import type { B1Inventory, InutilizacaoObservation } from "./inventories"
import { B1_COVERAGE, REQUIRED_GUARDS, RUNTIME_CATEGORIES } from "./inventories"
import { OFFLINE_CAPABILITY, validateRetention } from "./ports"
import { preflightOffline, validateHistorical588, validateInutilizacaoInventory, validateRuntimeInventory } from "./policies"

function changePath(object: unknown, path: string, value: unknown, remove = false): void {
  const parts = path.split(".")
  let parent = object as Record<string, unknown>
  for (const part of parts.slice(0, -1)) parent = parent[part] as Record<string, unknown>
  const last = parts[parts.length - 1]
  if (remove) delete parent[last]
  else parent[last] = value
}
function unrelatedObservation(source = makeSource()): InutilizacaoObservation {
  return {
    id: "SYNTHETIC-inutilizacao", kind: "INUTILIZACAO", state: "SYNTHETIC-TERMINAL-STATE",
    storeId: source.identity.storeId, modelo: source.identity.modelo, ambiente: source.identity.ambiente,
    serieFiscalId: source.identity.serieFiscalId, serie: source.identity.serie, from: 10, to: 12,
    notaFiscalIds: [], vendaIds: [], jobIds: [], correlationProven: true,
  }
}

describe("positive historical provenance B2", () => {
  it("accepts only a complete correlated synthetic chain and never manufactures xMotivo", () => {
    const source = makeSource()
    expect(validateHistorical588(source)).toEqual({ ok: true, reasons: [], capability: OFFLINE_CAPABILITY })
    expect(source.privateState.historical588.xMotivoHistorical).toEqual({ status: "NOT_PERSISTED" })
  })
  it.each([
    "persisted", "persisted.id", "persisted.at", "persisted.identity", "persisted.xmlSha256", "persisted.type",
    "uncertain", "uncertain.persistedEventId", "uncertain.cStat", "uncertain.errorExact", "uncertain.detailCode",
    "uncertain.operation", "uncertain.serviceVersion", "uncertain.matrixVersion", "uncertain.executedSha",
    "execution", "execution.historicalExecutionProven", "execution.executedSha",
    "consultation", "consultation.originalJobId", "consultation.dedupeKey", "consultation.consulted",
    "consultation.completed", "consultation.completed.consultedEventId", "xMotivoHistorical",
  ])("refuses missing historical proof %s", (path) => {
    const source = mutable(makeSource())
    changePath(source.privateState.historical588, path, undefined, true)
    const result = validateHistorical588(source)
    expect(result.ok).toBe(false)
    expect(result.capability).toEqual(OFFLINE_CAPABILITY)
  })
  it.each([
    ["persisted.identity.storeId", "SYNTHETIC-other-store"], ["uncertain.identity.vendaId", "SYNTHETIC-other-sale"],
    ["uncertain.identity.notaFiscalId", "SYNTHETIC-other-note"], ["uncertain.identity.jobId", "SYNTHETIC-other-job"],
    ["uncertain.identity.dedupeKey", "SYNTHETIC-other-dedupe"], ["consultation.identity.chave", "8".repeat(44)],
    ["persisted.xmlSha256", sha256("other")], ["uncertain.xmlSha256", sha256("other")],
    ["uncertain.persistedEventId", "SYNTHETIC-other"], ["uncertain.cStat", 589],
    ["uncertain.errorExact", "contains 588 but different"], ["uncertain.detailCode", "OTHER_588"],
    ["uncertain.operation", "NFeConsultaProtocolo4"], ["uncertain.serviceVersion", "SYNTHETIC-other"],
    ["uncertain.matrixVersion", "SYNTHETIC-current-matrix"], ["uncertain.executedSha", "c".repeat(40)],
    ["execution.executedSha", "c".repeat(40)], ["execution.sourceVersion", "SYNTHETIC-other"],
    ["execution.historicalExecutionProven", false],
    ["consultation.originalJobId", "SYNTHETIC-other-job"], ["consultation.jobId", "SYNTHETIC-original-job-A"],
    ["consultation.dedupeKey", "SYNTHETIC-other-dedupe"], ["consultation.outcome", "FOUND"],
    ["consultation.status", "PENDENTE"], ["consultation.consulted.uncertainEventId", "SYNTHETIC-other"],
    ["consultation.completed.consultedEventId", "SYNTHETIC-other"],
    ["uncertain.at", "2019-01-01T00:00:00.000Z"], ["consultation.consulted.at", "2019-01-01T00:00:00.000Z"],
    ["consultation.completed.at", "2019-01-01T00:00:00.000Z"],
    ["persisted.at", "not-a-timestamp"], ["xMotivoHistorical", { status: "PRESENT", value: "current matrix reason" }],
    ["evidenceKind", "PRODUCTION"],
  ])("refuses divergent or fabricated B2 proof %s", (path, value) => {
    const source = mutable(makeSource()); changePath(source.privateState.historical588, path, value)
    const result = validateHistorical588(source)
    expect(result.ok).toBe(false)
    expect(result.capability).toEqual(OFFLINE_CAPABILITY)
    expect(result.reasons.join()).not.toContain("current matrix reason")
  })
  it("refuses NOT_FOUND by itself and changed original bytes", () => {
    const source = makeSource()
    const evidence = { consultation: source.privateState.historical588.consultation }
    expect(validateHistorical588({ ...source, privateState: { ...source.privateState, historical588: evidence } as typeof source.privateState }).ok).toBe(false)
    const changed = mutable(source); changed.xml[changed.xml.length - 1] ^= 1
    expect(validateHistorical588(changed).ok).toBe(false)
  })
})

describe("B1-R1 inventories of all existing inutilizacoes", () => {
  it("accepts a complete empty inventory and complete unrelated rows in every state", () => {
    const source = makeSource()
    expect(validateInutilizacaoInventory(makeB1(source), source.identity, CHECKED_AT).ok).toBe(true)
    const inventory = mutable(makeB1(source))
    inventory.observations = ["PENDING", "RUNNING", "FAILED", "COMPLETED", "CANCELED", "UNKNOWN"].map((state, index) => ({
      ...mutable(unrelatedObservation(source)), id: "SYNTHETIC-row-" + index, state,
    }))
    expect(validateInutilizacaoInventory(inventory, source.identity, CHECKED_AT).ok).toBe(true)
  })
  it.each(B1_COVERAGE)("refuses incomplete B1 coverage %s", (field) => {
    const inventory = mutable(makeB1()); changePath(inventory, "completeness." + field, false)
    expect(validateInutilizacaoInventory(inventory, makeSource().identity, CHECKED_AT).ok).toBe(false)
  })
  it.each(["INUTILIZACAO", "A_INUTILIZAR", "EVENT", "RANGE", "INDIRECT_LINK", "ORPHAN", "AMBIGUITY"])("blocks target occurrence or ambiguity %s", (kind) => {
    const inventory = mutable(makeB1())
    inventory.observations = [{ ...mutable(unrelatedObservation()), kind: kind as InutilizacaoObservation["kind"], from: 1, to: 3 }]
    const result = validateInutilizacaoInventory(inventory, makeSource().identity, CHECKED_AT)
    expect(result.ok).toBe(false)
    expect(result.capability).toEqual(OFFLINE_CAPABILITY)
  })
  it.each(["notaFiscalIds", "vendaIds", "jobIds"] as const)("blocks indirect target link %s even outside the number range", (field) => {
    const source = makeSource()
    const inventory = mutable(makeB1(source))
    const row = mutable(unrelatedObservation(source))
    row[field] = [field === "notaFiscalIds" ? source.identity.notaFiscalId : field === "vendaIds" ? source.identity.vendaId : source.identity.jobId]
    inventory.observations = [row]
    expect(validateInutilizacaoInventory(inventory, source.identity, CHECKED_AT).ok).toBe(false)
  })
  it.each([
    ["exhaustiveQueryProven", false], ["revalidatedVersion", "SYNTHETIC-drift"],
    ["checkedAt", "2030-01-01T00:00:00.000Z"], ["target.storeId", "SYNTHETIC-other-store"],
  ])("refuses incomplete/revalidation-drift B1 %s", (path, value) => {
    const inventory = mutable(makeB1()); changePath(inventory, path, value)
    expect(validateInutilizacaoInventory(inventory, makeSource().identity, CHECKED_AT).ok).toBe(false)
  })
  it("blocks orphan, uncorrelated, missing range and duplicate observations", () => {
    for (const patch of [{ kind: "ORPHAN" }, { correlationProven: false }, { from: null }, { serieFiscalId: null }, { to: 0 }]) {
      const inventory = mutable(makeB1())
      inventory.observations = [{ ...unrelatedObservation(), ...patch } as Mutable<InutilizacaoObservation>]
      expect(validateInutilizacaoInventory(inventory, makeSource().identity, CHECKED_AT).ok).toBe(false)
    }
    const inventory: B1Inventory = { ...makeB1(), observations: [unrelatedObservation(), unrelatedObservation()] }
    expect(validateInutilizacaoInventory(inventory, makeSource().identity, CHECKED_AT).ok).toBe(false)
  })
})

describe("B3-R1 inventory of every runtime with writing capability", () => {
  it("accepts all required categories with proven effective guards", () => {
    const result = validateRuntimeInventory(makeB3(), makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT)
    expect(result).toEqual({ ok: true, reasons: [], capability: OFFLINE_CAPABILITY })
  })
  it.each(RUNTIME_CATEGORIES)("refuses omitted runtime category %s", (category) => {
    const inventory = mutable(makeB3())
    inventory.runtimes = inventory.runtimes.filter((row) => row.category !== category)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
  })
  it.each(REQUIRED_GUARDS)("refuses missing effective guard %s", (guard) => {
    const inventory = mutable(makeB3())
    changePath(inventory.runtimes[0], "safety.guards." + guard, false)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
  })
  it.each([
    ["effectiveSha", "c".repeat(40)], ["effectiveVersion", "SYNTHETIC-old-version"], ["credentialsVerified", false],
    ["productionStatus", "BUILDING"], ["proofId", ""], ["projectId", "SYNTHETIC-unrelated-project"],
  ])("refuses unknown/old/unsafe production runtime %s", (field, value) => {
    const inventory = mutable(makeB3()); changePath(inventory.runtimes[0], field, value)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
  })
  it("accepts writing incapacity only with proof and verified credentials", () => {
    const inventory = mutable(makeB3())
    const old = inventory.runtimes.find((row) => row.category === "OLD_DEPLOYMENT")!
    old.safety = { kind: "NO_WRITE_PROVEN", writingImpossible: true }
    old.effectiveVersion = "SYNTHETIC-old-version"; old.effectiveSha = "c".repeat(40)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(true)
    changePath(old, "safety.writingImpossible", false)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
  })
  it("refuses declared absence but accepts an explicit simulated proof of no writers", () => {
    const inventory = mutable(makeB3())
    inventory.runtimes = inventory.runtimes.filter((row) => row.category !== "EXTERNAL_PROCESS")
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
    inventory.coverage.EXTERNAL_PROCESS.absent = { kind: "NO_WRITERS_PROVEN", credentialsVerified: true, proofId: "SYNTHETIC-no-external-writers-proof" }
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(true)
    changePath(inventory.coverage.EXTERNAL_PROCESS.absent, "credentialsVerified", false)
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
  })
  it("refuses incomplete coverage, inventory drift, missing second project and duplicate runtimes", () => {
    for (const path of ["coverage.PREVIEW_PRODUCTION_CREDENTIALS.complete", "revalidatedVersion", "checkedAt"]) {
      const inventory = mutable(makeB3())
      changePath(inventory, path, path.endsWith("complete") ? false : "SYNTHETIC-drift")
      expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
    }
    const inventory = mutable(makeB3()); inventory.runtimes.push(inventory.runtimes[0])
    expect(validateRuntimeInventory(inventory, makeSource().identity, CHECKED_AT, RUNTIME_REQUIREMENT).ok).toBe(false)
    const requirement = { ...RUNTIME_REQUIREMENT, secondaryProjectId: RUNTIME_REQUIREMENT.primaryProjectId }
    expect(validateRuntimeInventory(makeB3(), makeSource().identity, CHECKED_AT, requirement).ok).toBe(false)
  })
})

describe("fail-closed offline preflight and authority", () => {
  it("accepts all revalidated simulated proofs with zero operational authority", async () => {
    const result = preflightOffline(await makePreflight())
    expect(result).toEqual({ ok: true, reasons: [], capability: OFFLINE_CAPABILITY })
    expect(result.capability.productionEvidence).toBe(false)
    expect(Object.isFrozen(result.capability)).toBe(true)
  })
  it.each(["source", "observedIdentity", "archive", "b1", "b3", "retentionRequirement", "runtimeRequirement"])("refuses missing preflight participant %s", async (field) => {
    const input = await makePreflight()
    changePath(input, field, undefined, true)
    expect(preflightOffline(input).ok).toBe(false)
  })
  it.each([
    ["archive.retention", { status: "UNKNOWN" }],
    ["archive.reference.locator.versionId", "latest"],
    ["archive.reference.bundleSha256", sha256("other")],
    ["archive.reference.manifestSha256", sha256("other")],
    ["archive.reference.sourceFingerprint", sha256("other")],
    ["archive.reference.identity.jobId", "SYNTHETIC-other-job"],
    ["archive.protectedReference.kind", "DECLARED_UNVERIFIED"],
    ["archive.protectedReference.referenceSha256", sha256("other")],
    ["archive.protectedReference.observedFingerprint", sha256("other")],
    ["archive.protectedReference.revalidatedAt", "2030-01-01T00:00:00.000Z"],
    ["b1.revalidatedVersion", "SYNTHETIC-drift"], ["b3.revalidatedVersion", "SYNTHETIC-drift"],
    ["archive.retention.retainUntil", "2030-01-01T00:00:00.000Z"],
    ["archive.retention.checkedAt", "2030-01-01T00:00:00.000Z"],
  ])("blocks divergent, unproven or stale preflight proof %s", async (path, value) => {
    const input = mutable(await makePreflight()); changePath(input, path, value)
    const result = preflightOffline(input)
    expect(result.ok).toBe(false)
    expect(result.capability).toEqual(OFFLINE_CAPABILITY)
  })
  it("blocks corrupted readback, second nota/job and original-state drift", async () => {
    for (const alter of [
      (input: Mutable<Awaited<ReturnType<typeof makePreflight>>>) => { input.archive.readbackBytes[0] ^= 1 },
      (input: Mutable<Awaited<ReturnType<typeof makePreflight>>>) => { input.observedIdentity.emissionJobIds.push("SYNTHETIC-second-job") },
      (input: Mutable<Awaited<ReturnType<typeof makePreflight>>>) => { input.observedIdentity.notaFiscalIds.push("SYNTHETIC-second-note") },
      (input: Mutable<Awaited<ReturnType<typeof makePreflight>>>) => { input.source.privateState.originalState.serie.proximoNumero = 4 },
    ]) {
      const input = mutable(await makePreflight()); alter(input)
      expect(preflightOffline(input)).toMatchObject({ ok: false, capability: OFFLINE_CAPABILITY })
    }
  })
  it("refuses stale/short retention and malformed inputs without private error text", async () => {
    const input = await makePreflight()
    const reference = input.archive.reference
    for (const requirement of [
      { checkedAt: CHECKED_AT, minimumRetainUntil: CUSTODY.checkedAt },
      { checkedAt: CHECKED_AT, minimumRetainUntil: "2031-01-01T00:00:00.000Z" },
    ]) expect(() => validateRetention(input.archive.retention, reference.locator, requirement)).toThrow()
    expect(preflightOffline(null as unknown as typeof input)).toMatchObject({ ok: false, capability: OFFLINE_CAPABILITY })
    const invalidSource = { ...makeSource(), xml: "SYNTHETIC-PRIVATE" } as unknown as ArchiveSource
    expect(validateHistorical588(invalidSource)).toMatchObject({ ok: false, capability: OFFLINE_CAPABILITY })
  })
})
