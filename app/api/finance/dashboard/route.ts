import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}
function monthLabel(d: Date): string {
  return MONTHS[d.getMonth()]!
}

export async function GET(req: Request) {
  await prismaEnsureConnected()
  const sid = opsLojaIdFromRequest(req)
  if (!sid) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })
  const now = new Date()
  const mStart = startOfMonth(now)
  const mEnd = endOfMonth(now)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

  try {
    const [
      accounts,
      monthIncome,
      monthExpense,
      overdueCount,
      pendingCount,
      recentTxs,
      dueTodayTxs,
      categories,
    ] = await Promise.all([
      // Saldo das contas ativas
      prisma.financialAccount.findMany({
        where: { storeId: sid, active: true },
        select: { id: true, name: true, type: true, balance: true },
      }),
      // Entradas pagas no mês
      prisma.financialTransaction.aggregate({
        where: { storeId: sid, type: "income", status: "paid", paidAt: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
      // Saídas pagas no mês
      prisma.financialTransaction.aggregate({
        where: { storeId: sid, type: "expense", status: "paid", paidAt: { gte: mStart, lte: mEnd } },
        _sum: { amount: true },
      }),
      // Contas vencidas (dueDate < hoje, status pending)
      prisma.financialTransaction.count({
        where: { storeId: sid, status: "pending", dueDate: { lt: todayStart } },
      }),
      // Contas pendentes total
      prisma.financialTransaction.count({
        where: { storeId: sid, status: "pending" },
      }),
      // Últimas 8 transações
      prisma.financialTransaction.findMany({
        where: { storeId: sid },
        include: {
          category: { select: { name: true, color: true, icon: true } },
          account: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      // Vencendo hoje
      prisma.financialTransaction.findMany({
        where: { storeId: sid, status: "pending", dueDate: { gte: todayStart, lte: todayEnd } },
        include: { category: { select: { name: true, color: true } } },
        orderBy: { amount: "desc" },
        take: 5,
      }),
      // Despesas por categoria no mês
      prisma.financialTransaction.findMany({
        where: { storeId: sid, type: "expense", status: "paid", paidAt: { gte: mStart, lte: mEnd } },
        include: { category: { select: { name: true, color: true } } },
      }),
    ])

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
    const entradas = monthIncome._sum.amount ?? 0
    const saidas = monthExpense._sum.amount ?? 0
    const lucro = entradas - saidas

    // Receitas vs despesas últimos 6 meses
    const fluxo: { mes: string; receitas: number; despesas: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ms = startOfMonth(d)
      const me = endOfMonth(d)
      const [inc, exp] = await Promise.all([
        prisma.financialTransaction.aggregate({
          where: { storeId: sid, type: "income", status: "paid", paidAt: { gte: ms, lte: me } },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { storeId: sid, type: "expense", status: "paid", paidAt: { gte: ms, lte: me } },
          _sum: { amount: true },
        }),
      ])
      fluxo.push({ mes: monthLabel(d), receitas: inc._sum.amount ?? 0, despesas: exp._sum.amount ?? 0 })
    }

    // Despesas por categoria (pie)
    const catMap = new Map<string, { name: string; color: string; total: number }>()
    for (const tx of categories) {
      const name = tx.category?.name ?? "Sem categoria"
      const color = tx.category?.color ?? "#94a3b8"
      const entry = catMap.get(name) ?? { name, color, total: 0 }
      entry.total += tx.amount
      catMap.set(name, entry)
    }
    const despesasPorCategoria = Array.from(catMap.values())
      .map((c) => ({ name: c.name, value: Math.round(c.total * 100) / 100, color: c.color }))
      .sort((a, b) => b.value - a.value)

    return NextResponse.json({
      ok: true,
      cards: {
        totalBalance: Math.round(totalBalance * 100) / 100,
        entradas: Math.round(entradas * 100) / 100,
        saidas: Math.round(saidas * 100) / 100,
        lucro: Math.round(lucro * 100) / 100,
        overdueCount,
        pendingCount,
      },
      accounts: accounts.map((a) => ({ ...a, balance: Math.round(a.balance * 100) / 100 })),
      recentTransactions: recentTxs,
      dueTodayTransactions: dueTodayTxs,
      fluxoMensal: fluxo,
      despesasPorCategoria,
    })
  } catch (e) {
    console.error("[finance/dashboard]", e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 503 })
  }
}
