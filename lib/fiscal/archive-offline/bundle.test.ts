import { describe, expect, it } from "vitest"
import { canonicalBytes, canonicalJson, frozenJsonCopy, parseCanonical, sha256 } from "./canonical"
import { createArchiveBundle, decodeArchiveBundle, HEADER_BYTES } from "./bundle"
import type { ArchiveBundle } from "./bundle"
import { attemptIdFor, fingerprintFor, freezeSource } from "./contracts"
import { makeSource, mutable } from "./fixtures"

function repack(bundle: ArchiveBundle, manifestBytes = bundle.manifestBytes, xml = makeSource().xml, state = canonicalBytes(makeSource().privateState)): Buffer {
  const header = Buffer.from(bundle.bytes.subarray(0, HEADER_BYTES))
  header.writeUInt32BE(manifestBytes.length, 12)
  header.writeUInt32BE(xml.length, 16)
  header.writeUInt32BE(state.length, 20)
  return Buffer.concat([header, manifestBytes, xml, state])
}

describe("ArchiveCanonicalJson/v1", () => {
  it("defines ordering, numbers, null and Unicode without normalizing strings", () => {
    expect(canonicalJson({ z: null, a: [true, 1.25, 1e-7, "ação", "e\u0301"] })).toBe('{"a":[true,1.25,1e-7,"ação","é"],"z":null}')
    expect(canonicalJson({ z: 1, a: 2 })).toBe(canonicalJson({ a: 2, z: 1 }))
    expect(canonicalJson(["a", "b"])).not.toBe(canonicalJson(["b", "a"]))
    expect(canonicalJson("é")).not.toBe(canonicalJson("e\u0301"))
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
  it.each([
    undefined, NaN, Infinity, -Infinity, -0, Number.MAX_SAFE_INTEGER + 1,
    BigInt(1), () => 1, new Date(0), new Map(), new Set(), /fixture/,
    { a: undefined }, [undefined], "\uD800", "\uDC00",
  ])("rejects unsupported JSON value %#", (value) => { expect(() => canonicalJson(value)).toThrow() })
  it("rejects accessors without invoking them", () => {
    let calls = 0
    const value = Object.defineProperty({}, "fixture", { enumerable: true, get: () => { calls++; return "private" } })
    expect(() => canonicalJson(value)).toThrow("JSON_ACCESSOR_OR_HIDDEN")
    expect(calls).toBe(0)
  })
  it("rejects symbols, hidden keys, exotic arrays, holes, cycles and limits", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    const expando = Object.assign([1], { extra: 2 })
    const symbol = { [Symbol("fixture")]: 1 }
    const hidden = Object.defineProperty({}, "fixture", { value: 1 })
    const exotic = Object.setPrototypeOf([1], null)
    let deep: unknown = null
    for (let i = 0; i < 65; i++) deep = [deep]
    for (const value of [cycle, expando, symbol, hidden, exotic, Array(1), deep, Array(100_001).fill(null)]) {
      expect(() => canonicalJson(value)).toThrow()
    }
  })
  it("rejects noncanonical, duplicate-key and invalid UTF-8 JSON", () => {
    for (const bytes of [Buffer.from('{ "a":1}'), Buffer.from('{"a":1,"a":1}'), Buffer.from([0xff]), Buffer.from('\uFEFF{}')]) {
      expect(() => parseCanonical(bytes)).toThrow()
    }
  })
  it("freezes logical copies without mutating the producer", () => {
    const original = { nested: { b: 2, a: 1 }, array: [1, null] }
    const copy = frozenJsonCopy(original)
    original.nested.a = 9
    expect(copy.nested.a).toBe(1)
    expect(Object.isFrozen(copy.nested)).toBe(true)
    expect(Object.isFrozen(copy.array)).toBe(true)
    expect(Object.isFrozen(original)).toBe(false)
  })
})

describe("ArchiveBundle/v1 binary framing and private state", () => {
  it("is byte deterministic and preserves BOM, CRLF, combining marks and trailing whitespace", () => {
    const source = makeSource()
    const first = createArchiveBundle(source)
    const second = createArchiveBundle(mutable(source))
    expect(first.bytes.equals(second.bytes)).toBe(true)
    expect(first.bytes.subarray(0, 8).toString("ascii")).toBe("OMNIARCV")
    expect(first.bytes.readUInt16BE(8)).toBe(1)
    const decoded = decodeArchiveBundle(first.bytes, { bundleSha256: first.bundleSha256, manifestSha256: first.manifestSha256 })
    expect(decoded.xml.equals(Buffer.from(source.xml))).toBe(true)
    expect(decoded.xml.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
    expect(decoded.privateStateBytes.equals(canonicalBytes(source.privateState))).toBe(true)
    expect(decoded.manifestSha256).toBe(sha256(decoded.manifestBytes))
    expect(decoded.bundleSha256).toBe(sha256(first.bytes))
    expect(Object.isFrozen(decoded.privateState.frozenSource.itens[0].snapshot)).toBe(true)
    expect(decoded.privateState.historical588.xMotivoHistorical).toEqual({ status: "NOT_PERSISTED" })
    expect(canonicalJson(decoded.manifest)).not.toContain("bundleSha256")
    expect(canonicalJson(decoded.manifest)).not.toContain("manifestSha256")
  })
  it("isolates the producer and decoded buffers", () => {
    const source = mutable(makeSource())
    const frozen = freezeSource(source)
    source.xml[0] ^= 1
    source.privateState.frozenSource.itens[0].snapshot.fixture = false
    expect(Buffer.from(frozen.xml).equals(Buffer.from(makeSource().xml))).toBe(true)
    expect(frozen.privateState.frozenSource.itens[0].snapshot.fixture).toBe(true)
    const bundle = createArchiveBundle(makeSource())
    const decoded = decodeArchiveBundle(bundle.bytes)
    decoded.bytes[0] ^= 1
    decoded.xml[0] ^= 1
    expect(() => decodeArchiveBundle(bundle.bytes)).not.toThrow()
  })
  it.each([0, 7, 23, 24, 100, -1])("rejects truncation at offset %s", (cut) => {
    const bundle = createArchiveBundle(makeSource())
    expect(() => decodeArchiveBundle(bundle.bytes.subarray(0, cut === -1 ? bundle.bytes.length - 1 : cut))).toThrow()
  })
  it.each(["manifest", "xml", "privateState"] as const)("rejects missing or changed %s segment", (segment) => {
    const bundle = createArchiveBundle(makeSource())
    const start = segment === "manifest" ? HEADER_BYTES : segment === "xml"
      ? HEADER_BYTES + bundle.manifestBytes.length : HEADER_BYTES + bundle.manifestBytes.length + makeSource().xml.length
    const length = segment === "manifest" ? bundle.manifestBytes.length : segment === "xml" ? makeSource().xml.length : canonicalBytes(makeSource().privateState).length
    const corrupted = Buffer.from(bundle.bytes); corrupted[start + Math.floor(length / 2)] ^= 1
    expect(() => decodeArchiveBundle(corrupted)).toThrow()
    expect(() => decodeArchiveBundle(Buffer.concat([bundle.bytes.subarray(0, start), bundle.bytes.subarray(start + length)]))).toThrow()
    const absent = Buffer.from(bundle.bytes); absent.writeUInt32BE(0, segment === "manifest" ? 12 : segment === "xml" ? 16 : 20)
    expect(() => decodeArchiveBundle(absent)).toThrow()
  })
  it.each([12, 16, 20])("rejects zero/oversized header lengths at %s", (offset) => {
    for (const size of [0, 0xffffffff]) {
      const bytes = Buffer.from(createArchiveBundle(makeSource()).bytes); bytes.writeUInt32BE(size, offset)
      expect(() => decodeArchiveBundle(bytes)).toThrow()
    }
  })
  it.each([0, 8, 10])("rejects magic, version or reserved flags at %s", (offset) => {
    const bytes = Buffer.from(createArchiveBundle(makeSource()).bytes); bytes[offset] ^= 1
    expect(() => decodeArchiveBundle(bytes)).toThrow()
  })
  it("rejects extra bytes and external manifest/bundle hash divergences", () => {
    const bundle = createArchiveBundle(makeSource())
    expect(() => decodeArchiveBundle(Buffer.concat([bundle.bytes, Buffer.from([0])]))).toThrow()
    expect(() => decodeArchiveBundle(bundle.bytes, { bundleSha256: sha256("other"), manifestSha256: bundle.manifestSha256 })).toThrow()
    expect(() => decodeArchiveBundle(bundle.bytes, { bundleSha256: bundle.bundleSha256, manifestSha256: sha256("other") })).toThrow()
  })
  it.each([
    ["version", 2], ["serializer", "unknown"], ["attemptId", "ab1_" + "0".repeat(64)],
    ["sourceFingerprint", "0".repeat(64)], ["unknownField", true],
  ])("rejects invalid manifest %s", (key, value) => {
    const bundle = createArchiveBundle(makeSource())
    const manifest = { ...bundle.manifest, [key]: value }
    expect(() => decodeArchiveBundle(repack(bundle, canonicalBytes(manifest)))).toThrow()
  })
  it("rejects wrong segment descriptors, noncanonical manifest and a forged private schema", () => {
    const bundle = createArchiveBundle(makeSource())
    for (const manifest of [
      { ...bundle.manifest, xml: { ...bundle.manifest.xml, byteLength: bundle.manifest.xml.byteLength + 1 } },
      { ...bundle.manifest, xml: { ...bundle.manifest.xml, sha256: sha256("other") } },
      { ...bundle.manifest, privateState: { ...bundle.manifest.privateState, sha256: sha256("other") } },
    ]) expect(() => decodeArchiveBundle(repack(bundle, canonicalBytes(manifest)))).toThrow()
    expect(() => decodeArchiveBundle(repack(bundle, Buffer.from(JSON.stringify(bundle.manifest, null, 2))))).toThrow("JSON_NOT_CANONICAL")
    const state = Buffer.from("{}")
    const stateDescriptor = { byteLength: state.length, sha256: sha256(state) }
    const manifest = { ...bundle.manifest, privateState: stateDescriptor, sourceFingerprint: fingerprintFor(bundle.manifest.identity, { byteLength: makeSource().xml.length, sha256: sha256(makeSource().xml) }, stateDescriptor) }
    expect(() => decodeArchiveBundle(repack(bundle, canonicalBytes(manifest), makeSource().xml, state))).toThrow()
  })
  it.each(["password", "senha", "CSC", "token", "PFX", "certificate", "privateKey", "DSN", "DATABASE_URL"])("rejects forbidden private field %s without echoing it", (key) => {
    const source = mutable(makeSource())
    source.privateState.originalState.job[key] = "SYNTHETIC-PRIVATE-SENTINEL"
    expect(() => createArchiveBundle(source)).toThrow("PRIVATE_SECRET_FIELD")
    try { createArchiveBundle(source) } catch (error) { expect(String(error)).not.toContain("SYNTHETIC-PRIVATE-SENTINEL") }
  })
  it.each(["metadata", "frozenSource", "originalState", "historical588", "observedVersions", "lineage"])("does not reconstruct missing private field %s", (key) => {
    const source = makeSource()
    const state = { ...source.privateState } as Record<string, unknown>; delete state[key]
    expect(() => createArchiveBundle({ ...source, privateState: state as unknown as typeof source.privateState })).toThrow()
  })
  it.each(["emitente", "destinatario", "pagamento", "tributacao", "diagnostico"] as const)("refuses an empty required snapshot %s", (field) => {
    const source = mutable(makeSource()); source.privateState.frozenSource[field] = {}
    expect(() => createArchiveBundle(source)).toThrow("PRIVATE_MISSING_SNAPSHOT")
  })
  it("refuses a missing item snapshot rather than reconstructing it", () => {
    const source = mutable(makeSource()); source.privateState.frozenSource.itens[0].snapshot = {}
    expect(() => createArchiveBundle(source)).toThrow("PRIVATE_MISSING_ITEM_SNAPSHOT")
  })
  it("rejects item order/duplicates, false lineage, absent XML and invalid JSON values", () => {
    const source = mutable(makeSource())
    source.privateState.frozenSource.itens[0].ordinal = 2
    expect(() => createArchiveBundle(source)).toThrow("PRIVATE_ITEM_ORDER")
    const lineage = mutable(makeSource()); lineage.privateState.lineage.noParentProven = false
    expect(() => createArchiveBundle(lineage)).toThrow("LINEAGE_UNPROVEN")
    expect(() => createArchiveBundle({ ...makeSource(), xml: new Uint8Array() })).toThrow()
    const self = mutable(makeSource()); self.privateState.lineage.parentAttemptId = attemptIdFor(self.identity); self.privateState.lineage.noParentProven = false
    expect(() => createArchiveBundle(self)).toThrow("BUNDLE_SELF_LINEAGE")
    expect(() => createArchiveBundle({ ...makeSource(), xml: Buffer.from([0xff]) })).toThrow("XML_INVALID_UTF8")
  })
})
