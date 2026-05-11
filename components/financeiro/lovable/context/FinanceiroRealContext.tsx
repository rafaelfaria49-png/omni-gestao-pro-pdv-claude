"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

// ── Shared types (hub + context) ──────────────────────────────────────────────

export type StatusReceber = "pendente" | "atrasado" | "pago" | "parcial"
export type StatusPagar = "pendente" | "atrasado" | "pago"

export type ContaReceber = {
  id: string
  cliente: string
  valor: number
  recebido: number
  venc: string
  status: StatusReceber
  parcela?: string
}

export type ContaPagar = {
  id: string
  fornecedor: string
  valor: number
  pago: number
  venc: string
  status: StatusPagar
}

export type SummaryReceber = {
  quantidade: number
  totalAberto: number
  totalVencido: number
  totalPago: number
}

export type SummaryPagar = {
  quantidade: number
  totalAberto: number
  totalVencido: number
  totalPago: number
}

export type FluxoMes = { mes: string; entrada: number; saida: number }
export type MovimentacaoItem = { id: string; desc: string; tipo: "entrada" | "saida"; valor: number; data: string }
export type AnalyticsFinanceiro = {
  fluxoMensal: FluxoMes[]
  movimentacoes: MovimentacaoItem[]
  receitasOrigem: { name: string; value: number }[]
  despesasCategoria: { name: string; value: number }[]
  resultadoLoja: { loja: string; receita: number; despesa: number }[]
}

export type FluxoCaixaProximoItem = { id: string; descricao: string; valor: number; vencimento: string; diasRestantes: number }
export type FluxoCaixaAlerta = { tipo: string; mensagem: string; valor?: number; urgente: boolean }
export type FluxoCaixaFluxoDia = { data: string; label: string; entrada: number; saida: number; saldo: number }

export type FluxoCaixa = {
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
  proximosRecebimentos7Dias: { total: number; count: number; items: FluxoCaixaProximoItem[] }
  proximosPagamentos7Dias: { total: number; count: number; items: FluxoCaixaProximoItem[] }
  fluxoDiarioUltimos30Dias: FluxoCaixaFluxoDia[]
  alertas: FluxoCaixaAlerta[]
}

export type NovoReceberInput = {
  cliente: string
  descricao: string
  valor: number
  vencimento: string
}

export type NovoPagarInput = {
  fornecedor: string
  descricao: string
  valor: number
  vencimento: string
  categoria?: string
}

// ── Context shape ─────────────────────────────────────────────────────────────

type FinanceiroRealState = {
  receber: ContaReceber[]
  pagar: ContaPagar[]
  summaryR: SummaryReceber | null
  summaryP: SummaryPagar | null
  analytics: AnalyticsFinanceiro | null
  fluxoCaixa: FluxoCaixa | null
  loadingFluxoCaixa: boolean
  loading: boolean
  error: string | null
  reload: () => void
  refreshFluxoCaixa: () => Promise<void>
  liquidarReceber: (id: string, observacao?: string) => Promise<void>
  receberParcial: (id: string, valor: number, observacao?: string) => Promise<void>
  estornarReceber: (id: string, motivo?: string) => Promise<void>
  criarReceber: (data: NovoReceberInput) => Promise<void>
  liquidarPagar: (id: string, observacao?: string) => Promise<void>
  pagarParcial: (id: string, valor: number, observacao?: string) => Promise<void>
  estornarPagar: (id: string, motivo?: string) => Promise<void>
  criarPagar: (data: NovoPagarInput) => Promise<void>
}

const FinanceiroRealContext = createContext<FinanceiroRealState | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLojaId(): string {
  if (typeof document === "undefined") return "loja-1"
  const match = document.cookie.match(/(?:^|;\s*)assistec-active-store=([^;]+)/)
  if (match) {
    const v = decodeURIComponent(match[1]).trim()
    if (v) return v
  }
  return "loja-1"
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function normalizeReceberStatus(s: string): StatusReceber {
  const l = s.toLowerCase().trim()
  if (l === "pago") return "pago"
  if (l === "parcial") return "parcial"
  if (l === "vencido" || l === "atrasado") return "atrasado"
  if (l === "estornado") return "pendente"
  if (l === "cancelado") return "pago"
  return "pendente"
}

function normalizePagarStatus(s: string): StatusPagar {
  const l = s.toLowerCase().trim()
  if (l === "pago") return "pago"
  if (l === "vencido" || l === "atrasado") return "atrasado"
  if (l === "estornado" || l === "parcial") return "pendente"
  if (l === "cancelado") return "pago"
  return "pendente"
}

type AuditR = { id?: unknown; localKey?: unknown; saldoAberto?: unknown }
type AuditP = { id?: unknown; localKey?: unknown; pago?: unknown }

function normalizeReceberRows(rows: unknown[], audit: unknown[]): ContaReceber[] {
  const auditMap = new Map<string, AuditR>()
  for (const a of audit) {
    const item = a as AuditR
    const key = safeStr(item.id ?? item.localKey)
    if (key) auditMap.set(key, item)
  }
  const result: ContaReceber[] = []
  for (const r of rows) {
    const row = r as Record<string, unknown>
    const id = safeStr(row.id).trim()
    if (!id) continue
    const auditItem = auditMap.get(id)
    const valor = safeNum(row.valor)
    const status = normalizeReceberStatus(safeStr(row.status))
    const saldoAberto = auditItem ? safeNum(auditItem.saldoAberto) : status === "pago" ? 0 : valor
    const recebido = Math.max(0, valor - saldoAberto)
    result.push({
      id,
      cliente: safeStr(row.cliente) || safeStr(row.descricao) || "—",
      valor,
      recebido,
      venc: safeStr(row.vencimento),
      status,
      parcela: "1/1",
    })
  }
  return result
}

function normalizePagarRows(rows: unknown[], audit: unknown[]): ContaPagar[] {
  const auditMap = new Map<string, AuditP>()
  for (const a of audit) {
    const item = a as AuditP
    const key = safeStr(item.id ?? item.localKey)
    if (key) auditMap.set(key, item)
  }
  const result: ContaPagar[] = []
  for (const r of rows) {
    const row = r as Record<string, unknown>
    const id = safeStr(row.id).trim()
    if (!id) continue
    const auditItem = auditMap.get(id)
    const valor = safeNum(row.valor)
    const status = normalizePagarStatus(safeStr(row.status))
    const pago = auditItem ? safeNum(auditItem.pago) : status === "pago" ? valor : 0
    result.push({
      id,
      fornecedor: safeStr(row.fornecedor) || safeStr(row.descricao) || "—",
      valor,
      pago,
      venc: safeStr(row.dataVencimento) || safeStr(row.vencimento),
      status,
    })
  }
  return result
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function FinanceiroRealProvider({ children }: { children: ReactNode }) {
  const [receber, setReceber] = useState<ContaReceber[]>([])
  const [pagar, setPagar] = useState<ContaPagar[]>([])
  const [summaryR, setSummaryR] = useState<SummaryReceber | null>(null)
  const [summaryP, setSummaryP] = useState<SummaryPagar | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsFinanceiro | null>(null)
  const [fluxoCaixa, setFluxoCaixa] = useState<FluxoCaixa | null>(null)
  const [loadingFluxoCaixa, setLoadingFluxoCaixa] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rRes, pRes, aRes] = await Promise.all([
        fetch("/api/financeiro/receber"),
        fetch("/api/financeiro/pagar"),
        fetch("/api/financeiro/analytics"),
      ])
      const [rJson, pJson, aJson] = await Promise.all([
        rRes.json() as Promise<Record<string, unknown>>,
        pRes.json() as Promise<Record<string, unknown>>,
        aRes.json() as Promise<Record<string, unknown>>,
      ])
      if (rJson.ok) {
        const rRows = Array.isArray(rJson.rows) ? rJson.rows : []
        const rAudit = Array.isArray(rJson.audit) ? rJson.audit : []
        setReceber(normalizeReceberRows(rRows, rAudit))
        const sr = rJson.summary as Record<string, unknown> | undefined
        if (sr) setSummaryR({ quantidade: safeNum(sr.quantidade), totalAberto: safeNum(sr.totalAberto), totalVencido: safeNum(sr.totalVencido), totalPago: safeNum(sr.totalPago) })
      }
      if (pJson.ok) {
        const pRows = Array.isArray(pJson.rows) ? pJson.rows : []
        const pAudit = Array.isArray(pJson.audit) ? pJson.audit : []
        setPagar(normalizePagarRows(pRows, pAudit))
        const sp = pJson.summary as Record<string, unknown> | undefined
        if (sp) setSummaryP({ quantidade: safeNum(sp.quantidade), totalAberto: safeNum(sp.totalAberto), totalVencido: safeNum(sp.totalVencido), totalPago: safeNum(sp.totalPago) })
      }
      if (aJson.ok) {
        setAnalytics(aJson as unknown as AnalyticsFinanceiro)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados financeiros")
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshFluxoCaixa = useCallback(async () => {
    setLoadingFluxoCaixa(true)
    try {
      const res = await fetch("/api/financeiro/fluxo-caixa")
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) setFluxoCaixa(json as unknown as FluxoCaixa)
    } catch {
      // silencioso — fluxo-caixa é complementar
    } finally {
      setLoadingFluxoCaixa(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { void refreshFluxoCaixa() }, [refreshFluxoCaixa])

  const callApi = useCallback(async (path: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST"): Promise<Record<string, unknown>> => {
    const lojaId = getLojaId()
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json", "x-assistec-loja-id": lojaId },
      body: JSON.stringify({ lojaId, ...body }),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    }
    return json
  }, [])

  const liquidarReceber = useCallback(async (id: string, observacao?: string) => {
    await callApi("/api/financeiro/receber", { op: "liquidar", localKey: id, observacao }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const receberParcial = useCallback(async (id: string, valor: number, observacao?: string) => {
    await callApi("/api/financeiro/receber", { op: "parcial", localKey: id, valor, observacao }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const estornarReceber = useCallback(async (id: string, motivo?: string) => {
    await callApi("/api/financeiro/receber", { op: "estornar", localKey: id, modo: "ultimo_pagamento", motivo }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const criarReceber = useCallback(async (data: NovoReceberInput) => {
    const res = await callApi("/api/financeiro/receber", {
      descricao: data.descricao,
      cliente: data.cliente,
      valor: data.valor,
      vencimento: data.vencimento,
    }, "POST")
    if (res.ok === false) throw new Error(safeStr(res.error) || "Falha ao criar recebimento")
    await fetchData()
  }, [callApi, fetchData])

  const liquidarPagar = useCallback(async (id: string, observacao?: string) => {
    await callApi("/api/financeiro/pagar", { op: "liquidar", localKey: id, observacao }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const pagarParcial = useCallback(async (id: string, valor: number, observacao?: string) => {
    await callApi("/api/financeiro/pagar", { op: "parcial", localKey: id, valor, observacao }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const estornarPagar = useCallback(async (id: string, motivo?: string) => {
    await callApi("/api/financeiro/pagar", { op: "estornar", localKey: id, motivo }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const criarPagar = useCallback(async (data: NovoPagarInput) => {
    const res = await callApi("/api/financeiro/pagar", {
      fornecedor: data.fornecedor,
      descricao: data.descricao,
      valor: data.valor,
      vencimento: data.vencimento,
      categoria: data.categoria || "Outros",
    }, "POST")
    if (res.ok === false) throw new Error(safeStr(res.error) || "Falha ao criar conta a pagar")
    await fetchData()
  }, [callApi, fetchData])

  return (
    <FinanceiroRealContext.Provider
      value={{
        receber, pagar, summaryR, summaryP, analytics,
        fluxoCaixa, loadingFluxoCaixa,
        loading, error, reload: fetchData,
        refreshFluxoCaixa,
        liquidarReceber, receberParcial, estornarReceber, criarReceber,
        liquidarPagar, pagarParcial, estornarPagar, criarPagar,
      }}
    >
      {children}
    </FinanceiroRealContext.Provider>
  )
}

export function useFinanceiroReal(): FinanceiroRealState {
  const ctx = useContext(FinanceiroRealContext)
  if (!ctx) throw new Error("useFinanceiroReal: missing FinanceiroRealProvider")
  return ctx
}
