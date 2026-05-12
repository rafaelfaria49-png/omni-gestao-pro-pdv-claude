/**
 * GET /api/vendas/historico
 *
 * Lista vendas reais do banco (model Venda) com KPIs, filtros e paginação.
 * Lê storeId do header x-assistec-loja-id, cookie assistec-active-store ou query storeId.
 *
 * Filtros disponíveis:
 *  q         — busca por pedidoId / clienteNome
 *  status    — concluida | cancelada | parcialmente_devolvida | devolvida
 *  pagamento — dinheiro | pix | cartaoDebito | cartaoCredito | carne | aPrazo | creditoVale
 *  operador  — string parcial no campo operador
 *  from      — ISO date início
 *  to        — ISO date fim
 *  take      — máx 200 (padrão 50)
 *  skip      — paginação
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import type { Prisma } from "@/generated/prisma"

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
  const pb = (payload as Record<string, unknown>).paymentBreakdown as
    | Partial<PaymentBreakdownFull>
    | undefined
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

function paymentMatchesFilter(payload: unknown, filter: string): boolean {
  if (!payload || typeof payload !== "object") return false
  const pb = (payload as Record<string, unknown>).paymentBreakdown as
    | Partial<PaymentBreakdownFull>
    | undefined
  if (!pb) return false
  const val = Number(pb[filter as keyof PaymentBreakdownFull]) || 0
  return val > 0
}

export async function GET(req: Request) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() ?? ""
  const statusFilter = url.searchParams.get("status")?.trim() ?? ""
  const operadorFilter = url.searchParams.get("operador")?.trim() ?? ""
  const fromStr = url.searchParams.get("from")?.trim() ?? ""
  const toStr = url.searchParams.get("to")?.trim() ?? ""
  const take = Math.min(parseInt(url.searchParams.get("take") ?? "50", 10), 200)
  const skip = parseInt(url.searchParams.get("skip") ?? "0", 10)

  try {
    await prismaEnsureConnected()

    const where: Prisma.VendaWhereInput = {
      storeId,
      ...(q
        ? {
            OR: [
              { pedidoId: { contains: q, mode: "insensitive" } },
              { clienteNome: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(operadorFilter
        ? { operador: { contains: operadorFilter, mode: "insensitive" } }
        : {}),
      ...(fromStr || toStr
        ? {
            at: {
              ...(fromStr ? { gte: new Date(fromStr) } : {}),
              ...(toStr ? { lte: new Date(toStr) } : {}),
            },
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

    // KPIs — full store dataset (no search filter, only date range if provided)
    const kpiWhere: Prisma.VendaWhereInput = {
      storeId,
      ...(fromStr || toStr
        ? {
            at: {
              ...(fromStr ? { gte: new Date(fromStr) } : {}),
              ...(toStr ? { lte: new Date(toStr) } : {}),
            },
          }
        : {}),
    }

    const [concluidas, canceladas, devolvidoAgg, parcAgg, faturBruto] = await Promise.all([
      prisma.venda.count({ where: { ...kpiWhere, status: "concluida" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "cancelada" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "devolvida" } }),
      prisma.venda.count({ where: { ...kpiWhere, status: "parcialmente_devolvida" } }),
      prisma.venda.aggregate({
        where: { ...kpiWhere, status: { not: "cancelada" } },
        _sum: { total: true },
        _count: { id: true },
      }),
    ])

    const devolvidas = devolvidoAgg + parcAgg
    const faturamento = faturBruto._sum.total ?? 0
    const totalVendas = faturBruto._count.id

    // Ticket médio (vendas não canceladas)
    const ticketMedio = totalVendas > 0 ? faturamento / totalVendas : 0

    // Apply payment filter in-memory (payload JSON not queryable by SQL)
    const pagamentoFilter = url.searchParams.get("pagamento")?.trim() ?? ""
    let vendas = rows.map((r) => ({
      id: r.pedidoId,
      dbId: r.id,
      at: r.at.toISOString(),
      cliente: r.clienteNome || "—",
      total: r.total,
      status: r.status,
      operador: r.operador || null,
      formaPagamento: primaryPaymentLabel(r.payload),
      quantidadeItens: r.itens.reduce((acc, it) => acc + it.quantidade, 0),
      cancelada: r.status === "cancelada",
      canceladaEm: r.canceladaEm?.toISOString() ?? null,
      motivoCancelamento: r.motivoCancelamento ?? null,
    }))

    if (pagamentoFilter) {
      const rowsWithPayload = await prisma.venda.findMany({
        where,
        select: { pedidoId: true, payload: true },
      })
      const pedidoMap = new Map(rowsWithPayload.map((r) => [r.pedidoId, r.payload]))
      vendas = vendas.filter((v) => paymentMatchesFilter(pedidoMap.get(v.id), pagamentoFilter))
    }

    return NextResponse.json({
      ok: true,
      vendas,
      total: totalCount,
      kpis: {
        totalVendas,
        faturamento,
        cancelamentos: canceladas,
        devolvidas,
        concluidas,
        ticketMedio,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/historico]", msg)
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao carregar histórico",
        vendas: [],
        total: 0,
        kpis: { totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 },
      },
      { status: 503 },
    )
  }
}
