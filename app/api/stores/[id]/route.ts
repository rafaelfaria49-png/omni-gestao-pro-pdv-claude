import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/require-admin"
import {
  countStoreOperationalLinks,
  denyIfNoStoreAccess,
  isProtectedPrimaryStore,
  parseStoreDeleteConfirm,
  requireStoresSession,
  type StoreDeleteConfirmBody,
} from "@/lib/stores-api-access"
import { diffScalarFields } from "@/lib/config-audit/diff"
import { recordConfigAuditFromSession } from "@/lib/config-audit/record"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type StoreProfileInput = "ASSISTENCIA" | "VARIEDADES" | "SUPERMERCADO"
type SubscriptionPlanInput = "BRONZE" | "PRATA" | "OURO"

function parseProfile(raw: unknown): StoreProfileInput {
  if (raw === "VARIEDADES" || raw === "SUPERMERCADO" || raw === "ASSISTENCIA") return raw
  return "ASSISTENCIA"
}

function parseSubscriptionPlan(raw: unknown): SubscriptionPlanInput | undefined {
  if (raw === "PRATA" || raw === "OURO" || raw === "BRONZE") return raw
  return undefined
}

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const gate = await requireStoresSession()
  if (!gate.ok) return gate.res

  const denied = denyIfNoStoreAccess(gate.session, id)
  if (denied) return denied

  try {
    const store = await prisma.store.findUnique({ where: { id } })
    if (!store) {
      return NextResponse.json({ store: null, error: "Unidade não encontrada." }, { status: 404 })
    }
    return NextResponse.json({ store })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao carregar unidade"
    return NextResponse.json({ store: null, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    const denied = denyIfNoStoreAccess(gate.session, id)
    if (denied) return denied

    let body: StoreDeleteConfirmBody = {}
    try {
      body = (await req.json()) as StoreDeleteConfirmBody
    } catch {
      body = {}
    }
    const confirmErr = parseStoreDeleteConfirm(body, id)
    if (confirmErr) return confirmErr

    if (await isProtectedPrimaryStore(id)) {
      return NextResponse.json(
        { ok: false, error: "A loja principal não pode ser excluída." },
        { status: 403 },
      )
    }

    const existing = await prisma.store.findUnique({
      where: { id },
      select: { id: true, name: true },
    })
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Unidade não encontrada." }, { status: 404 })
    }

    const links = await countStoreOperationalLinks(id)
    if (links.hasLinks) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Esta unidade possui dados vinculados (clientes, OS, produtos ou técnicos) e não pode ser excluída.",
          ...links,
        },
        { status: 409 },
      )
    }

    await prisma.store.delete({ where: { id } })

    try {
      await recordConfigAuditFromSession(req, gate.session, {
        storeId: id,
        section: "geral",
        changes: [
          {
            field: "store.deleted",
            oldValue: { id: existing.id, name: existing.name },
            newValue: null,
          },
        ],
      })
    } catch {
      /* auditoria não deve bloquear exclusão */
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : ""
    if (code === "P2003") {
      return NextResponse.json(
        {
          ok: false,
          error: "Não foi possível excluir: existem registros dependentes nesta unidade.",
        },
        { status: 409 },
      )
    }
    const msg = e instanceof Error ? e.message : "Falha ao excluir unidade"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    const denied = denyIfNoStoreAccess(gate.session, id)
    if (denied) return denied

    const body = (await req.json()) as Partial<{
      name: string
      cnpj: string
      phone: string
      logoUrl: string
      address: unknown
      profile: StoreProfileInput
      subscriptionPlan: SubscriptionPlanInput
    }>

    const existing = await prisma.store.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Unidade não encontrada." }, { status: 404 })
    }

    const profile = body.profile != null ? parseProfile(body.profile) : undefined
    const subscriptionPlan = body.subscriptionPlan != null ? parseSubscriptionPlan(body.subscriptionPlan) : undefined

    const store = await prisma.store.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.cnpj != null ? { cnpj: String(body.cnpj).trim() } : {}),
        ...(body.phone != null ? { phone: String(body.phone).trim() } : {}),
        ...(body.logoUrl != null ? { logoUrl: String(body.logoUrl).trim() } : {}),
        ...(body.address !== undefined ? { address: body.address as any } : {}),
        ...(profile ? { profile } : {}),
        ...(subscriptionPlan ? { subscriptionPlan } : {}),
      },
    })

    try {
      const changes = diffScalarFields([
        ...(body.name != null
          ? [{ key: "store.name", before: existing.name, after: store.name }]
          : []),
        ...(body.cnpj != null
          ? [{ key: "store.cnpj", before: existing.cnpj, after: store.cnpj }]
          : []),
        ...(body.phone != null
          ? [{ key: "store.phone", before: existing.phone, after: store.phone }]
          : []),
        ...(body.address !== undefined
          ? [{ key: "store.address", before: existing.address, after: store.address }]
          : []),
        ...(profile
          ? [{ key: "store.profile", before: existing.profile, after: store.profile }]
          : []),
        ...(subscriptionPlan
          ? [
              {
                key: "store.subscriptionPlan",
                before: existing.subscriptionPlan,
                after: store.subscriptionPlan,
              },
            ]
          : []),
      ])
      if (changes.length > 0) {
        await recordConfigAuditFromSession(req, gate.session, {
          storeId: id,
          section: "geral",
          changes,
        })
      }
    } catch {
      /* auditoria não deve bloquear save */
    }

    return NextResponse.json({ ok: true, store })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao salvar unidade"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
