/**
 * Relatórios Financeiros Avançados — FASE 12
 *
 * Todas as funções aceitam `storeId` + filtros de período.
 * Prioriza aggregates/groupBy do Prisma para evitar N+1.
 */

import { prisma } from "@/lib/prisma"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import type { Prisma } from "@/generated/prisma"

// ─── tipos ────────────────────────────────────────────────────────────────────

export type PeriodoFiltro = {
  dataInicio?: string // yyyy-mm-dd
  dataFim?: string    // yyyy-mm-dd
  carteiraId?: string
}

export type CategoriaLinha = {
  categoria: string
  total: number
  percentual: number
  qtd: number
  media: number
  crescimento?: number
}

export type RankingItem = {
  label: string
  valor: number
  percentual: number
  tipo: "entrada" | "saida"
}

export type IndicadoresExecutivos = {
  receitaTotal: number
  despesaTotal: number
  lucroLiquido: number
  margemLiquida: number
  ticketMedio: number
  saldoConsolidado: number
  crescimentoMensal: number
  crescimentoAnual: number
  inadimplencia: number
  receberPendente: number
  pagarPendente: number
  maiorDespesa: { descricao: string; valor: number } | null
  maiorCategoriaReceita: string | null
  carteiraTop: { nome: string; saldo: number } | null
}

export type ResumoExecutivo = {
  periodo: { dataInicio: string; dataFim: string; dias: number }
  indicadores: IndicadoresExecutivos
  receitasPorCategoria: CategoriaLinha[]
  despesasPorCategoria: CategoriaLinha[]
  topReceitas: RankingItem[]
  topDespesas: RankingItem[]
}

export type FluxoPeriodo = {
  periodo: string
  label: string
  entrada: number
  saida: number
  saldo: number
  acumulado: number
}

export type ComparativoMensal = {
  mes: string
  mesLabel: string
  ano: number
  entrada: number
  saida: number
  lucro: number
  margem: number
}

export type ComparativoAnual = {
  ano: number
  entrada: number
  saida: number
  lucro: number
  margem: number
  crescimento: number
}

export type AnaliseCarteira = {
  id: string
  nome: string
  tipo: string
  saldoAtual: number
  saldoInicial: number
  totalEntradas: number
  totalSaidas: number
  qtdMovimentacoes: number
  participacao: number
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstDayOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function subDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function toDateRange(filtro: PeriodoFiltro): { gte: Date; lte: Date } {
  const inicio = filtro.dataInicio ?? firstDayOfMonth()
  const fim = filtro.dataFim ?? todayStr()
  return {
    gte: new Date(inicio + "T00:00:00.000Z"),
    lte: new Date(fim + "T23:59:59.999Z"),
  }
}

function buildMovWhere(storeId: string, filtro: PeriodoFiltro, extra: Prisma.MovimentacaoFinanceiraWhereInput = {}): Prisma.MovimentacaoFinanceiraWhereInput {
  const range = toDateRange(filtro)
  const w: Prisma.MovimentacaoFinanceiraWhereInput = {
    storeId,
    createdAt: range,
    ...extra,
  }
  if (filtro.carteiraId) w.carteiraId = filtro.carteiraId
  return w
}

function pct(part: number, total: number): number {
  if (!total) return 0
  return safeMoney((part / total) * 100)
}

function monthLabel(m: number, a: number): string {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  return `${labels[(m - 1) % 12]}/${String(a).slice(-2)}`
}

// ─── getIndicadoresExecutivos ─────────────────────────────────────────────────

export async function getIndicadoresExecutivos(
  storeId: string,
  filtro: PeriodoFiltro = {},
): Promise<IndicadoresExecutivos> {
  const where = buildMovWhere(storeId, filtro)

  const [entAgg, saiAgg, receberAgg, pagarAgg, carteiras, allMovs] = await Promise.all([
    prisma.movimentacaoFinanceira.aggregate({ where: { ...where, tipo: "entrada" }, _sum: { valor: true }, _count: { _all: true } }),
    prisma.movimentacaoFinanceira.aggregate({ where: { ...where, tipo: "saida" }, _sum: { valor: true } }),
    prisma.contaReceberTitulo.aggregate({ where: { storeId, status: { in: ["pendente", "parcial", "atrasado"] } }, _sum: { valor: true } }),
    prisma.contaPagarTitulo.aggregate({ where: { storeId, status: { in: ["pendente", "atrasado"] } }, _sum: { valor: true } }),
    prisma.carteiraFinanceira.findMany({ where: { storeId, ativo: true }, select: { id: true, nome: true, saldoAtual: true }, orderBy: { saldoAtual: "desc" }, take: 1 }),
    prisma.movimentacaoFinanceira.findFirst({ where: { ...where, tipo: "saida" }, orderBy: { valor: "desc" }, select: { descricao: true, valor: true } }),
  ])

  const receitaTotal = safeMoney(entAgg._sum.valor ?? 0)
  const despesaTotal = safeMoney(saiAgg._sum.valor ?? 0)
  const lucroLiquido = safeMoney(receitaTotal - despesaTotal)
  const margemLiquida = pct(lucroLiquido, receitaTotal)
  const qtdEntradas = entAgg._count._all
  const ticketMedio = qtdEntradas > 0 ? safeMoney(receitaTotal / qtdEntradas) : 0

  // Saldo consolidado = soma de todas as carteiras ativas
  const saldoAgg = await prisma.carteiraFinanceira.aggregate({ where: { storeId, ativo: true }, _sum: { saldoAtual: true } })
  const saldoConsolidado = safeMoney(saldoAgg._sum.saldoAtual ?? 0)

  // Crescimento mensal — comparar mês atual vs anterior
  const now = new Date()
  const mesAtual = { dataInicio: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, dataFim: todayStr() }
  const prevMonth = new Date(now)
  prevMonth.setMonth(prevMonth.getMonth() - 1)
  const prevFirst = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`
  const prevLast = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()}`

  const [curEntAgg, prevEntAgg] = await Promise.all([
    prisma.movimentacaoFinanceira.aggregate({ where: buildMovWhere(storeId, mesAtual, { tipo: "entrada" }), _sum: { valor: true } }),
    prisma.movimentacaoFinanceira.aggregate({ where: buildMovWhere(storeId, { dataInicio: prevFirst, dataFim: prevLast }, { tipo: "entrada" }), _sum: { valor: true } }),
  ])
  const curRec = safeMoney(curEntAgg._sum.valor ?? 0)
  const prevRec = safeMoney(prevEntAgg._sum.valor ?? 0)
  const crescimentoMensal = prevRec > 0 ? safeMoney(((curRec - prevRec) / prevRec) * 100) : 0

  // Crescimento anual
  const anoAtual = now.getFullYear()
  const [curYearAgg, prevYearAgg] = await Promise.all([
    prisma.movimentacaoFinanceira.aggregate({ where: buildMovWhere(storeId, { dataInicio: `${anoAtual}-01-01`, dataFim: `${anoAtual}-12-31` }, { tipo: "entrada" }), _sum: { valor: true } }),
    prisma.movimentacaoFinanceira.aggregate({ where: buildMovWhere(storeId, { dataInicio: `${anoAtual - 1}-01-01`, dataFim: `${anoAtual - 1}-12-31` }, { tipo: "entrada" }), _sum: { valor: true } }),
  ])
  const curYear = safeMoney(curYearAgg._sum.valor ?? 0)
  const prevYear = safeMoney(prevYearAgg._sum.valor ?? 0)
  const crescimentoAnual = prevYear > 0 ? safeMoney(((curYear - prevYear) / prevYear) * 100) : 0

  // Inadimplência = vencidos / (pago + aberto + vencido)
  const receberStats = await prisma.contaReceberTitulo.groupBy({
    by: ["status"],
    where: { storeId },
    _sum: { valor: true },
  })
  let totalPagoR = 0, totalAbertoR = 0, totalVencidoR = 0
  for (const s of receberStats) {
    const v = safeMoney(s._sum.valor ?? 0)
    if (s.status === "pago") totalPagoR += v
    else if (s.status === "pendente" || s.status === "parcial") totalAbertoR += v
    else if (s.status === "atrasado") totalVencidoR += v
  }
  const denomInad = totalPagoR + totalAbertoR + totalVencidoR
  const inadimplencia = pct(totalVencidoR, denomInad)

  return {
    receitaTotal,
    despesaTotal,
    lucroLiquido,
    margemLiquida,
    ticketMedio,
    saldoConsolidado,
    crescimentoMensal,
    crescimentoAnual,
    inadimplencia,
    receberPendente: safeMoney(receberAgg._sum.valor ?? 0),
    pagarPendente: safeMoney(pagarAgg._sum.valor ?? 0),
    maiorDespesa: allMovs ? { descricao: allMovs.descricao, valor: safeMoney(allMovs.valor) } : null,
    maiorCategoriaReceita: null,
    carteiraTop: carteiras[0] ? { nome: carteiras[0].nome, saldo: safeMoney(carteiras[0].saldoAtual) } : null,
  }
}

// ─── getFluxoPorPeriodo ───────────────────────────────────────────────────────

export async function getFluxoPorPeriodo(
  storeId: string,
  filtro: PeriodoFiltro = {},
  agrupamento: "dia" | "semana" | "mes" = "dia",
): Promise<FluxoPeriodo[]> {
  const range = toDateRange(filtro)

  const movs = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) },
    select: { tipo: true, valor: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const buckets = new Map<string, { entrada: number; saida: number }>()
  for (const m of movs) {
    let key: string
    const d = new Date(m.createdAt)
    if (agrupamento === "dia") {
      key = d.toISOString().slice(0, 10)
    } else if (agrupamento === "semana") {
      const startOfWeek = new Date(d)
      startOfWeek.setDate(d.getDate() - d.getDay())
      key = startOfWeek.toISOString().slice(0, 10)
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }

    const cur = buckets.get(key) ?? { entrada: 0, saida: 0 }
    if (m.tipo === "entrada") cur.entrada += m.valor
    else cur.saida += m.valor
    buckets.set(key, cur)
  }

  let acumulado = 0
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, v]) => {
      const saldo = safeMoney(v.entrada - v.saida)
      acumulado = safeMoney(acumulado + saldo)
      return {
        periodo,
        label: agrupamento === "mes"
          ? monthLabel(parseInt(periodo.split("-")[1]), parseInt(periodo.split("-")[0]))
          : periodo,
        entrada: safeMoney(v.entrada),
        saida: safeMoney(v.saida),
        saldo,
        acumulado,
      }
    })
}

// ─── getResultadoPorCategoria ─────────────────────────────────────────────────

export async function getResultadoPorCategoria(
  storeId: string,
  filtro: PeriodoFiltro = {},
): Promise<{ receitas: CategoriaLinha[]; despesas: CategoriaLinha[] }> {
  const range = toDateRange(filtro)
  const baseWhere = { storeId, createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) }

  const [entradas, saidas] = await Promise.all([
    prisma.movimentacaoFinanceira.groupBy({
      by: ["origem"],
      where: { ...baseWhere, tipo: "entrada" },
      _sum: { valor: true },
      _count: { _all: true },
      orderBy: { _sum: { valor: "desc" } },
    }),
    prisma.movimentacaoFinanceira.groupBy({
      by: ["origem"],
      where: { ...baseWhere, tipo: "saida" },
      _sum: { valor: true },
      _count: { _all: true },
      orderBy: { _sum: { valor: "desc" } },
    }),
  ])

  const totalEnt = entradas.reduce((s, r) => s + (r._sum.valor ?? 0), 0)
  const totalSai = saidas.reduce((s, r) => s + (r._sum.valor ?? 0), 0)

  const toLinhas = (rows: typeof entradas, total: number, tipo: "entrada" | "saida"): CategoriaLinha[] =>
    rows.map((r) => {
      const v = safeMoney(r._sum.valor ?? 0)
      const qt = r._count._all
      return {
        categoria: r.origem ?? "outros",
        total: v,
        percentual: pct(v, total),
        qtd: qt,
        media: qt > 0 ? safeMoney(v / qt) : 0,
        tipo,
      } as CategoriaLinha & { tipo: string }
    })

  return {
    receitas: toLinhas(entradas, totalEnt, "entrada"),
    despesas: toLinhas(saidas, totalSai, "saida"),
  }
}

// ─── getTopReceitas / getTopDespesas ──────────────────────────────────────────

export async function getTopReceitas(storeId: string, filtro: PeriodoFiltro = {}, take = 10): Promise<RankingItem[]> {
  const range = toDateRange(filtro)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, tipo: "entrada", createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) },
    select: { descricao: true, valor: true },
    orderBy: { valor: "desc" },
    take,
  })
  const totalAgg = await prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "entrada", createdAt: range }, _sum: { valor: true } })
  const total = safeMoney(totalAgg._sum.valor ?? 0)
  return rows.map((r) => ({
    label: r.descricao,
    valor: safeMoney(r.valor),
    percentual: pct(r.valor, total),
    tipo: "entrada" as const,
  }))
}

export async function getTopDespesas(storeId: string, filtro: PeriodoFiltro = {}, take = 10): Promise<RankingItem[]> {
  const range = toDateRange(filtro)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, tipo: "saida", createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) },
    select: { descricao: true, valor: true },
    orderBy: { valor: "desc" },
    take,
  })
  const totalAgg = await prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "saida", createdAt: range }, _sum: { valor: true } })
  const total = safeMoney(totalAgg._sum.valor ?? 0)
  return rows.map((r) => ({
    label: r.descricao,
    valor: safeMoney(r.valor),
    percentual: pct(r.valor, total),
    tipo: "saida" as const,
  }))
}

// ─── getAnaliseCarteiras ──────────────────────────────────────────────────────

export async function getAnaliseCarteiras(storeId: string, filtro: PeriodoFiltro = {}): Promise<AnaliseCarteira[]> {
  const range = toDateRange(filtro)
  const carteiras = await prisma.carteiraFinanceira.findMany({
    where: { storeId, ativo: true },
    select: { id: true, nome: true, tipo: true, saldoAtual: true, saldoInicial: true },
  })

  const saldoTotal = carteiras.reduce((s, c) => s + c.saldoAtual, 0)

  const results = await Promise.all(carteiras.map(async (c) => {
    const [entAgg, saiAgg, cnt] = await Promise.all([
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, carteiraId: c.id, tipo: "entrada", createdAt: range }, _sum: { valor: true } }),
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, carteiraId: c.id, tipo: "saida", createdAt: range }, _sum: { valor: true } }),
      prisma.movimentacaoFinanceira.count({ where: { storeId, carteiraId: c.id, createdAt: range } }),
    ])
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      saldoAtual: safeMoney(c.saldoAtual),
      saldoInicial: safeMoney(c.saldoInicial),
      totalEntradas: safeMoney(entAgg._sum.valor ?? 0),
      totalSaidas: safeMoney(saiAgg._sum.valor ?? 0),
      qtdMovimentacoes: cnt,
      participacao: pct(c.saldoAtual, saldoTotal),
    }
  }))

  return results.sort((a, b) => b.saldoAtual - a.saldoAtual)
}

// ─── getComparativoMensal ─────────────────────────────────────────────────────

export async function getComparativoMensal(storeId: string, meses = 12): Promise<ComparativoMensal[]> {
  const result: ComparativoMensal[] = []
  const now = new Date()

  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    const mesStr = String(mes).padStart(2, "0")
    const lastDay = new Date(ano, mes, 0).getDate()
    const inicio = `${ano}-${mesStr}-01`
    const fim = `${ano}-${mesStr}-${String(lastDay).padStart(2, "0")}`
    const range = { gte: new Date(inicio + "T00:00:00.000Z"), lte: new Date(fim + "T23:59:59.999Z") }

    const [entAgg, saiAgg] = await Promise.all([
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "entrada", createdAt: range }, _sum: { valor: true } }),
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "saida", createdAt: range }, _sum: { valor: true } }),
    ])

    const entrada = safeMoney(entAgg._sum.valor ?? 0)
    const saida = safeMoney(saiAgg._sum.valor ?? 0)
    const lucro = safeMoney(entrada - saida)
    result.push({
      mes: `${ano}-${mesStr}`,
      mesLabel: monthLabel(mes, ano),
      ano,
      entrada,
      saida,
      lucro,
      margem: pct(lucro, entrada),
    })
  }

  return result
}

// ─── getComparativoAnual ──────────────────────────────────────────────────────

export async function getComparativoAnual(storeId: string, anos = 3): Promise<ComparativoAnual[]> {
  const result: ComparativoAnual[] = []
  const anoAtual = new Date().getFullYear()

  for (let i = anos - 1; i >= 0; i--) {
    const ano = anoAtual - i
    const range = { gte: new Date(`${ano}-01-01T00:00:00.000Z`), lte: new Date(`${ano}-12-31T23:59:59.999Z`) }
    const [entAgg, saiAgg] = await Promise.all([
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "entrada", createdAt: range }, _sum: { valor: true } }),
      prisma.movimentacaoFinanceira.aggregate({ where: { storeId, tipo: "saida", createdAt: range }, _sum: { valor: true } }),
    ])
    const entrada = safeMoney(entAgg._sum.valor ?? 0)
    const saida = safeMoney(saiAgg._sum.valor ?? 0)
    const lucro = safeMoney(entrada - saida)
    const prev = result[result.length - 1]
    const crescimento = prev && prev.entrada > 0 ? safeMoney(((entrada - prev.entrada) / prev.entrada) * 100) : 0
    result.push({ ano, entrada, saida, lucro, margem: pct(lucro, entrada), crescimento })
  }
  return result
}

// ─── getResumoExecutivo ───────────────────────────────────────────────────────

export async function getResumoExecutivo(storeId: string, filtro: PeriodoFiltro = {}): Promise<ResumoExecutivo> {
  const inicio = filtro.dataInicio ?? firstDayOfMonth()
  const fim = filtro.dataFim ?? todayStr()
  const dias = Math.max(1, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000) + 1)

  const [indicadores, cats, topR, topD] = await Promise.all([
    getIndicadoresExecutivos(storeId, filtro),
    getResultadoPorCategoria(storeId, filtro),
    getTopReceitas(storeId, filtro, 5),
    getTopDespesas(storeId, filtro, 5),
  ])

  return {
    periodo: { dataInicio: inicio, dataFim: fim, dias },
    indicadores,
    receitasPorCategoria: cats.receitas,
    despesasPorCategoria: cats.despesas,
    topReceitas: topR,
    topDespesas: topD,
  }
}

// ─── Pré-define filtros padrão ────────────────────────────────────────────────

export function buildFiltroPreset(preset: string): PeriodoFiltro {
  const today = todayStr()
  switch (preset) {
    case "hoje": return { dataInicio: today, dataFim: today }
    case "ontem": { const d = subDays(1); return { dataInicio: d, dataFim: d } }
    case "7dias": return { dataInicio: subDays(7), dataFim: today }
    case "30dias": return { dataInicio: subDays(30), dataFim: today }
    case "estemes": return { dataInicio: firstDayOfMonth(), dataFim: today }
    case "mespassado": {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      const ano = d.getFullYear(); const mes = d.getMonth() + 1
      const mesStr = String(mes).padStart(2, "0")
      const lastDay = new Date(ano, mes, 0).getDate()
      return { dataInicio: `${ano}-${mesStr}-01`, dataFim: `${ano}-${mesStr}-${String(lastDay).padStart(2, "0")}` }
    }
    default: return { dataInicio: firstDayOfMonth(), dataFim: today }
  }
}
