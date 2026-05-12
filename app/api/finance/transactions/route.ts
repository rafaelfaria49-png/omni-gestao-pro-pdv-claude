import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"
import type { Prisma } from "@/generated/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const createSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().optional(),
  clienteId: z.string().optional(),
  vendaId: z.string().optional(),
  osId: z.string().optional(),
  type: z.enum(["income", "expense"]),
  status: z.enum(["pending", "paid", "canceled"]).default("pending"),
  description: z.string().min(1).max(240),
  amount: z.number().finite().nonnegative(),
  dueDate: z.string().min(1),
  paidAt: z.string().optional(),
  competencyDate: z.string().optional(),
  paymentMethod: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
})

const patchSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  status: z.enum(["pending", "paid", "canceled"]).optional(),
  description: z.string().min(1).max(240).optional(),
  amount: z.number().finite().nonnegative().optional(),
  dueDate: z.string().optional(),
  paidAt: z.string().nullable().optional(),
  competencyDate: z.string().nullable().optional(),
  paymentMethod: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

function storeId(req: Request): string {
  return opsLojaIdFromRequest(req) || "loja-1"
}

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const sid = storeId(req)
  const url = new URL(req.url)

  const type = url.searchParams.get("type")
  const status = url.searchParams.get("status")
  const accountId = url.searchParams.get("accountId")
  const categoryId = url.searchParams.get("categoryId")
  const q = url.searchParams.get("q")?.trim()
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)))

  const where: Prisma.FinancialTransactionWhereInput = { storeId: sid }
  if (type === "income" || type === "expense") where.type = type
  if (status === "pending" || status === "paid" || status === "canceled") where.status = status
  if (accountId) where.accountId = accountId
  if (categoryId) where.categoryId = categoryId
  if (from || to) {
    where.dueDate = {}
    if (from) where.dueDate.gte = new Date(from)
    if (to) where.dueDate.lte = new Date(to)
  }
  if (q) {
    where.description = { contains: q, mode: "insensitive" }
  }

  try {
    const [transactions, total] = await prisma.$transaction([
      prisma.financialTransaction.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, color: true, icon: true } },
          account: { select: { id: true, name: true, type: true } },
          attachments: { select: { id: true, fileName: true, fileUrl: true } },
        },
        orderBy: { dueDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.financialTransaction.count({ where }),
    ])
    return NextResponse.json({
      ok: true,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
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
    const { dueDate, paidAt, competencyDate, ...rest } = parsed.data
    const transaction = await prisma.financialTransaction.create({
      data: {
        storeId: sid,
        ...rest,
        dueDate: new Date(dueDate),
        paidAt: paidAt ? new Date(paidAt) : undefined,
        competencyDate: competencyDate ? new Date(competencyDate) : undefined,
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        account: { select: { id: true, name: true, type: true } },
      },
    })

    // Atualiza saldo da conta quando pago imediatamente
    if (parsed.data.status === "paid") {
      const delta = parsed.data.type === "income" ? parsed.data.amount : -parsed.data.amount
      await prisma.financialAccount.update({
        where: { id: parsed.data.accountId },
        data: { balance: { increment: delta } },
      })
    }

    return NextResponse.json({ ok: true, transaction }, { status: 201 })
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

  const sid = storeIdFromAssistecRequestForWrite(req) || storeId(req)
  await prismaEnsureConnected()
  try {
    const { id, dueDate, paidAt, competencyDate, ...rest } = parsed.data

    const prev = await prisma.financialTransaction.findFirst({ where: { id, storeId: sid } })
    if (!prev) return NextResponse.json({ ok: false, error: "Transação não encontrada" }, { status: 404 })

    const data: Prisma.FinancialTransactionUpdateInput = {
      ...rest,
      ...(dueDate !== undefined ? { dueDate: new Date(dueDate) } : {}),
      ...(paidAt !== undefined ? { paidAt: paidAt ? new Date(paidAt) : null } : {}),
      ...(competencyDate !== undefined ? { competencyDate: competencyDate ? new Date(competencyDate) : null } : {}),
    }

    const updated = await prisma.financialTransaction.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        account: { select: { id: true, name: true, type: true } },
      },
    })

    // Ajuste de saldo quando muda status para paid ou de paid para outro
    const wasPaid = prev.status === "paid"
    const nowPaid = parsed.data.status === "paid"
    if (!wasPaid && nowPaid) {
      const delta = prev.type === "income" ? prev.amount : -prev.amount
      await prisma.financialAccount.update({
        where: { id: prev.accountId },
        data: { balance: { increment: delta } },
      })
    } else if (wasPaid && !nowPaid && parsed.data.status !== undefined) {
      const delta = prev.type === "income" ? -prev.amount : prev.amount
      await prisma.financialAccount.update({
        where: { id: prev.accountId },
        data: { balance: { increment: delta } },
      })
    }

    return NextResponse.json({ ok: true, transaction: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 })
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const sid = storeIdFromAssistecRequestForWrite(req) || storeId(req)
  const url = new URL(req.url)
  const id = url.searchParams.get("id")
  if (!id) return NextResponse.json({ ok: false, error: "id obrigatório" }, { status: 400 })

  await prismaEnsureConnected()
  try {
    const tx = await prisma.financialTransaction.findFirst({ where: { id, storeId: sid } })
    if (!tx) return NextResponse.json({ ok: false, error: "Não encontrado" }, { status: 404 })

    await prisma.financialTransaction.update({ where: { id }, data: { status: "canceled" } })

    // Estorno de saldo se estava pago
    if (tx.status === "paid") {
      const delta = tx.type === "income" ? -tx.amount : tx.amount
      await prisma.financialAccount.update({
        where: { id: tx.accountId },
        data: { balance: { increment: delta } },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 })
  }
}
