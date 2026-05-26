import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/require-admin"
import { countStoreOperationalLinks, denyIfNoStoreAccess } from "@/lib/stores-api-access"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const denied = denyIfNoStoreAccess(gate.session, id)
  if (denied) return denied

  try {
    const { hasLinks, clientes, os, produtos, tecnicos } = await countStoreOperationalLinks(id)
    return NextResponse.json({ ok: true, hasLinks, clientes, os, produtos, tecnicos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao verificar vínculos"
    return NextResponse.json({ ok: false, error: msg, hasLinks: false }, { status: 500 })
  }
}
