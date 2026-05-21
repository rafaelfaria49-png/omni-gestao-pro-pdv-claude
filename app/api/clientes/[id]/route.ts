import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { isValidPhoneBr } from "@/lib/phone-br"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { requireAdmin } from "@/lib/require-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
    const storeId = storeIdFromAssistecRequestForRead(req)
    if (!storeId) {
      return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")
    }

    const cliente = await prisma.cliente.findFirst({
      where: { id, storeId },
      include: {
        ordensServico: {
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        vendas: {
          orderBy: { at: "desc" },
          take: 15,
        },
      },
    })

    if (!cliente) {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    return json({ ok: true, cliente })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes/[id] GET]", msg)
    return json(
      { error: "Falha ao obter detalhes do cliente", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const body = (await req.json()) as {
      name?: unknown
      phone?: unknown
      email?: unknown
      kind?: unknown
      document?: unknown
      city?: unknown
      tags?: unknown
      active?: unknown
      totalSpent?: unknown
      lastPurchaseAt?: unknown
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const phone = typeof body.phone === "string" ? body.phone.trim() : ""
    const email = typeof body.email === "string" ? body.email.trim() : ""
    const kind = typeof body.kind === "string" ? body.kind.trim() : undefined
    const document = typeof body.document === "string" ? body.document.trim() : undefined
    const city = typeof body.city === "string" ? body.city.trim() : undefined
    const tags = body.tags !== undefined ? body.tags : undefined
    const active = typeof body.active === "boolean" ? body.active : undefined
    const totalSpent = typeof body.totalSpent === "number" ? body.totalSpent : undefined
    
    let lastPurchaseAt: Date | null | undefined = undefined
    if (body.lastPurchaseAt !== undefined) {
      if (body.lastPurchaseAt === null) {
        lastPurchaseAt = null
      } else {
        const d = new Date(body.lastPurchaseAt as string)
        if (!Number.isNaN(d.getTime())) {
          lastPurchaseAt = d
        }
      }
    }

    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")
    }

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (!phone) return badRequest('Campo "phone" é obrigatório')
    if (!isValidPhoneBr(phone)) return badRequest("Telefone inválido (use DDD + número, 10 ou 11 dígitos)")

    const upd = await prisma.cliente.updateMany({
      where: { id, storeId },
      data: {
        name,
        phone,
        email: email || null,
        ...(kind !== undefined ? { kind } : {}),
        ...(document !== undefined ? { document } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(tags !== undefined ? { tags: tags || Prisma.DbNull } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(totalSpent !== undefined ? { totalSpent } : {}),
        ...(lastPurchaseAt !== undefined ? { lastPurchaseAt } : {}),
      },
    })
    if (upd.count === 0) {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    const updated = await prisma.cliente.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        document: true,
        kind: true,
        city: true,
        tags: true,
        active: true,
        totalSpent: true,
        lastPurchaseAt: true,
        createdAt: true,
      },
    })

    return json({ ok: true, cliente: updated })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes PATCH]", msg)
    return json(
      { error: "Falha ao atualizar cliente", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id?.trim()) return badRequest("ID inválido")

  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")
    }
    const del = await prisma.cliente.deleteMany({ where: { id, storeId } })
    if (del.count === 0) {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    return json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return json({ error: "Cliente não encontrado" }, { status: 404 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes DELETE]", msg)
    return json(
      { error: "Falha ao excluir cliente", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}
