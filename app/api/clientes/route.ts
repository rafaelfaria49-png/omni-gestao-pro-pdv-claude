import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { StatusOrdemServico } from "@/generated/prisma"
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

function normalizeSearch(s: string) {
  return s.trim()
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = normalizeSearch(url.searchParams.get("q") ?? "")
    const storeId = storeIdFromAssistecRequestForRead(req)

    const clientes = await prisma.cliente.findMany({
      where: {
        storeId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } },
                { document: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
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
      take: 200,
    })

    // Total gasto REAL e consistente com o Cadastros HUB: agrega OS concluídas
    // (Pronto/Entregue) + Vendas concluídas por clienteId. Fallback para a coluna
    // estática Cliente.totalSpent (clientes importados sem OS/Venda no app).
    let totalPorCliente = new Map<string, number>()
    try {
      const [osTotals, vendaTotals] = await Promise.all([
        prisma.ordemServico.groupBy({
          by: ["clienteId"],
          where: {
            storeId,
            clienteId: { not: null },
            status: { in: [StatusOrdemServico.Pronto, StatusOrdemServico.Entregue] },
          },
          _sum: { valorTotal: true },
        }),
        prisma.venda.groupBy({
          by: ["clienteId"],
          where: { storeId, clienteId: { not: null }, status: "concluida" },
          _sum: { total: true },
        }),
      ])
      const totais = new Map<string, number>()
      for (const r of osTotals) {
        if (r.clienteId) totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.valorTotal ?? 0))
      }
      for (const r of vendaTotals) {
        if (r.clienteId) totais.set(r.clienteId, (totais.get(r.clienteId) ?? 0) + Number(r._sum.total ?? 0))
      }
      totalPorCliente = totais
    } catch (aggErr) {
      console.error("[api/clientes GET] agregação totalSpent falhou:", aggErr instanceof Error ? aggErr.message : aggErr)
    }

    const clientesComTotal = clientes.map((c) => ({
      ...c,
      totalSpent: totalPorCliente.get(c.id) ?? Number(c.totalSpent ?? 0),
    }))

    return json({ clientes: clientesComTotal })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes GET]", msg)
    return json(
      { error: "Falha ao listar clientes", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

export async function POST(req: Request) {
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
    const kind = typeof body.kind === "string" ? body.kind.trim() : "PF"
    const document = typeof body.document === "string" ? body.document.trim() : ""
    const city = typeof body.city === "string" ? body.city.trim() : ""
    const tags = body.tags !== undefined ? body.tags : null
    const active = typeof body.active === "boolean" ? body.active : true
    const totalSpent = typeof body.totalSpent === "number" ? body.totalSpent : 0
    
    let lastPurchaseAt: Date | null = null
    if (body.lastPurchaseAt) {
      const d = new Date(body.lastPurchaseAt as string)
      if (!Number.isNaN(d.getTime())) {
        lastPurchaseAt = d
      }
    }

    const storeId = storeIdFromAssistecRequestForWrite(req)
    if (!storeId) {
      return badRequest("Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId.")
    }

    if (!name) return badRequest('Campo "name" é obrigatório')
    if (!phone) return badRequest('Campo "phone" é obrigatório')
    if (!isValidPhoneBr(phone)) return badRequest("Telefone inválido (use DDD + número, 10 ou 11 dígitos)")

    const created = await prisma.cliente.create({
      data: {
        name,
        phone,
        email: email || null,
        kind,
        document,
        city,
        tags: tags || undefined,
        active,
        totalSpent,
        lastPurchaseAt,
        storeId,
      },
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

    return json({ ok: true, cliente: created }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/clientes POST]", msg)
    return json(
      { error: "Falha ao criar cliente", ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}) },
      { status: 503 }
    )
  }
}

