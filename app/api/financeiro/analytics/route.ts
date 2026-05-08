import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { requireOpsSubscription, opsLojaIdFromRequest } from "@/lib/ops-api-gate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function monthKey(vencimento: string): string {
  const m = vencimento.match(/^(\d{4}-\d{2})/)
  return m ? m[1] : ""
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
  const gate = await requireOpsSubscription()
  if (!gate.ok && process.env.NODE_ENV !== "development") return gate.res

  const storeId = opsLojaIdFromRequest(req)

  try {
    await prismaEnsureConnected()

    const [receber, pagar, stores] = await Promise.all([
      prisma.contaReceberTitulo.findMany({
        where: { storeId, status: "pago" },
        select: { id: true, cliente: true, descricao: true, valor: true, vencimento: true, localKey: true, storeId: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.contaPagarTitulo.findMany({
        where: { storeId, status: "pago" },
        select: { id: true, descricao: true, valor: true, vencimento: true, payload: true, storeId: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.store.findMany({ select: { id: true, name: true } }),
    ])

    const storeNameMap = new Map(stores.map((s) => [s.id, s.name || s.id]))

    // ── Fluxo mensal (últimos 6 meses) ───────────────────────────────────────
    const now = new Date()
    const keys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
    }
    const fluxoMap = new Map(keys.map((k) => [k, { entrada: 0, saida: 0 }]))
    for (const r of receber) {
      const k = monthKey(r.vencimento)
      if (fluxoMap.has(k)) fluxoMap.get(k)!.entrada += r.valor
    }
    for (const p of pagar) {
      const k = monthKey(p.vencimento)
      if (fluxoMap.has(k)) fluxoMap.get(k)!.saida += p.valor
    }
    const fluxoMensal = keys.map((k) => {
      const month = parseInt(k.split("-")[1], 10) - 1
      return { mes: MONTH_NAMES[month] ?? k, ...fluxoMap.get(k)! }
    })

    // ── Movimentações recentes ────────────────────────────────────────────────
    const movimentacoes = [
      ...receber.slice(0, 6).map((r) => ({
        id: r.id,
        desc: r.cliente || r.descricao || "Recebimento",
        tipo: "entrada" as const,
        valor: r.valor,
        data: formatDate(r.updatedAt),
      })),
      ...pagar.slice(0, 6).map((p) => ({
        id: p.id,
        desc: p.descricao || "Pagamento",
        tipo: "saida" as const,
        valor: p.valor,
        data: formatDate(p.updatedAt),
      })),
    ]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)

    // ── Receitas por origem ───────────────────────────────────────────────────
    const origemMap = new Map<string, number>()
    for (const r of receber) {
      const key = getOrigin(r.localKey, r.descricao)
      origemMap.set(key, (origemMap.get(key) ?? 0) + r.valor)
    }
    const receitasOrigem = Array.from(origemMap.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)

    // ── Despesas por categoria ────────────────────────────────────────────────
    const catMap = new Map<string, number>()
    for (const p of pagar) {
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

    // ── Resultado por loja ────────────────────────────────────────────────────
    const [recByStore, pagByStore] = await Promise.all([
      prisma.contaReceberTitulo.groupBy({ by: ["storeId"], where: { status: "pago" }, _sum: { valor: true } }),
      prisma.contaPagarTitulo.groupBy({ by: ["storeId"], where: { status: "pago" }, _sum: { valor: true } }),
    ])
    const recMap = new Map(recByStore.map((r) => [r.storeId, r._sum.valor ?? 0]))
    const pagMap = new Map(pagByStore.map((p) => [p.storeId, p._sum.valor ?? 0]))
    const allSids = new Set([...recMap.keys(), ...pagMap.keys()])
    const resultadoLoja = Array.from(allSids)
      .map((sid) => ({
        loja: storeNameMap.get(sid) || sid,
        receita: Math.round(recMap.get(sid) ?? 0),
        despesa: Math.round(pagMap.get(sid) ?? 0),
      }))
      .sort((a, b) => b.receita - a.receita)

    return NextResponse.json({ ok: true, fluxoMensal, movimentacoes, receitasOrigem, despesasCategoria, resultadoLoja })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[financeiro/analytics]", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 503 })
  }
}
