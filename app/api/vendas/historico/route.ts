/**
 * GET /api/vendas/historico
 *
 * Lista vendas reais do banco (model Venda) com KPIs e paginação.
 * Lê storeId do header x-assistec-loja-id, cookie assistec-active-store ou query storeId.
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const PAYMENT_LABELS: Record<keyof PaymentBreakdownFull, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartaoDebito: "Débito",
  cartaoCredito: "Crédito",
  carne: "Carnê",
  aPrazo: "A Prazo",
  creditoVale: "Vale/Crédito",
}

function primaryPaymentLabel(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "—"
  const pb = (payload as any).paymentBreakdown as Partial<PaymentBreakdownFull> | undefined
  if (!pb) return "—"
  let best = ""
  let bestVal = 0
  for (const [k, v] of Object.entries(pb)) {
    const val = Number(v) || 0
    if (val > bestVal) {
      bestVal = val
      best = k
    }
  }
  return best ? (PAYMENT_LABELS[best as keyof PaymentBreakdownFull] ?? best) : "—"
}

export async function GET(req: Request) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200)
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10)

  try {
    await prismaEnsureConnected()

    const where = {
      storeId,
      ...(q
        ? {
            OR: [
              { pedidoId: { contains: q, mode: "insensitive" as const } },
              { clienteNome: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    }

    const [rows, totalCount] = await Promise.all([
      prisma.venda.findMany({
        where,
        include: { itens: { select: { quantidade: true } } },
        orderBy: { at: "desc" },
        take: Number.isFinite(take) ? take : 50,
        skip: Number.isFinite(skip) ? skip : 0,
      }),
      prisma.venda.count({ where }),
    ])

    // KPIs — always over the full store dataset (no search filter)
    const kpiWhere = { storeId }
    const [kpiAgg] = await Promise.all([
      prisma.venda.aggregate({
        where: kpiWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
    ])

    const vendas = rows.map((r) => ({
      id: r.pedidoId,
      at: r.at.toISOString(),
      cliente: r.clienteNome || "—",
      total: r.total,
      status: "pago" as const,
      formaPagamento: primaryPaymentLabel(r.payload),
      quantidadeItens: r.itens.reduce((acc, it) => acc + it.quantidade, 0),
      cancelada: false,
    }))

    return NextResponse.json({
      ok: true,
      vendas,
      total: totalCount,
      kpis: {
        totalVendas: kpiAgg._count.id,
        faturamento: kpiAgg._sum.total ?? 0,
        cancelamentos: 0,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/historico]", msg)
    return NextResponse.json(
      { ok: false, error: "Falha ao carregar histórico", vendas: [], total: 0, kpis: { totalVendas: 0, faturamento: 0, cancelamentos: 0 } },
      { status: 503 },
    )
  }
}
