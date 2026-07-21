/**
 * Contador HUB · Documentos — hash SHA-256 (GOAL 010).
 *
 * O hash persistido é SEMPRE o calculado no servidor a partir do conteúdo real
 * do objeto no storage. O hash declarado pelo navegador é apenas conferido — se
 * divergir do servidor, o upload é rejeitado.
 */
import { createHash } from "node:crypto"

/** SHA-256 em hexadecimal minúsculo: exatamente 64 caracteres [0-9a-f]. */
export const SHA256_HEX_RE = /^[a-f0-9]{64}$/

/** `true` se `v` é um SHA-256 hex canônico (64 chars, minúsculo). */
export function isSha256Hex(v: unknown): v is string {
  return typeof v === "string" && SHA256_HEX_RE.test(v)
}

/**
 * Normaliza um hash declarado para comparação: apara espaços e minúscula.
 * Retorna `null` se, após normalizar, não for um SHA-256 hex válido.
 */
export function normalizarSha256(v: unknown): string | null {
  if (typeof v !== "string") return null
  const norm = v.trim().toLowerCase()
  return SHA256_HEX_RE.test(norm) ? norm : null
}

/** SHA-256 (hex minúsculo) do conteúdo binário. */
export function sha256HexDeBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex")
}

/** Comparação de hashes em tempo constante-ish (ambos já normalizados/hex). */
export function hashesIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
