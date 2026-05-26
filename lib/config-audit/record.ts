import { prisma } from "@/lib/prisma"
import { buildAuditDetail, changeToSerializedStrings } from "./diff"
import { inferConfigAuditArea } from "./areas"
import { actorFromSession, clientInfoFromRequest, resolveConfigAuditActor } from "./actor"
import type { Session } from "next-auth"
import {
  CONFIG_AUDIT_ACTION_PREFIX,
  CONFIG_AUDIT_SOURCE,
  type ConfigAuditActor,
  type ConfigAuditChangeInput,
  type ConfigAuditMetadataV1,
  type ConfigAuditSection,
} from "./types"

export async function recordConfigAuditChanges(
  req: Request,
  params: {
    storeId: string
    section: ConfigAuditSection
    changes: ConfigAuditChangeInput[]
    actor?: ConfigAuditActor | null
  },
): Promise<number> {
  const changes = params.changes.filter((c) => c.field.trim())
  if (changes.length === 0) return 0

  const actor = params.actor ?? (await resolveConfigAuditActor())
  if (!actor) return 0

  const { ip, userAgent } = clientInfoFromRequest(req)
  const storeId = params.storeId.trim()
  if (!storeId) return 0

  const rows = changes.map((change) => {
    const area = change.area ?? inferConfigAuditArea(change.field)
    const { oldValue, newValue } = changeToSerializedStrings(change)
    const metadata: ConfigAuditMetadataV1 = {
      v: 1,
      storeId,
      section: params.section,
      area,
      field: change.field,
      oldValue,
      newValue,
      userId: actor.userId,
      userEmail: actor.userEmail ?? null,
      ip,
      userAgent,
    }
    return {
      action: `${CONFIG_AUDIT_ACTION_PREFIX}${area}`,
      userLabel: actor.userLabel.slice(0, 500),
      detail: buildAuditDetail(change.field, oldValue, newValue).slice(0, 4000),
      metadata: JSON.stringify(metadata).slice(0, 8000),
      source: CONFIG_AUDIT_SOURCE,
    }
  })

  await prisma.logsAuditoria.createMany({ data: rows })
  return rows.length
}

export async function recordConfigAuditFromSession(
  req: Request,
  session: Session,
  params: {
    storeId: string
    section: ConfigAuditSection
    changes: ConfigAuditChangeInput[]
  },
): Promise<number> {
  return recordConfigAuditChanges(req, { ...params, actor: actorFromSession(session) })
}
