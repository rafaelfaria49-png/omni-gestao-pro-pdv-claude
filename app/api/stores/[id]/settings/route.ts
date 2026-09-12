import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEnterpriseWith, requireStoreAccess } from "@/lib/auth/guard-enterprise"
import { buildStoreSettingsAuditChanges } from "@/lib/config-audit/store-settings"
import { recordConfigAuditChanges } from "@/lib/config-audit/record"
import { validateCapabilitiesPayload } from "@/lib/capabilities-persistence-v1"
import { persistStoreSettingsPut, type StoreSettingsPutDb } from "@/lib/store-settings-put"
import type { StoreSettingsPutPayload } from "@/lib/store-settings-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const guard = await requireStoreAccess(id)
  if (!guard.ok) {
    return NextResponse.json({ settings: null, error: guard.error }, { status: guard.status })
  }
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId: id } })
    return NextResponse.json({ settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao carregar settings"
    return NextResponse.json({ settings: null, error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const guard = await requireEnterpriseWith(
    id,
    (p) => p.admin.configuracoes,
    "Sem permissão para alterar configurações desta unidade.",
  )
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }
  try {
    const body = (await req.json()) as StoreSettingsPutPayload & Partial<{
      mascotCharacterSeed: string
      mascotPromptBase: string
    }>

    // ── Validação rigorosa de Capabilities V1 ──────────────────────────────
    if (body.printerConfig && typeof body.printerConfig === "object" && !Array.isArray(body.printerConfig)) {
      const pConf = body.printerConfig as Record<string, unknown>
      if (pConf.capabilities !== undefined && pConf.capabilities !== null) {
        const capsValidation = validateCapabilitiesPayload(pConf.capabilities)
        if (!capsValidation.ok) {
          return NextResponse.json({ ok: false, error: capsValidation.error }, { status: 400 })
        }
      }
    }

    const { existing, settings } = await persistStoreSettingsPut(
      prisma as unknown as StoreSettingsPutDb,
      id,
      body,
    )

    try {
      const { section, changes } = buildStoreSettingsAuditChanges(existing, settings, body)
      if (changes.length > 0) {
        await recordConfigAuditChanges(req, { storeId: id, section, changes })
      }
    } catch {
      /* auditoria não deve bloquear save */
    }

    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao salvar settings"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
