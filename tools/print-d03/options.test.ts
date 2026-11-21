import { describe, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import { retentionOptions } from "./options.mjs"
import { PrintCrypto } from "../../lib/printing/direct/codec"
import { APPROVED_RELEASE, CANDIDATE_POLICY, directPrintRuntimeFromEnv } from "../../lib/printing/direct/activation"
import { retentionError } from "../../lib/printing/direct/retention"

const env = { OMNI_PRINT_RETENTION_DATABASE_URL: "postgresql://operator:secret@127.0.0.1/print_lab_unit" }
const args = ["--store", "store-a", "--expect-host", "127.0.0.1", "--expect-db", "print_lab_unit"]
describe("D03 operator boundary, policy and keys", () => {
  it("defaults to dry run; execution requires a separate explicit enable AND --execute", () => {
    expect(retentionOptions(args, env).options.dryRun).toBe(true)
    expect(retentionOptions(args, { ...env, OMNI_PRINT_RETENTION_ENABLED: "1" }).options.dryRun).toBe(true)
    expect(() => retentionOptions([...args, "--execute"], env)).toThrow("RETENTION_DISABLED")
    expect(retentionOptions([...args, "--execute"], { ...env, OMNI_PRINT_RETENTION_ENABLED: "1" }).options.dryRun).toBe(false)
  })
  it.each([
    ["--execute", "--dry-run"], ["--batch-size", "0"], ["--batch-size", "101"], ["--batch-size", "NaN"],
    ["--batch-size", "1.5"], ["--after", "bad"], ["--store", "x"], ["--cron"], ["--after"],
  ])("refuses ambiguous, unbounded or unknown options %j", (...extra) => {
    expect(() => retentionOptions([...args, ...extra], env)).toThrow()
  })
  it("refuses missing credentials, mismatched target and URL target overrides", () => {
    expect(() => retentionOptions(args, { DATABASE_URL: env.OMNI_PRINT_RETENTION_DATABASE_URL })).toThrow()
    for (const url of [env.OMNI_PRINT_RETENTION_DATABASE_URL.replace("127.0.0.1", "other.invalid"),
      env.OMNI_PRINT_RETENTION_DATABASE_URL + "?host=other.invalid", env.OMNI_PRINT_RETENTION_DATABASE_URL + "?schema=private",
      env.OMNI_PRINT_RETENTION_DATABASE_URL + "?options=-c%20role%3Downer"]) {
      expect(() => retentionOptions(args, { OMNI_PRINT_RETENTION_DATABASE_URL: url })).toThrow()
    }
  })
  it("keeps D03-A limits and the production gate", () => {
    expect(CANDIDATE_POLICY).toMatchObject({ maxCopies: 2, maxItems: 200, commandBytes: 16384, snapshotBytes: 65536, payloadBytes: 65536, initialWindowMs: 1800000 })
    expect(APPROVED_RELEASE).toBeNull()
    expect(directPrintRuntimeFromEnv({ NODE_ENV: "production", OMNI_PRINT_DIRECT_LAB: "1", OMNI_PRINT_DIRECT_ENABLED: "1" }).enabled).toBe(false)
  })
  it("accepts independent canonical 32-byte encodings, refuses same/short/malformed keys", () => {
    const a = randomBytes(32).toString("base64"), b = randomBytes(32).toString("base64url")
    expect(PrintCrypto.fromBase64(a, b)).not.toBeNull()
    for (const bad of [a + "!", a + "=", " " + a, a.slice(0, 10), randomBytes(33).toString("base64"), ""]) expect(PrintCrypto.fromBase64(bad, b)).toBeNull()
    expect(PrintCrypto.fromBase64(a, a)).toBeNull()
  })
  it("revoked content/signing keys fail closed and references remain stable across signing-only rotation", () => {
    const a = randomBytes(32), b = randomBytes(32), first = new PrintCrypto(a, b)
    const ciphertext = first.seal(Buffer.from("lab-only"), "aad"), token = first.sign("consent", { n: 1 })
    const next = new PrintCrypto(randomBytes(32), randomBytes(32))
    expect(() => next.open(ciphertext, "aad")).toThrow("CONTENT_UNAVAILABLE")
    expect(() => next.verify("consent", token)).toThrow("INVALID_PROOF")
    expect(new PrintCrypto(a, randomBytes(32)).keyRef).toBe(first.keyRef)
  })
  it("never returns database messages or secrets in errors", () => {
    expect(retentionError(new Error("password=secret SELECT ciphertext"))).toBe("RETENTION_FAILED")
    expect(retentionError({ meta: { code: "57014" }, message: "sensitive" })).toBe("DATABASE_TIMEOUT")
    expect(retentionError({ meta: { code: "55P03" } })).toBe("DATABASE_BUSY")
    expect(retentionError({ code: "P1000" })).toBe("DATABASE_ACCESS_DENIED")
  })
})
