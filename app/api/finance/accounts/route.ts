import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import { type FinancialAccountType } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ACCOUNT_TYPES: FinancialAccountType[] = ["cash", "bank", "pix", "credit_card"]

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["cash", "bank", "pix", "credit_card"]),
  balance: z.number().finite().default(0),
})

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  type: z.enum(["cash", "bank", "pix", "credit_card"]).optional(),
  balance: z.number().finite().optional(),
  active: z.boolean().optional(),
})

function storeId(req: Request): string | null {
  return opsLojaIdFromRequest(req)
}

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const sid = storeId(req)
  if (!sid) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  try {
    const accounts = await prisma.financialAccount.findMany({
      where: { storeId: sid, active: true },
      orderBy: { createdAt: "asc" },
    })
    const total = accounts.reduce((s, a) => s + a.balance, 0)
    return NextResponse.json({ ok: true, accounts, total })
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

  const sid = storeIdFromAssistecRequestForWrite(req) ?? storeId(req)
  if (!sid) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  await prismaEnsureConnected()
  try {
    const account = await prisma.financialAccount.create({
      data: { storeId: sid, ...parsed.data },
    })
    return NextResponse.json({ ok: true, account }, { status: 201 })
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

  const sid = storeIdFromAssistecRequestForWrite(req) ?? storeId(req)
  if (!sid) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  await prismaEnsureConnected()
  try {
    const { id, ...data } = parsed.data
    const updated = await prisma.financialAccount.update({
      where: { id },
      data,
    })
    return NextResponse.json({ ok: true, account: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 404 })
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const sid = storeIdFromAssistecRequestForWrite(req) ?? storeId(req)
  if (!sid) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 })

  await prismaEnsureConnected()
  try {
    // Soft delete — preserva histórico
    await prisma.financialAccount.update({ where: { id }, data: { active: false } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 404 })
  }
}
