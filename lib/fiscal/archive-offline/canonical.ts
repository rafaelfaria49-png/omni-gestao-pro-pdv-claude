import { createHash } from "node:crypto"

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject
export type JsonObject = { readonly [key: string]: JsonValue }
export type Sha256 = string & { readonly __sha256: unique symbol }

export class ArchiveError extends Error {
  constructor(readonly code: string) {
    super(code) // Codes only: never include private input, XML, IDs or errors.
    this.name = "ArchiveError"
  }
}

export function requireArchive(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ArchiveError(code)
}

export function sha256(bytes: Uint8Array | string): Sha256 {
  return createHash("sha256").update(bytes).digest("hex") as Sha256
}

export function isSha256(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

/**
 * ArchiveCanonicalJson/v1:
 * own plain data properties only; keys sorted by UTF-16 code units;
 * JSON.stringify spelling for strings/finite numbers, no Unicode normalization;
 * safe integers, fractional finite numbers, booleans and null. Reject -0,
 * undefined, sparse arrays, accessors, symbols, cycles, exotic prototypes,
 * lone surrogates and excessive depth/node count. Arrays retain source order.
 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>()
  let nodes = 0
  const validString = (text: string) => {
    requireArchive(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text), "JSON_INVALID_UNICODE")
    return JSON.stringify(text)
  }
  const visit = (input: unknown, depth: number): string => {
    requireArchive(++nodes <= 100_000 && depth <= 64, "JSON_LIMIT")
    if (input === null) return "null"
    if (typeof input === "string") return validString(input)
    if (typeof input === "boolean") return String(input)
    if (typeof input === "number") {
      requireArchive(Number.isFinite(input) && !Object.is(input, -0), "JSON_INVALID_NUMBER")
      requireArchive(!Number.isInteger(input) || Number.isSafeInteger(input), "JSON_UNSAFE_INTEGER")
      return JSON.stringify(input)
    }
    requireArchive(typeof input === "object" && input !== null, "JSON_INVALID_TYPE")
    requireArchive(!ancestors.has(input), "JSON_CYCLE")
    requireArchive(Object.getOwnPropertySymbols(input).length === 0, "JSON_SYMBOL")
    ancestors.add(input)
    try {
      if (Array.isArray(input)) {
        requireArchive(Object.getPrototypeOf(input) === Array.prototype, "JSON_PROTOTYPE")
        const names = Object.getOwnPropertyNames(input)
        requireArchive(names.length === input.length + 1, "JSON_ARRAY_PROPERTIES")
        return "[" + Array.from({ length: input.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
          requireArchive(descriptor && "value" in descriptor && descriptor.enumerable, "JSON_SPARSE_OR_ACCESSOR")
          return visit(descriptor.value, depth + 1)
        }).join(",") + "]"
      }
      const proto: unknown = Object.getPrototypeOf(input)
      requireArchive(proto === Object.prototype || proto === null, "JSON_PROTOTYPE")
      return "{" + Object.getOwnPropertyNames(input).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key)
        requireArchive(descriptor && "value" in descriptor && descriptor.enumerable, "JSON_ACCESSOR_OR_HIDDEN")
        return validString(key) + ":" + visit(descriptor.value, depth + 1)
      }).join(",") + "}"
    } finally {
      ancestors.delete(input)
    }
  }
  return visit(value, 0)
}

export function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), "utf8")
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((child) => deepFreeze(child))
    Object.freeze(value)
  }
  return value
}

export function frozenJsonCopy<T>(value: T): Readonly<T> {
  return deepFreeze(JSON.parse(canonicalJson(value)) as T)
}

export function parseCanonical(bytes: Uint8Array): unknown {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes))
  } catch {
    throw new ArchiveError("JSON_INVALID_ENCODING_OR_SYNTAX")
  }
  requireArchive(Buffer.from(bytes).equals(canonicalBytes(value)), "JSON_NOT_CANONICAL")
  return value
}

export function record(value: unknown): asserts value is Record<string, unknown> {
  requireArchive(value !== null && typeof value === "object" && !Array.isArray(value), "CONTRACT_OBJECT")
}

export function keys(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  record(value)
  requireArchive(Object.keys(value).sort().join("\0") === [...expected].sort().join("\0"), "CONTRACT_KEYS")
}

export function textField(value: unknown): asserts value is string {
  requireArchive(typeof value === "string" && value.length > 0 && value.length <= 4096, "CONTRACT_TEXT")
}

export function timestamp(value: unknown): asserts value is string {
  textField(value)
  const time = Date.parse(value)
  requireArchive(Number.isFinite(time) && new Date(time).toISOString() === value, "CONTRACT_TIMESTAMP")
}
