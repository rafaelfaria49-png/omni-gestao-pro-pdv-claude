import { diffConfigObjects, diffScalarFields } from "./diff"
import type { ConfigAuditChangeInput, ConfigAuditSection } from "./types"

type SettingsSnapshot = {
  contactEmail?: string | null
  contactWhatsapp?: string | null
  contactWhatsappDono?: string | null
  receiptFooter?: string | null
  mascotCharacterSeed?: string | null
  mascotPromptBase?: string | null
  printerConfig?: unknown
  cardFees?: unknown
}

function inferSectionFromBody(body: Record<string, unknown>): ConfigAuditSection {
  if (body.cardFees !== undefined) return "financeiro"
  if (body.printerConfig !== undefined) {
    const pc = body.printerConfig
    if (pc && typeof pc === "object") {
      const keys = Object.keys(pc as Record<string, unknown>)
      if (keys.some((k) => k.toLowerCase().includes("pdv") || k === "pdvParams")) return "pdv"
    }
    return "vendas"
  }
  return "geral"
}

export function buildStoreSettingsAuditChanges(
  before: SettingsSnapshot | null,
  after: SettingsSnapshot,
  body: Record<string, unknown>,
): { section: ConfigAuditSection; changes: ConfigAuditChangeInput[] } {
  const section = inferSectionFromBody(body)
  const changes: ConfigAuditChangeInput[] = []

  const scalarKeys = [
    "contactEmail",
    "contactWhatsapp",
    "contactWhatsappDono",
    "receiptFooter",
    "mascotCharacterSeed",
    "mascotPromptBase",
  ] as const

  const scalarFields = scalarKeys
    .filter((k) => body[k] !== undefined)
    .map((k) => ({
      key: k,
      before: before?.[k] ?? null,
      after: after[k] ?? null,
    }))

  changes.push(...diffScalarFields(scalarFields))

  if (body.printerConfig !== undefined) {
    changes.push(
      ...diffConfigObjects(before?.printerConfig ?? null, after.printerConfig ?? null, "printerConfig"),
    )
  }

  if (body.cardFees !== undefined) {
    changes.push(...diffConfigObjects(before?.cardFees ?? null, after.cardFees ?? null, "cardFees"))
  }

  return { section, changes }
}
