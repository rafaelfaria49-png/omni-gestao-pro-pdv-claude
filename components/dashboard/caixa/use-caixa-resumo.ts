"use client"

import { useEffect, useMemo, useState } from "react"
import { useCaixa } from "./caixa-provider"
import { useOperationsStore } from "@/lib/operations-store"
import { useLojaAtiva } from "@/lib/loja-ativa"
import {
  aggregateCaixaOperacoes,
  computeFechamentoResumo,
  filterSalesDaSessao,
  type CaixaOperacaoLinha,
  type FechamentoResumo,
} from "@/lib/caixa-fechamento-resumo"
import type { SaleRecord } from "@/lib/operations-sale-types"

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export interface CaixaResumoView {
  /** Resumo autoritativo da sessão (vendas canceladas já excluídas dos totais). */
  resumo: FechamentoResumo
  /** Vendas da sessão — inclui canceladas (para auditoria visual na lista). */
  sessionSales: SaleRecord[]
  /** Vendas canceladas da sessão (fora de todos os totais). */
  canceladas: SaleRecord[]
  qtdCanceladas: number
  totalCanceladas: number
  /** Entradas reais = recebido à vista + suprimentos + serviços recebidos (CR). */
  entradas: number
  /** Saídas = sangrias. */
  saidas: number
  /** Saldo movimentado esperado (abertura + recebido + supr. + CR − sangrias). */
  saldoEsperado: number
  opsCarregando: boolean
}

/**
 * Fonte ÚNICA dos números do caixa — compartilhada pela barra de status, pelo resumo
 * expansível e pelo modal de fechamento. Recalcula sempre a partir das vendas
 * autoritativas da sessão (status vindo do servidor) + operações de caixa do servidor:
 * vendas canceladas NUNCA entram em nenhum total. Garante que Resumo do Caixa,
 * Fechamento e Financeiro mostrem exatamente os mesmos valores.
 *
 * @param active     só busca/recalcula quando o consumidor está visível.
 * @param refreshKey incrementar força nova busca de vendas + operações (ex.: após sangria).
 */
export function useCaixaResumo(active: boolean, refreshKey = 0): CaixaResumoView {
  const { caixa, sessaoId } = useCaixa()
  const { sales, refreshSalesFromServer } = useOperationsStore()
  const { lojaAtivaId } = useLojaAtiva()
  const [ops, setOps] = useState<CaixaOperacaoLinha[]>([])
  const [opsOk, setOpsOk] = useState(false)
  const [opsCarregando, setOpsCarregando] = useState(false)

  // Reconcilia o status autoritativo das vendas (cancelamentos feitos na tela Vendas).
  useEffect(() => {
    if (!active) return
    void refreshSalesFromServer()
  }, [active, refreshKey, refreshSalesFromServer])

  // Operações da sessão no servidor (sangria / suprimento / recebimento_cr).
  useEffect(() => {
    if (!active || !sessaoId?.trim() || !lojaAtivaId) {
      setOps([])
      setOpsOk(false)
      return
    }
    let cancelled = false
    setOpsCarregando(true)
    void fetch(`/api/ops/caixa/sessao-detalhe?sessaoId=${encodeURIComponent(sessaoId)}`, {
      credentials: "include",
      headers: { "x-assistec-loja-id": lojaAtivaId },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { sessao?: { operacoes?: CaixaOperacaoLinha[] } }) => {
        if (cancelled) return
        const o = j.sessao?.operacoes
        setOps(Array.isArray(o) ? o.map((x) => ({ tipo: x.tipo, valor: x.valor, payload: x.payload })) : [])
        setOpsOk(true)
      })
      .catch(() => {
        if (cancelled) return
        setOps([])
        setOpsOk(false)
      })
      .finally(() => {
        if (!cancelled) setOpsCarregando(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, sessaoId, lojaAtivaId, refreshKey])

  return useMemo<CaixaResumoView>(() => {
    const sessionSales = filterSalesDaSessao(sales, {
      sessaoId,
      dataAbertura: caixa.dataAbertura,
    })
    const opsAgg = aggregateCaixaOperacoes(ops)
    // Usa as operações do servidor só quando a busca confirmou (mesmo vazia). Se a busca
    // falhou ou ainda não há sessão registrada, cai para o acumulador local (offline-safe).
    const usarOpsServidor = !!sessaoId?.trim() && opsOk && !opsCarregando
    // Σ total da sessão (inclui canceladas) — usado só para extrair suprimentos do
    // acumulador no modo fallback, igual ao comportamento legado do fechamento.
    const totalSessao = sessionSales.reduce((s, v) => s + (v.total ?? 0), 0)
    const sangrias = usarOpsServidor ? opsAgg.sangrias : caixa.totalSaidas
    const suprimentos = usarOpsServidor
      ? opsAgg.suprimentos
      : Math.max(0, caixa.totalEntradas - totalSessao)
    const resumo = computeFechamentoResumo({
      sales: sessionSales,
      sangrias,
      suprimentos,
      saldoInicial: caixa.saldoInicial,
      recebimentosContas: opsAgg.recebimentosContas,
      recebimentosContasDinheiro: opsAgg.recebimentosContasDinheiro,
      qtdRecebimentosContas: opsAgg.qtdRecebimentosContas,
    })
    const canceladas = sessionSales.filter((s) => s.status === "cancelada")
    const totalCanceladas = round2(canceladas.reduce((s, v) => s + (v.total ?? 0), 0))
    const entradas = round2(resumo.totalRecebido + resumo.suprimentos + resumo.recebimentosContas)
    return {
      resumo,
      sessionSales,
      canceladas,
      qtdCanceladas: canceladas.length,
      totalCanceladas,
      entradas,
      saidas: resumo.sangrias,
      saldoEsperado: resumo.saldoMovimentadoEsperado,
      opsCarregando,
    }
  }, [
    sales,
    sessaoId,
    caixa.dataAbertura,
    caixa.totalSaidas,
    caixa.totalEntradas,
    caixa.saldoInicial,
    ops,
    opsOk,
    opsCarregando,
  ])
}
