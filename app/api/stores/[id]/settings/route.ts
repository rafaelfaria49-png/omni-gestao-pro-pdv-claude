import { requireModuleApi } from "@/lib/auth/module-access"
import { hasModule } from "@/lib/auth/enterprise-permissions"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEnterpriseWith, requireStoreAccess } from "@/lib/auth/guard-enterprise"
import { buildStoreSettingsAuditChanges } from "@/lib/config-audit/store-settings"
import { recordConfigAuditChanges } from "@/lib/config-audit/record"
import { validateCapabilitiesPayload } from "@/lib/capabilities-persistence-v1"
import { isDedicatedCapabilitiesPatch } from "@/lib/pdv-settings-server-first"
import { persistStoreSettingsPut, type StoreSettingsPutDb } from "@/lib/store-settings-put"
import type { StoreSettingsPutPayload } from "@/lib/store-settings-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const moduleDenied = await requireModuleApi(_, "authenticated")
  if (moduleDenied) return moduleDenied

  const { id } = await ctx.params
  const guard = await requireStoreAccess(id)
  if (!guard.ok) {
    return NextResponse.json({ settings: null, error: guard.error }, { status: guard.status })
  }
  try {
    const settings = await prisma.storeSettings.findUnique({ where: { storeId: id } })
    return NextResponse.json({ settings })
  } catch {
    // Mensagem do Prisma/driver pode conter host, query ou dados: nunca ao operador.
    return NextResponse.json({ settings: null, error: "Falha ao carregar configurações da unidade." }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const moduleDenied = await requireModuleApi(req, "settings")
  if (moduleDenied) return moduleDenied

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
    if (!isPlatformSession(guard.session) && ["moduleAccess", "accessScope", "platformAuthority", "subscriptionPlan", "marketingMediaCredits"].some((key) => Object.hasOwn(body, key))) {
      return NextResponse.json({ ok: false, error: "Liberação controlada pela plataforma." }, { status: 403 })
    }
    if (!hasModule(guard.session, "marketing", id) && (body.mascotCharacterSeed !== undefined || body.mascotPromptBase !== undefined)) {
      return NextResponse.json({ ok: false, error: "Módulo não liberado." }, { status: 403 })
    }

    // A persistência decide o modo por `!!body.backfill`; só booleano evita divergir da validação abaixo.
    if (body.backfill !== undefined && typeof body.backfill !== "boolean") {
      return NextResponse.json({ ok: false, error: "Campo backfill inválido." }, { status: 400 })
    }

    // ── Validação rigorosa de Capabilities V1 ──────────────────────────────
    // Snapshot com seções irmãs não altera capabilities (ver merge): não validar o que não será aplicado.
    if (body.printerConfig && typeof body.printerConfig === "object" && !Array.isArray(body.printerConfig)) {
      const pConf = body.printerConfig as Record<string, unknown>
      if (Object.hasOwn(pConf, "capabilities") && (body.backfill === true || isDedicatedCapabilitiesPatch(pConf))) {
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
  } catch {
    return NextResponse.json({ ok: false, error: "Falha ao salvar configurações da unidade. Tente novamente." }, { status: 500 })
  }
}
