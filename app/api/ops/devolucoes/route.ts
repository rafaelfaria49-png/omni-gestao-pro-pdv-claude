import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const gate = await requireOpsSubscription()
  if (!gate.ok) return gate.res

  const lojaId = opsLojaIdFromRequest(req)
  if (!lojaId) {
    return NextResponse.json(
      { error: "Unidade obrigatória: envie o header x-assistec-loja-id." },
      { status: 400 }
    )
  }

  const url = new URL(req.url)
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200)
  const skip = Math.max(parseInt(url.searchParams.get("skip") ?? "0", 10), 0)
  const from = url.searchParams.get("from") // ISO date string
  const to = url.searchParams.get("to")
  const tipo = url.searchParams.get("tipo") // vale_credito | somente_estoque | troca
  const sessaoId = url.searchParams.get("sessaoId")
  const q = url.searchParams.get("q")?.trim()

  try {
    const where = {
      storeId: lojaId,
      ...(from || to
        ? {
            at: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(tipo ? { tipo } : {}),
      ...(sessaoId ? { sessaoId } : {}),
      ...(q
        ? {
            OR: [
              { localId: { contains: q, mode: "insensitive" as const } },
              { clienteNome: { contains: q, mode: "insensitive" as const } },
              { clienteDoc: { contains: q } },
            ],
          }
        : {}),
    }

    const [devolucoes, total] = await Promise.all([
      prisma.devolucaoVenda.findMany({
        where,
        orderBy: { at: "desc" },
        take,
        skip,
        include: {
          itens: {
            select: { id: true, nome: true, quantidade: true, valorTotal: true },
          },
        },
      }),
      prisma.devolucaoVenda.count({ where }),
    ])

    // KPIs
    const kpis = await prisma.devolucaoVenda.aggregate({
      where: { storeId: lojaId },
      _sum: { valorTotal: true, creditoEmitido: true },
      _count: { id: true },
    })

    return NextResponse.json({
      ok: true,
      devolucoes,
      total,
      kpis: {
        totalDevolucoes: kpis._count.id,
        valorTotalDevolvido: kpis._sum.valorTotal ?? 0,
        creditoEmitidoTotal: kpis._sum.creditoEmitido ?? 0,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[ops/devolucoes]", msg)
    return NextResponse.json({ error: "Falha ao listar devoluções" }, { status: 500 })
  }
}
