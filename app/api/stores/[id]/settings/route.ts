import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/require-admin"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { buildStoreSettingsAuditChanges } from "@/lib/config-audit/store-settings"
import { recordConfigAuditChanges } from "@/lib/config-audit/record"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

async function canManageStoreSettings(): Promise<boolean> {
  // 1) NextAuth session ou cookie admin legado
  const adminGate = await requireAdmin()
  if (adminGate.ok) return true

  // 2) Dono da loja sem sessão NextAuth, autenticado por assinatura válida
  const sub = await getVerifiedSubscriptionFromCookies()
  return sub.ok
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
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
  try {
    const allowed = await canManageStoreSettings()
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const body = (await req.json()) as Partial<{
      contactEmail: string
      contactWhatsapp: string
      contactWhatsappDono: string
      receiptFooter: string
      mascotCharacterSeed: string
      mascotPromptBase: string
      printerConfig: unknown
      cardFees: unknown
    }>

    const existing = await prisma.storeSettings.findUnique({ where: { storeId: id } })

    const settings = await prisma.storeSettings.upsert({
      where: { storeId: id },
      create: {
        storeId: id,
        contactEmail: (body.contactEmail || "").trim(),
        contactWhatsapp: (body.contactWhatsapp || "").trim(),
        contactWhatsappDono: (body.contactWhatsappDono || "").trim(),
        receiptFooter: (body.receiptFooter || "").trim(),
        mascotCharacterSeed: (body.mascotCharacterSeed || "").trim(),
        mascotPromptBase: (body.mascotPromptBase || "").trim(),
        printerConfig: body.printerConfig as any,
        cardFees: body.cardFees as any,
      },
      update: {
        ...(body.contactEmail != null ? { contactEmail: String(body.contactEmail).trim() } : {}),
        ...(body.contactWhatsapp != null ? { contactWhatsapp: String(body.contactWhatsapp).trim() } : {}),
        ...(body.contactWhatsappDono != null ? { contactWhatsappDono: String(body.contactWhatsappDono).trim() } : {}),
        ...(body.receiptFooter != null ? { receiptFooter: String(body.receiptFooter).trim() } : {}),
        ...(body.mascotCharacterSeed != null ? { mascotCharacterSeed: String(body.mascotCharacterSeed).trim() } : {}),
        ...(body.mascotPromptBase != null ? { mascotPromptBase: String(body.mascotPromptBase).trim() } : {}),
        ...(body.printerConfig !== undefined ? { printerConfig: body.printerConfig as any } : {}),
        ...(body.cardFees !== undefined ? { cardFees: body.cardFees as any } : {}),
      },
    })

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

