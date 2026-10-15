import { describe, expect, it } from "vitest"
import { createArchiveBundle } from "./bundle"
import { attemptIdFor, IDENTITY_KEYS, privateKeyFor, validateIdentity } from "./contracts"
import type { ArchiveIdentity } from "./contracts"
import { makeSource, mutable, identityObservation } from "./fixtures"
import { validateFiscalIdentity } from "./policies"

const identityChanges: [string, unknown][] = [
  ["storeId", "SYNTHETIC-store-B"], ["vendaId", "SYNTHETIC-sale-B"], ["notaFiscalId", "SYNTHETIC-note-B"],
  ["jobId", "SYNTHETIC-job-B"], ["dedupeKey", "SYNTHETIC-dedupe-B"], ["serieFiscalId", "SYNTHETIC-series-B"],
  ["serie", 2], ["numero", 3], ["chave", "8".repeat(44)],
  ["historicalDiscriminator", { eventId: "SYNTHETIC-other-event", proven: true }],
]
describe("complete historical fiscal identity", () => {
  it.each(identityChanges)("derives a new attempt for changed %s and rejects identity drift", (key, value) => {
    const source = makeSource()
    const changed = { ...source.identity, [key]: value } as ArchiveIdentity
    expect(attemptIdFor(changed)).not.toBe(attemptIdFor(source.identity))
    const observed = { ...identityObservation(source), identity: changed }
    expect(validateFiscalIdentity(source, observed).ok).toBe(false)
  })
  it.each(IDENTITY_KEYS)("requires identity field %s", (key) => {
    const value = { ...makeSource().identity } as Record<string, unknown>; delete value[key]
    expect(() => validateIdentity(value)).toThrow()
  })
  it.each([
    ["jobType", "CONSULTA"], ["historicalAttempt", 2], ["modelo", "NFE"], ["ambiente", "PRODUCAO"],
    ["provider", "OTHER"], ["serie", -1], ["numero", 0], ["numero", 1.5], ["chave", "588"],
    ["historicalDiscriminator", { eventId: "SYNTHETIC-event", proven: false }],
  ])("rejects unsupported/incomplete identity %s", (key, value) => {
    expect(() => validateIdentity({ ...makeSource().identity, [key]: value })).toThrow()
  })
  it("keeps the key opaque, fixed by identity and unrelated to content", () => {
    const source = makeSource()
    const changed = mutable(source); changed.privateState.originalState.job.tentativas = 2
    expect(attemptIdFor(changed.identity)).toBe(attemptIdFor(source.identity))
    expect(privateKeyFor(changed.identity)).toBe(privateKeyFor(source.identity))
    expect(privateKeyFor(source.identity)).not.toContain(source.identity.storeId)
    expect(privateKeyFor(source.identity)).not.toContain(source.identity.notaFiscalId)
    expect(createArchiveBundle(changed).manifest.sourceFingerprint).not.toBe(createArchiveBundle(source).manifest.sourceFingerprint)
  })
  it.each([
    "xml", "nota", "job", "consulta", "serie", "venda", "snapshots", "metadata", "b2", "versions", "lineage",
  ])("fingerprints the entire logical source: %s", (field) => {
    const source = mutable(makeSource())
    if (field === "xml") source.xml[source.xml.length - 1] ^= 1
    else if (["nota", "job", "consulta", "serie", "venda"].includes(field)) source.privateState.originalState[field as "nota"].fixtureChange = true
    else if (field === "snapshots") source.privateState.frozenSource.itens[0].snapshot.quantidade = 2
    else if (field === "metadata") source.privateState.metadata.digestValue = { status: "PRESENT", value: "SYNTHETIC-other-digest" }
    else if (field === "b2") source.privateState.historical588.uncertain.id = "SYNTHETIC-other-uncertain"
    else if (field === "versions") source.privateState.observedVersions.sourceVersion = "SYNTHETIC-v2"
    else source.privateState.lineage = { parentAttemptId: attemptIdFor(makeSource({ numero: 3 }).identity), noParentProven: false, historicalCorrelation: source.identity.historicalDiscriminator.eventId }
    const changed = createArchiveBundle(source)
    const original = createArchiveBundle(makeSource())
    expect(changed.manifest.attemptId).toBe(original.manifest.attemptId)
    expect(changed.manifest.sourceFingerprint).not.toBe(original.manifest.sourceFingerprint)
  })
  it("accepts only the original single nota/job and original frozen identity", () => {
    const source = makeSource()
    expect(validateFiscalIdentity(source, identityObservation(source)).ok).toBe(true)
    for (const observed of [
      { ...identityObservation(source), emissionJobIds: [source.identity.jobId, "SYNTHETIC-second-job"] },
      { ...identityObservation(source), notaFiscalIds: [source.identity.notaFiscalId, "SYNTHETIC-second-note"] },
      { ...identityObservation(source), emissionJobIds: [] },
      { ...identityObservation(source), lineage: { ...source.privateState.lineage, historicalCorrelation: "SYNTHETIC-other" } },
      { ...identityObservation(source), versions: { ...source.privateState.observedVersions, executedSha: "c".repeat(40) } },
    ]) expect(validateFiscalIdentity(source, observed).ok).toBe(false)
    for (const field of ["nota", "job", "serie", "venda"] as const) {
      const changed = mutable(source); changed.privateState.originalState[field].storeId = "SYNTHETIC-other-store"
      expect(validateFiscalIdentity(changed, identityObservation(changed)).ok).toBe(false)
    }
  })
})
