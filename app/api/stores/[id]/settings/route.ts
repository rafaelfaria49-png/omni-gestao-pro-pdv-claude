import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/require-admin"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { STAFF_ROLE_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/staff-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

async function canManageStoreSettings(): Promise<boolean> {
  // 1) Admin explícito (fluxo mais restrito)
  const adminGate = await requireAdmin()
  if (adminGate.ok) return true

  // 2) Se houver sessão staff, só ADMIN/GERENTE podem alterar configurações
  const jar = await cookies()
  const hasStaffSession = !!String(jar.get(STAFF_SESSION_COOKIE)?.value || "").trim()
  const staffRole = String(jar.get(STAFF_ROLE_COOKIE)?.value || "").trim().toUpperCase()
  if (hasStaffSession) {
    return staffRole === "ADMIN" || staffRole === "GERENTE"
  }

  // 3) Dono da loja (sem sessão staff), autenticado por assinatura válida
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
    return NextResponse.json({ ok: true, settings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao salvar settings"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

