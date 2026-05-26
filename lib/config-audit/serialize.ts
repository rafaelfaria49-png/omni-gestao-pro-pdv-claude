const MAX_VALUE_LEN = 2000

const SENSITIVE_KEY = /password|senha|secret|token|hash/i

export function serializeAuditValue(value: unknown): string {
  if (value === undefined) return ""
  if (value === null) return "—"
  if (typeof value === "string") return truncate(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return truncate(JSON.stringify(value))
  } catch {
    return truncate(String(value))
  }
}

export function isSensitiveField(field: string): boolean {
  return SENSITIVE_KEY.test(field)
}

export function maskIfSensitive(field: string, value: unknown): unknown {
  if (!isSensitiveField(field)) return value
  if (value === undefined || value === null || value === "") return value
  return "***"
}

function truncate(s: string): string {
  const t = s.trim()
  if (t.length <= MAX_VALUE_LEN) return t
  return `${t.slice(0, MAX_VALUE_LEN)}…`
}
