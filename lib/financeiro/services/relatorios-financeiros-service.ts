/**
 * Relatórios Financeiros Avançados — FASE 12
 *
 * Todas as funções aceitam `storeId` + filtros de período.
 * Prioriza aggregates/groupBy do Prisma para evitar N+1.
 */

import { prisma } from "@/lib/prisma"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import type { Prisma } from "@/generated/prisma"
import {
  isOrigemDevolucaoPdv,
  isOrigemEstornoPagar,
  isOrigemEstornoReceber,
  isOrigemSangriaPdv,
  isOrigemTransferenciaInterna,
} from "./movimentacao-financeira-classify"

type MovLin = { tipo: string; origem: string | null; valor: number; descricao?: string | null; createdAt?: Date }

/** Receita/despesa líquidas alinhadas ao DRE (FASE 13): devoluções e estornos de recebimento abatem receita; estorno de pagamento abate despesa; transferências ignoradas. */
export function reduceNetResultadoMovs(rows: MovLin[]): { receita: number; despesa: number; qtdEntradasBrutas: number } {
  let receita = 0
  let despesa = 0
  let qtdEntradasBrutas = 0
  for (const m of rows) {
    const o = m.origem ?? ""
    const v = safeMoney(m.valor)
    if (isOrigemTransferenciaInterna(o)) continue

    if (m.tipo === "entrada") {
      if (isOrigemEstornoPagar(o)) {
        despesa = safeMoney(despesa - v)
        continue
      }
      receita = safeMoney(receita + v)
      qtdEntradasBrutas++
      continue
    }
    if (m.tipo === "saida") {
      if (isOrigemEstornoReceber(o) || isOrigemDevolucaoPdv(o)) {
        receita = safeMoney(receita - v)
        continue
      }
      despesa = safeMoney(despesa + v)
    }
  }
  return { receita, despesa, qtdEntradasBrutas }
}

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

  const [movRows, receberAgg, pagarAgg, carteiras, maiorDespesaRow] = await Promise.all([
    prisma.movimentacaoFinanceira.findMany({
      where,
      select: { tipo: true, origem: true, valor: true, descricao: true },
    }),
    prisma.contaReceberTitulo.aggregate({ where: { storeId, status: { in: ["pendente", "parcial", "atrasado"] } }, _sum: { valor: true } }),
    prisma.contaPagarTitulo.aggregate({ where: { storeId, status: { in: ["pendente", "atrasado"] } }, _sum: { valor: true } }),
    prisma.carteiraFinanceira.findMany({ where: { storeId, ativo: true }, select: { id: true, nome: true, saldoAtual: true }, orderBy: { saldoAtual: "desc" }, take: 1 }),
    prisma.movimentacaoFinanceira.findFirst({
      where: {
        ...where,
        tipo: "saida",
        NOT: {
          OR: [
            { origem: { startsWith: "estorno_receber" } },
            { origem: "devolucao_pdv" },
            { origem: "transferencia" },
            { origem: "transferência" },
          ],
        },
      },
      orderBy: { valor: "desc" },
      select: { descricao: true, valor: true },
    }),
  ])

  const { receita: receitaTotal, despesa: despesaTotal, qtdEntradasBrutas } = reduceNetResultadoMovs(movRows)
  const lucroLiquido = safeMoney(receitaTotal - despesaTotal)
  const margemLiquida = pct(lucroLiquido, receitaTotal)
  const ticketMedio = qtdEntradasBrutas > 0 ? safeMoney(receitaTotal / qtdEntradasBrutas) : 0

  // Saldo consolidado = soma de todas as carteiras ativas
  const saldoAgg = await prisma.carteiraFinanceira.aggregate({ where: { storeId, ativo: true }, _sum: { saldoAtual: true } })
  const saldoConsolidado = safeMoney(saldoAgg._sum.saldoAtual ?? 0)

  // Crescimento mensal — comparar mês atual vs anterior (líquido)
  const now = new Date()
  const mesAtual = { dataInicio: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, dataFim: todayStr() }
  const prevMonth = new Date(now)
  prevMonth.setMonth(prevMonth.getMonth() - 1)
  const prevFirst = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`
  const prevLast = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-${new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()}`

  const [curRows, prevRows] = await Promise.all([
    prisma.movimentacaoFinanceira.findMany({
      where: buildMovWhere(storeId, mesAtual),
      select: { tipo: true, origem: true, valor: true },
    }),
    prisma.movimentacaoFinanceira.findMany({
      where: buildMovWhere(storeId, { dataInicio: prevFirst, dataFim: prevLast }),
      select: { tipo: true, origem: true, valor: true },
    }),
  ])
  const curRec = reduceNetResultadoMovs(curRows).receita
  const prevRec = reduceNetResultadoMovs(prevRows).receita
  const crescimentoMensal = prevRec > 0 ? safeMoney(((curRec - prevRec) / prevRec) * 100) : 0

  // Crescimento anual
  const anoAtual = now.getFullYear()
  const [curYearRows, prevYearRows] = await Promise.all([
    prisma.movimentacaoFinanceira.findMany({
      where: buildMovWhere(storeId, { dataInicio: `${anoAtual}-01-01`, dataFim: `${anoAtual}-12-31` }),
      select: { tipo: true, origem: true, valor: true },
    }),
    prisma.movimentacaoFinanceira.findMany({
      where: buildMovWhere(storeId, { dataInicio: `${anoAtual - 1}-01-01`, dataFim: `${anoAtual - 1}-12-31` }),
      select: { tipo: true, origem: true, valor: true },
    }),
  ])
  const curYear = reduceNetResultadoMovs(curYearRows).receita
  const prevYear = reduceNetResultadoMovs(prevYearRows).receita
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

  // Maior categoria de receita (origem) no período — exclui transfer/estorno_pagar na entrada bruta
  const origemMap = new Map<string, number>()
  for (const m of movRows) {
    if (m.tipo !== "entrada") continue
    const o = m.origem ?? "manual"
    if (isOrigemTransferenciaInterna(o) || isOrigemEstornoPagar(o)) continue
    origemMap.set(o, safeMoney((origemMap.get(o) ?? 0) + safeMoney(m.valor)))
  }
  let maiorCat: string | null = null
  let maiorCatV = 0
  for (const [k, v] of origemMap) {
    if (v > maiorCatV) { maiorCatV = v; maiorCat = k }
  }

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
    maiorDespesa: maiorDespesaRow ? { descricao: maiorDespesaRow.descricao, valor: safeMoney(maiorDespesaRow.valor) } : null,
    maiorCategoriaReceita: maiorCat,
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
    select: { tipo: true, valor: true, origem: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const buckets = new Map<string, { entrada: number; saida: number }>()
  for (const m of movs) {
    const o = m.origem ?? ""
    if (isOrigemTransferenciaInterna(o)) continue

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
    const v = safeMoney(m.valor)
    if (m.tipo === "entrada") cur.entrada = safeMoney(cur.entrada + v)
    else cur.saida = safeMoney(cur.saida + v)
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

function catReceitaOrigem(origemRaw: string): string {
  const o = origemRaw.toLowerCase().trim()
  if (o.startsWith("os") || o.startsWith("receber")) return "Serviços / OS"
  if (o === "pdv" || o === "venda") return "Vendas (PDV)"
  if (o.startsWith("marketplace")) return "Marketplace"
  if (o === "suprimento_pdv") return "Suprimento de caixa (PDV)"
  return origemRaw || "Outras receitas"
}

export async function getResultadoPorCategoria(
  storeId: string,
  filtro: PeriodoFiltro = {},
): Promise<{ receitas: CategoriaLinha[]; despesas: CategoriaLinha[] }> {
  const range = toDateRange(filtro)
  const baseWhere = { storeId, createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) }

  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: baseWhere,
    select: { tipo: true, origem: true, valor: true },
  })

  type Acc = { total: number; qtd: number }
  const receitasMap = new Map<string, Acc>()
  const despesasMap = new Map<string, Acc>()
  const bump = (map: Map<string, Acc>, key: string, delta: number) => {
    const cur = map.get(key) ?? { total: 0, qtd: 0 }
    cur.total = safeMoney(cur.total + delta)
    cur.qtd += 1
    map.set(key, cur)
  }

  for (const m of rows) {
    const o = m.origem ?? ""
    const v = safeMoney(m.valor)
    if (isOrigemTransferenciaInterna(o)) continue

    if (m.tipo === "entrada") {
      if (isOrigemEstornoPagar(o)) {
        bump(despesasMap, "Estorno de pagamento (redução de despesa)", -v)
        continue
      }
      bump(receitasMap, catReceitaOrigem(o), v)
      continue
    }
    if (m.tipo === "saida") {
      if (isOrigemEstornoReceber(o)) {
        bump(receitasMap, "Estorno / cancelamento de recebimento", -v)
        continue
      }
      if (isOrigemDevolucaoPdv(o)) {
        bump(receitasMap, "Devolução PDV (abatimento)", -v)
        continue
      }
      if (isOrigemSangriaPdv(o)) {
        bump(despesasMap, "Sangria de caixa (PDV)", v)
        continue
      }
      bump(despesasMap, o || "Saídas diversas", v)
    }
  }

  const { receita: netRec, despesa: netDesp } = reduceNetResultadoMovs(rows)
  const denomRec = Math.max(Math.abs(netRec), 1e-6)
  const denomDesp = Math.max(Math.abs(netDesp), 1e-6)

  const toLinhas = (map: Map<string, Acc>, denom: number): CategoriaLinha[] =>
    Array.from(map.entries())
      .map(([categoria, { total, qtd }]) => ({
        categoria,
        total: safeMoney(total),
        percentual: pct(Math.abs(total), denom),
        qtd,
        media: qtd > 0 ? safeMoney(total / qtd) : 0,
      }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  return {
    receitas: toLinhas(receitasMap, denomRec),
    despesas: toLinhas(despesasMap, denomDesp),
  }
}

// ─── getTopReceitas / getTopDespesas ──────────────────────────────────────────

const whereSemTransferencia: Prisma.MovimentacaoFinanceiraWhereInput = {
  NOT: {
    OR: [
      { origem: "transferencia" },
      { origem: "transferência" },
      { origem: { startsWith: "transfer" } },
    ],
  },
}

export async function getTopReceitas(storeId: string, filtro: PeriodoFiltro = {}, take = 10): Promise<RankingItem[]> {
  const range = toDateRange(filtro)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: {
      storeId,
      tipo: "entrada",
      createdAt: range,
      ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}),
      AND: [whereSemTransferencia, { NOT: { origem: { startsWith: "estorno_pagar" } } }],
    },
    select: { descricao: true, valor: true },
    orderBy: { valor: "desc" },
    take,
  })
  const movRows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) },
    select: { tipo: true, origem: true, valor: true },
  })
  const total = Math.max(reduceNetResultadoMovs(movRows).receita, 1e-6)
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
    where: {
      storeId,
      tipo: "saida",
      createdAt: range,
      ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}),
      AND: [
        whereSemTransferencia,
        {
          NOT: {
            OR: [
              { origem: { startsWith: "estorno_receber" } },
              { origem: "devolucao_pdv" },
              { origem: { startsWith: "devolucao_" } },
            ],
          },
        },
      ],
    },
    select: { descricao: true, valor: true },
    orderBy: { valor: "desc" },
    take,
  })
  const movRows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, createdAt: range, ...(filtro.carteiraId ? { carteiraId: filtro.carteiraId } : {}) },
    select: { tipo: true, origem: true, valor: true },
  })
  const total = Math.max(reduceNetResultadoMovs(movRows).despesa, 1e-6)
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
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - (meses - 1), 1, 0, 0, 0, 0)
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: { storeId, createdAt: { gte: first, lte: last } },
    select: { tipo: true, origem: true, valor: true, createdAt: true },
  })
  const byMes = new Map<string, MovLin[]>()
  for (const m of rows) {
    const d = m.createdAt
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const arr = byMes.get(k) ?? []
    arr.push({ tipo: m.tipo, origem: m.origem, valor: m.valor })
    byMes.set(k, arr)
  }

  const result: ComparativoMensal[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ano = d.getFullYear()
    const mes = d.getMonth() + 1
    const mesStr = String(mes).padStart(2, "0")
    const k = `${ano}-${mesStr}`
    const { receita: entrada, despesa: saida } = reduceNetResultadoMovs(byMes.get(k) ?? [])
    const lucro = safeMoney(entrada - saida)
    result.push({
      mes: `${ano}-${mesStr}`,
      mesLabel: monthLabel(mes, ano),
      ano,
      entrada: safeMoney(entrada),
      saida: safeMoney(saida),
      lucro,
      margem: pct(lucro, entrada),
    })
  }
  return result
}

// ─── getComparativoAnual ──────────────────────────────────────────────────────

export async function getComparativoAnual(storeId: string, anos = 3): Promise<ComparativoAnual[]> {
  const anoAtual = new Date().getFullYear()
  const firstYear = anoAtual - (anos - 1)
  const rows = await prisma.movimentacaoFinanceira.findMany({
    where: {
      storeId,
      createdAt: {
        gte: new Date(`${firstYear}-01-01T00:00:00.000Z`),
        lte: new Date(`${anoAtual}-12-31T23:59:59.999Z`),
      },
    },
    select: { tipo: true, origem: true, valor: true, createdAt: true },
  })
  const byAno = new Map<number, MovLin[]>()
  for (const m of rows) {
    const y = m.createdAt.getFullYear()
    const arr = byAno.get(y) ?? []
    arr.push({ tipo: m.tipo, origem: m.origem, valor: m.valor })
    byAno.set(y, arr)
  }

  const result: ComparativoAnual[] = []
  for (let i = anos - 1; i >= 0; i--) {
    const ano = anoAtual - i
    const { receita: entrada, despesa: saida } = reduceNetResultadoMovs(byAno.get(ano) ?? [])
    const entradaN = safeMoney(entrada)
    const saidaN = safeMoney(saida)
    const lucro = safeMoney(entradaN - saidaN)
    const prev = result[result.length - 1]
    const crescimento = prev && prev.entrada > 0 ? safeMoney(((entradaN - prev.entrada) / prev.entrada) * 100) : 0
    result.push({ ano, entrada: entradaN, saida: saidaN, lucro, margem: pct(lucro, entradaN), crescimento })
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
