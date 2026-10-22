import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformSession, parseModuleAccess } from "@/lib/auth/access-policy"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) return NextResponse.json({ ok: false, error: "Somente a plataforma altera módulos." }, { status: 403 })
  const raw = await req.json().catch(() => null)
  const policy = parseModuleAccess(raw)
  if (!policy || Object.keys(raw).some((k) => !["version", "modules"].includes(k))) return NextResponse.json({ ok: false, error: "Política inválida." }, { status: 400 })
  const { id } = await ctx.params
  try {
    const store = await prisma.store.update({ where: { id }, data: { moduleAccess: policy }, select: { id: true, moduleAccess: true, updatedAt: true } })
    return NextResponse.json({ ok: true, store }, { headers: { "Cache-Control": "no-store" } })
  } catch { return NextResponse.json({ ok: false, error: "Unidade indisponível." }, { status: 404 }) }
}
