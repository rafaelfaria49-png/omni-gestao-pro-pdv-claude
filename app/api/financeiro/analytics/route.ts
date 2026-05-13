import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected, withPrismaSafe } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { apiGuardFinanceiroViewOrOps } from "@/lib/auth/api-enterprise-guard"
import { parseDateStringSafe, safeMoney } from "@/lib/financeiro/contracts/valores"
import { isOrigemTransferenciaInterna } from "@/lib/financeiro/services/movimentacao-financeira-classify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function monthKey(vencimento: string): string {
  const d = parseDateStringSafe(vencimento)
  if (!d) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatDate(d: Date): string {
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  if (diff < 86_400_000) return `Hoje, ${time}`
  if (diff < 172_800_000) return `Ontem, ${time}`
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function getOrigin(localKey: string | null, descricao: string): string {
  const lk = localKey ?? ""
  if (lk.startsWith("os-faturamento:")) return "Ordem de Serviço"
  const d = descricao.toLowerCase()
  if (d.includes("pdv") || d.includes("venda")) return "PDV"
  if (lk.startsWith("manual-cr-")) return "Avulso"
  return "Outros"
}

export async function GET(req: Request) {
  const storeId = opsLojaIdFromRequest(req) || "loja-1"
  const denied = await apiGuardFinanceiroViewOrOps(storeId, { skipOpsInDev: true })
  if (denied) return denied

  try {
    await prismaEnsureConnected()

    const now = new Date()
    const fluxoDesde = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0)

    const [receber, pagar, stores, movsFluxo, movsRecent] = await Promise.all([
      prisma.contaReceberTitulo.findMany({
        where: { storeId },
        select: { id: true, cliente: true, descricao: true, valor: true, vencimento: true, localKey: true, storeId: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.contaPagarTitulo.findMany({
        where: { storeId },
        select: { id: true, descricao: true, valor: true, vencimento: true, payload: true, storeId: true, status: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.store.findMany({ select: { id: true, name: true } }),
      prisma.movimentacaoFinanceira.findMany({
        where: { storeId, createdAt: { gte: fluxoDesde } },
        select: { id: true, tipo: true, descricao: true, valor: true, origem: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.movimentacaoFinanceira.findMany({
        where: { storeId },
        select: { id: true, tipo: true, descricao: true, valor: true, origem: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ])

    const storeNameMap = new Map(stores.map((s) => [s.id, s.name || s.id]))

    // ── Fluxo mensal (últimos 6 meses) ───────────────────────────────────────
    // Fonte primária: MovimentacaoFinanceira (entradas/saídas reais)
    // Fallback: CR/CP com status=pago (quando ainda não há movimentações reais)
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const fluxoMap = new Map(keys.map((k) => [k, { entrada: 0, saida: 0 }]))

    const usaMovReal = movsFluxo.length > 0

    if (usaMovReal) {
      for (const m of movsFluxo) {
        const k = `${m.createdAt.getFullYear()}-${String(m.createdAt.getMonth() + 1).padStart(2, "0")}`
        if (!fluxoMap.has(k)) continue
        if (isOrigemTransferenciaInterna(m.origem)) continue
        const v = safeMoney(m.valor)
        if (m.tipo === "entrada") fluxoMap.get(k)!.entrada = safeMoney(fluxoMap.get(k)!.entrada + v)
        else fluxoMap.get(k)!.saida = safeMoney(fluxoMap.get(k)!.saida + v)
      }
    } else {
      // Fallback: títulos pagos (dados anteriores ao backfill)
      for (const r of receber) {
        if (r.status !== "pago") continue
        const k = monthKey(r.vencimento)
        if (fluxoMap.has(k)) fluxoMap.get(k)!.entrada += r.valor
      }
      for (const p of pagar) {
        if (p.status !== "pago") continue
        const k = monthKey(p.vencimento)
        if (fluxoMap.has(k)) fluxoMap.get(k)!.saida += p.valor
      }
    }

    const fluxoMensal = keys.map((k) => {
      const month = parseInt(k.split("-")[1], 10) - 1
      return { mes: MONTH_NAMES[month] ?? k, ...fluxoMap.get(k)! }
    })

    // ── Movimentações recentes ────────────────────────────────────────────────
    // Fonte primária: MovimentacaoFinanceira real; fallback: CR/CP pagos
    const movimentacoesBase =
      usaMovReal
        ? movsRecent
            .filter((m) => !isOrigemTransferenciaInterna(m.origem))
            .map((m) => ({
              id: m.id,
              desc: m.descricao || "Movimentação",
              tipo: m.tipo === "saida" ? ("saida" as const) : ("entrada" as const),
              valor: m.valor,
              data: formatDate(m.createdAt),
            }))
        : [
            ...receber
              .filter((r) => r.status === "pago")
              .slice(0, 8)
              .map((r) => ({
                id: r.id,
                desc: r.cliente || r.descricao || "Recebimento",
                tipo: "entrada" as const,
                valor: r.valor,
                data: formatDate(r.updatedAt),
              })),
            ...pagar
              .filter((p) => p.status === "pago")
              .slice(0, 8)
              .map((p) => ({
                id: p.id,
                desc: p.descricao || "Pagamento",
                tipo: "saida" as const,
                valor: p.valor,
                data: formatDate(p.updatedAt),
              })),
          ]

    const movimentacoes = movimentacoesBase.slice(0, 20)

    // ── Receitas por origem ───────────────────────────────────────────────────
    const origemMap = new Map<string, number>()
    for (const r of receber) {
      if (r.status !== "pago") continue
      const key = getOrigin(r.localKey, r.descricao)
      origemMap.set(key, (origemMap.get(key) ?? 0) + r.valor)
    }
    const receitasOrigem = Array.from(origemMap.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)

    // ── Despesas por categoria ────────────────────────────────────────────────
    const catMap = new Map<string, number>()
    for (const p of pagar) {
      if (p.status !== "pago") continue
      const pl =
        p.payload && typeof p.payload === "object" && !Array.isArray(p.payload)
          ? (p.payload as Record<string, unknown>)
          : {}
      const cat = (pl.categoria as string) || "Outros"
      catMap.set(cat, (catMap.get(cat) ?? 0) + p.valor)
    }
    const despesasCategoria = Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)

    // ── Resultado por loja (totais completos) ─────────────────────────────────
    type GroupByRow = { storeId: string; _sum: { valor: number | null } }
    type GroupResult = [GroupByRow[], GroupByRow[], GroupByRow[], GroupByRow[]]

    const lojaGroups = await withPrismaSafe<GroupResult>(
      async (db) => {
        const [a, b, c, d] = await Promise.all([
          db.contaReceberTitulo.groupBy({ by: ["storeId"], where: { status: "pago" }, _sum: { valor: true } }),
          db.contaReceberTitulo.groupBy({ by: ["storeId"], where: { status: { notIn: ["pago", "cancelado"] } }, _sum: { valor: true } }),
          db.contaPagarTitulo.groupBy({ by: ["storeId"], where: { status: "pago" }, _sum: { valor: true } }),
          db.contaPagarTitulo.groupBy({ by: ["storeId"], where: { status: { notIn: ["pago", "cancelado"] } }, _sum: { valor: true } }),
        ])
        return [a as GroupByRow[], b as GroupByRow[], c as GroupByRow[], d as GroupByRow[]]
      },
      [[], [], [], []] as GroupResult,
    )
    const [recPagoByStore, recAbertoByStore, pagPagoByStore, pagAbertoByStore] = lojaGroups

    const toMap = (arr: GroupByRow[]) =>
      new Map(arr.map((r) => [r.storeId, r._sum.valor ?? 0]))

    const rpMap = toMap(recPagoByStore)
    const raMap = toMap(recAbertoByStore)
    const ppMap = toMap(pagPagoByStore)
    const paMap = toMap(pagAbertoByStore)

    const allSids = new Set([...rpMap.keys(), ...raMap.keys(), ...ppMap.keys(), ...paMap.keys()])
    const resultadoLoja = Array.from(allSids)
      .map((sid) => {
        const totalRecebido = Math.round((rpMap.get(sid) ?? 0) * 100) / 100
        const totalReceber  = Math.round((raMap.get(sid) ?? 0) * 100) / 100
        const totalPago     = Math.round((ppMap.get(sid) ?? 0) * 100) / 100
        const totalPagar    = Math.round((paMap.get(sid) ?? 0) * 100) / 100
        const saldo         = Math.round((totalRecebido - totalPago) * 100) / 100
        return {
          loja: storeNameMap.get(sid) || sid,
          // legado (mantém compat. com gráfico BarChart existente)
          receita: totalRecebido,
          despesa: totalPago,
          // novos campos completos
          totalReceber,
          totalRecebido,
          totalPagar,
          totalPago,
          saldo,
        }
      })
      .sort((a, b) => b.receita - a.receita)

    return NextResponse.json({ ok: true, fluxoMensal, movimentacoes, receitasOrigem, despesasCategoria, resultadoLoja })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/analytics]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
