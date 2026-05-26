"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import {
  Search, RefreshCw,
  TrendingUp, BarChart3, AlertTriangle,
  Printer, Eye, XCircle, ChevronLeft, ChevronRight,
  CheckCircle, Filter, X, Tag, Clock, DollarSign, UserCheck, RotateCcw,
  Receipt, Download, MoreHorizontal, Loader2, Calendar, Wrench, ShieldCheck, Monitor,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { CupomNaoFiscal, type CupomData } from "./cupom-nao-fiscal"
import { TrocasDevolucao } from "./trocas-devolucao"
import { useToast } from "@/hooks/use-toast"
import type { SaleRecord } from "@/lib/operations-sale-types"
import { useOperationsStore } from "@/lib/operations-store"
import { subscribeEvent } from "@/lib/events/event-bus"

// ── Types ─────────────────────────────────────────────────────────────────────

type VendaItem = {
  id: string
  dbId: string
  at: string
  cliente: string
  total: number
  status: string
  operador: string | null
  /** FK do terminal PDV (Fase 3). null para vendas legadas (rótulo "Sem terminal"). */
  terminalId: string | null
  formaPagamento: string
  quantidadeItens: number
  cancelada: boolean
  canceladaEm: string | null
  motivoCancelamento: string | null
}

type TerminalOption = {
  id: string
  code: string
  name: string
  status: "ACTIVE" | "INACTIVE"
}

type Kpis = {
  totalVendas: number
  faturamento: number
  cancelamentos: number
  devolvidas: number
  concluidas: number
  ticketMedio: number
}

type ApiResponse = {
  ok: boolean
  vendas: VendaItem[]
  total: number
  kpis: Kpis
  terminais?: TerminalOption[]
}

type VendaDetalhe = {
  id: string
  dbId: string
  at: string
  clienteNome: string | null
  clienteId: string | null
  clienteCpf: string | null
  total: number
  desconto: number
  status: string
  operador: string | null
  canceladaEm: string | null
  canceladaPor: string | null
  motivoCancelamento: string | null
  estoqueReposto?: boolean
  estornoFinanceiro?: boolean
  sessaoId: string | null
  terminalId?: string | null
  terminal?: { id: string; code: string; name: string } | null
  observacao: string | null
  correcoes: Array<{
    at: string
    operador: string
    motivo: string
    campos: string[]
    pagamentoAnterior?: string
    pagamentoNovo?: string
    clienteAnterior?: string | null
    clienteNovo?: string | null
    observacaoAnterior?: string | null
    observacaoNova?: string | null
    supervisorNome?: string
  }>
  pagamentos: Array<{ label: string; valor: number }>
  itens: Array<{ id: string; nome: string; quantidade: number; precoUnitario: number; lineTotal: number }>
  devolucoes: Array<{
    id: string
    localId: string
    at: string
    tipo: string
    valorTotal: number
    creditoEmitido: number
    operador: string
    motivo: string
    modo?: string | null
    novaVendaId?: string | null
    itens: Array<{ nome: string; quantidade: number; valorTotal: number }>
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBrl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function fmtDateParts(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso)
    return {
      date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    }
  } catch {
    return { date: iso, time: "" }
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    concluida: "Concluída",
    cancelada: "Cancelada",
    devolvida: "Devolvida",
    parcialmente_devolvida: "Dev. Parcial",
  }
  return map[s] ?? s
}

function statusBadgeClass(s: string): string {
  if (s === "cancelada") return "border-destructive/30 bg-destructive/10 text-destructive"
  if (s === "devolvida" || s === "parcialmente_devolvida") return "border-warning/30 bg-warning/10 text-warning"
  return "border-success/20 bg-success/10 text-success"
}

const PAGE_SIZE = 20

function paymentBreakdownLabels(pb: SaleRecord["paymentBreakdown"]): string[] {
  const formas: string[] = []
  if (pb.dinheiro > 0) formas.push("Dinheiro")
  if (pb.pix > 0) formas.push("Pix")
  if (pb.cartaoDebito > 0) formas.push("Débito")
  if (pb.cartaoCredito > 0) formas.push("Crédito")
  if (pb.carne > 0) formas.push("Carnê")
  if (pb.aPrazo > 0) formas.push("À Prazo")
  if (pb.creditoVale > 0) formas.push("Vale")
  return formas
}

function saleRecordToPagamentos(s: SaleRecord): Array<{ label: string; valor: number }> {
  const pb = s.paymentBreakdown
  const rows: Array<{ label: string; valor: number }> = []
  if (pb.dinheiro > 0) rows.push({ label: "Dinheiro", valor: pb.dinheiro })
  if (pb.pix > 0) rows.push({ label: "Pix", valor: pb.pix })
  if (pb.cartaoDebito > 0) rows.push({ label: "Débito", valor: pb.cartaoDebito })
  if (pb.cartaoCredito > 0) rows.push({ label: "Crédito", valor: pb.cartaoCredito })
  if (pb.carne > 0) rows.push({ label: "Carnê", valor: pb.carne })
  if (pb.aPrazo > 0) rows.push({ label: "A Prazo", valor: pb.aPrazo })
  if (pb.creditoVale > 0) rows.push({ label: "Vale/Crédito", valor: pb.creditoVale })
  return rows
}

function saleRecordToVendaItem(s: SaleRecord): VendaItem {
  const formas = paymentBreakdownLabels(s.paymentBreakdown)
  return {
    id: s.id,
    dbId: s.id,
    at: s.at,
    cliente: s.customerName?.trim() || "—",
    total: s.total,
    status: "concluida",
    operador: s.cashierId ?? null,
    terminalId: s.terminalId ?? null,
    formaPagamento: formas.length > 0 ? formas.join(" + ") : "—",
    quantidadeItens: s.lines.reduce((sum, l) => sum + l.quantity, 0),
    cancelada: false,
    canceladaEm: null,
    motivoCancelamento: null,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VendasArquivoGeral() {
  const { lojaAtivaId, empresaDocumentos, getEnderecoDocumentos } = useLojaAtiva()
  const storeId = lojaAtivaId ?? LEGACY_PRIMARY_STORE_ID
  const { sales: opsSales } = useOperationsStore()
  const { toast } = useToast()

  // Filters
  const [busca, setBusca] = useState("")
  const [buscaInput, setBuscaInput] = useState("")
  const [statusFiltro, setStatusFiltro] = useState("todos")
  const [pagamentoFiltro, setPagamentoFiltro] = useState("todos")
  const [operadorFiltro, setOperadorFiltro] = useState("")
  const [operadorInput, setOperadorInput] = useState("")
  const [terminalFiltro, setTerminalFiltro] = useState("todos") // "todos" | "sem" | <terminalId>
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [page, setPage] = useState(0)
  const [showFilters, setShowFilters] = useState(false)

  // Data
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [vendas, setVendas] = useState<VendaItem[]>([])
  const [total, setTotal] = useState(0)
  const [kpis, setKpis] = useState<Kpis>({ totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 })
  const [terminais, setTerminais] = useState<TerminalOption[]>([])
  const terminalMap = useMemo(
    () => new Map(terminais.map((t) => [t.id, t] as const)),
    [terminais],
  )
  const [remoteSales, setRemoteSales] = useState<SaleRecord[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)

  // Detalhe drawer
  const [detalheOpen, setDetalheOpen] = useState(false)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalhe, setDetalhe] = useState<VendaDetalhe | null>(null)
  /** Venda apenas no operations-store (syncPending) — detalhe local, sem API. */
  const [detalhePendenteLocal, setDetalhePendenteLocal] = useState<SaleRecord | null>(null)
  const [saldoCredito, setSaldoCredito] = useState<number | null>(null)

  // Cupom modal
  const [cupomOpen, setCupomOpen] = useState(false)
  const [cupomData, setCupomData] = useState<CupomData | null>(null)

  // Troca / Devolução modal
  const [trocaOpen, setTrocaOpen] = useState(false)
  const [trocaSaleId, setTrocaSaleId] = useState<string | null>(null)
  const [trocaInitialSale, setTrocaInitialSale] = useState<SaleRecord | undefined>(undefined)

  // Cancel dialog
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState("")
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelConfirmForcar, setCancelConfirmForcar] = useState(false)

  // Correção dialog
  const [corrigindoVenda, setCorrigindoVenda] = useState<VendaDetalhe | null>(null)
  const [correcaoMotivo, setCorrecaoMotivo] = useState("")
  const [correcaoFormaPag, setCorrecaoFormaPag] = useState<string>("") // key da forma selecionada
  const [correcaoClienteNome, setCorrecaoClienteNome] = useState("")
  const [correcaoClienteId, setCorrecaoClienteId] = useState<string | null>(null)
  const [correcaoObservacao, setCorrecaoObservacao] = useState("")
  const [correcaoTab, setCorrecaoTab] = useState<"pagamento" | "cliente" | "observacao">("pagamento")
  const [correcaoPin, setCorrecaoPin] = useState("")
  const [correcaoLoading, setCorrecaoLoading] = useState(false)
  const [correcaoError, setCorrecaoError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setApiError(false)
    try {
      const params = new URLSearchParams({
        storeId,
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
        ...(busca ? { q: busca } : {}),
        ...(statusFiltro !== "todos" ? { status: statusFiltro } : {}),
        ...(pagamentoFiltro !== "todos" ? { pagamento: pagamentoFiltro } : {}),
        ...(operadorFiltro.trim() ? { operador: operadorFiltro.trim() } : {}),
        ...(terminalFiltro !== "todos" ? { terminalId: terminalFiltro } : {}),
        ...(fromDate ? { from: new Date(fromDate).toISOString() } : {}),
        ...(toDate ? { to: new Date(toDate + "T23:59:59").toISOString() } : {}),
      })
      const res = await fetch(`/api/vendas/historico?${params}`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-assistec-loja-id": storeId },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as ApiResponse
      setVendas(data.vendas ?? [])
      setTotal(data.total ?? 0)
      setKpis(data.kpis ?? { totalVendas: 0, faturamento: 0, cancelamentos: 0, devolvidas: 0, concluidas: 0, ticketMedio: 0 })
      if (Array.isArray(data.terminais)) setTerminais(data.terminais)
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }, [storeId, page, busca, statusFiltro, pagamentoFiltro, operadorFiltro, terminalFiltro, fromDate, toDate])

  const fetchRemoteSales = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ops/vendas-list?lojaId=${encodeURIComponent(storeId)}`,
        { credentials: "include", headers: { "x-assistec-loja-id": storeId } },
      )
      if (res.ok) {
        const data = (await res.json()) as { sales?: SaleRecord[] }
        setRemoteSales(data.sales ?? [])
      }
    } catch (err: unknown) {
      console.warn("[vendas-arquivo] falha ao carregar do servidor:", err)
    }
  }, [storeId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    return subscribeEvent("venda_finalizada", (payload) => {
      if (payload.storeId !== storeId) return
      void load()
      void fetchRemoteSales()
    })
  }, [storeId, load, fetchRemoteSales])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setBusca(buscaInput) }, 400)
    return () => clearTimeout(t)
  }, [buscaInput])

  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setOperadorFiltro(operadorInput) }, 400)
    return () => clearTimeout(t)
  }, [operadorInput])

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [statusFiltro, pagamentoFiltro, terminalFiltro, fromDate, toDate])

  useEffect(() => {
    let cancelled = false
    setRemoteLoading(true)
    void fetchRemoteSales().finally(() => {
      if (!cancelled) setRemoteLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchRemoteSales])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const { mergedVendas, remoteOnlyIds, pendingSyncIds } = useMemo(() => {
    const historicoIds = new Set(vendas.map((v) => v.id))
    const remoteOnly = new Set<string>()
    const pendingSync = new Set<string>()

    const extraRemote = remoteSales
      .filter((s) => s.id && !historicoIds.has(s.id))
      .map((s) => {
        remoteOnly.add(s.id)
        return saleRecordToVendaItem(s)
      })

    const knownIds = new Set([...historicoIds, ...remoteOnly])
    const extraLocal = opsSales
      .filter((s) => s.id && !knownIds.has(s.id))
      .map((s) => {
        if (s.syncPending) pendingSync.add(s.id)
        return saleRecordToVendaItem(s)
      })

    const merged = [...vendas, ...extraRemote, ...extraLocal].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
    return { mergedVendas: merged, remoteOnlyIds: remoteOnly, pendingSyncIds: pendingSync }
  }, [vendas, remoteSales, opsSales])

  const isVendaPendenteSync = useCallback(
    (vendaId: string) => pendingSyncIds.has(vendaId),
    [pendingSyncIds],
  )

  const getPendingSaleRecord = useCallback(
    (vendaId: string) => opsSales.find((s) => s.id === vendaId && s.syncPending === true) ?? null,
    [opsSales],
  )

  const toastVendaPendenteBloqueada = useCallback(
    (acao: "cancelar" | "corrigir" | "troca" | "imprimir") => {
      const desc =
        acao === "cancelar"
          ? "Venda pendente não pode ser cancelada até sincronizar com o servidor."
          : "Esta ação só está disponível após a venda ser confirmada no servidor."
      toast({
        title: "Venda pendente de sincronização",
        description: desc,
        variant: acao === "cancelar" ? "destructive" : "default",
      })
    },
    [toast],
  )

  // ── Detalhe ──────────────────────────────────────────────────────────────────
  const openDetalhe = useCallback(async (vendaId: string) => {
    setDetalheOpen(true)
    setSaldoCredito(null)

    if (isVendaPendenteSync(vendaId)) {
      const local = getPendingSaleRecord(vendaId)
      setDetalheLoading(false)
      setDetalhe(null)
      setDetalhePendenteLocal(local)
      if (!local) {
        toast({
          title: "Venda pendente",
          description: "Dados locais indisponíveis. Atualize a página ou aguarde a sincronização.",
          variant: "destructive",
        })
      }
      return
    }

    setDetalhePendenteLocal(null)
    setDetalheLoading(true)
    setDetalhe(null)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      if (data.ok) {
        setDetalhe(data.venda)
        // Busca saldo atual em haver se a venda tem devoluções com crédito e CPF do cliente
        const venda = data.venda as VendaDetalhe
        if (venda.clienteCpf) {
          const totalCreditoGerado = venda.devolucoes.reduce((s, d) => s + (d.creditoEmitido ?? 0), 0)
          if (totalCreditoGerado > 0) {
            try {
              const doc = venda.clienteCpf.replace(/\D/g, "")
              const rCred = await fetch(
                `/api/ops/credito-cliente?lojaId=${encodeURIComponent(storeId)}&doc=${encodeURIComponent(doc)}`,
                { credentials: "include" }
              )
              if (rCred.ok) {
                const jCred = (await rCred.json()) as { creditos?: Record<string, { nome: string; saldo: number }> }
                const saldo = jCred.creditos?.[doc]?.saldo
                setSaldoCredito(typeof saldo === "number" ? saldo : null)
              }
            } catch { /* silent */ }
          }
        }
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar o detalhe da venda.", variant: "destructive" })
    } finally {
      setDetalheLoading(false)
    }
  }, [storeId, toast, isVendaPendenteSync, getPendingSaleRecord])

  // ── Cupom ────────────────────────────────────────────────────────────────────
  const openCupom = useCallback((d: VendaDetalhe) => {
    const lojaNome = empresaDocumentos.nomeFantasia || empresaDocumentos.razaoSocial || "Loja"
    const lojaCnpj = empresaDocumentos.cnpj || undefined
    const lojaEndereco = getEnderecoDocumentos() || undefined

    setCupomData({
      numeroPedido: d.id,
      at: d.at,
      lojaNome,
      lojaCnpj,
      lojaEndereco,
      clienteNome: d.clienteNome,
      clienteCpf: d.clienteCpf,
      operador: d.operador,
      sessaoId: d.sessaoId,
      itens: d.itens,
      pagamentos: d.pagamentos,
      total: d.total,
      desconto: d.desconto,
      status: d.status,
    })
    setCupomOpen(true)
  }, [empresaDocumentos])

  const openCupomFromRow = useCallback(async (vendaId: string) => {
    if (isVendaPendenteSync(vendaId)) {
      toastVendaPendenteBloqueada("imprimir")
      return
    }
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      if (data.ok) openCupom(data.venda)
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar os dados do cupom.", variant: "destructive" })
    }
  }, [storeId, openCupom, toast, isVendaPendenteSync, toastVendaPendenteBloqueada])

  // ── Cancelamento ─────────────────────────────────────────────────────────────
  const handleCancelar = useCallback(async (forcar = false) => {
    if (!cancelandoId || !cancelMotivo.trim()) return
    if (isVendaPendenteSync(cancelandoId)) {
      toastVendaPendenteBloqueada("cancelar")
      setCancelandoId(null)
      setCancelMotivo("")
      setCancelConfirmForcar(false)
      return
    }
    setCancelLoading(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(cancelandoId)}/cancelar`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-assistec-loja-id": storeId,
        },
        body: JSON.stringify({
          motivo: cancelMotivo.trim(),
          canceladaPor: "Operador",
          forcar,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.requireConfirm && !forcar) {
          setCancelConfirmForcar(true)
          return
        }
        toast({ title: "Erro", description: data.error ?? "Falha ao cancelar venda.", variant: "destructive" })
        return
      }
      toast({ title: "Venda cancelada", description: `${cancelandoId} cancelada com sucesso.` })
      setCancelandoId(null)
      setCancelMotivo("")
      setCancelConfirmForcar(false)
      // Refresh detail if open
      if (detalhe?.id === cancelandoId) {
        await openDetalhe(cancelandoId)
      }
      load()
    } catch {
      toast({ title: "Erro", description: "Falha ao cancelar venda.", variant: "destructive" })
    } finally {
      setCancelLoading(false)
    }
  }, [cancelandoId, cancelMotivo, storeId, detalhe, openDetalhe, load, toast, isVendaPendenteSync, toastVendaPendenteBloqueada])

  const openTroca = useCallback(
    (vendaId: string) => {
      if (isVendaPendenteSync(vendaId)) {
        toastVendaPendenteBloqueada("troca")
        return
      }
      setTrocaSaleId(vendaId)
      setTrocaInitialSale(remoteSales.find((s) => s.id === vendaId))
      setTrocaOpen(true)
    },
    [remoteSales, isVendaPendenteSync, toastVendaPendenteBloqueada],
  )

  const closeTroca = useCallback(() => {
    setTrocaOpen(false)
    setTrocaSaleId(null)
    setTrocaInitialSale(undefined)
  }, [])

  const startCorrecao = useCallback((v: VendaDetalhe) => {
    setCorrigindoVenda(v)
    setCorrecaoMotivo("")
    setCorrecaoPin("")
    setCorrecaoError(null)
    setCorrecaoTab("pagamento")
    setCorrecaoObservacao(v.observacao ?? "")
    setCorrecaoClienteNome(v.clienteNome ?? "")
    setCorrecaoClienteId(v.clienteId ?? null)
    // Detectar forma de pagamento atual (a principal/mais alta)
    if (v.pagamentos.length > 0) {
      const sorted = [...v.pagamentos].sort((a, b) => b.valor - a.valor)
      const mainLabel = sorted[0].label
      const labelToKey: Record<string, string> = {
        "Dinheiro": "dinheiro", "Pix": "pix", "Débito": "cartaoDebito",
        "Crédito": "cartaoCredito", "Carnê": "carne", "A Prazo": "aPrazo", "Vale/Crédito": "creditoVale",
      }
      setCorrecaoFormaPag(labelToKey[mainLabel] ?? "dinheiro")
    } else {
      setCorrecaoFormaPag("dinheiro")
    }
  }, [])

  const handleCorrigir = useCallback(async () => {
    if (!corrigindoVenda || !correcaoMotivo.trim()) return
    setCorrecaoLoading(true)
    setCorrecaoError(null)
    try {
      const body: Record<string, unknown> = { motivo: correcaoMotivo.trim() }

      if (correcaoTab === "pagamento") {
        // Redistribuir todo o total na forma selecionada
        const newPb: Record<string, number> = {}
        newPb[correcaoFormaPag] = corrigindoVenda.total
        body.novaFormaPagamento = newPb
        body.supervisorPin = correcaoPin
      } else if (correcaoTab === "cliente") {
        body.novoClienteId = correcaoClienteId
        body.novoClienteNome = correcaoClienteNome.trim() || null
      } else if (correcaoTab === "observacao") {
        body.novaObservacao = correcaoObservacao.trim() || null
      }

      const res = await fetch(`/api/vendas/${encodeURIComponent(corrigindoVenda.id)}/corrigir`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) {
        setCorrecaoError(data.error ?? "Falha ao corrigir venda.")
        return
      }
      toast({ title: "Venda corrigida", description: `${corrigindoVenda.id} atualizada com sucesso.` })
      setCorrigindoVenda(null)
      // Refresh detalhe drawer se aberto na mesma venda
      if (detalhe?.id === corrigindoVenda.id) {
        await openDetalhe(corrigindoVenda.id)
      }
      load()
    } catch {
      setCorrecaoError("Falha na conexão.")
    } finally {
      setCorrecaoLoading(false)
    }
  }, [corrigindoVenda, correcaoMotivo, correcaoTab, correcaoFormaPag, correcaoPin, correcaoClienteId, correcaoClienteNome, correcaoObservacao, storeId, detalhe, openDetalhe, load, toast])

  const startCancel = useCallback((vendaId: string) => {
    if (isVendaPendenteSync(vendaId)) {
      toastVendaPendenteBloqueada("cancelar")
      return
    }
    setCancelandoId(vendaId)
    setCancelMotivo("")
    setCancelConfirmForcar(false)
  }, [isVendaPendenteSync, toastVendaPendenteBloqueada])

  const startCorrecaoFromRow = useCallback(
    async (vendaId: string) => {
      if (isVendaPendenteSync(vendaId)) {
        toastVendaPendenteBloqueada("corrigir")
        return
      }
      try {
        const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}`, {
          credentials: "include",
          headers: { "x-assistec-loja-id": storeId },
        })
        const data = await res.json()
        if (data.ok) startCorrecao(data.venda)
      } catch {
        toast({ title: "Erro", description: "Não foi possível carregar a venda para correção.", variant: "destructive" })
      }
    },
    [storeId, isVendaPendenteSync, toastVendaPendenteBloqueada, toast],
  )

  const clearAllFilters = useCallback(() => {
    setStatusFiltro("todos")
    setPagamentoFiltro("todos")
    setBuscaInput("")
    setBusca("")
    setOperadorFiltro("")
    setOperadorInput("")
    setTerminalFiltro("todos")
    setFromDate("")
    setToDate("")
  }, [])

  // ── KPI Cards ──────────────────────────────────────────────────────────────

  const kpiCards = [
    {
      label: "Concluídas",
      value: kpis.concluidas.toLocaleString("pt-BR"),
      icon: CheckCircle,
      tone: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Faturamento líquido",
      value: fmtBrl(kpis.faturamento),
      icon: TrendingUp,
      tone: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Ticket médio",
      value: fmtBrl(kpis.ticketMedio),
      icon: DollarSign,
      tone: "text-info",
      bg: "bg-info/10",
    },
    {
      label: "Cancelamentos",
      value: kpis.cancelamentos.toLocaleString("pt-BR"),
      icon: XCircle,
      tone: "text-destructive",
      bg: "bg-destructive/10",
    },
  ]

  const hasActiveFilters = statusFiltro !== "todos" || pagamentoFiltro !== "todos" || terminalFiltro !== "todos" || busca !== "" || fromDate !== "" || toDate !== "" || operadorFiltro !== ""

  return (
    <TooltipProvider delayDuration={300}>
    <div className="space-y-5 pb-8 min-w-0">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <Receipt className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Vendas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Consulte, corrija, reimprima, cancele ou registre trocas e devoluções · unidade{" "}
              <span className="font-mono text-xs">{storeId}</span>
              {remoteLoading && (
                <span className="inline-flex items-center gap-1 ml-2 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  sincronizando…
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-70">
                <Download className="h-4 w-4" />
                Exportar
                <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal">Em breve</Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Exportação CSV/Excel — disponível em breve</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className="border-border bg-card">
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${k.bg}`}>
                <k.icon className={`h-4 w-4 ${k.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">{k.label}</p>
                {loading ? (
                  <Skeleton className="mt-1 h-5 w-20" />
                ) : (
                  <p className="text-base font-bold text-foreground leading-tight">{k.value}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar operacional */}
      <Card className="border-border bg-card shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-10 bg-background"
                placeholder="Buscar por cupom, cliente ou ID da venda…"
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold">
                    !
                  </span>
                )}
              </Button>
              <Badge variant="outline" className="h-9 px-3 font-normal text-muted-foreground border-border">
                {loading ? "…" : `${total.toLocaleString("pt-BR")} registro${total !== 1 ? "s" : ""}`}
              </Badge>
            </div>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 pt-3 border-t border-border">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Status
                </Label>
                <Select value={statusFiltro} onValueChange={setStatusFiltro}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="devolvida">Devolvida</SelectItem>
                    <SelectItem value="parcialmente_devolvida">Dev. Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Pagamento
                </Label>
                <Select value={pagamentoFiltro} onValueChange={setPagamentoFiltro}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as formas</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartaoDebito">Débito</SelectItem>
                    <SelectItem value="cartaoCredito">Crédito</SelectItem>
                    <SelectItem value="carne">Carnê</SelectItem>
                    <SelectItem value="aPrazo">A Prazo</SelectItem>
                    <SelectItem value="creditoVale">Vale/Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> De
                </Label>
                <Input type="date" className="h-9 text-sm bg-background" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Até
                </Label>
                <Input type="date" className="h-9 text-sm bg-background" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserCheck className="h-3 w-3" /> Operador
                </Label>
                <Input
                  className="h-9 text-sm bg-background"
                  placeholder="Nome ou ID…"
                  value={operadorInput}
                  onChange={(e) => setOperadorInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Monitor className="h-3 w-3" /> Terminal
                </Label>
                <Select value={terminalFiltro} onValueChange={setTerminalFiltro}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os terminais</SelectItem>
                    {terminais.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name || t.code}
                        {t.status === "INACTIVE" ? " (inativo)" : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="sem">Sem terminal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
                  <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5 h-8" onClick={clearAllFilters}>
                    <X className="h-3.5 w-3.5" />
                    Limpar filtros
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela ERP */}
      {apiError ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-8 py-14 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Erro ao carregar histórico</p>
            <p className="text-sm text-muted-foreground">Seus dados estão seguros. Verifique a conexão e tente novamente.</p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 border-border">
                  <TableHead className="min-w-[130px] font-semibold text-foreground">Data / Hora</TableHead>
                  <TableHead className="min-w-[120px] font-semibold text-foreground">Cupom</TableHead>
                  <TableHead className="min-w-[140px] font-semibold text-foreground">Cliente</TableHead>
                  <TableHead className="min-w-[100px] font-semibold text-foreground hidden md:table-cell">Pagamento</TableHead>
                  <TableHead className="min-w-[80px] font-semibold text-foreground hidden lg:table-cell text-center">Itens</TableHead>
                  <TableHead className="min-w-[90px] font-semibold text-foreground hidden xl:table-cell">Operador</TableHead>
                  <TableHead className="min-w-[90px] font-semibold text-foreground hidden xl:table-cell">Terminal</TableHead>
                  <TableHead className="min-w-[100px] font-semibold text-foreground">Status</TableHead>
                  <TableHead className="min-w-[100px] font-semibold text-foreground text-right">Total</TableHead>
                  <TableHead className="min-w-[180px] font-semibold text-foreground text-right sticky right-0 bg-muted/40 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10} className="py-3">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : mergedVendas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <BarChart3 className="h-10 w-10 text-muted-foreground/50" />
                        <p className="font-medium text-foreground">
                          {hasActiveFilters ? "Nenhuma venda encontrada" : "Nenhuma venda registrada"}
                        </p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          {hasActiveFilters
                            ? "Ajuste os filtros ou limpe a busca."
                            : "As vendas do PDV aparecem aqui após sincronização com o banco."}
                        </p>
                        {hasActiveFilters && (
                          <Button variant="outline" size="sm" onClick={clearAllFilters}>
                            Limpar filtros
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  mergedVendas.map((v) => {
                    const { date, time } = fmtDateParts(v.at)
                    const isPendenteSync = pendingSyncIds.has(v.id)
                    return (
                      <TableRow
                        key={v.id}
                        className={cn(
                          "group border-border transition-colors",
                          v.cancelada && "opacity-80 bg-destructive/[0.02]",
                        )}
                      >
                        <TableCell className="tabular-nums">
                          <div className="text-foreground font-medium">{date}</div>
                          <div className="text-[11px] text-muted-foreground">{time}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-foreground">{v.id}</span>
                            {pendingSyncIds.has(v.id) && (
                              <Badge variant="outline" className="border-warning/30 bg-warning/10 text-[9px] px-1 py-0 text-warning">
                                Pendente
                              </Badge>
                            )}
                            {remoteOnlyIds.has(v.id) && !pendingSyncIds.has(v.id) && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">Sync</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground truncate max-w-[160px] inline-block" title={v.cliente}>
                            {v.cliente}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">{v.formaPagamento}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-center tabular-nums text-muted-foreground">
                          {v.quantidadeItens}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground truncate max-w-[100px] inline-block" title={v.operador ?? ""}>
                            {v.operador ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {v.terminalId ? (
                            <Badge variant="outline" className="text-[10px]">
                              <Monitor className="mr-1 h-3 w-3" />
                              {terminalMap.get(v.terminalId)?.code || "PDV"}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Sem terminal</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] font-semibold", statusBadgeClass(v.status))}>
                            {statusLabel(v.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn("font-bold tabular-nums", v.cancelada && "line-through text-muted-foreground")}>
                            {fmtBrl(v.total)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right sticky right-0 bg-card group-hover:bg-muted/50 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)] transition-colors">
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openDetalhe(v.id)}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Detalhes</TooltipContent>
                            </Tooltip>
                            {!isPendenteSync && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void openCupomFromRow(v.id)}>
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Imprimir</TooltipContent>
                              </Tooltip>
                            )}
                            {!v.cancelada && !isPendenteSync && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void startCorrecaoFromRow(v.id)}>
                                      <Wrench className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Corrigir venda</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openTroca(v.id)}>
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Troca / Devolução</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => startCancel(v.id)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Cancelar venda</TooltipContent>
                                </Tooltip>
                              </>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 md:hidden">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => void openDetalhe(v.id)}>
                                  <Eye className="h-4 w-4 mr-2" /> Detalhes
                                </DropdownMenuItem>
                                {!isPendenteSync && (
                                  <DropdownMenuItem onClick={() => void openCupomFromRow(v.id)}>
                                    <Printer className="h-4 w-4 mr-2" /> Imprimir
                                  </DropdownMenuItem>
                                )}
                                {!v.cancelada && !isPendenteSync && (
                                  <>
                                    <DropdownMenuItem onClick={() => void startCorrecaoFromRow(v.id)}>
                                      <Wrench className="h-4 w-4 mr-2" /> Corrigir venda
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openTroca(v.id)}>
                                      <RotateCcw className="h-4 w-4 mr-2" /> Troca / Devolução
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => startCancel(v.id)}>
                                      <XCircle className="h-4 w-4 mr-2" /> Cancelar venda
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && !loading && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages} · {total.toLocaleString("pt-BR")} vendas
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Detalhe Drawer ─────────────────────────────────────────────────────── */}
      <Sheet
        open={detalheOpen}
        onOpenChange={(open) => {
          setDetalheOpen(open)
          if (!open) {
            setDetalhePendenteLocal(null)
            setDetalhe(null)
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 bg-card border-border">
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle className="text-lg font-bold text-foreground">
              {detalhePendenteLocal
                ? `Venda ${detalhePendenteLocal.id}`
                : detalhe
                  ? `Venda ${detalhe.id}`
                  : "Detalhes da Venda"}
            </SheetTitle>
            {detalhePendenteLocal ? (
              <SheetDescription className="text-xs text-muted-foreground">
                {fmtDate(detalhePendenteLocal.at)} · Pendente de sincronização
              </SheetDescription>
            ) : detalhe ? (
              <SheetDescription className="text-xs text-muted-foreground">
                {fmtDate(detalhe.at)} · {detalhe.operador ?? "Operador"} · {statusLabel(detalhe.status)}
              </SheetDescription>
            ) : null}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {detalhePendenteLocal ? (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="text-sm space-y-1 min-w-0">
                    <p className="font-semibold text-foreground">
                      Venda pendente de sincronização
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Esta venda ainda não foi confirmada no servidor. Os dados abaixo vêm apenas do dispositivo local.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informações</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Cupom / pedido</p>
                      <p className="font-mono text-xs font-semibold text-foreground">{detalhePendenteLocal.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="font-medium text-foreground">{fmtDate(detalhePendenteLocal.at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="font-medium text-foreground">{detalhePendenteLocal.customerName?.trim() || "—"}</p>
                    </div>
                    {detalhePendenteLocal.customerCpf && (
                      <div>
                        <p className="text-xs text-muted-foreground">CPF</p>
                        <p className="font-medium text-foreground">{detalhePendenteLocal.customerCpf}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Operador</p>
                      <p className="font-medium text-foreground">{detalhePendenteLocal.cashierId ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Terminal</p>
                      {detalhePendenteLocal.terminalId ? (
                        <p className="font-medium text-foreground">
                          {terminalMap.get(detalhePendenteLocal.terminalId)?.name
                            || terminalMap.get(detalhePendenteLocal.terminalId)?.code
                            || detalhePendenteLocal.terminalId}
                        </p>
                      ) : (
                        <p className="font-medium text-muted-foreground">Sem terminal</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Loja</p>
                      <p className="font-mono text-xs text-foreground">{storeId}</p>
                    </div>
                    {detalhePendenteLocal.sessaoId && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Sessão caixa</p>
                        <p className="font-mono text-[11px] text-foreground truncate">{detalhePendenteLocal.sessaoId}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-border" />

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Itens ({detalhePendenteLocal.lines.length})
                  </h3>
                  {detalhePendenteLocal.lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum item no registro local</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detalhePendenteLocal.lines.map((it, i) => (
                        <div key={`${it.inventoryId}-${i}`} className="flex items-center justify-between text-sm py-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">{it.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.quantity}x {fmtBrl(it.unitPrice)}
                            </p>
                          </div>
                          <p className="font-semibold text-foreground ml-4 shrink-0">{fmtBrl(it.lineTotal)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="bg-border" />

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</h3>
                  {(() => {
                    const pagamentos = saleRecordToPagamentos(detalhePendenteLocal)
                    return pagamentos.length === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <div className="space-y-1">
                        {pagamentos.map((pg, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{pg.label}</span>
                            <span className="font-medium text-foreground">{fmtBrl(pg.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="flex justify-between font-bold text-base text-foreground pt-1 border-t border-border">
                    <span>Total</span>
                    <span>{fmtBrl(detalhePendenteLocal.total)}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">Próximos passos</p>
                  <p>
                    Aguarde a sincronização ou clique em <span className="font-medium text-foreground">Atualizar</span> na lista.
                    Se continuar pendente, verifique os logs de{" "}
                    <span className="font-mono text-[10px] text-foreground">/api/ops/venda-persist</span>.
                  </p>
                  <p>
                    Cancelamento, correção, troca/devolução e reimpressão ficam disponíveis após a confirmação no servidor.
                  </p>
                </div>
              </>
            ) : detalheLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : detalhe ? (
              <>
                {/* Status banner */}
                {detalhe.status !== "concluida" && (
                  <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${statusBadgeClass(detalhe.status)}`}>
                    {detalhe.status === "cancelada" ? (
                      <XCircle className="h-4 w-4 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0" />
                    )}
                    <div className="text-sm">
                      <p className="font-semibold">{statusLabel(detalhe.status)}</p>
                      {detalhe.canceladaEm && (
                        <p className="text-[11px] opacity-80">{fmtDate(detalhe.canceladaEm)}</p>
                      )}
                      {detalhe.motivoCancelamento && (
                        <p className="text-[11px] opacity-80">Motivo: {detalhe.motivoCancelamento}</p>
                      )}
                      {detalhe.canceladaPor && (
                        <p className="text-[11px] opacity-80">Por: {detalhe.canceladaPor}</p>
                      )}
                      {detalhe.status === "cancelada" && detalhe.estoqueReposto && (
                        <p className="text-[11px] opacity-80">Estoque reposto ao cancelar</p>
                      )}
                      {detalhe.status === "cancelada" && detalhe.estornoFinanceiro && (
                        <p className="text-[11px] opacity-80">Estorno financeiro registrado</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Client + Operator info */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informações</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Cliente</p>
                      <p className="font-medium text-foreground">{detalhe.clienteNome ?? "—"}</p>
                    </div>
                    {detalhe.clienteCpf && (
                      <div>
                        <p className="text-xs text-muted-foreground">CPF</p>
                        <p className="font-medium text-foreground">{detalhe.clienteCpf}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Operador</p>
                      <p className="font-medium text-foreground">{detalhe.operador ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Terminal</p>
                      {detalhe.terminal ? (
                        <p className="font-medium text-foreground">
                          {detalhe.terminal.name || detalhe.terminal.code}{" "}
                          <span className="text-xs text-muted-foreground">({detalhe.terminal.code})</span>
                        </p>
                      ) : (
                        <p className="font-medium text-muted-foreground">Sem terminal</p>
                      )}
                    </div>
                    {detalhe.sessaoId && (
                      <div>
                        <p className="text-xs text-muted-foreground">Sessão caixa</p>
                        <p className="font-mono text-[11px] text-foreground truncate">{detalhe.sessaoId}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator className="bg-border" />

                {/* Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Itens ({detalhe.itens.length})
                  </h3>
                  {detalhe.itens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum item registrado</p>
                  ) : (
                    <div className="space-y-1.5">
                      {detalhe.itens.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-sm py-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate">{it.nome}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.quantidade}x {fmtBrl(it.precoUnitario)}
                            </p>
                          </div>
                          <p className="font-semibold text-foreground ml-4 shrink-0">{fmtBrl(it.lineTotal)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="bg-border" />

                {/* Payments + Total */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pagamento</h3>
                  {detalhe.pagamentos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <div className="space-y-1">
                      {detalhe.pagamentos.map((pg, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{pg.label}</span>
                          <span className="font-medium text-foreground">{fmtBrl(pg.valor)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detalhe.itens.length > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground pt-1">
                      <span>Subtotal ({detalhe.itens.length} {detalhe.itens.length === 1 ? "item" : "itens"})</span>
                      <span className="tabular-nums">
                        {fmtBrl(detalhe.itens.reduce((acc, it) => acc + it.lineTotal, 0))}
                      </span>
                    </div>
                  )}
                  {(detalhe.desconto ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>Desconto</span>
                      <span>-{fmtBrl(detalhe.desconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base text-foreground pt-1 border-t border-border">
                    <span>Total</span>
                    <span>{fmtBrl(detalhe.total)}</span>
                  </div>
                </div>

                {/* Devoluções vinculadas */}
                {detalhe.devolucoes.length > 0 && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Devoluções ({detalhe.devolucoes.length})
                      </h3>
                      {detalhe.devolucoes.map((dev) => {
                        const isTrocaImediata = dev.modo === "troca_imediata"
                        const badgeLabel = isTrocaImediata
                          ? "Troca imediata"
                          : dev.tipo === "vale_credito"
                            ? "Vale/Crédito"
                            : dev.tipo === "troca"
                              ? "Troca"
                              : dev.tipo === "devolucao"
                                ? "Devolução"
                                : "Estoque"
                        return (
                          <div key={dev.id} className="rounded-lg border border-border bg-background/40 p-3 text-sm space-y-1">
                            <div className="flex justify-between">
                              <Badge variant="outline" className={`text-[10px] ${isTrocaImediata ? "border-primary/40 bg-primary/10 text-primary" : ""}`}>
                                {badgeLabel}
                              </Badge>
                              <span className="font-semibold text-destructive">{fmtBrl(dev.valorTotal)}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{fmtDate(dev.at)} · {dev.operador || "Operador"}</p>
                            {dev.creditoEmitido > 0 && (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">Crédito gerado: {fmtBrl(dev.creditoEmitido)}</p>
                            )}
                            {dev.motivo && <p className="text-xs text-muted-foreground">Motivo: {dev.motivo}</p>}
                            {dev.itens.map((it, i) => (
                              <p key={i} className="text-xs text-foreground/70">{it.quantidade}x {it.nome}</p>
                            ))}
                            {/* Mini-timeline da troca imediata */}
                            {isTrocaImediata && (
                              <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2 text-[11px]">
                                <p className="font-semibold text-primary mb-1">Fluxo da troca</p>
                                <p className="font-mono text-foreground/80">
                                  {detalhe.id} <span className="text-muted-foreground">→</span> dev {dev.localId}
                                  {dev.novaVendaId ? (
                                    <>
                                      {" "}<span className="text-muted-foreground">→</span> nova venda <span className="text-primary">{dev.novaVendaId}</span>
                                    </>
                                  ) : null}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {/* Saldo em haver — mostrado quando há crédito vinculado ao CPF desta venda */}
                {saldoCredito !== null && detalhe?.clienteCpf && (
                  <>
                    <Separator className="bg-border" />
                    <div className={`rounded-lg border p-3 text-sm ${
                      saldoCredito > 0
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-muted bg-muted/20"
                    }`}>
                      <p className={`text-xs font-semibold ${
                        saldoCredito > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                      }`}>
                        {saldoCredito > 0 ? `Saldo em haver: ${fmtBrl(saldoCredito)}` : "Crédito totalmente utilizado"}
                      </p>
                      {saldoCredito > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Disponível para uso no PDV</p>
                      )}
                    </div>
                  </>
                )}

                {/* Histórico de correções */}
                {detalhe.correcoes && detalhe.correcoes.length > 0 && (
                  <>
                    <Separator className="bg-border" />
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="h-3 w-3" />
                        Correções ({detalhe.correcoes.length})
                      </h3>
                      {detalhe.correcoes.map((c, i) => (
                        <div key={i} className="rounded-lg border border-border bg-background/40 p-3 text-sm space-y-1">
                          <div className="flex justify-between items-start">
                            <Badge variant="outline" className="text-[10px]">Correção</Badge>
                            <span className="text-[11px] text-muted-foreground">{fmtDate(c.at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{c.operador}{c.supervisorNome ? ` · Supervisor: ${c.supervisorNome}` : ""}</p>
                          <p className="text-xs text-foreground/80">Motivo: {c.motivo}</p>
                          {c.campos.includes("formaPagamento") && (
                            <p className="text-xs text-foreground/70">
                              Pagamento: <span className="line-through text-muted-foreground">{c.pagamentoAnterior}</span>{" → "}<span className="font-medium">{c.pagamentoNovo}</span>
                            </p>
                          )}
                          {c.campos.includes("cliente") && (
                            <p className="text-xs text-foreground/70">
                              Cliente: <span className="line-through text-muted-foreground">{c.clienteAnterior ?? "—"}</span>{" → "}<span className="font-medium">{c.clienteNovo ?? "—"}</span>
                            </p>
                          )}
                          {c.campos.includes("observacao") && (
                            <p className="text-xs text-foreground/70">
                              Obs.: <span className="line-through text-muted-foreground">{c.observacaoAnterior ?? "—"}</span>{" → "}<span className="font-medium">{c.observacaoNova ?? "—"}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Não foi possível carregar o detalhe.</p>
              </div>
            )}
          </div>

          {/* Drawer actions — apenas vendas persistidas no servidor */}
          {detalhe && !detalheLoading && !detalhePendenteLocal && (
            <div className="shrink-0 border-t border-border px-6 py-4 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 gap-2 text-sm"
                  onClick={() => openCupom(detalhe)}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir recibo
                </Button>
                {detalhe.status !== "cancelada" && (
                  <Button
                    variant="outline"
                    className="flex-1 h-10 gap-2 text-sm"
                    onClick={() => startCorrecao(detalhe)}
                  >
                    <Wrench className="h-4 w-4" />
                    Corrigir venda
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {detalhe.status !== "cancelada" && detalhe.status !== "devolvida" && (
                  <Button
                    variant="outline"
                    className="flex-1 h-10 gap-2 text-sm"
                    onClick={() => openTroca(detalhe.id)}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Trocar / Devolver
                  </Button>
                )}
                {detalhe.status !== "cancelada" && (
                  <Button
                    variant="outline"
                    className="flex-1 h-10 gap-2 text-sm text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => {
                      setCancelandoId(detalhe.id)
                      setCancelMotivo("")
                      setCancelConfirmForcar(false)
                    }}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Cancel Dialog ──────────────────────────────────────────────────────── */}
      <AlertDialog
        open={!!cancelandoId}
        onOpenChange={(o) => {
          if (!o && !cancelLoading) {
            setCancelandoId(null)
            setCancelMotivo("")
            setCancelConfirmForcar(false)
          }
        }}
      >
        <AlertDialogContent className="border-border bg-card max-w-md">
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
                {cancelLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 space-y-1">
                <AlertDialogTitle className="text-foreground text-left">
                  {cancelConfirmForcar ? "Confirmar cancelamento com devoluções" : "Cancelar venda"}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground text-left">
                  {cancelConfirmForcar
                    ? "Esta venda possui devoluções registradas. O cancelamento irá apenas marcar a venda — as devoluções serão mantidas."
                    : `A venda ${cancelandoId ?? ""} será marcada como cancelada no histórico.`}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          {!cancelConfirmForcar && (
            <div className="space-y-3 py-1">
              <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                  Atenção
                </p>
                <p>
                  O cancelamento registra o motivo e altera o status da venda. Reposição de estoque e estorno financeiro
                  serão tratados na próxima fase.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-motivo" className="text-sm text-foreground">
                  Motivo do cancelamento <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="cancel-motivo"
                  placeholder="Descreva o motivo (obrigatório)…"
                  value={cancelMotivo}
                  onChange={(e) => setCancelMotivo(e.target.value)}
                  className="min-h-[88px] resize-none bg-background border-border"
                  disabled={cancelLoading}
                  autoFocus
                />
              </div>
            </div>
          )}

          {cancelConfirmForcar && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs text-muted-foreground">
              Deseja continuar mesmo assim?
            </div>
          )}

          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="border-border" disabled={cancelLoading}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
              disabled={cancelLoading || (!cancelConfirmForcar && !cancelMotivo.trim())}
              onClick={(e) => {
                e.preventDefault()
                void handleCancelar(cancelConfirmForcar)
              }}
            >
              {cancelLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {cancelLoading ? "Cancelando…" : cancelConfirmForcar ? "Confirmar mesmo assim" : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cupom Modal ────────────────────────────────────────────────────────── */}
      {cupomData && (
        <CupomNaoFiscal
          isOpen={cupomOpen}
          onClose={() => setCupomOpen(false)}
          data={cupomData}
        />
      )}

      {/* ── Troca / Devolução ──────────────────────────────────────────────────── */}
      <Dialog
        open={trocaOpen}
        onOpenChange={(o) => {
          if (!o) closeTroca()
        }}
      >
        <DialogContent className="max-h-[min(90vh,680px)] w-[min(100vw-2rem,82rem)] sm:max-w-[82rem] border-border bg-card p-0 flex flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-4 py-3 sm:px-6">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              Troca / Devolução
              {trocaSaleId && (
                <span className="font-mono text-xs font-normal text-muted-foreground">{trocaSaleId}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
            <Suspense fallback={
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Carregando formulário…</span>
              </div>
            }>
              {trocaSaleId && (
                <TrocasDevolucao
                   key={trocaSaleId}
                   initialSaleId={trocaSaleId}
                   initialSale={trocaInitialSale}
                   onRegistered={() => {
                     load()
                     if (detalhe?.id === trocaSaleId) void openDetalhe(trocaSaleId)
                     closeTroca()
                   }}
                />
              )}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Correção de Venda ──────────────────────────────────────────────────── */}
      <Dialog
        open={!!corrigindoVenda}
        onOpenChange={(o) => {
          if (!o && !correcaoLoading) setCorrigindoVenda(null)
        }}
      >
        <DialogContent className="max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Corrigir venda
              {corrigindoVenda && (
                <span className="font-mono text-xs font-normal text-muted-foreground">{corrigindoVenda.id}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {corrigindoVenda && (
            <div className="space-y-4">
              {/* Info banner */}
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                  Correção segura — itens e total não serão alterados
                </p>
                <p>Total: <span className="font-bold text-foreground">{fmtBrl(corrigindoVenda.total)}</span> · {corrigindoVenda.itens.length} {corrigindoVenda.itens.length === 1 ? "item" : "itens"}</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-border">
                {(["pagamento", "cliente", "observacao"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={cn(
                      "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                      correcaoTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => { setCorrecaoTab(tab); setCorrecaoError(null) }}
                  >
                    {tab === "pagamento" ? "Pagamento" : tab === "cliente" ? "Cliente" : "Observação"}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {correcaoTab === "pagamento" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Pagamento atual</Label>
                    <p className="text-sm font-medium text-foreground">
                      {corrigindoVenda.pagamentos.map((p) => `${p.label} ${fmtBrl(p.valor)}`).join(" + ") || "—"}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nova forma de pagamento</Label>
                    <Select value={correcaoFormaPag} onValueChange={setCorrecaoFormaPag}>
                      <SelectTrigger className="h-9 text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">Pix</SelectItem>
                        <SelectItem value="cartaoDebito">Débito</SelectItem>
                        <SelectItem value="cartaoCredito">Crédito</SelectItem>
                        <SelectItem value="carne">Carnê</SelectItem>
                        <SelectItem value="aPrazo">A Prazo</SelectItem>
                        <SelectItem value="creditoVale">Vale/Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      O valor total ({fmtBrl(corrigindoVenda.total)}) será redistribuído na forma selecionada.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> PIN do supervisor <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={12}
                      className="h-9 text-sm bg-background font-mono tracking-widest"
                      placeholder="PIN numérico"
                      value={correcaoPin}
                      onChange={(e) => setCorrecaoPin(e.target.value.replace(/\D/g, ""))}
                      disabled={correcaoLoading}
                    />
                  </div>
                </div>
              )}

              {correcaoTab === "cliente" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Cliente atual</Label>
                    <p className="text-sm font-medium text-foreground">{corrigindoVenda.clienteNome ?? "—"}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Novo nome do cliente</Label>
                    <Input
                      className="h-9 text-sm bg-background"
                      placeholder="Nome do cliente (ou vazio para remover)"
                      value={correcaoClienteNome}
                      onChange={(e) => setCorrecaoClienteNome(e.target.value)}
                      disabled={correcaoLoading}
                    />
                  </div>
                </div>
              )}

              {correcaoTab === "observacao" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Observação atual</Label>
                    <p className="text-sm font-medium text-foreground">{corrigindoVenda.observacao ?? "—"}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Nova observação</Label>
                    <Textarea
                      className="min-h-[80px] resize-none bg-background border-border text-sm"
                      placeholder="Observação (ou vazio para remover)"
                      value={correcaoObservacao}
                      onChange={(e) => setCorrecaoObservacao(e.target.value)}
                      disabled={correcaoLoading}
                    />
                  </div>
                </div>
              )}

              {/* Motivo — sempre visível */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <Label className="text-xs text-foreground">
                  Motivo da correção <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  className="min-h-[68px] resize-none bg-background border-border text-sm"
                  placeholder="Descreva o motivo da correção (obrigatório)…"
                  value={correcaoMotivo}
                  onChange={(e) => setCorrecaoMotivo(e.target.value)}
                  disabled={correcaoLoading}
                />
              </div>

              {/* Error */}
              {correcaoError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {correcaoError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={correcaoLoading}
                  onClick={() => setCorrigindoVenda(null)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-9 gap-2"
                  disabled={correcaoLoading || !correcaoMotivo.trim() || (correcaoTab === "pagamento" && !correcaoPin.trim())}
                  onClick={() => void handleCorrigir()}
                >
                  {correcaoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {correcaoLoading ? "Corrigindo…" : "Confirmar correção"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}
