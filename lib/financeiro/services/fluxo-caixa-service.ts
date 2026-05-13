/**
 * Fluxo de Caixa Service — dados operacionais em tempo real.
 *
 * Fontes:
 *  - MovimentacaoFinanceira → entradas/saídas realizadas
 *  - ContaReceberTitulo     → receber aberto, vencido, próximos
 *  - ContaPagarTitulo       → pagar aberto, vencido, próximos
 */

import { prisma } from "@/lib/prisma"
import { parseDateStringSafe, isOverdueDateString, safeMoney } from "@/lib/financeiro/contracts/valores"
import { isOrigemTransferenciaInterna } from "@/lib/financeiro/services/movimentacao-financeira-classify"

// ─── tipos públicos ───────────────────────────────────────────────────────────

export type FluxoDia = {
  data: string      // yyyy-mm-dd
  label: string     // dd/mm
  entrada: number
  saida: number
  saldo: number     // entrada - saida do dia
}

export type FluxoCaixaProximo = {
  id: string
  descricao: string   // cliente/fornecedor
  valor: number
  vencimento: string  // original pt-BR
  diasRestantes: number
}

export type AlertaFinanceiro = {
  tipo: "vencido_receber" | "vencido_pagar" | "caixa_negativo" | "alto_pagar_mes" | "proximo_vencimento" | "carteira_negativa" | "saldo_critico"
  mensagem: string
  valor?: number
  urgente: boolean
}

export type FluxoCaixaResumo = {
  saldoAtual: number
  entradasHoje: number
  saidasHoje: number
  entradasMes: number
  saidasMes: number
  saldoMes: number
  totalReceberAberto: number
  totalPagarAberto: number
  totalVencidosReceber: number
  totalVencidosPagar: number
  qtdVencidosReceber: number
  qtdVencidosPagar: number
  proximosRecebimentos7Dias: { total: number; count: number; items: FluxoCaixaProximo[] }
  proximosPagamentos7Dias: { total: number; count: number; items: FluxoCaixaProximo[] }
  fluxoDiarioUltimos30Dias: FluxoDia[]
  alertas: AlertaFinanceiro[]
}

// ─── helpers internos ─────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function dayLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}

function isBetweenDays(vencimento: string, fromDate: Date, toDate: Date): boolean {
  const d = parseDateStringSafe(vencimento)
  if (!d) return false
  const from = startOfDay(fromDate)
  const to = endOfDay(toDate)
  return d >= from && d <= to
}

function diasRestantes(vencimento: string, hoje: Date): number {
  const d = parseDateStringSafe(vencimento)
  if (!d) return 999
  const diff = startOfDay(d).getTime() - startOfDay(hoje).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function isStatusAberto(status: string): boolean {
  const s = (status ?? "").toLowerCase()
  return s === "pendente" || s === "parcial" || s === "vencido"
}

// ─── funções exportadas ───────────────────────────────────────────────────────

export async function getFluxoCaixaResumo(storeId: string): Promise<FluxoCaixaResumo> {
  const sid = (storeId ?? "").trim()
  if (!sid) throw new Error("fluxo-caixa-service: storeId obrigatório")

  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const mesStart = startOfMonth(now)
  const em7Dias = new Date(now)
  em7Dias.setDate(now.getDate() + 7)

  // Buscar todos os dados em paralelo
  const [
    todasMovs,
    todosReceber,
    todosPagar,
    todasCarteiras,
  ] = await Promise.all([
    prisma.movimentacaoFinanceira.findMany({
      where: { storeId: sid },
      select: { id: true, tipo: true, valor: true, descricao: true, origem: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.contaReceberTitulo.findMany({
      where: { storeId: sid },
      select: { id: true, cliente: true, descricao: true, valor: true, vencimento: true, status: true },
    }),
    prisma.contaPagarTitulo.findMany({
      where: { storeId: sid },
      select: { id: true, descricao: true, valor: true, vencimento: true, status: true, payload: true },
    }),
    prisma.carteiraFinanceira.findMany({
      where: { storeId: sid, ativo: true },
      select: { id: true, nome: true, tipo: true, saldoAtual: true },
    }),
  ])

  // ── Saldo atual e fluxo por período ───────────────────────────────────────
  let saldoAtual = 0
  let entradasHoje = 0
  let saidasHoje = 0
  let entradasMes = 0
  let saidasMes = 0

  // Mapa para fluxo diário (últimos 30 dias)
  const fluxoDiarioMap = new Map<string, { entrada: number; saida: number }>()
  const hoje30 = new Date(now)
  hoje30.setDate(now.getDate() - 29)
  for (let i = 0; i <= 29; i++) {
    const d = new Date(hoje30)
    d.setDate(hoje30.getDate() + i)
    fluxoDiarioMap.set(dayKey(d), { entrada: 0, saida: 0 })
  }

  for (const m of todasMovs) {
    const o = m.origem ?? ""
    const v = safeMoney(m.valor)
    const isEntrada = m.tipo === "entrada"
    const isSaida = m.tipo === "saida"
    const ignoraAgregadoLoja = isOrigemTransferenciaInterna(o)

    if (isEntrada) saldoAtual = safeMoney(saldoAtual + v)
    if (isSaida) saldoAtual = safeMoney(saldoAtual - v)

    // Fluxo do período: movimentação de caixa real (inclui estornos e devoluções); transferências entre carteiras não duplicam resultado da loja
    if (!ignoraAgregadoLoja) {
      if (m.createdAt >= todayStart && m.createdAt <= todayEnd) {
        if (isEntrada) entradasHoje = safeMoney(entradasHoje + v)
        if (isSaida) saidasHoje = safeMoney(saidasHoje + v)
      }
      if (m.createdAt >= mesStart) {
        if (isEntrada) entradasMes = safeMoney(entradasMes + v)
        if (isSaida) saidasMes = safeMoney(saidasMes + v)
      }
    }

    const k = dayKey(m.createdAt)
    if (fluxoDiarioMap.has(k) && !ignoraAgregadoLoja) {
      const entry = fluxoDiarioMap.get(k)!
      if (isEntrada) entry.entrada = safeMoney(entry.entrada + v)
      if (isSaida) entry.saida = safeMoney(entry.saida + v)
    }
  }

  const fluxoDiarioUltimos30Dias: FluxoDia[] = Array.from(fluxoDiarioMap.entries())
    .map(([key, val]) => {
      const d = new Date(key + "T00:00:00")
      return {
        data: key,
        label: dayLabel(d),
        entrada: val.entrada,
        saida: val.saida,
        saldo: safeMoney(val.entrada - val.saida),
      }
    })
    .sort((a, b) => a.data.localeCompare(b.data))

  // ── Contas a receber ───────────────────────────────────────────────────────
  let totalReceberAberto = 0
  let totalVencidosReceber = 0
  let qtdVencidosReceber = 0
  const proximosReceberItems: FluxoCaixaProximo[] = []

  for (const cr of todosReceber) {
    if (!isStatusAberto(cr.status)) continue
    const v = safeMoney(cr.valor)
    totalReceberAberto = safeMoney(totalReceberAberto + v)

    if (isOverdueDateString(cr.vencimento)) {
      totalVencidosReceber = safeMoney(totalVencidosReceber + v)
      qtdVencidosReceber++
    } else if (isBetweenDays(cr.vencimento, now, em7Dias)) {
      proximosReceberItems.push({
        id: cr.id,
        descricao: cr.cliente || cr.descricao,
        valor: v,
        vencimento: cr.vencimento,
        diasRestantes: diasRestantes(cr.vencimento, now),
      })
    }
  }
  proximosReceberItems.sort((a, b) => a.diasRestantes - b.diasRestantes)

  // ── Contas a pagar ─────────────────────────────────────────────────────────
  let totalPagarAberto = 0
  let totalVencidosPagar = 0
  let qtdVencidosPagar = 0
  const proximosPagarItems: FluxoCaixaProximo[] = []

  for (const cp of todosPagar) {
    if (!isStatusAberto(cp.status)) continue
    const v = safeMoney(cp.valor)
    totalPagarAberto = safeMoney(totalPagarAberto + v)
    const p = cp.payload && typeof cp.payload === "object" ? (cp.payload as Record<string, unknown>) : {}
    const fornecedor = String(p.fornecedorNome ?? cp.descricao ?? "")

    if (isOverdueDateString(cp.vencimento)) {
      totalVencidosPagar = safeMoney(totalVencidosPagar + v)
      qtdVencidosPagar++
    } else if (isBetweenDays(cp.vencimento, now, em7Dias)) {
      proximosPagarItems.push({
        id: cp.id,
        descricao: fornecedor || cp.descricao,
        valor: v,
        vencimento: cp.vencimento,
        diasRestantes: diasRestantes(cp.vencimento, now),
      })
    }
  }
  proximosPagarItems.sort((a, b) => a.diasRestantes - b.diasRestantes)

  // ── Alertas financeiros ────────────────────────────────────────────────────
  const alertas: AlertaFinanceiro[] = []

  if (qtdVencidosReceber > 0) {
    alertas.push({
      tipo: "vencido_receber",
      mensagem: `${qtdVencidosReceber} conta${qtdVencidosReceber > 1 ? "s" : ""} a receber vencida${qtdVencidosReceber > 1 ? "s" : ""} — total ${totalVencidosReceber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: totalVencidosReceber,
      urgente: qtdVencidosReceber >= 3 || totalVencidosReceber >= 1000,
    })
  }

  if (qtdVencidosPagar > 0) {
    alertas.push({
      tipo: "vencido_pagar",
      mensagem: `${qtdVencidosPagar} conta${qtdVencidosPagar > 1 ? "s" : ""} a pagar vencida${qtdVencidosPagar > 1 ? "s" : ""} — total ${totalVencidosPagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: totalVencidosPagar,
      urgente: true,
    })
  }

  if (saldoAtual < 0) {
    alertas.push({
      tipo: "caixa_negativo",
      mensagem: `Saldo de caixa negativo: ${saldoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: saldoAtual,
      urgente: true,
    })
  }

  if (saidasMes > 0 && entradasMes > 0 && saidasMes / entradasMes > 0.85) {
    alertas.push({
      tipo: "alto_pagar_mes",
      mensagem: `Despesas do mês (${saidasMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) representam ${Math.round((saidasMes / entradasMes) * 100)}% das receitas`,
      valor: saidasMes,
      urgente: saidasMes >= entradasMes,
    })
  }

  // Alertas de carteiras: negativas e saldo crítico (<= 100)
  for (const c of todasCarteiras) {
    const saldo = safeMoney(c.saldoAtual)
    if (c.tipo === "caixa" && saldo < 0) {
      alertas.push({
        tipo: "caixa_negativo",
        mensagem: `Caixa "${c.nome}" está negativo: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        valor: saldo,
        urgente: true,
      })
    } else if (saldo < 0) {
      alertas.push({
        tipo: "carteira_negativa",
        mensagem: `Carteira "${c.nome}" (${c.tipo}) está negativa: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
        valor: saldo,
        urgente: true,
      })
    } else if (saldo > 0 && saldo <= 100) {
      alertas.push({
        tipo: "saldo_critico",
        mensagem: `Saldo crítico em "${c.nome}": ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} restantes`,
        valor: saldo,
        urgente: saldo <= 20,
      })
    }
  }

  const venceHojeReceber = proximosReceberItems.filter((x) => x.diasRestantes === 0)
  if (venceHojeReceber.length > 0) {
    const total = venceHojeReceber.reduce((s, x) => s + x.valor, 0)
    alertas.push({
      tipo: "proximo_vencimento",
      mensagem: `${venceHojeReceber.length} recebimento${venceHojeReceber.length > 1 ? "s" : ""} vence${venceHojeReceber.length > 1 ? "m" : ""} hoje — ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: total,
      urgente: false,
    })
  }

  const venceHojePagar = proximosPagarItems.filter((x) => x.diasRestantes === 0)
  if (venceHojePagar.length > 0) {
    const total = venceHojePagar.reduce((s, x) => s + x.valor, 0)
    alertas.push({
      tipo: "proximo_vencimento",
      mensagem: `${venceHojePagar.length} pagamento${venceHojePagar.length > 1 ? "s" : ""} vence${venceHojePagar.length > 1 ? "m" : ""} hoje — ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      valor: total,
      urgente: true,
    })
  }

  // Ordenar alertas: urgentes primeiro
  alertas.sort((a, b) => Number(b.urgente) - Number(a.urgente))

  return {
    saldoAtual,
    entradasHoje,
    saidasHoje,
    entradasMes,
    saidasMes,
    saldoMes: safeMoney(entradasMes - saidasMes),
    totalReceberAberto,
    totalPagarAberto,
    totalVencidosReceber,
    totalVencidosPagar,
    qtdVencidosReceber,
    qtdVencidosPagar,
    proximosRecebimentos7Dias: {
      total: safeMoney(proximosReceberItems.reduce((s, x) => s + x.valor, 0)),
      count: proximosReceberItems.length,
      items: proximosReceberItems.slice(0, 5),
    },
    proximosPagamentos7Dias: {
      total: safeMoney(proximosPagarItems.reduce((s, x) => s + x.valor, 0)),
      count: proximosPagarItems.length,
      items: proximosPagarItems.slice(0, 5),
    },
    fluxoDiarioUltimos30Dias,
    alertas,
  }
}
