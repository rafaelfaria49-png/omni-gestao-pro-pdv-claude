import { diffScalarFields } from "./diff"
import type { ConfigAuditChangeInput } from "./types"

type UserAuditSnapshot = {
  name: string
  email: string
  role: string
  active: boolean
  lojaId: string | null
  storeIds: string[]
}

export function buildAdminUserCreateChanges(
  created: UserAuditSnapshot,
): ConfigAuditChangeInput[] {
  return diffScalarFields([
    { key: "email", before: null, after: created.email },
    { key: "name", before: null, after: created.name },
    { key: "role", before: null, after: created.role },
    { key: "active", before: null, after: created.active },
    { key: "lojaId", before: null, after: created.lojaId },
    { key: "allowedStoreIds", before: null, after: created.storeIds },
  ])
}

export function buildAdminUserPatchChanges(
  before: UserAuditSnapshot,
  after: UserAuditSnapshot,
  body: Record<string, unknown>,
): ConfigAuditChangeInput[] {
  const fields: Array<{ key: string; before: unknown; after: unknown }> = []

  if (body.name !== undefined) {
    fields.push({ key: "name", before: before.name, after: after.name })
  }
  if (body.role !== undefined) {
    fields.push({ key: "role", before: before.role, after: after.role })
  }
  if (body.active !== undefined) {
    fields.push({ key: "active", before: before.active, after: after.active })
  }
  if (body.lojaId !== undefined) {
    fields.push({ key: "lojaId", before: before.lojaId, after: after.lojaId })
  }
  if (body.allowedStoreIds !== undefined) {
    fields.push({
      key: "allowedStoreIds",
      before: before.storeIds,
      after: after.storeIds,
    })
  }
  if (body.password !== undefined && String(body.password).trim()) {
    fields.push({ key: "password", before: null, after: "(alterada)" })
  }

  return diffScalarFields(fields)
}

export function resolveAuditStoreIdForUser(
  lojaId: string | null,
  storeIds: string[],
): string {
  const fromLoja = lojaId?.trim()
  if (fromLoja) return fromLoja
  const first = storeIds[0]?.trim()
  if (first) return first
  return "global"
}
