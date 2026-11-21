import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { check, CoreError } from "./db"
export function canonical(value: unknown): string {
  if (value === null) return "null"
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") { check(Number.isFinite(value), "NON_FINITE", 400); return JSON.stringify(value) }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]"
  check(typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype, "INVALID_OBJECT", 400)
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical((value as Record<string, unknown>)[k])).join(",") + "}"
}
export const hash = (domain: string, value: unknown) => createHash("sha256").update(domain + "\0").update(typeof value === "string" ? value : canonical(value)).digest("hex")
export const byteHash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
export function text(value: unknown, max = 200): string {
  check(typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value), "INVALID_TEXT", 400)
  return value.normalize("NFC")
}
export function shape(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype, "INVALID_INPUT", 400)
  check(Object.keys(value).every(k => allowed.includes(k)), "UNKNOWN_FIELD", 400)
  return value as Record<string, unknown>
}
export function cleanData(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/gu, "\uFFFD")
  if (value === undefined) return null
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map(cleanData)
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cleanData(v)]))
}
/** Ephemeral fixture keys supplied by harness; never persisted with evidence. */
export class FixtureCrypto {
  readonly keyRef = "EPHEMERAL_004B_FIXTURE"
  constructor(private readonly key: Buffer, private readonly signingKey: Buffer) {
    check(key.length === 32 && signingKey.length === 32, "FIXTURE_KEY_REQUIRED", 500)
  }
  seal(value: Uint8Array, aad: string): Buffer {
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, nonce)
    cipher.setAAD(Buffer.from(aad))
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()])
    return Buffer.concat([Buffer.from([1]), nonce, cipher.getAuthTag(), encrypted])
  }
  open(value: Uint8Array, aad: string): Buffer {
    try {
      const b = Buffer.from(value)
      check(b.length >= 29 && b[0] === 1, "CONTENT_UNAVAILABLE")
      const cipher = createDecipheriv("aes-256-gcm", this.key, b.subarray(1, 13))
      cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(b.subarray(13, 29))
      return Buffer.concat([cipher.update(b.subarray(29)), cipher.final()])
    } catch { throw new CoreError("CONTENT_UNAVAILABLE") }
  }
  sign(domain: string, body: Record<string, unknown>): string {
    const b = Buffer.from(canonical(body)).toString("base64url")
    return b + "." + createHmac("sha256", this.signingKey).update(domain + "\0" + b).digest("base64url")
  }
  verify(domain: string, token: string): Record<string, unknown> {
    try {
      check(typeof token === "string" && token.length <= 8192, "INVALID_PROOF", 403)
      const [b, mac, extra] = token.split(".")
      check(b && mac && !extra, "INVALID_PROOF", 403)
      const expected = createHmac("sha256", this.signingKey).update(domain + "\0" + b).digest(), given = Buffer.from(mac, "base64url")
      check(mac === given.toString("base64url") && given.length === expected.length && timingSafeEqual(given, expected), "INVALID_PROOF", 403)
      return JSON.parse(Buffer.from(b, "base64url").toString("utf8")) as Record<string, unknown>
    } catch { throw new CoreError("INVALID_PROOF", 403) }
  }
}
