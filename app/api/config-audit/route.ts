import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { CONFIG_AUDIT_ACTION_PREFIX, CONFIG_AUDIT_SOURCE, type ConfigAuditSection } from "@/lib/config-audit/types"
import { isConfigAuditArea } from "@/lib/config-audit/areas"
import { canAccessConfigAudit } from "@/lib/config-audit/access"
import { parseConfigAuditRow } from "@/lib/config-audit/parse"
import { recordConfigAuditChanges } from "@/lib/config-audit/record"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const postSchema = z.object({
  storeId: z.string().trim().min(1).max(64),
  section: z.enum(["geral", "pdv", "vendas", "financeiro", "usuarios", "seguranca"]),
  changes: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(300),
        oldValue: z.unknown().optional().default(null),
        newValue: z.unknown().optional().default(null),
        area: z
          .enum([
            "financeiro",
            "pdv",
            "impostos",
            "crediario",
            "usuarios",
            "permissoes",
            "maquininhas",
            "modulos",
          ])
          .optional(),
      }),
    )
    .min(1)
    .max(80),
})

function jsonError(msg: string, status: number) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!canAccessConfigAudit(session)) {
    return jsonError("Acesso restrito a administradores de configuração.", 403)
  }

  const url = new URL(req.url)
  const area = url.searchParams.get("area")?.trim() || "all"
  const storeId = url.searchParams.get("storeId")?.trim() || ""
  const section = url.searchParams.get("section")?.trim() || "all"
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const limitRaw = Number(url.searchParams.get("limit") || "200")
  const take = Math.min(500, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 200))

  const where: {
    source: string
    action?: string | { startsWith: string }
    createdAt?: { gte?: Date; lte?: Date }
  } = {
    source: CONFIG_AUDIT_SOURCE,
  }

  if (area !== "all" && isConfigAuditArea(area)) {
    where.action = `${CONFIG_AUDIT_ACTION_PREFIX}${area}`
  } else {
    where.action = { startsWith: CONFIG_AUDIT_ACTION_PREFIX }
  }

  if (from || to) {
    where.createdAt = {}
    if (from) {
      const d = new Date(from)
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d
    }
    if (to) {
      const d = new Date(to)
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999)
        where.createdAt.lte = d
      }
    }
  }

  const rows = await prisma.logsAuditoria.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take * 2,
  })

  let logs = rows
    .map((r) => parseConfigAuditRow(r))
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (storeId) {
    logs = logs.filter((l) => l.storeId === storeId)
  }

  if (section !== "all") {
    logs = logs.filter((l) => l.section === (section as ConfigAuditSection))
  }

  logs = logs.slice(0, take)

  return NextResponse.json({ ok: true, logs })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!canAccessConfigAudit(session)) {
    return jsonError("Não autorizado.", 403)
  }

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await req.json())
  } catch {
    return jsonError("Payload inválido.", 400)
  }

  const n = await recordConfigAuditChanges(req, {
    storeId: body.storeId,
    section: body.section,
    changes: body.changes.map((c) => ({
      field: c.field,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      area: c.area,
    })),
  })

  return NextResponse.json({ ok: true, recorded: n })
}
