import type { Session } from "next-auth"
import { hasCadastrosHub } from "./cadastros-api-access"

/** Only explicit, established roles may use the shared client boundary. */
export function canUseClientOperations(session: Session | null): boolean {
  return !!session?.user?.id && ["SUPER_ADMIN", "ADMIN", "GERENTE", "CAIXA", "TECNICO", "VENDEDOR", "OPERADOR"]
    .includes(String(session.user.role ?? "").toUpperCase())
}

export function canReadClientRegister(session: Session | null): boolean {
  return canUseClientOperations(session) && hasCadastrosHub(session)
}

export const CLIENT_LOOKUP_SELECT = { id: true, name: true, phone: true, document: true, kind: true, active: true } as const
export const CLIENT_REGISTER_SELECT = {
  ...CLIENT_LOOKUP_SELECT, email: true, document: true, city: true,
  tags: true, totalSpent: true, lastPurchaseAt: true, createdAt: true, updatedAt: true,
} as const

export const CLIENT_RETENTION_BLOCK = {
  error: "Exclusão indisponível até revisão autorizada de identidade, finalidade e retenção. Use a inativação para suspender o cadastro.",
  code: "RETENTION_REVIEW_REQUIRED",
} as const

/** Only fields used by the register editor. Import payloads, RG and financial metadata stay server-side. */
export function clientEditorTags(value: unknown): Record<string, unknown> | string[] | null {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  if (!value || typeof value !== "object") return null
  const src = value as Record<string, unknown>, out: Record<string, unknown> = {}
  for (const key of ["logradouro", "numero", "uf", "observacoes"]) if (typeof src[key] === "string") out[key] = src[key]
  if (Array.isArray(src.labels)) out.labels = src.labels.filter((v) => typeof v === "string")
  for (const [group, keys] of [["address", ["street", "number", "state"]], ["operational", ["notes"]]] as const) {
    const record = src[group]
    if (record && typeof record === "object" && !Array.isArray(record)) {
      const filtered: Record<string, string> = {}
      for (const key of keys) { const v = (record as Record<string, unknown>)[key]; if (typeof v === "string") filtered[key] = v }
      out[group] = filtered
    }
  }
  return out
}
export function mergeClientEditorTags(existing: unknown, incoming: unknown): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {}
  const filtered = clientEditorTags(incoming)
  const patch = Array.isArray(filtered) ? { labels: filtered } : filtered ?? {}
  const merged = { ...base, ...patch }
  for (const group of ["address", "operational"]) {
    if (group in patch) merged[group] = { ...(base[group] && typeof base[group] === "object" ? base[group] as object : {}), ...patch[group] as object }
  }
  return merged
}
