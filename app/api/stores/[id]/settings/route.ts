import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireEnterpriseWith, requireStoreAccess } from "@/lib/auth/guard-enterprise"
import { buildStoreSettingsAuditChanges } from "@/lib/config-audit/store-settings"
import { recordConfigAuditChanges } from "@/lib/config-audit/record"
import { validateCapabilitiesPayload } from "@/lib/capabilities-persistence-v1"
import { mergePrinterConfigServerSide } from "@/lib/pdv-settings-server-first"
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

    const isBackfill = !!body.backfill
    const existing = await prisma.storeSettings.findUnique({ where: { storeId: id } })

    const existingPrinter =
      existing?.printerConfig && typeof existing.printerConfig === "object" && !Array.isArray(existing.printerConfig)
        ? (existing.printerConfig as Record<string, unknown>)
        : null

    const incomingPrinter =
      body.printerConfig && typeof body.printerConfig === "object" && !Array.isArray(body.printerConfig)
        ? (body.printerConfig as Record<string, unknown>)
        : null

    const resolvedPrinter =
      incomingPrinter !== null
        ? mergePrinterConfigServerSide(existingPrinter, incomingPrinter, isBackfill)
        : existingPrinter

    // Se for backfill, só grava campos de texto se estiverem vazios/ausentes no banco existente
    const resolveField = (incoming: string | null | undefined, current: string | undefined): string | undefined => {
      if (incoming === undefined) return undefined
      if (isBackfill && current && current.trim() !== "") {
        return current.trim()
      }
      return incoming != null ? String(incoming).trim() : ""
    }

    const nextContactEmail = resolveField(body.contactEmail, existing?.contactEmail)
    const nextContactWhatsapp = resolveField(body.contactWhatsapp, existing?.contactWhatsapp)
    const nextContactWhatsappDono = resolveField(body.contactWhatsappDono, existing?.contactWhatsappDono)
    const nextReceiptFooter = resolveField(body.receiptFooter, existing?.receiptFooter)
    const nextMascotSeed = resolveField(body.mascotCharacterSeed, existing?.mascotCharacterSeed)
    const nextMascotPrompt = resolveField(body.mascotPromptBase, existing?.mascotPromptBase)

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
        printerConfig: (resolvedPrinter ?? {}) as any,
        cardFees: body.cardFees as any,
      },
      update: {
        ...(nextContactEmail !== undefined ? { contactEmail: nextContactEmail } : {}),
        ...(nextContactWhatsapp !== undefined ? { contactWhatsapp: nextContactWhatsapp } : {}),
        ...(nextContactWhatsappDono !== undefined ? { contactWhatsappDono: nextContactWhatsappDono } : {}),
        ...(nextReceiptFooter !== undefined ? { receiptFooter: nextReceiptFooter } : {}),
        ...(nextMascotSeed !== undefined ? { mascotCharacterSeed: nextMascotSeed } : {}),
        ...(nextMascotPrompt !== undefined ? { mascotPromptBase: nextMascotPrompt } : {}),
        ...(body.printerConfig !== undefined ? { printerConfig: resolvedPrinter as any } : {}),
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
