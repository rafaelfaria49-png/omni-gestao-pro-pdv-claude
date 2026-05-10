import { createHmac, timingSafeEqual } from "crypto"

export const META_WEBHOOK_MAX_BODY_BYTES = 2_000_000

export function isMetaCloudIngressBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || body === null) return false
  const o = body as Record<string, unknown>
  if (o.object === "whatsapp_business_account") return true
  if (Array.isArray(o.entry) && o.entry.length > 0) return true
  return false
}

export function verifyMetaXHubSignature256(rawBody: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`
  try {
    const a = Buffer.from(sigHeader, "utf8")
    const b = Buffer.from(expected, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
