import { describe, expect, it } from "vitest"
import { canonicalJson, sha256 } from "./canonical"
import { createArchiveBundle } from "./bundle"
import { attemptIdFor, privateKeyFor } from "./contracts"
import type { SourceFingerprint } from "./contracts"
import { CUSTODY, makeSource, mutable } from "./fixtures"
import { MemoryArchiveFake } from "./memory-fake"
import type { MemoryFault } from "./memory-fake"
import { OFFLINE_CAPABILITY, queryFor } from "./ports"
import type { ProtectedArchiveReference, PutRequest } from "./ports"

async function seal(fake: MemoryArchiveFake, source = makeSource()): Promise<ProtectedArchiveReference> {
  const result = await fake.simulateArchive(source, CUSTODY)
  if (result.status === "BLOCKED") throw new Error("SYNTHETIC_SEAL_FAILED")
  expect(result.capability).toEqual(OFFLINE_CAPABILITY)
  return result.reference
}
function putRequest(): PutRequest {
  const source = makeSource()
  const bundle = createArchiveBundle(source)
  return {
    identity: source.identity, attemptId: bundle.manifest.attemptId, sourceFingerprint: bundle.manifest.sourceFingerprint,
    key: privateKeyFor(source.identity), bytes: bundle.bytes, bundleSha256: bundle.bundleSha256,
    manifestSha256: bundle.manifestSha256, retainUntil: CUSTODY.retainUntil, capturedAt: CUSTODY.capturedAt,
  }
}

describe("option B memory-only custody", () => {
  it("replays the exact reference/version without new attempts or copied bundle bytes in the reference", async () => {
    const fake = new MemoryArchiveFake()
    const first = await fake.simulateArchive(makeSource(), CUSTODY)
    const second = await fake.simulateArchive(makeSource(), {
      ...CUSTODY, capturedAt: "2030-01-03T00:00:00.000Z", checkedAt: "2030-01-04T00:00:00.000Z",
      retainUntil: "2030-04-01T00:00:00.000Z",
    })
    expect(first.status).toBe("SEALED_SIMULATION")
    expect(second.status).toBe("REPLAY_SIMULATION")
    if (first.status === "BLOCKED" || second.status === "BLOCKED") throw new Error("SYNTHETIC_SETUP")
    expect(second.reference).toEqual(first.reference)
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
    const reference = canonicalJson(first.reference)
    for (const forbidden of ["<synthetic", "privateState", "manifestBytes", "xmlBytes", "frozenSource", "historical588"]) {
      expect(reference).not.toContain(forbidden)
    }
    expect(first.reference.attemptId).toBe(attemptIdFor(makeSource().identity))
    expect(second.capability).toEqual(OFFLINE_CAPABILITY)
  })
  it("performs conditional exclusive PUT and returns the existing exact version", async () => {
    const fake = new MemoryArchiveFake()
    const request = putRequest()
    const [left, right] = await Promise.all([fake.putIfAbsent(request), fake.putIfAbsent(request)])
    expect([left.outcome, right.outcome].sort()).toEqual(["CREATED", "EXISTING_IDENTICAL"])
    expect(left.locator).toEqual(right.locator)
    expect(fake.stats).toEqual({ objects: 1, references: 0, putCreations: 1 })
    request.bytes[0] ^= 1
    expect((await fake.readExactVersion(left.locator)).bytes).not.toEqual(request.bytes)
  })
  it("rejects sequential fingerprint conflict while preserving the winner", async () => {
    const fake = new MemoryArchiveFake()
    const reference = await seal(fake)
    const changed = mutable(makeSource()); changed.privateState.originalState.job.tentativas = 2
    const conflict = await fake.simulateArchive(changed, CUSTODY)
    expect(conflict).toMatchObject({ status: "BLOCKED", reason: "ATTEMPT_CONTENT_CONFLICT", capability: OFFLINE_CAPABILITY })
    expect(await fake.resolveProtectedReference(queryFor(reference))).toEqual(reference)
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
  })
  it("simulates concurrent divergent contenders with one winner and no partial reference", async () => {
    const fake = new MemoryArchiveFake()
    const changed = mutable(makeSource()); changed.privateState.frozenSource.itens[0].snapshot.quantidade = 2
    const results = await Promise.all([fake.simulateArchive(makeSource(), CUSTODY), fake.simulateArchive(changed, CUSTODY)])
    expect(results.map((result) => result.status).sort()).toEqual(["BLOCKED", "SEALED_SIMULATION"])
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
    for (const result of results) expect(result.capability).toEqual(OFFLINE_CAPABILITY)
  })
  it("simulates concurrent identical replay with one object/reference", async () => {
    const fake = new MemoryArchiveFake()
    const results = await Promise.all(Array.from({ length: 8 }, () => fake.simulateArchive(makeSource(), CUSTODY)))
    expect(results.filter((result) => result.status === "SEALED_SIMULATION")).toHaveLength(1)
    expect(results.filter((result) => result.status === "REPLAY_SIMULATION")).toHaveLength(7)
    const references = results.map((result) => result.status === "BLOCKED" ? null : result.reference)
    expect(references.every((reference) => canonicalJson(reference) === canonicalJson(references[0]))).toBe(true)
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
  })
  it.each([
    ["BEFORE_PUT", 0, 0],
    ["AFTER_PUT_RESPONSE_LOST", 1, 0],
    ["BEFORE_REFERENCE", 1, 0],
    ["CAS_MISMATCH", 1, 0],
    ["AFTER_REFERENCE_RESPONSE_LOST", 1, 1],
  ] as const)("preserves state through %s and recovers by the same exact object", async (fault, objects, references) => {
    const fake = new MemoryArchiveFake()
    const source = makeSource()
    const before = canonicalJson(source.privateState)
    fake.injectFault(fault as MemoryFault)
    const failed = await fake.simulateArchive(source, CUSTODY)
    expect(failed.status).toBe("BLOCKED")
    expect(failed.capability).toEqual(OFFLINE_CAPABILITY)
    expect(fake.stats).toEqual({ objects, references, putCreations: objects })
    expect(canonicalJson(source.privateState)).toBe(before)
    const recovered = await fake.simulateArchive(source, CUSTODY)
    expect(recovered.status).toBe(references ? "REPLAY_SIMULATION" : "SEALED_SIMULATION")
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
  })
  it("preserves an orphan when the source CAS no longer matches and refuses divergent reuse", async () => {
    const fake = new MemoryArchiveFake()
    const result = await fake.simulateArchive(makeSource(), { ...CUSTODY, observedFingerprint: sha256("SYNTHETIC-drift") as SourceFingerprint })
    expect(result).toMatchObject({ status: "BLOCKED", reason: "REFERENCE_CAS_MISMATCH", capability: OFFLINE_CAPABILITY })
    expect(fake.stats).toEqual({ objects: 1, references: 0, putCreations: 1 })
    const changed = mutable(makeSource()); changed.privateState.originalState.nota.vigente = false
    expect((await fake.simulateArchive(changed, CUSTODY)).status).toBe("BLOCKED")
    expect(fake.stats).toEqual({ objects: 1, references: 0, putCreations: 1 })
  })
  it("blocks unknown retention and preserves the orphan until proof is available", async () => {
    const fake = new MemoryArchiveFake()
    fake.simulateUnknownRetention(true)
    expect(await fake.simulateArchive(makeSource(), CUSTODY)).toMatchObject({ status: "BLOCKED", reason: "RETENTION_UNKNOWN", capability: OFFLINE_CAPABILITY })
    expect(fake.stats).toEqual({ objects: 1, references: 0, putCreations: 1 })
    fake.simulateUnknownRetention(false)
    await seal(fake)
    fake.simulateUnknownRetention(true)
    expect((await fake.simulateArchive(makeSource(), CUSTODY)).status).toBe("BLOCKED")
    expect(fake.stats.references).toBe(1)
  })
  it("rejects insufficient retention without extending/overwriting the existing version", async () => {
    const fake = new MemoryArchiveFake()
    const reference = await seal(fake)
    const result = await fake.simulateArchive(makeSource(), { ...CUSTODY, minimumRetainUntil: "2030-05-01T00:00:00.000Z", retainUntil: "2030-06-01T00:00:00.000Z" })
    expect(result.status).toBe("BLOCKED")
    expect(await fake.resolveProtectedReference(queryFor(reference))).toEqual(reference)
    expect(fake.stats.putCreations).toBe(1)
  })
  it("detects corruption on replay without deleting/remapping the reference", async () => {
    const fake = new MemoryArchiveFake()
    const reference = await seal(fake)
    fake.simulateCorruptRead(true)
    expect((await fake.simulateArchive(makeSource(), CUSTODY)).status).toBe("BLOCKED")
    await expect(fake.resolveProtectedReference(queryFor(reference))).rejects.toThrow()
    expect(fake.stats).toEqual({ objects: 1, references: 1, putCreations: 1 })
    fake.simulateCorruptRead(false)
    expect(await fake.resolveProtectedReference(queryFor(reference))).toEqual(reference)
  })
  it.each(["latest", "LATEST", "", "memory-version-missing"])("never reads or resolves alternate version %s", async (versionId) => {
    const fake = new MemoryArchiveFake()
    const reference = await seal(fake)
    const locator = { ...reference.locator, versionId }
    await expect(fake.readExactVersion(locator)).rejects.toThrow()
    await expect(fake.resolveProtectedReference({ ...queryFor(reference), locator })).rejects.toThrow()
    expect(fake.stats.putCreations).toBe(1)
  })
  it.each(["identity", "attemptId", "sourceFingerprint", "bundleSha256", "manifestSha256", "key", "storeId", "account", "backend"])("rejects mismatched protected reference query %s", async (field) => {
    const fake = new MemoryArchiveFake()
    const reference = await seal(fake)
    const query = mutable(queryFor(reference))
    if (field === "identity") query.identity.jobId = "SYNTHETIC-other-job"
    else if (field === "attemptId") query.attemptId = attemptIdFor(makeSource({ numero: 3 }).identity)
    else if (field === "key") query.locator.key = privateKeyFor(makeSource({ numero: 3 }).identity)
    else if (field === "storeId" || field === "account" || field === "backend") query.locator[field] = "SYNTHETIC-other"
    else query[field as "bundleSha256"] = sha256("SYNTHETIC-other")
    await expect(fake.resolveProtectedReference(query)).rejects.toThrow()
    expect(await fake.resolveProtectedReference(queryFor(reference))).toEqual(reference)
  })
  it("keeps stores isolated and returns defensive byte copies", async () => {
    const fake = new MemoryArchiveFake()
    const left = await seal(fake)
    const right = await seal(fake, makeSource({ storeId: "SYNTHETIC-store-B" }))
    expect(left.attemptId).not.toBe(right.attemptId)
    expect(left.locator.key).not.toBe(right.locator.key)
    const first = await fake.readExactVersion(left.locator)
    first.bytes[0] ^= 1
    const next = await fake.readExactVersion(left.locator)
    expect(Buffer.from(next.bytes).equals(createArchiveBundle(makeSource()).bytes)).toBe(true)
    await expect(fake.readExactVersion({ ...left.locator, storeId: right.identity.storeId })).rejects.toThrow()
    expect(fake.stats).toEqual({ objects: 2, references: 2, putCreations: 2 })
  })
  it("does not expose delete/overwrite/latest/production capabilities", () => {
    const fake = new MemoryArchiveFake()
    for (const method of ["delete", "deleteObject", "overwrite", "readLatest", "transmit", "retry", "rearm"]) {
      expect(method in fake).toBe(false)
    }
    expect(OFFLINE_CAPABILITY).toEqual({
      mode: "OFFLINE_ONLY", productionEvidence: false, retry: false, transmission: false, rearm: false, activation: false, write: false,
    })
    expect(Object.isFrozen(OFFLINE_CAPABILITY)).toBe(true)
  })
})
