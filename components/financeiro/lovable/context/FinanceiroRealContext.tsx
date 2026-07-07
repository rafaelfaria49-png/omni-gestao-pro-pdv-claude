"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { toast } from "sonner"

// ── Shared types (hub + context) ──────────────────────────────────────────────

export type StatusReceber = "pendente" | "atrasado" | "pago" | "parcial" | "cancelado"
export type StatusPagar = "pendente" | "atrasado" | "pago" | "cancelado"

export type ContaReceber = {
  id: string
  cliente: string
  descricao: string
  valor: number
  recebido: number
  venc: string
  status: StatusReceber
  parcela?: string
}

export type ContaPagar = {
  id: string
  fornecedor: string
  descricao: string
  categoria: string
  valor: number
  pago: number
  venc: string
  status: StatusPagar
  parcela?: string
  formaPagamento?: string
  contaBancaria?: string
  observacao?: string
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

export type NovoReceberOrigem = "manual" | "venda" | "os" | "crediario" | "ajuste"

export type NovoReceberInput = {
  cliente: string
  descricao: string
  valor: number
  vencimento: string
  /** Campos opcionais — gravados em `payload` no servidor. */
  origem?: NovoReceberOrigem
  numeroDocumento?: string
  competencia?: string
  formaPagamento?: string
  carteiraId?: string
  observacao?: string
}

export type NovoPagarInput = {
  fornecedor: string
  descricao: string
  valor: number
  vencimento: string
  categoria?: string
  /** Campos opcionais — gravados em `payload` no servidor. */
  numeroDocumento?: string
  competencia?: string
  centroCusto?: string
  formaPagamento?: string
  carteiraId?: string
  observacao?: string
}

export type TipoCarteira =
  | "caixa"
  | "banco"
  | "pix"
  | "dinheiro"
  | "credito"
  | "debito"
  | "investimento"

export type CarteiraPublica = {
  id: string
  storeId: string
  nome: string
  tipo: TipoCarteira
  saldoInicial: number
  saldoAtual: number
  ativo: boolean
  cor: string
  icone: string
  createdAt: string
  updatedAt: string
}

export type NovaCarteiraInput = {
  nome: string
  tipo?: TipoCarteira
  saldoInicial?: number
  cor?: string
  icone?: string
}

// ── DRE types ─────────────────────────────────────────────────────────────────

export type DRELinha = { categoria: string; valor: number; percentual: number }

export type DREComparativo = {
  receitaCrescimento: number
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
  receitaBruta: number
  receitasDetalhadas: DRELinha[]
  custos: number
  custosDetalhados: DRELinha[]
  despesasFixas: number
  despesasFixasDetalhadas: DRELinha[]
  despesasVariaveis: number
  despesasVariaveisDetalhadas: DRELinha[]
  totalDespesas: number
  lucroBruto: number
  lucroLiquido: number
  margemBruta: number
  margemLiquida: number
  margemDespesas: number
  ticketMedio: number
  totalTransacoes: number
  totalMovimentacoes: number
  comparativo: DREComparativo | null
  tendencia: "positiva" | "negativa" | "estavel"
  historico6Meses: { mes: string; receita: number; despesa: number; lucro: number }[]
  alertas: AlertaDRE[]
}

export type TransferenciaCarteiraInput = {
  origemId: string
  destinoId: string
  valor: number
  descricao?: string
}

// ── Relatórios Avançados types ────────────────────────────────────────────────

export type PresetPeriodo = "hoje" | "ontem" | "7dias" | "30dias" | "estemes" | "mespassado" | "personalizado"

export type FiltrosFinanceiros = {
  preset: PresetPeriodo
  dataInicio?: string
  dataFim?: string
  carteiraId?: string
}

export type CategoriaLinha = {
  categoria: string
  total: number
  percentual: number
  qtd: number
  media: number
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

export type RelatoriosAvancados = {
  resumo: ResumoExecutivo | null
  fluxo: FluxoPeriodo[]
  comparativoMensal: ComparativoMensal[]
  comparativoAnual: ComparativoAnual[]
  analiseCarteiras: AnaliseCarteira[]
  topReceitas: RankingItem[]
  topDespesas: RankingItem[]
}

// ── Auditoria / Conciliação / Fechamento types ────────────────────────────────

export type AuditoriaPublica = {
  id: string
  storeId: string
  entidade: string
  entidadeId: string | null
  acao: string
  antes: unknown
  depois: unknown
  usuarioId: string | null
  usuarioNome: string | null
  ip: string | null
  createdAt: string
}

export type StatusConciliacao = "pendente" | "conciliado" | "divergente"

export type ConciliacaoPublica = {
  id: string
  storeId: string
  carteiraId: string
  carteiraNome: string
  dataReferencia: string
  saldoSistema: number
  saldoInformado: number
  diferenca: number
  status: StatusConciliacao
  observacao: string | null
  conciliadoPor: string | null
  conciliadoEm: string | null
  createdAt: string
  updatedAt: string
}

export type TipoFechamento = "diario" | "mensal"
export type StatusFechamento = "fechado" | "reaberto"

export type FechamentoPublico = {
  id: string
  storeId: string
  tipo: TipoFechamento
  dataReferencia: string
  mes: number
  ano: number
  status: StatusFechamento
  saldoSistema: number
  saldoInformado: number | null
  diferenca: number
  observacao: string | null
  fechadoPor: string | null
  reabertoPor: string | null
  fechadoEm: string | null
  reabertoEm: string | null
  snapshotDRE: unknown
  createdAt: string
  updatedAt: string
}

export type ResumoConciliacao = {
  total: number
  conciliadas: number
  divergentes: number
  pendentes: number
  totalDivergencia: number
}

/** Lançamento manual em carteira (POST /api/financeiro/movimentacoes). */
export type RegistrarMovimentacaoCarteiraInput = {
  tipo: "entrada" | "saida"
  valor: number
  descricao: string
  observacao?: string
  carteiraId: string
  /** yyyy-mm-dd */
  data?: string
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
  carteiras: CarteiraPublica[]
  loadingCarteiras: boolean
  saldoTotalCarteiras: number
  dre: DREMensal | null
  loadingDRE: boolean
  loading: boolean
  error: string | null
  reload: () => void
  refreshFluxoCaixa: () => Promise<void>
  refreshCarteiras: () => Promise<void>
  refreshDRE: (mes?: number, ano?: number) => Promise<void>
  criarCarteira: (data: NovaCarteiraInput) => Promise<CarteiraPublica>
  transferirEntreCarteiras: (data: TransferenciaCarteiraInput) => Promise<void>
  liquidarReceber: (id: string, observacao?: string, formaPagamento?: string) => Promise<void>
  receberParcial: (id: string, valor: number, observacao?: string, formaPagamento?: string) => Promise<void>
  estornarReceber: (id: string, motivo?: string) => Promise<void>
  criarReceber: (data: NovoReceberInput) => Promise<void>
  liquidarPagar: (id: string, observacao?: string) => Promise<void>
  pagarParcial: (id: string, valor: number, observacao?: string) => Promise<void>
  estornarPagar: (id: string, motivo?: string) => Promise<void>
  criarPagar: (data: NovoPagarInput) => Promise<void>
  // ── FASE 12 ──
  relatorios: RelatoriosAvancados
  loadingRelatorios: boolean
  filtrosFinanceiros: FiltrosFinanceiros
  setFiltrosFinanceiros: (f: FiltrosFinanceiros) => void
  refreshRelatorios: (filtros?: FiltrosFinanceiros) => Promise<void>
  exportarRelatorio: (tipo: string, formato: "csv" | "xlsx", filtros?: FiltrosFinanceiros) => void
  // ── FASE 11 ──
  auditoriaFinanceira: AuditoriaPublica[]
  conciliacoes: ConciliacaoPublica[]
  fechamentos: FechamentoPublico[]
  resumoConciliacao: ResumoConciliacao | null
  loadingAuditoria: boolean
  loadingConciliacao: boolean
  loadingFechamentos: boolean
  refreshAuditoria: () => Promise<void>
  refreshConciliacao: () => Promise<void>
  refreshFechamentos: () => Promise<void>
  fecharDia: (opts?: { observacao?: string; saldoInformado?: number }) => Promise<FechamentoPublico>
  fecharMes: (mes: number, ano: number, opts?: { observacao?: string; saldoInformado?: number }) => Promise<FechamentoPublico>
  reabrirFechamento: (id: string, motivo: string) => Promise<FechamentoPublico>
  conciliarCarteira: (carteiraId: string, saldoInformado: number, opts?: { observacao?: string }) => Promise<ConciliacaoPublica>
  /** Unidade ativa (cookie ou localStorage). `null` se nenhuma loja estiver selecionada — não usar fallback silencioso. */
  getActiveStoreId: () => string | null
  /** Entrada/saída manual vinculada à carteira + recálculo de saldo. */
  registrarMovimentacaoCarteira: (input: RegistrarMovimentacaoCarteiraInput) => Promise<void>
}

const FinanceiroRealContext = createContext<FinanceiroRealState | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mesma chave que `lib/loja-ativa.tsx` — evita fallback para loja errada. */
const LOJA_ATIVA_LS = "assistec-pro-loja-ativa-v1"

/** Loja ativa: cookie `assistec-active-store` ou `localStorage` da unidade. Sem `loja-1` implícito. */
function readActiveStoreIdFromBrowser(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)assistec-active-store=([^;]+)/)
  if (match) {
    const v = decodeURIComponent(match[1]).trim()
    if (v) return v
  }
  try {
    const raw = window.localStorage.getItem(LOJA_ATIVA_LS)?.trim()
    if (raw) return raw
  } catch {
    /* ignore */
  }
  return null
}

/** Garante `x-assistec-loja-id` quando há loja ativa (sem inventar unidade). */
function withStoreHeaders(headers?: HeadersInit): HeadersInit {
  const h = new Headers(headers ?? undefined)
  const id = readActiveStoreIdFromBrowser()
  if (id) h.set(ASSISTEC_LOJA_HEADER, id)
  return h
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
  if (l === "cancelado") return "cancelado"
  return "pendente"
}

function normalizePagarStatus(s: string): StatusPagar {
  const l = s.toLowerCase().trim()
  if (l === "pago") return "pago"
  if (l === "vencido" || l === "atrasado") return "atrasado"
  if (l === "estornado" || l === "parcial") return "pendente"
  if (l === "cancelado") return "cancelado"
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
    const saldoAberto = auditItem
      ? safeNum(auditItem.saldoAberto)
      : status === "pago" || status === "cancelado"
        ? 0
        : valor
    const recebido = Math.max(0, valor - saldoAberto)
    const descricao = safeStr(row.descricao)
    const parcelaRaw = typeof row.parcela === "string" ? row.parcela.trim() : ""
    result.push({
      id,
      cliente: safeStr(row.cliente) || descricao || "—",
      descricao,
      valor,
      recebido,
      venc: safeStr(row.vencimento),
      status,
      parcela: parcelaRaw || undefined,
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
    const descricao = safeStr(row.descricao)
    const parcelaRaw = typeof row.parcela === "string" ? row.parcela.trim() : ""
    result.push({
      id,
      fornecedor: safeStr(row.fornecedor),
      descricao,
      categoria: safeStr(row.categoria),
      valor,
      pago,
      venc: safeStr(row.dataVencimento) || safeStr(row.vencimento),
      status,
      parcela: parcelaRaw || undefined,
      formaPagamento: safeStr(row.formaPagamento) || undefined,
      contaBancaria: safeStr(row.contaBancaria) || undefined,
      observacao: safeStr(row.observacao) || undefined,
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
  const [carteiras, setCarteiras] = useState<CarteiraPublica[]>([])
  const [loadingCarteiras, setLoadingCarteiras] = useState(true)
  const [saldoTotalCarteiras, setSaldoTotalCarteiras] = useState(0)
  const [dre, setDRE] = useState<DREMensal | null>(null)
  const [loadingDRE, setLoadingDRE] = useState(true)
  const emptyRelatorios: RelatoriosAvancados = { resumo: null, fluxo: [], comparativoMensal: [], comparativoAnual: [], analiseCarteiras: [], topReceitas: [], topDespesas: [] }
  const [relatorios, setRelatorios] = useState<RelatoriosAvancados>(emptyRelatorios)
  const [loadingRelatorios, setLoadingRelatorios] = useState(false)
  const [filtrosFinanceiros, setFiltrosFinanceiros] = useState<FiltrosFinanceiros>({ preset: "estemes" })

  const [auditoriaFinanceira, setAuditoriaFinanceira] = useState<AuditoriaPublica[]>([])
  const [conciliacoes, setConciliacoes] = useState<ConciliacaoPublica[]>([])
  const [fechamentos, setFechamentos] = useState<FechamentoPublico[]>([])
  const [resumoConciliacao, setResumoConciliacao] = useState<ResumoConciliacao | null>(null)
  const [loadingAuditoria, setLoadingAuditoria] = useState(false)
  const [loadingConciliacao, setLoadingConciliacao] = useState(false)
  const [loadingFechamentos, setLoadingFechamentos] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (!readActiveStoreIdFromBrowser()) {
      setReceber([])
      setPagar([])
      setSummaryR(null)
      setSummaryP(null)
      setAnalytics(null)
      setError(
        "Nenhuma loja ativa encontrada. Selecione uma unidade no canto superior do OmniGestão e recarregue esta página.",
      )
      setLoading(false)
      return
    }
    try {
      const [rRes, pRes, aRes] = await Promise.all([
        fetch("/api/financeiro/receber", { headers: withStoreHeaders() }),
        fetch("/api/financeiro/pagar", { headers: withStoreHeaders() }),
        fetch("/api/financeiro/analytics", { headers: withStoreHeaders() }),
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
    if (!readActiveStoreIdFromBrowser()) {
      setFluxoCaixa(null)
      setLoadingFluxoCaixa(false)
      return
    }
    setLoadingFluxoCaixa(true)
    try {
      const res = await fetch("/api/financeiro/fluxo-caixa", { headers: withStoreHeaders() })
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) setFluxoCaixa(json as unknown as FluxoCaixa)
    } catch {
      // silencioso — fluxo-caixa é complementar
    } finally {
      setLoadingFluxoCaixa(false)
    }
  }, [])

  const refreshCarteiras = useCallback(async () => {
    if (!readActiveStoreIdFromBrowser()) {
      setCarteiras([])
      setSaldoTotalCarteiras(0)
      setLoadingCarteiras(false)
      return
    }
    setLoadingCarteiras(true)
    try {
      const res = await fetch("/api/financeiro/carteiras", {
        headers: withStoreHeaders(),
      })
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) {
        setCarteiras(Array.isArray(json.carteiras) ? (json.carteiras as CarteiraPublica[]) : [])
        setSaldoTotalCarteiras(typeof json.saldoTotal === "number" ? json.saldoTotal : 0)
      }
    } catch {
      // silencioso
    } finally {
      setLoadingCarteiras(false)
    }
  }, [])

  const criarCarteira = useCallback(async (data: NovaCarteiraInput): Promise<CarteiraPublica> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch("/api/financeiro/carteiras", {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(data),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      throw new Error(safeStr(json.error) || "Falha ao criar carteira")
    }
    await refreshCarteiras()
    return json.carteira as CarteiraPublica
  }, [refreshCarteiras])

  const transferirEntreCarteiras = useCallback(async (data: TransferenciaCarteiraInput): Promise<void> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch("/api/financeiro/carteiras/transferencia", {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(data),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      throw new Error(safeStr(json.error) || "Falha na transferência")
    }
    await refreshCarteiras()
  }, [refreshCarteiras])

  const refreshDRE = useCallback(async (mes?: number, ano?: number) => {
    if (!readActiveStoreIdFromBrowser()) {
      setDRE(null)
      setLoadingDRE(false)
      return
    }
    setLoadingDRE(true)
    try {
      const params = new URLSearchParams()
      if (mes) params.set("mes", String(mes))
      if (ano) params.set("ano", String(ano))
      const url = `/api/financeiro/dre${params.toString() ? `?${params.toString()}` : ""}`
      const res = await fetch(url, {
        headers: withStoreHeaders(),
      })
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) setDRE(json.dre as DREMensal)
    } catch {
      // silencioso — DRE é complementar
    } finally {
      setLoadingDRE(false)
    }
  }, [])

  const buildRelatoriosParams = (f: FiltrosFinanceiros): string => {
    const params = new URLSearchParams()
    const lojaId = readActiveStoreIdFromBrowser()
    if (!lojaId) return ""
    params.set("storeId", lojaId)
    if (f.preset !== "personalizado") {
      params.set("preset", f.preset)
    } else {
      if (f.dataInicio) params.set("dataInicio", f.dataInicio)
      if (f.dataFim) params.set("dataFim", f.dataFim)
    }
    if (f.carteiraId) params.set("carteiraId", f.carteiraId)
    return params.toString()
  }

  const refreshRelatorios = useCallback(async (filtros?: FiltrosFinanceiros) => {
    const f = filtros ?? filtrosFinanceiros
    if (!readActiveStoreIdFromBrowser()) {
      setRelatorios(emptyRelatorios)
      setLoadingRelatorios(false)
      return
    }
    setLoadingRelatorios(true)
    try {
      const headers = withStoreHeaders()
      const qs = buildRelatoriosParams(f)
      if (!qs) {
        setRelatorios(emptyRelatorios)
        setLoadingRelatorios(false)
        return
      }

      const [resumoRes, rankRes, indicRes, fluxoRes] = await Promise.all([
        fetch(`/api/financeiro/relatorios/resumo?${qs}`, { headers }),
        fetch(`/api/financeiro/relatorios/rankings?${qs}`, { headers }),
        fetch(`/api/financeiro/relatorios/indicadores?${qs}`, { headers }),
        fetch(`/api/financeiro/relatorios/fluxo?${qs}&agrupamento=mes`, { headers }),
      ])
      const [resumoJson, rankJson, indicJson, fluxoJson] = await Promise.all([
        resumoRes.json(), rankRes.json(), indicRes.json(), fluxoRes.json()
      ]) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>]

      setRelatorios({
        resumo: resumoJson.ok ? (resumoJson as unknown as ResumoExecutivo) : null,
        fluxo: Array.isArray(fluxoJson.fluxo) ? (fluxoJson.fluxo as FluxoPeriodo[]) : [],
        comparativoMensal: Array.isArray(indicJson.comparativoMensal) ? (indicJson.comparativoMensal as ComparativoMensal[]) : [],
        comparativoAnual: Array.isArray(indicJson.comparativoAnual) ? (indicJson.comparativoAnual as ComparativoAnual[]) : [],
        analiseCarteiras: Array.isArray(rankJson.carteiras) ? (rankJson.carteiras as AnaliseCarteira[]) : [],
        topReceitas: Array.isArray(rankJson.topReceitas) ? (rankJson.topReceitas as RankingItem[]) : [],
        topDespesas: Array.isArray(rankJson.topDespesas) ? (rankJson.topDespesas as RankingItem[]) : [],
      })
    } catch { /* silencioso */ } finally {
      setLoadingRelatorios(false)
    }
  }, [filtrosFinanceiros])

  const exportarRelatorio = useCallback((tipo: string, formato: "csv" | "xlsx", filtros?: FiltrosFinanceiros) => {
    const f = filtros ?? filtrosFinanceiros
    const lojaId = readActiveStoreIdFromBrowser()
    if (!lojaId) {
      toast.error("Selecione uma loja ativa para exportar relatórios.")
      return
    }
    // `storeId` na query: leituras via anchor não enviam header; `storeIdFromAssistecRequestForRead` ignora `x-assistec-loja-id` na URL.
    const params = new URLSearchParams({ tipo, formato, storeId: lojaId })
    if (f.preset !== "personalizado") {
      params.set("preset", f.preset)
    } else {
      if (f.dataInicio) params.set("dataInicio", f.dataInicio)
      if (f.dataFim) params.set("dataFim", f.dataFim)
    }
    const url = `/api/financeiro/relatorios/exportar?${params.toString()}`
    const a = document.createElement("a")
    a.href = url
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [filtrosFinanceiros])

  const refreshAuditoria = useCallback(async () => {
    if (!readActiveStoreIdFromBrowser()) {
      setAuditoriaFinanceira([])
      setLoadingAuditoria(false)
      return
    }
    setLoadingAuditoria(true)
    try {
      const res = await fetch("/api/financeiro/auditoria?take=30", {
        headers: withStoreHeaders(),
      })
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) setAuditoriaFinanceira(Array.isArray(json.items) ? (json.items as AuditoriaPublica[]) : [])
    } catch { /* silencioso */ } finally {
      setLoadingAuditoria(false)
    }
  }, [])

  const refreshConciliacao = useCallback(async () => {
    if (!readActiveStoreIdFromBrowser()) {
      setConciliacoes([])
      setResumoConciliacao(null)
      setLoadingConciliacao(false)
      return
    }
    setLoadingConciliacao(true)
    try {
      const [listRes, resumoRes] = await Promise.all([
        fetch("/api/financeiro/conciliacao", { headers: withStoreHeaders() }),
        fetch("/api/financeiro/conciliacao?resumo=1", { headers: withStoreHeaders() }),
      ])
      const [listJson, resumoJson] = await Promise.all([listRes.json(), resumoRes.json()]) as [Record<string, unknown>, Record<string, unknown>]
      if (listJson.ok) setConciliacoes(Array.isArray(listJson.items) ? (listJson.items as ConciliacaoPublica[]) : [])
      if (resumoJson.ok) setResumoConciliacao(resumoJson.resumo as ResumoConciliacao)
    } catch { /* silencioso */ } finally {
      setLoadingConciliacao(false)
    }
  }, [])

  const refreshFechamentos = useCallback(async () => {
    if (!readActiveStoreIdFromBrowser()) {
      setFechamentos([])
      setLoadingFechamentos(false)
      return
    }
    setLoadingFechamentos(true)
    try {
      const res = await fetch("/api/financeiro/fechamentos", {
        headers: withStoreHeaders(),
      })
      const json = (await res.json()) as Record<string, unknown>
      if (json.ok) setFechamentos(Array.isArray(json.items) ? (json.items as FechamentoPublico[]) : [])
    } catch { /* silencioso */ } finally {
      setLoadingFechamentos(false)
    }
  }, [])

  const fecharDia = useCallback(async (opts?: { observacao?: string; saldoInformado?: number }): Promise<FechamentoPublico> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch("/api/financeiro/fechamentos/fechar-dia", {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(opts ?? {}),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok || json.ok === false) throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    void refreshFechamentos()
    return json.fechamento as FechamentoPublico
  }, [refreshFechamentos])

  const fecharMes = useCallback(async (mes: number, ano: number, opts?: { observacao?: string; saldoInformado?: number }): Promise<FechamentoPublico> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch("/api/financeiro/fechamentos/fechar-mes", {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ mes, ano, ...opts }),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok || json.ok === false) throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    void refreshFechamentos()
    return json.fechamento as FechamentoPublico
  }, [refreshFechamentos])

  const reabrirFechamento = useCallback(async (id: string, motivo: string): Promise<FechamentoPublico> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch(`/api/financeiro/fechamentos/${id}/reabrir`, {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ motivo }),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok || json.ok === false) throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    void refreshFechamentos()
    return json.fechamento as FechamentoPublico
  }, [refreshFechamentos])

  const conciliarCarteira = useCallback(async (carteiraId: string, saldoInformado: number, opts?: { observacao?: string }): Promise<ConciliacaoPublica> => {
    if (!readActiveStoreIdFromBrowser()) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch("/api/financeiro/conciliacao", {
      method: "POST",
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ carteiraId, saldoInformado, observacao: opts?.observacao }),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok || json.ok === false) throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    void refreshConciliacao()
    return json.conciliacao as ConciliacaoPublica
  }, [refreshConciliacao])

  const callApi = useCallback(async (path: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST"): Promise<Record<string, unknown>> => {
    const lojaId = readActiveStoreIdFromBrowser()
    if (!lojaId) {
      throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
    }
    const res = await fetch(path, {
      method,
      headers: withStoreHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ lojaId, ...body }),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      throw new Error(safeStr(json.error) || `Falha ${res.status}`)
    }
    return json
  }, [])

  const liquidarReceber = useCallback(async (id: string, observacao?: string, formaPagamento?: string) => {
    await callApi("/api/financeiro/receber", { op: "liquidar", localKey: id, observacao, formaPagamento }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const receberParcial = useCallback(async (id: string, valor: number, observacao?: string, formaPagamento?: string) => {
    await callApi("/api/financeiro/receber", { op: "parcial", localKey: id, valor, observacao, formaPagamento }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const estornarReceber = useCallback(async (id: string, motivo?: string) => {
    await callApi("/api/financeiro/receber", { op: "estornar", localKey: id, modo: "ultimo_pagamento", motivo }, "PATCH")
    await fetchData()
  }, [callApi, fetchData])

  const criarReceber = useCallback(async (data: NovoReceberInput) => {
    const body: Record<string, unknown> = {
      descricao: data.descricao,
      cliente: data.cliente,
      valor: data.valor,
      vencimento: data.vencimento,
    }
    if (data.origem) body.origem = data.origem
    if (data.numeroDocumento?.trim()) body.numeroDocumento = data.numeroDocumento.trim()
    if (data.competencia?.trim()) body.competencia = data.competencia.trim()
    if (data.formaPagamento?.trim()) body.formaPagamento = data.formaPagamento.trim()
    if (data.carteiraId?.trim()) body.carteiraId = data.carteiraId.trim()
    if (data.observacao?.trim()) body.observacao = data.observacao.trim()
    const res = await callApi("/api/financeiro/receber", body, "POST")
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
    const body: Record<string, unknown> = {
      fornecedor: data.fornecedor,
      descricao: data.descricao,
      valor: data.valor,
      vencimento: data.vencimento,
      categoria: data.categoria || "Outros",
    }
    if (data.numeroDocumento?.trim()) body.numeroDocumento = data.numeroDocumento.trim()
    if (data.competencia?.trim()) body.competencia = data.competencia.trim()
    if (data.centroCusto?.trim()) body.centroCusto = data.centroCusto.trim()
    if (data.formaPagamento?.trim()) body.formaPagamento = data.formaPagamento.trim()
    if (data.carteiraId?.trim()) body.carteiraId = data.carteiraId.trim()
    if (data.observacao?.trim()) body.observacao = data.observacao.trim()
    const res = await callApi("/api/financeiro/pagar", body, "POST")
    if (res.ok === false) throw new Error(safeStr(res.error) || "Falha ao criar conta a pagar")
    await fetchData()
  }, [callApi, fetchData])

  const getActiveStoreId = useCallback(() => readActiveStoreIdFromBrowser(), [])

  const registrarMovimentacaoCarteira = useCallback(
    async (input: RegistrarMovimentacaoCarteiraInput) => {
      if (!readActiveStoreIdFromBrowser()) {
        throw new Error("Nenhuma loja ativa. Selecione uma unidade no OmniGestão.")
      }
      const body: Record<string, unknown> = {
        tipo: input.tipo,
        valor: input.valor,
        descricao: input.descricao.trim(),
        origem: "manual",
        carteiraId: input.carteiraId,
      }
      if (input.observacao?.trim()) body.observacao = input.observacao.trim()
      if (input.data?.trim()) body.data = input.data.trim()

      const res = await fetch("/api/financeiro/movimentacoes", {
        method: "POST",
        headers: withStoreHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok || json.ok === false) {
        throw new Error(safeStr(json.error) || `Falha ${res.status}`)
      }
      await Promise.all([refreshFluxoCaixa(), refreshCarteiras(), fetchData()])
      void refreshAuditoria()
      void refreshRelatorios(filtrosFinanceiros)
    },
    [fetchData, refreshFluxoCaixa, refreshCarteiras, refreshAuditoria, refreshRelatorios, filtrosFinanceiros],
  )

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { void refreshFluxoCaixa() }, [refreshFluxoCaixa])
  useEffect(() => { void refreshCarteiras() }, [refreshCarteiras])
  useEffect(() => { void refreshDRE() }, [refreshDRE])
  useEffect(() => { void refreshAuditoria() }, [refreshAuditoria])
  useEffect(() => { void refreshConciliacao() }, [refreshConciliacao])
  useEffect(() => { void refreshFechamentos() }, [refreshFechamentos])

  return (
    <FinanceiroRealContext.Provider
      value={{
        receber, pagar, summaryR, summaryP, analytics,
        fluxoCaixa, loadingFluxoCaixa,
        carteiras, loadingCarteiras, saldoTotalCarteiras,
        dre, loadingDRE,
        relatorios, loadingRelatorios, filtrosFinanceiros, setFiltrosFinanceiros,
        refreshRelatorios, exportarRelatorio,
        auditoriaFinanceira, conciliacoes, fechamentos, resumoConciliacao,
        loadingAuditoria, loadingConciliacao, loadingFechamentos,
        refreshAuditoria, refreshConciliacao, refreshFechamentos,
        fecharDia, fecharMes, reabrirFechamento, conciliarCarteira,
        getActiveStoreId,
        registrarMovimentacaoCarteira,
        loading, error, reload: fetchData,
        refreshFluxoCaixa, refreshCarteiras, refreshDRE,
        criarCarteira, transferirEntreCarteiras,
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
