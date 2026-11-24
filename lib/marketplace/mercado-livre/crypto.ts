import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { MercadoLivreConfig } from "./config"

export function opaqueId() {
  return randomBytes(32).toString("base64url")
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url")
}

export function sealMeli(config: MercadoLivreConfig, context: string[], value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", config.key, iv)
  cipher.setAAD(Buffer.from(JSON.stringify(["omni-meli-v1", config.clientId, ...context])))
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".")
}

export function openMeli(config: MercadoLivreConfig, context: string[], value: string): string | null {
  if (value.length > 16_000) return null
  const parts = value.split(".")
  const [version, iv, ciphertext, tag] = parts
  if (parts.length !== 4 || version !== "v1" ||
      !/^[A-Za-z0-9_-]{16}$/.test(iv) || !/^[A-Za-z0-9_-]+$/.test(ciphertext) ||
      !/^[A-Za-z0-9_-]{22}$/.test(tag)) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", config.key, Buffer.from(iv, "base64url"))
    decipher.setAAD(Buffer.from(JSON.stringify(["omni-meli-v1", config.clientId, ...context])))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
