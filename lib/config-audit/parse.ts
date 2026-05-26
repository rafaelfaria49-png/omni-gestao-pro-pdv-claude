import { isConfigAuditArea } from "./areas"
import {
  CONFIG_AUDIT_ACTION_PREFIX,
  CONFIG_AUDIT_SOURCE,
  type ConfigAuditLogRow,
  type ConfigAuditMetadataV1,
  type ConfigAuditSection,
} from "./types"

function isSection(value: string): value is ConfigAuditSection {
  return (
    value === "geral" ||
    value === "pdv" ||
    value === "vendas" ||
    value === "financeiro" ||
    value === "usuarios" ||
    value === "seguranca"
  )
}

export function parseConfigAuditRow(row: {
  id: string
  createdAt: Date
  action: string
  userLabel: string
  detail: string
  metadata: string | null
  source: string
}): ConfigAuditLogRow | null {
  if (row.source !== CONFIG_AUDIT_SOURCE) return null
  if (!row.action.startsWith(CONFIG_AUDIT_ACTION_PREFIX)) return null

  let meta: ConfigAuditMetadataV1 | null = null
  if (row.metadata) {
    try {
      const parsed = JSON.parse(row.metadata) as ConfigAuditMetadataV1
      if (parsed?.v === 1 && parsed.storeId && parsed.field) meta = parsed
    } catch {
      /* ignore */
    }
  }

  const areaFromAction = row.action.slice(CONFIG_AUDIT_ACTION_PREFIX.length)
  const area = meta?.area ?? (isConfigAuditArea(areaFromAction) ? areaFromAction : "financeiro")

  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    action: row.action,
    userLabel: row.userLabel,
    detail: row.detail,
    area,
    section: meta?.section && isSection(meta.section) ? meta.section : "geral",
    storeId: meta?.storeId ?? "",
    field: meta?.field ?? row.detail,
    oldValue: meta?.oldValue ?? "",
    newValue: meta?.newValue ?? "",
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  }
}
