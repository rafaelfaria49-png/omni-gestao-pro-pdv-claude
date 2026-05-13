/**
 * DRE Service — Demonstração do Resultado do Exercício (mensal).
 *
 * Fonte de dados:
 *  - MovimentacaoFinanceira: entradas/saídas efetivadas
 *  - ContaReceberTitulo: volume/ticket médio de receitas
 *  - ContaPagarTitulo: categorização de despesas (payload.categoria)
 *
 * Classificação DRE:
 *  RECEITAS    → movimentações entrada, origem ∈ {os, pdv, venda, receber*, manual}
 *  CUSTOS      → saídas cuja categoria ∈ CATEGORIAS_CUSTO
 *  DESP.FIXAS  → saídas cuja categoria ∈ CATEGORIAS_DESP_FIXA
 *  DESP.VAR.   → demais saídas (exclui transferencias e estornos)
 *
 * Performance:
 *  - Um único findMany por entidade por período (sem N+1)
 *  - Lookup O(1) via Map para categorias
 */

import { prisma } from "@/lib/prisma"
import {
  isOrigemDevolucaoPdv,
  isOrigemEstornoPagar,
  isOrigemEstornoReceber,
  isOrigemSangriaPdv,
  isOrigemSuprimentoPdv,
  isOrigemTransferenciaInterna,
} from "./movimentacao-financeira-classify"

// ─── constantes de classificação ─────────────────────────────────────────────

const CATEGORIAS_CUSTO = new Set([
  "peças", "insumos", "material", "materiais", "compras", "estoque",
  "mercadoria", "mercadorias", "custo", "custos", "produto", "produtos",
  "reposicao", "reposição", "componente", "componentes",
])

const CATEGORIAS_DESP_FIXA = new Set([
  "aluguel", "salario", "salários", "salário", "folha", "folha de pagamento",
  "funcionários", "funcionarios", "funcionario", "pro-labore", "pro labore",
  "internet", "telefone", "luz", "energia", "agua", "água", "gas", "gás",
  "contador", "contabilidade", "software", "assinatura", "assinaturas",
  "seguro", "iptu", "condominio", "condomínio", "fixo", "fixas",
])

/** Origens que representam receita de clientes */
const ORIGENS_RECEITA = new Set([
  "os", "pdv", "venda", "receber", "receber:liquidar", "receber:parcial",
  "marketplace", "legado",
])

/** Origens neutras (não entram em receita nem despesa no DRE) */
const ORIGENS_IGNORAR = new Set([
  "ajuste", "sistema",
])

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type DRELinha = {
  categoria: string
  valor: number
  percentual: number // % sobre receita bruta
}

export type DREComparativo = {
  receitaCrescimento: number   // % vs mês anterior
  lucroCrescimento: number
  despesaCrescimento: number
  receitaMesAnterior: number
  lucroMesAnterior: number
}

export type AlertaDRE = {
  tipo: "margem_baixa" | "lucro_negativo" | "queda_receita" | "despesas_altas" | "fluxo_pressionado"
  mensagem: string
  valor?: number
  urgente: boolean
}

export type DREMensal = {
  periodo: { mes: number; ano: number; label: string }

  // Receitas
  receitaBruta: number
  receitasDetalhadas: DRELinha[]

  // Custos
  custos: number
  custosDetalhados: DRELinha[]

  // Despesas
  despesasFixas: number
  despesasFixasDetalhadas: DRELinha[]
  despesasVariaveis: number
  despesasVariaveisDetalhadas: DRELinha[]
  totalDespesas: number

  // Resultados
  lucroBruto: number
  lucroLiquido: number
  margemBruta: number    // %
  margemLiquida: number  // %
  margemDespesas: number // despesas / receita %

  // KPIs
  ticketMedio: number
  totalTransacoes: number
  totalMovimentacoes: number

  // Comparativo
  comparativo: DREComparativo | null

  // Tendência
  tendencia: "positiva" | "negativa" | "estavel"
  historico6Meses: { mes: string; receita: number; despesa: number; lucro: number }[]

  // Alertas
  alertas: AlertaDRE[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeMoney(v: number | null | undefined): number {
  const n = Number(v ?? 0)
  return isFinite(n) ? Math.round(n * 100) / 100 : 0
}

function normCategoria(raw: string | null | undefined): string {
  return (raw ?? "outros").trim().toLowerCase()
}

function classifyCategoria(cat: string): "custo" | "fixa" | "variavel" {
  const n = normCategoria(cat)
  if (CATEGORIAS_CUSTO.has(n)) return "custo"
  if (CATEGORIAS_DESP_FIXA.has(n)) return "fixa"
  return "variavel"
}

function isOrigemReceita(origem: string): boolean {
  const o = origem.toLowerCase().trim()
  if (ORIGENS_RECEITA.has(o)) return true
  if (o.startsWith("receber")) return true
  if (o.startsWith("os")) return true
  return false
}

function isOrigemIgnorada(origem: string): boolean {
  const o = origem.toLowerCase().trim()
  if (ORIGENS_IGNORAR.has(o)) return true
  if (isOrigemTransferenciaInterna(o)) return true
  return false
}

function mesLabel(mes: number, ano: number): string {
  const d = new Date(ano, mes - 1, 1)
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
}

function pct(valor: number, base: number): number {
  if (base <= 0) return 0
  return safeMoney((valor / base) * 100)
}

function crescimento(atual: number, anterior: number): number {
  if (anterior === 0) return atual > 0 ? 100 : 0
  return safeMoney(((atual - anterior) / Math.abs(anterior)) * 100)
}

function agrupaPorCategoria(
  items: { categoria: string; valor: number }[],
  base: number,
): DRELinha[] {
  const map = new Map<string, number>()
  for (const it of items) {
    const c = it.categoria || "Outros"
    map.set(c, safeMoney((map.get(c) ?? 0) + it.valor))
  }
  return Array.from(map.entries())
    .map(([categoria, valor]) => ({ categoria, valor, percentual: pct(valor, base) }))
    .sort((a, b) => b.valor - a.valor)
}

// ─── getDREPeriodo ────────────────────────────────────────────────────────────

async function getDREPeriodo(
  storeId: string,
  mes: number,
  ano: number,
): Promise<Omit<DREMensal, "comparativo" | "historico6Meses" | "alertas" | "tendencia">> {
  const inicio = new Date(ano, mes - 1, 1)
  const fim = new Date(ano, mes, 0, 23, 59, 59, 999)

  // Busca movimentações + títulos pagos no período — em paralelo, sem N+1
  const [movs, crPagos, cpPagos] = await Promise.all([
    prisma.movimentacaoFinanceira.findMany({
      where: {
        storeId,
        createdAt: { gte: inicio, lte: fim },
      },
      select: {
        id: true,
        tipo: true,
        origem: true,
        valor: true,
        referenciaId: true,
        descricao: true,
      },
    }),

    // Títulos a receber pagos/parciais no período para ticket médio
    prisma.contaReceberTitulo.findMany({
      where: {
        storeId,
        status: { in: ["pago", "parcial"] },
        updatedAt: { gte: inicio, lte: fim },
      },
      select: { id: true, valor: true },
    }),

    // Títulos a pagar pagos no período para classificação de categoria
    prisma.contaPagarTitulo.findMany({
      where: {
        storeId,
        status: "pago",
        updatedAt: { gte: inicio, lte: fim },
      },
      select: { id: true, payload: true },
    }),
  ])

  // Mapa referenciaId → categoria do CP (para classificar saídas de movimentações)
  const cpCatMap = new Map<string, string>()
  for (const cp of cpPagos) {
    const p = cp.payload && typeof cp.payload === "object"
      ? (cp.payload as Record<string, unknown>)
      : {}
    const cat = String(p.categoria ?? p.category ?? "Outros")
    cpCatMap.set(cp.id, cat)
  }

  // ── Classificação das movimentações ──────────────────────────────────────
  const receitaItems: { categoria: string; valor: number }[] = []
  const custoItems: { categoria: string; valor: number }[] = []
  const despFixaItems: { categoria: string; valor: number }[] = []
  const despVarItems: { categoria: string; valor: number }[] = []

  for (const m of movs) {
    const v = safeMoney(m.valor)
    const origemRaw = m.origem ?? "manual"
    const origem = origemRaw.toLowerCase()

    if (isOrigemIgnorada(origem)) continue

    // Estorno de pagamento: entrada que reduz despesa (não é receita operacional)
    if (m.tipo === "entrada" && isOrigemEstornoPagar(origemRaw)) {
      despVarItems.push({ categoria: "Estornos (pagamentos)", valor: -v })
      continue
    }

    if (m.tipo === "entrada") {
      if (isOrigemReceita(origem)) {
        // Label de receita baseado na origem
        let cat = "Outras receitas"
        if (origem.startsWith("os") || origem.startsWith("receber")) cat = "Serviços (OS)"
        else if (origem === "pdv" || origem === "venda") cat = "Vendas (PDV)"
        else if (origem === "marketplace") cat = "Marketplace"
        else if (isOrigemSuprimentoPdv(origemRaw)) cat = "Suprimento de caixa (PDV)"
        receitaItems.push({ categoria: cat, valor: v })
      } else {
        receitaItems.push({ categoria: "Outras receitas", valor: v })
      }
      continue
    }

    // Saídas
    if (isOrigemEstornoReceber(origemRaw)) {
      receitaItems.push({ categoria: "Estornos (recebimentos / cancelamentos)", valor: -v })
      continue
    }
    if (isOrigemDevolucaoPdv(origemRaw)) {
      receitaItems.push({ categoria: "Devoluções PDV", valor: -v })
      continue
    }
    if (isOrigemSangriaPdv(origemRaw)) {
      despVarItems.push({ categoria: "Sangria de caixa (PDV)", valor: v })
      continue
    }

    // Demais saídas: despesa/custo via CP vinculado
    const cat = m.referenciaId ? (cpCatMap.get(m.referenciaId) ?? "Outros") : "Outros"
    const tipo = classifyCategoria(cat)
    const catFormatada = cat.charAt(0).toUpperCase() + cat.slice(1)

    if (tipo === "custo") custoItems.push({ categoria: catFormatada, valor: v })
    else if (tipo === "fixa") despFixaItems.push({ categoria: catFormatada, valor: v })
    else despVarItems.push({ categoria: catFormatada, valor: v })
  }

  // ── Totais ────────────────────────────────────────────────────────────────
  const receitaBruta = safeMoney(receitaItems.reduce((s, x) => s + x.valor, 0))
  const custos = safeMoney(custoItems.reduce((s, x) => s + x.valor, 0))
  const despesasFixas = safeMoney(despFixaItems.reduce((s, x) => s + x.valor, 0))
  const despesasVariaveis = safeMoney(despVarItems.reduce((s, x) => s + x.valor, 0))
  const totalDespesas = safeMoney(despesasFixas + despesasVariaveis)

  const lucroBruto = safeMoney(receitaBruta - custos)
  const lucroLiquido = safeMoney(lucroBruto - totalDespesas)

  // Ticket médio via CR pagos (inclui parciais)
  const totalTransacoes = crPagos.length
  const ticketMedio = totalTransacoes > 0
    ? safeMoney(crPagos.reduce((s, x) => s + safeMoney(x.valor), 0) / totalTransacoes)
    : 0

  return {
    periodo: { mes, ano, label: mesLabel(mes, ano) },
    receitaBruta,
    receitasDetalhadas: agrupaPorCategoria(receitaItems, receitaBruta),
    custos,
    custosDetalhados: agrupaPorCategoria(custoItems, receitaBruta),
    despesasFixas,
    despesasFixasDetalhadas: agrupaPorCategoria(despFixaItems, receitaBruta),
    despesasVariaveis,
    despesasVariaveisDetalhadas: agrupaPorCategoria(despVarItems, receitaBruta),
    totalDespesas,
    lucroBruto,
    lucroLiquido,
    margemBruta: pct(lucroBruto, receitaBruta),
    margemLiquida: pct(lucroLiquido, receitaBruta),
    margemDespesas: pct(totalDespesas, receitaBruta),
    ticketMedio,
    totalTransacoes,
    totalMovimentacoes: movs.length,
  }
}

// ─── getDREMensal (exported) ──────────────────────────────────────────────────

export async function getDREMensal(
  storeId: string,
  mes?: number,
  ano?: number,
): Promise<DREMensal> {
  const sid = (storeId ?? "").trim()
  if (!sid) throw new Error("dre-service: storeId obrigatório")

  const now = new Date()
  const mesFinal = mes ?? now.getMonth() + 1
  const anoFinal = ano ?? now.getFullYear()

  // Mês anterior para comparativo
  let mesAnt = mesFinal - 1
  let anoAnt = anoFinal
  if (mesAnt < 1) { mesAnt = 12; anoAnt-- }

  // Histórico dos últimos 6 meses (em paralelo)
  const periodos: { mes: number; ano: number }[] = []
  for (let i = 5; i >= 0; i--) {
    let m = mesFinal - i
    let a = anoFinal
    while (m < 1) { m += 12; a-- }
    periodos.push({ mes: m, ano: a })
  }

  // Buscar DRE atual + anterior + histórico em paralelo
  const [atual, anterior, ...historicoParcial] = await Promise.all([
    getDREPeriodo(sid, mesFinal, anoFinal),
    getDREPeriodo(sid, mesAnt, anoAnt),
    ...periodos.slice(0, 5).map((p) => getDREPeriodo(sid, p.mes, p.ano)),
  ])

  // Histórico 6 meses (inclui o atual)
  const historico6Meses = [
    ...historicoParcial.map((p, i) => ({
      mes: periodos[i].mes === mesFinal && periodos[i].ano === anoFinal
        ? `${p.periodo.label}*`
        : p.periodo.label,
      receita: p.receitaBruta,
      despesa: safeMoney(p.custos + p.totalDespesas),
      lucro: p.lucroLiquido,
    })),
    {
      mes: atual.periodo.label,
      receita: atual.receitaBruta,
      despesa: safeMoney(atual.custos + atual.totalDespesas),
      lucro: atual.lucroLiquido,
    },
  ]

  // Comparativo
  const comparativo: DREComparativo = {
    receitaCrescimento: crescimento(atual.receitaBruta, anterior.receitaBruta),
    lucroCrescimento: crescimento(atual.lucroLiquido, anterior.lucroLiquido),
    despesaCrescimento: crescimento(
      atual.custos + atual.totalDespesas,
      anterior.custos + anterior.totalDespesas,
    ),
    receitaMesAnterior: anterior.receitaBruta,
    lucroMesAnterior: anterior.lucroLiquido,
  }

  // Tendência
  const tendencia: DREMensal["tendencia"] =
    atual.lucroLiquido > anterior.lucroLiquido * 1.05
      ? "positiva"
      : atual.lucroLiquido < anterior.lucroLiquido * 0.95
        ? "negativa"
        : "estavel"

  // Alertas gerenciais
  const alertas: AlertaDRE[] = []

  if (atual.lucroLiquido < 0) {
    alertas.push({
      tipo: "lucro_negativo",
      mensagem: `Resultado negativo em ${atual.periodo.label}: prejuízo de ${Math.abs(atual.lucroLiquido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: atual.lucroLiquido,
      urgente: true,
    })
  }

  if (atual.receitaBruta > 0 && atual.margemLiquida < 10 && atual.lucroLiquido >= 0) {
    alertas.push({
      tipo: "margem_baixa",
      mensagem: `Margem líquida baixa: ${atual.margemLiquida.toFixed(1)}% (abaixo de 10%)`,
      valor: atual.margemLiquida,
      urgente: atual.margemLiquida < 5,
    })
  }

  if (atual.receitaBruta > 0 && atual.margemDespesas > 70) {
    alertas.push({
      tipo: "despesas_altas",
      mensagem: `Despesas representam ${atual.margemDespesas.toFixed(1)}% da receita`,
      valor: atual.margemDespesas,
      urgente: atual.margemDespesas > 90,
    })
  }

  if (
    anterior.receitaBruta > 0 &&
    comparativo.receitaCrescimento < -15
  ) {
    alertas.push({
      tipo: "queda_receita",
      mensagem: `Queda de ${Math.abs(comparativo.receitaCrescimento).toFixed(1)}% na receita vs mês anterior`,
      valor: comparativo.receitaCrescimento,
      urgente: comparativo.receitaCrescimento < -30,
    })
  }

  if (atual.receitaBruta > 0 && atual.custos + atual.totalDespesas > atual.receitaBruta * 0.9) {
    alertas.push({
      tipo: "fluxo_pressionado",
      mensagem: `Compromissos consomem ${((atual.custos + atual.totalDespesas) / atual.receitaBruta * 100).toFixed(1)}% da receita — fluxo pressionado`,
      valor: atual.custos + atual.totalDespesas,
      urgente: false,
    })
  }

  // Ordenar: urgentes primeiro
  alertas.sort((a, b) => Number(b.urgente) - Number(a.urgente))

  return {
    ...atual,
    comparativo,
    historico6Meses,
    tendencia,
    alertas,
  }
}
