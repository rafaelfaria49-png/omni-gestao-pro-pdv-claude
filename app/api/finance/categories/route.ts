import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["income", "expense"]),
  color: z.string().max(32).default("#6366f1"),
  icon: z.string().max(64).default("tag"),
})

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(32).optional(),
  icon: z.string().max(64).optional(),
})

function storeId(req: Request): string {
  return opsLojaIdFromRequest(req) || "loja-1"
}

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const sid = storeId(req)
  const url = new URL(req.url)
  const type = url.searchParams.get("type")
  try {
    const categories = await prisma.financialCategory.findMany({
      where: { storeId: sid, ...(type === "income" || type === "expense" ? { type } : {}) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })
    return NextResponse.json({ ok: true, categories })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }) }

  const parsed = createSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 })

  const sid = storeIdFromAssistecRequestForWrite(req) || storeId(req)
  await prismaEnsureConnected()
  try {
    const category = await prisma.financialCategory.create({
      data: { storeId: sid, ...parsed.data },
    })
    return NextResponse.json({ ok: true, category }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 })
  }
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let json: unknown
  try { json = await req.json() } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }) }

  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Dados inválidos" }, { status: 400 })

  await prismaEnsureConnected()
  try {
    const { id, ...data } = parsed.data
    const updated = await prisma.financialCategory.update({ where: { id }, data })
    return NextResponse.json({ ok: true, category: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 404 })
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 })

  await prismaEnsureConnected()
  try {
    await prisma.financialCategory.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 404 })
  }
}
