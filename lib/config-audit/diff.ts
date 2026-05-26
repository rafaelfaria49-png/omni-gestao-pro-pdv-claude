import { maskIfSensitive, serializeAuditValue } from "./serialize"
import type { ConfigAuditChangeInput } from "./types"
import { inferConfigAuditArea } from "./areas"

const MAX_CHANGES = 120
const MAX_DEPTH = 8

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function flattenLeafPaths(
  value: unknown,
  prefix: string,
  depth: number,
  out: Map<string, unknown>,
): void {
  if (depth > MAX_DEPTH) {
    out.set(prefix || "value", value)
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix || "[]", value)
      return
    }
    value.forEach((item, i) => {
      const p = prefix ? `${prefix}[${i}]` : `[${i}]`
      flattenLeafPaths(item, p, depth + 1, out)
    })
    return
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value)
    if (keys.length === 0) {
      out.set(prefix || "{}", value)
      return
    }
    for (const key of keys) {
      const p = prefix ? `${prefix}.${key}` : key
      flattenLeafPaths(value[key], p, depth + 1, out)
    }
    return
  }
  out.set(prefix || "value", value)
}

/** Compara dois objetos e retorna alterações de folhas (caminho com notação dot/bracket). */
export function diffConfigObjects(
  before: unknown,
  after: unknown,
  rootPrefix = "",
): ConfigAuditChangeInput[] {
  const bMap = new Map<string, unknown>()
  const aMap = new Map<string, unknown>()
  flattenLeafPaths(before ?? null, rootPrefix, 0, bMap)
  flattenLeafPaths(after ?? null, rootPrefix, 0, aMap)

  const keys = new Set([...bMap.keys(), ...aMap.keys()])
  const changes: ConfigAuditChangeInput[] = []

  for (const field of keys) {
    const oldV = bMap.get(field)
    const newV = aMap.get(field)
    if (valuesEqual(oldV, newV)) continue
    const area = inferConfigAuditArea(field)
    changes.push({
      field,
      oldValue: maskIfSensitive(field, oldV ?? null),
      newValue: maskIfSensitive(field, newV ?? null),
      area,
    })
    if (changes.length >= MAX_CHANGES) break
  }

  return changes
}

/** Diff de campos escalares (store, usuário, contatos). */
export function diffScalarFields(
  fields: Array<{ key: string; before: unknown; after: unknown }>,
): ConfigAuditChangeInput[] {
  const changes: ConfigAuditChangeInput[] = []
  for (const { key, before, after } of fields) {
    if (valuesEqual(before, after)) continue
    changes.push({
      field: key,
      oldValue: maskIfSensitive(key, before),
      newValue: maskIfSensitive(key, after),
      area: inferConfigAuditArea(key),
    })
    if (changes.length >= MAX_CHANGES) break
  }
  return changes
}

export function buildAuditDetail(field: string, oldStr: string, newStr: string): string {
  const label = field.length > 80 ? `${field.slice(0, 77)}…` : field
  const o = oldStr.length > 120 ? `${oldStr.slice(0, 117)}…` : oldStr
  const n = newStr.length > 120 ? `${newStr.slice(0, 117)}…` : newStr
  return `${label}: ${o || "—"} → ${n || "—"}`
}

export function changeToSerializedStrings(change: ConfigAuditChangeInput): {
  oldValue: string
  newValue: string
} {
  return {
    oldValue: serializeAuditValue(change.oldValue),
    newValue: serializeAuditValue(change.newValue),
  }
}
