import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function toIsoDayLocal(d: Date): string {
  const x = new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, "0")
  const day = String(x.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function startOfDayLocal(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDaysLocal(d: Date, deltaDays: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + deltaDays)
  return x
}

type CategoriaSlice = { name: string; total: number }

/** Participação em faturamento (7D) por categoria de produto nos itens de venda. */
function buildVendasPorCategoria(
  items: { lineTotal: number; quantidade: number; precoUnitario: number; inventoryId: string | null }[],
  categoryByProductId: Map<string, string>,
): CategoriaSlice[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    const line =
      item.lineTotal > 0 ? item.lineTotal : Math.max(0, (item.quantidade ?? 0) * (item.precoUnitario ?? 0))
    if (line <= 0) continue

    let label = "Sem categoria"
    const pid = item.inventoryId?.trim()
    if (pid) {
      const cat = categoryByProductId.get(pid)?.trim()
      label = cat || "Sem categoria"
    } else {
      label = "Avulso / serviço"
    }

    totals.set(label, (totals.get(label) ?? 0) + line)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return []

  const top = sorted.slice(0, 5)
  const rest = sorted.slice(5)
  const slices: CategoriaSlice[] = top.map(([name, total]) => ({
    name,
    total: +total.toFixed(2),
  }))
  if (rest.length > 0) {
    const outros = rest.reduce((sum, [, t]) => sum + t, 0)
    slices.push({ name: "Outros", total: +outros.toFixed(2) })
  }
  return slices
}

export async function GET(req: Request) {
  try {
    const storeId = storeIdFromAssistecRequestForRead(req)

    const now = new Date()
    const todayStart = startOfDayLocal(now)
    const tomorrowStart = addDaysLocal(todayStart, 1)
    const sevenDaysStart = addDaysLocal(todayStart, -6)
    const todayIso = toIsoDayLocal(now)

    const [
      faturamentoHojeAgg,
      osEmAberto,
      alertaEstoqueCount,
      contasReceberHojeAgg,
      vendas7d,
      lastVendas,
      lastOs,
      estoqueCriticoTop,
      vendaItens7d,
    ] = await Promise.all([
      prisma.venda.aggregate({
        where: { storeId, at: { gte: todayStart, lt: tomorrowStart } },
        _sum: { total: true },
      }),
      prisma.ordemServico.count({
        where: { storeId, status: { in: ["Aberto", "EmAnalise"] } },
      }),
      prisma.produto.count({
        where: { storeId, stock: 0 },
      }),
      prisma.contaReceberTitulo.aggregate({
        where: { storeId, status: "pendente", vencimento: todayIso },
        _sum: { valor: true },
      }),
      prisma.venda.findMany({
        where: { storeId, at: { gte: sevenDaysStart, lt: tomorrowStart } },
        select: { total: true, at: true },
        orderBy: { at: "asc" },
        take: 2000,
      }),
      prisma.venda.findMany({
        where: { storeId },
        select: { id: true, pedidoId: true, total: true, at: true, clienteNome: true },
        orderBy: { at: "desc" },
        take: 5,
      }),
      prisma.ordemServico.findMany({
        where: { storeId },
        select: { id: true, valorTotal: true, updatedAt: true, createdAt: true, cliente: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.produto.findMany({
        where: { storeId },
        select: { id: true, name: true, stock: true, updatedAt: true },
        orderBy: [{ stock: "asc" }, { updatedAt: "desc" }],
        take: 5,
      }),
      prisma.itemVenda.findMany({
        where: {
          venda: {
            storeId,
            at: { gte: sevenDaysStart, lt: tomorrowStart },
            status: { notIn: ["cancelada", "devolvida"] },
          },
        },
        select: {
          lineTotal: true,
          quantidade: true,
          precoUnitario: true,
          inventoryId: true,
        },
        take: 3000,
      }),
    ])

    const productIds = [
      ...new Set(
        vendaItens7d.map((i) => i.inventoryId?.trim()).filter((id): id is string => Boolean(id)),
      ),
    ]
    const produtosCategoria =
      productIds.length > 0
        ? await prisma.produto.findMany({
            where: { storeId, id: { in: productIds } },
            select: { id: true, category: true },
          })
        : []
    const categoryByProductId = new Map(
      produtosCategoria.map((p) => [p.id, p.category?.trim() || ""]),
    )
    const vendasPorCategoria = buildVendasPorCategoria(vendaItens7d, categoryByProductId)

    const faturamentoHoje = faturamentoHojeAgg._sum.total ?? 0
    const contasReceberHoje = contasReceberHojeAgg._sum.valor ?? 0

    // Série dos últimos 7 dias (inclui dias sem venda).
    const revenueByDay = new Map<string, number>()
    for (const v of vendas7d) {
      const k = toIsoDayLocal(v.at)
      revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + (v.total ?? 0))
    }
    const faturamento7d = Array.from({ length: 7 }).map((_, idx) => {
      const date = addDaysLocal(sevenDaysStart, idx)
      const iso = toIsoDayLocal(date)
      return {
        day: iso,
        total: +(revenueByDay.get(iso) ?? 0).toFixed(2),
      }
    })

    // Movimentações (últimas 5 no geral: venda/OS).
    const moves = [
      ...lastVendas.map((v) => ({
        kind: "venda" as const,
        id: v.id,
        label: v.clienteNome?.trim() || "Venda balcão",
        value: v.total ?? 0,
        at: v.at,
      })),
      ...lastOs.map((o) => ({
        kind: "os" as const,
        id: o.id,
        label: o.cliente?.name?.trim() || "OS (cliente não informado)",
        value: o.valorTotal ?? 0,
        at: o.updatedAt ?? o.createdAt,
      })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 5)
      .map((m) => ({
        ...m,
        at: new Date(m.at).toISOString(),
      }))

    return NextResponse.json({
      ok: true,
      storeId,
      todayIso,
      cards: {
        faturamentoHoje,
        osEmAberto,
        alertaEstoqueCount,
        contasReceberHoje,
      },
      faturamento7d,
      movimentos: moves,
      estoqueCritico: estoqueCriticoTop.map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
      })),
      vendasPorCategoria,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[api/dashboard/elite]", msg)
    return NextResponse.json(
      {
        ok: false,
        error: "Falha ao carregar dashboard",
        ...(process.env.NODE_ENV === "development" ? { detail: msg } : {}),
      },
      { status: 503 }
    )
  }
}

