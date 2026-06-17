"use client"

/**
 * Workspace Enterprise de Correção de Venda — FUNDAÇÃO (F1).
 *
 * SOMENTE LEITURA. Nesta fase NÃO há nenhuma mutação: o componente apenas consome
 * `GET /api/vendas/{id}?full=1` (enriquecido, read-only) e apresenta a venda em 9 abas
 * estilo ERP. A edição de pagamento segue no modal "Corrigir venda" existente; produtos,
 * cliente e financeiro editáveis chegam em F2/F3/F4.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Receipt, User, CreditCard, Landmark, Package, ShieldCheck, FileText, Wallet,
  History, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, ArrowRight,
  RotateCcw, Banknote, Info, Pencil, Plus, Trash2, Save, Search, Calculator,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import { computeCorrecaoItensPlan, type CorrecaoLineInput } from "@/lib/vendas/correcao-itens-plan"
import { avulsoInventoryId } from "@/lib/os-pdv-virtual-lines"

// ── Tipos (espelham o GET enriquecido) ─────────────────────────────────────────

type Movimentacao = { id: string; tipo: string; origem: string; valor: number; descricao: string; createdAt: string }
type Titulo = {
  id: string; localKey: string | null; descricao: string; cliente: string
  valor: number; vencimento: string; status: string; pago: number; createdAt: string
}
type StatusFinanceiro = {
  totalVenda: number; recebidoAVista: number; estornado: number; entradaLiquida: number
  aPrazoTotal: number; aPrazoPago: number; aPrazoAberto: number; titulosCancelados: number
  creditoValeUsado: number; temAPrazo: boolean; temEstorno: boolean; conciliado: boolean
}
type ClienteCompleto = {
  id: string; name: string; kind: string; document: string; phone: string | null
  email: string | null; city: string; totalSpent: number; lastPurchaseAt: string | null
}
type Sessao = {
  id: string; operador: string; status: string; abertaEm: string
  fechadaEm: string | null; saldoInicial: number; terminalId: string | null
}
type Correcao = {
  at: string; operador: string; motivo: string; campos: string[]
  pagamentoAnterior?: string; pagamentoNovo?: string
  clienteAnterior?: string | null; clienteNovo?: string | null
  observacaoAnterior?: string | null; observacaoNova?: string | null
  supervisorNome?: string
  financeiro?: {
    caixaAnterior?: number; caixaNovo?: number; aPrazoAnterior?: number; aPrazoNovo?: number
    creditoValeAnterior?: number; creditoValeNovo?: number
    titulosCancelados?: number; tituloCriado?: boolean
  }
}
type Devolucao = {
  id: string; localId: string; at: string; tipo: string; valorTotal: number
  creditoEmitido: number; operador: string; motivo: string; modo?: string | null
  novaVendaId?: string | null; itens: Array<{ nome: string; quantidade: number; valorTotal: number }>
}

type VendaFull = {
  id: string; dbId: string; at: string; total: number; desconto: number; status: string
  operador: string | null; clienteNome: string | null; clienteId: string | null; clienteCpf: string | null
  observacao: string | null; sessaoId: string | null; terminalId?: string | null
  terminal?: { id: string; code: string; name: string } | null
  canceladaEm: string | null; canceladaPor: string | null; motivoCancelamento: string | null
  estoqueReposto?: boolean; estornoFinanceiro?: boolean
  paymentBreakdown: Partial<PaymentBreakdownFull> | null
  pagamentos: Array<{ label: string; valor: number }>
  itens: Array<{ id: string; inventoryId: string | null; nome: string; quantidade: number; precoUnitario: number; lineTotal: number }>
  correcoes: Correcao[]
  devolucoes: Devolucao[]
  clienteCompleto: ClienteCompleto | null
  sessao: Sessao | null
  movimentacoesFinanceiras: Movimentacao[]
  titulos: Titulo[]
  statusFinanceiro: StatusFinanceiro | null
}

// ── Helpers de formatação ───────────────────────────────────────────────────────

function fmtBrl(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
  } catch { return iso }
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartaoDebito: "Débito", cartaoCredito: "Crédito",
  carne: "Carnê", aPrazo: "A Prazo", creditoVale: "Vale/Crédito",
}

function statusVendaBadge(s: string): { label: string; className: string } {
  if (s === "cancelada") return { label: "Cancelada", className: "border-destructive/30 bg-destructive/10 text-destructive" }
  if (s === "devolvida" || s === "parcialmente_devolvida")
    return { label: s === "devolvida" ? "Devolvida" : "Dev. Parcial", className: "border-warning/30 bg-warning/10 text-warning" }
  return { label: "Concluída", className: "border-success/20 bg-success/10 text-success" }
}

function statusTituloBadge(s: string | null): { label: string; className: string } {
  const v = (s ?? "").toLowerCase()
  if (v === "pago") return { label: "Pago", className: "border-success/20 bg-success/10 text-success" }
  if (v === "parcial") return { label: "Parcial", className: "border-info/20 bg-info/10 text-info" }
  if (v === "cancelado" || v === "estornado")
    return { label: v === "cancelado" ? "Cancelado" : "Estornado", className: "border-muted bg-muted/30 text-muted-foreground" }
  return { label: "Pendente", className: "border-warning/30 bg-warning/10 text-warning" }
}

// ── Primitivos de UI internos ────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Info; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center min-w-0">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
    </div>
  )
}

function FieldRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm text-foreground text-right break-words min-w-0", mono && "font-mono text-xs")}>{value}</span>
    </div>
  )
}

function KpiCard({ label, value, tone = "text-foreground", icon: Icon }: { label: string; value: string; tone?: string; icon: typeof Info }) {
  return (
    <Card className="border-border bg-card min-w-0">
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/40">
          <Icon className={cn("h-4 w-4", tone)} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className={cn("text-base font-bold leading-tight truncate", tone)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Timeline (Parte 5) ────────────────────────────────────────────────────────────

type TimelineItem = { at: string; title: string; desc?: string; icon: typeof Info; tone: string }

function buildTimeline(v: VendaFull): TimelineItem[] {
  const items: TimelineItem[] = []
  items.push({ at: v.at, title: "Venda criada", desc: `${v.itens.length} ite${v.itens.length === 1 ? "m" : "ns"} · ${fmtBrl(v.total)}`, icon: Receipt, tone: "text-primary" })

  for (const m of v.movimentacoesFinanceiras) {
    const entrada = m.tipo === "entrada"
    items.push({
      at: m.createdAt,
      title: entrada ? "Entrada financeira" : "Saída / estorno financeiro",
      desc: `${m.descricao} · ${fmtBrl(m.valor)}`,
      icon: entrada ? Banknote : RotateCcw,
      tone: entrada ? "text-success" : "text-destructive",
    })
  }
  for (const t of v.titulos) {
    items.push({
      at: t.createdAt,
      title: "Título a receber",
      desc: `${t.descricao} · ${fmtBrl(t.valor)} · venc. ${t.vencimento || "—"}`,
      icon: FileText,
      tone: "text-warning",
    })
  }
  for (const c of v.correcoes) {
    items.push({
      at: c.at,
      title: `Correção: ${c.campos.join(", ") || "—"}`,
      desc: [c.motivo, c.supervisorNome ? `Supervisor: ${c.supervisorNome}` : null].filter(Boolean).join(" · "),
      icon: ShieldCheck,
      tone: "text-info",
    })
  }
  for (const d of v.devolucoes) {
    items.push({ at: d.at, title: `Devolução / troca (${d.tipo})`, desc: `${fmtBrl(d.valorTotal)} · ${d.operador}`, icon: RotateCcw, tone: "text-warning" })
  }
  if (v.canceladaEm) {
    items.push({ at: v.canceladaEm, title: "Venda cancelada", desc: [v.canceladaPor, v.motivoCancelamento].filter(Boolean).join(" · "), icon: XCircle, tone: "text-destructive" })
  }
  return items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <EmptyState icon={History} title="Sem eventos" hint="Esta venda ainda não possui eventos registrados." />
  return (
    <div className="relative pl-6 min-w-0">
      <div className="absolute left-2 top-1 bottom-1 w-px bg-border" aria-hidden />
      <ul className="space-y-4">
        {items.map((it, i) => (
          <li key={i} className="relative min-w-0">
            <span className="absolute -left-[1.30rem] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-card ring-2 ring-border">
              <it.icon className={cn("h-3 w-3", it.tone)} />
            </span>
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <p className="text-sm font-medium text-foreground min-w-0 break-words">{it.title}</p>
              <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{fmtDateTime(it.at)}</span>
            </div>
            {it.desc && <p className="text-xs text-muted-foreground break-words mt-0.5">{it.desc}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────────

const TABS = [
  { key: "resumo", label: "Resumo", icon: Info },
  { key: "cliente", label: "Cliente", icon: User },
  { key: "pagamento", label: "Pagamento", icon: CreditCard },
  { key: "financeiro", label: "Financeiro", icon: Landmark },
  { key: "produtos", label: "Produtos", icon: Package },
  { key: "auditoria", label: "Auditoria", icon: ShieldCheck },
  { key: "receber", label: "Conta a Receber", icon: FileText },
  { key: "caixa", label: "Caixa", icon: Wallet },
  { key: "historico", label: "Histórico", icon: History },
] as const

export function WorkspaceCorrecaoVenda({
  vendaId,
  storeId,
  open,
  onOpenChange,
}: {
  vendaId: string | null
  storeId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [venda, setVenda] = useState<VendaFull | null>(null)
  const [tab, setTab] = useState<string>("resumo")

  // ── Edição de produtos (F2) ────────────────────────────────────────────────
  type DraftLine = { uid: string; inventoryId: string; nome: string; quantidade: number; precoUnitario: number; desconto: number; isAvulso: boolean }
  const [editProdutos, setEditProdutos] = useState(false)
  const [draft, setDraft] = useState<DraftLine[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [pin, setPin] = useState("")
  const [applying, setApplying] = useState(false)
  // Busca de produto para adicionar/trocar
  const [buscaProduto, setBuscaProduto] = useState("")
  const [resultados, setResultados] = useState<Array<{ id: string; name: string; price: number; stock: number; sku: string | null }>>([])
  const [buscando, setBuscando] = useState(false)
  const [swapTarget, setSwapTarget] = useState<string | null>(null) // uid da linha a trocar; null = adicionar

  const resetEdicao = useCallback(() => {
    setEditProdutos(false)
    setDraft([])
    setShowConfirm(false)
    setMotivo("")
    setPin("")
    setBuscaProduto("")
    setResultados([])
    setSwapTarget(null)
  }, [])

  const load = useCallback(async () => {
    if (!vendaId) return
    setLoading(true)
    setErro(null)
    setVenda(null)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(vendaId)}?full=1`, {
        credentials: "include",
        cache: "no-store",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      if (!data.ok) {
        setErro(data.error ?? "Não foi possível carregar a venda.")
        return
      }
      setVenda(data.venda as VendaFull)
    } catch {
      setErro("Falha de conexão ao carregar a venda.")
    } finally {
      setLoading(false)
    }
  }, [vendaId, storeId])

  useEffect(() => {
    if (open && vendaId) {
      setTab("resumo")
      resetEdicao()
      void load()
    }
  }, [open, vendaId, load, resetEdicao])

  const sf = venda?.statusFinanceiro ?? null
  const timeline = useMemo(() => (venda ? buildTimeline(venda) : []), [venda])
  const statusBadge = venda ? statusVendaBadge(venda.status) : null

  const breakdownRows = useMemo(() => {
    const pb = venda?.paymentBreakdown
    if (!pb) return [] as Array<{ key: string; label: string; valor: number }>
    return (Object.keys(PAYMENT_LABELS) as (keyof PaymentBreakdownFull)[])
      .map((k) => ({ key: k, label: PAYMENT_LABELS[k], valor: Number(pb[k]) || 0 }))
      .filter((r) => r.valor > 0)
  }, [venda])

  // ── Edição de produtos: handlers ─────────────────────────────────────────────
  const startEdit = useCallback(() => {
    if (!venda) return
    setDraft(
      venda.itens.map((it, i) => {
        const invId = it.inventoryId ?? it.id
        return {
          uid: `${it.id}-${i}`,
          inventoryId: invId,
          nome: it.nome,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
          desconto: 0,
          isAvulso: invId.startsWith("__avulso__"),
        }
      }),
    )
    setEditProdutos(true)
    setShowConfirm(false)
    setMotivo("")
    setPin("")
  }, [venda])

  const updateLine = useCallback((uid: string, patch: Partial<DraftLine>) => {
    setDraft((cur) => cur.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }, [])
  const removeLine = useCallback((uid: string) => {
    setDraft((cur) => cur.filter((l) => l.uid !== uid))
  }, [])

  const buscarProdutos = useCallback(async (q: string) => {
    if (!q.trim()) { setResultados([]); return }
    setBuscando(true)
    try {
      const res = await fetch(`/api/produtos?q=${encodeURIComponent(q.trim())}&activeOnly=1`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const data = await res.json()
      const list = Array.isArray(data.produtos) ? data.produtos : []
      setResultados(list.slice(0, 25).map((p: Record<string, unknown>) => ({
        id: String(p.id), name: String(p.name), price: Number(p.price) || 0, stock: Number(p.stock) || 0, sku: (p.sku as string) ?? null,
      })))
    } catch { setResultados([]) } finally { setBuscando(false) }
  }, [storeId])

  const pickProduto = useCallback((p: { id: string; name: string; price: number }) => {
    if (swapTarget) {
      updateLine(swapTarget, { inventoryId: p.id, nome: p.name, precoUnitario: p.price })
      setSwapTarget(null)
    } else {
      setDraft((cur) => [...cur, { uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, inventoryId: p.id, nome: p.name, quantidade: 1, precoUnitario: p.price, desconto: 0, isAvulso: false }])
    }
    setBuscaProduto("")
    setResultados([])
  }, [swapTarget, updateLine])

  const addAvulso = useCallback(() => {
    setDraft((cur) => [...cur, { uid: `av-${Date.now()}`, inventoryId: avulsoInventoryId(), nome: "Item avulso", quantidade: 1, precoUnitario: 0, desconto: 0, isAvulso: true }])
  }, [])

  // Plano de pré-visualização (reusa o MESMO planner puro do servidor).
  const draftPlan = useMemo(() => {
    if (!venda || !editProdutos) return null
    const oldLines: CorrecaoLineInput[] = venda.itens.map((it) => ({
      inventoryId: it.inventoryId ?? it.id, nome: it.nome, quantidade: it.quantidade, precoUnitario: it.precoUnitario,
    }))
    const newLines: CorrecaoLineInput[] = draft.map((l) => ({
      inventoryId: l.inventoryId, nome: l.nome, quantidade: l.quantidade, precoUnitario: l.precoUnitario, desconto: l.desconto, isAvulso: l.isAvulso,
    }))
    return computeCorrecaoItensPlan({ oldLines, newLines, oldTotal: venda.total, oldBreakdown: venda.paymentBreakdown })
  }, [venda, editProdutos, draft])

  const aplicarCorrecaoItens = useCallback(async () => {
    if (!venda || !draftPlan?.ok || !motivo.trim() || !pin.trim()) return
    setApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir-itens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({
          motivo: motivo.trim(),
          supervisorPin: pin.trim(),
          expectedTotal: venda.total,
          itens: draft.map((l) => ({ inventoryId: l.inventoryId, nome: l.nome, quantidade: l.quantidade, precoUnitario: l.precoUnitario, desconto: l.desconto, isAvulso: l.isAvulso })),
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: "Correção não aplicada", description: data.error ?? "Falha ao corrigir itens.", variant: "destructive" })
        return
      }
      toast({ title: "Itens corrigidos", description: `Total ${fmtBrl(data.totalAnterior)} → ${fmtBrl(data.totalNovo)}.` })
      resetEdicao()
      await load()
    } catch {
      toast({ title: "Erro", description: "Falha de conexão ao aplicar correção.", variant: "destructive" })
    } finally {
      setApplying(false)
    }
  }, [venda, draftPlan, motivo, pin, draft, storeId, toast, resetEdicao, load])

  const draftTotal = useMemo(() => draft.reduce((s, l) => s + Math.max(0, l.precoUnitario * l.quantidade - l.desconto), 0), [draft])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 gap-0 border-border bg-background flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 space-y-0">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
                Workspace da Venda
                {venda && <span className="font-mono text-xs font-normal text-muted-foreground">{venda.id}</span>}
                {statusBadge && (
                  <Badge variant="outline" className={cn("text-[10px]", statusBadge.className)}>{statusBadge.label}</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {venda ? <>{fmtDateTime(venda.at)} · {venda.operador || "Operador —"} · unidade <span className="font-mono">{storeId}</span></> : "Carregando…"}
              </DialogDescription>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="gap-1 border-info/30 bg-info/10 text-info text-[10px]">
                <ShieldCheck className="h-3 w-3" /> Somente leitura (F1)
              </Badge>
              {venda && <span className="text-sm font-bold text-foreground tabular-nums">{fmtBrl(venda.total)}</span>}
            </div>
          </div>
        </DialogHeader>

        {/* Corpo */}
        {loading ? (
          <div className="flex-1 grid place-items-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Carregando ficha completa da venda…</span>
            </div>
          </div>
        ) : erro ? (
          <div className="flex-1 grid place-items-center">
            <div className="flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-foreground font-medium">{erro}</p>
            </div>
          </div>
        ) : !venda ? (
          <div className="flex-1 grid place-items-center">
            <Skeleton className="h-40 w-[80%]" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="shrink-0 border-b border-border px-3 overflow-x-auto">
              <TabsList className="h-auto bg-transparent p-0 gap-0 flex-nowrap justify-start">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-3 py-2.5 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
              {/* 1 · RESUMO */}
              <TabsContent value="resumo" className="mt-0 space-y-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard label="Total da venda" value={fmtBrl(venda.total)} tone="text-primary" icon={Receipt} />
                  <KpiCard label="Recebido à vista" value={fmtBrl(sf?.entradaLiquida ?? 0)} tone="text-success" icon={Banknote} />
                  <KpiCard label="À prazo em aberto" value={fmtBrl(sf?.aPrazoAberto ?? 0)} tone="text-warning" icon={FileText} />
                  <KpiCard label="Desconto" value={fmtBrl(venda.desconto)} tone="text-info" icon={Info} />
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Dados da venda</p>
                      <FieldRow label="Cupom" value={venda.id} mono />
                      <FieldRow label="Data / hora" value={fmtDateTime(venda.at)} />
                      <FieldRow label="Operador" value={venda.operador || "—"} />
                      <FieldRow label="Terminal" value={venda.terminal?.name || venda.terminal?.code || "Sem terminal"} />
                      <FieldRow label="Cliente" value={venda.clienteNome || "Consumidor final"} />
                      <FieldRow label="Formas de pagamento" value={venda.pagamentos.map((p) => `${p.label} ${fmtBrl(p.valor)}`).join(" + ") || "—"} />
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Status financeiro</p>
                      {sf ? (
                        <>
                          <FieldRow label="Recebido à vista (líquido)" value={fmtBrl(sf.entradaLiquida)} />
                          <FieldRow label="À prazo (total)" value={fmtBrl(sf.aPrazoTotal)} />
                          <FieldRow label="À prazo pago" value={fmtBrl(sf.aPrazoPago)} />
                          <FieldRow label="Vale/crédito usado" value={fmtBrl(sf.creditoValeUsado)} />
                          <FieldRow label="Estornado" value={fmtBrl(sf.estornado)} />
                          <FieldRow
                            label="Conciliação"
                            value={
                              <span className={cn("inline-flex items-center gap-1", sf.conciliado ? "text-success" : "text-warning")}>
                                {sf.conciliado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                {sf.conciliado ? "Conciliado" : "Verificar"}
                              </span>
                            }
                          />
                        </>
                      ) : (
                        <EmptyState icon={Landmark} title="Sem status financeiro" />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* 2 · CLIENTE */}
              <TabsContent value="cliente" className="mt-0">
                {venda.clienteCompleto ? (
                  <Card className="border-border bg-card max-w-2xl min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Cliente vinculado</p>
                      <FieldRow label="Nome" value={venda.clienteCompleto.name} />
                      <FieldRow label="Tipo" value={venda.clienteCompleto.kind === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />
                      <FieldRow label="Documento" value={venda.clienteCompleto.document || venda.clienteCpf || "—"} mono />
                      <FieldRow label="Telefone" value={venda.clienteCompleto.phone || "—"} />
                      <FieldRow label="E-mail" value={venda.clienteCompleto.email || "—"} />
                      <FieldRow label="Cidade" value={venda.clienteCompleto.city || "—"} />
                      <FieldRow label="Total gasto (histórico)" value={fmtBrl(venda.clienteCompleto.totalSpent)} />
                      <FieldRow label="Última compra" value={fmtDateTime(venda.clienteCompleto.lastPurchaseAt)} />
                    </CardContent>
                  </Card>
                ) : venda.clienteNome || venda.clienteCpf ? (
                  <Card className="border-border bg-card max-w-2xl min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Cliente (sem cadastro formal)</p>
                      <FieldRow label="Nome" value={venda.clienteNome || "—"} />
                      <FieldRow label="CPF/CNPJ no cupom" value={venda.clienteCpf || "—"} mono />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState icon={User} title="Consumidor final" hint="Esta venda não tem cliente vinculado. A troca/cadastro de cliente chega em F3." />
                )}
              </TabsContent>

              {/* 3 · PAGAMENTO */}
              <TabsContent value="pagamento" className="mt-0">
                {breakdownRows.length > 0 ? (
                  <Card className="border-border bg-card max-w-xl min-w-0">
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="text-foreground">Forma</TableHead>
                            <TableHead className="text-foreground text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {breakdownRows.map((r) => (
                            <TableRow key={r.key} className="border-border">
                              <TableCell className="text-foreground">{r.label}</TableCell>
                              <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(r.valor)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-border bg-muted/20 font-semibold">
                            <TableCell className="text-foreground">Total</TableCell>
                            <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(venda.total)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState icon={CreditCard} title="Sem detalhamento de pagamento" hint="A venda não registrou breakdown de formas de pagamento." />
                )}
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> A correção de pagamento continua no botão “Corrigir venda”. Edição inline chega em F4.
                </p>
              </TabsContent>

              {/* 4 · FINANCEIRO */}
              <TabsContent value="financeiro" className="mt-0">
                {venda.movimentacoesFinanceiras.length > 0 ? (
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="text-foreground">Data</TableHead>
                            <TableHead className="text-foreground">Tipo</TableHead>
                            <TableHead className="text-foreground">Origem</TableHead>
                            <TableHead className="text-foreground">Descrição</TableHead>
                            <TableHead className="text-foreground text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {venda.movimentacoesFinanceiras.map((m) => (
                            <TableRow key={m.id} className="border-border">
                              <TableCell className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(m.createdAt)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("text-[10px]", m.tipo === "entrada" ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive")}>
                                  {m.tipo === "entrada" ? "Entrada" : "Saída"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{m.origem}</TableCell>
                              <TableCell className="text-sm text-foreground break-words max-w-[360px]">{m.descricao}</TableCell>
                              <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(m.valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState icon={Landmark} title="Sem movimentações financeiras" hint="Nenhum lançamento financeiro foi gerado por esta venda (ex.: venda 100% à prazo, ainda não recebida)." />
                )}
              </TabsContent>

              {/* 5 · PRODUTOS (editável — F2) */}
              <TabsContent value="produtos" className="mt-0 space-y-4">
                {!editProdutos ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" /> Correções alteram caixa e estoque. Revise antes de aplicar.
                      </p>
                      {venda.status !== "cancelada" && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={startEdit}>
                          <Pencil className="h-3.5 w-3.5" /> Editar produtos
                        </Button>
                      )}
                    </div>
                    {venda.itens.length > 0 ? (
                      <Card className="border-border bg-card min-w-0">
                        <CardContent className="p-0 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead className="text-foreground">Produto</TableHead>
                                <TableHead className="text-foreground text-center">Qtd</TableHead>
                                <TableHead className="text-foreground text-right">Unitário</TableHead>
                                <TableHead className="text-foreground text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {venda.itens.map((it) => (
                                <TableRow key={it.id} className="border-border">
                                  <TableCell className="text-foreground break-words max-w-[420px]">{it.nome}</TableCell>
                                  <TableCell className="text-center tabular-nums text-foreground">{it.quantidade}</TableCell>
                                  <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(it.precoUnitario)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(it.lineTotal)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ) : (
                      <EmptyState icon={Package} title="Sem itens" hint="Esta venda não tem itens registrados." />
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    {/* Aviso */}
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Correções alteram caixa, estoque e financeiro. Revise no preview antes de aplicar.</span>
                    </div>

                    {/* Linhas editáveis */}
                    <Card className="border-border bg-card min-w-0">
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="text-foreground">Produto</TableHead>
                              <TableHead className="text-foreground text-center w-20">Qtd</TableHead>
                              <TableHead className="text-foreground text-right w-28">Unitário</TableHead>
                              <TableHead className="text-foreground text-right w-28">Desc. (R$)</TableHead>
                              <TableHead className="text-foreground text-right w-28">Total</TableHead>
                              <TableHead className="text-foreground text-center w-24">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {draft.length === 0 ? (
                              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Sem itens. Adicione abaixo.</TableCell></TableRow>
                            ) : draft.map((l) => (
                              <TableRow key={l.uid} className="border-border">
                                <TableCell className="min-w-[200px]">
                                  <div className="flex items-center gap-2">
                                    {l.isAvulso ? (
                                      <Input value={l.nome} onChange={(e) => updateLine(l.uid, { nome: e.target.value })} className="h-8 text-sm" />
                                    ) : (
                                      <span className="text-foreground break-words">{l.nome}</span>
                                    )}
                                    {l.isAvulso && <Badge variant="outline" className="text-[9px] border-info/30 bg-info/10 text-info shrink-0">avulso</Badge>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Input type="number" min={1} value={l.quantidade} onChange={(e) => updateLine(l.uid, { quantidade: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="h-8 w-16 text-center text-sm mx-auto" />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input type="number" min={0} step="0.01" value={l.precoUnitario} onChange={(e) => updateLine(l.uid, { precoUnitario: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-24 text-right text-sm ml-auto" />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input type="number" min={0} step="0.01" value={l.desconto} onChange={(e) => updateLine(l.uid, { desconto: Math.max(0, Number(e.target.value) || 0) })} className="h-8 w-24 text-right text-sm ml-auto" />
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(Math.max(0, l.precoUnitario * l.quantidade - l.desconto))}</TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-1">
                                    {!l.isAvulso && (
                                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Trocar produto" onClick={() => { setSwapTarget(l.uid); setBuscaProduto(""); setResultados([]) }}>
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Remover" onClick={() => removeLine(l.uid)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Adicionar produto / item avulso */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative flex-1 min-w-[220px]">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="pl-8 h-9 text-sm"
                            placeholder={swapTarget ? "Buscar produto para TROCAR…" : "Buscar produto para adicionar…"}
                            value={buscaProduto}
                            onChange={(e) => { setBuscaProduto(e.target.value); void buscarProdutos(e.target.value) }}
                          />
                        </div>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={addAvulso}>
                          <Plus className="h-3.5 w-3.5" /> Item avulso
                        </Button>
                        {swapTarget && (
                          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { setSwapTarget(null); setBuscaProduto(""); setResultados([]) }}>Cancelar troca</Button>
                        )}
                      </div>
                      {(buscando || resultados.length > 0) && (
                        <Card className="border-border bg-popover min-w-0">
                          <CardContent className="p-1 max-h-52 overflow-y-auto">
                            {buscando ? (
                              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</div>
                            ) : resultados.map((p) => (
                              <button key={p.id} type="button" onClick={() => pickProduto(p)} className="w-full text-left px-3 py-2 rounded-md hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-3 text-sm">
                                <span className="min-w-0 break-words">{p.name}{p.sku ? <span className="text-[10px] text-muted-foreground ml-1.5">{p.sku}</span> : null}</span>
                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtBrl(p.price)} · estq {p.stock}</span>
                              </button>
                            ))}
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Resumo / Preview */}
                    <Card className="border-border bg-card min-w-0">
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total anterior</span>
                          <span className="tabular-nums text-foreground">{fmtBrl(venda.total)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Total novo</span>
                          <span className="tabular-nums font-semibold text-foreground">{fmtBrl(draftTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Diferença</span>
                          <span className={cn("tabular-nums font-semibold", draftTotal - venda.total > 0 ? "text-success" : draftTotal - venda.total < 0 ? "text-destructive" : "text-foreground")}>
                            {draftTotal - venda.total >= 0 ? "+" : ""}{fmtBrl(draftTotal - venda.total)}
                          </span>
                        </div>
                        {draftPlan && !draftPlan.ok && draftPlan.errorCode !== "no_change" && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {draftPlan.error}
                          </div>
                        )}
                        {draftPlan?.ok && draftPlan.stockDeltas.length > 0 && (
                          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs space-y-1">
                            <p className="font-semibold text-muted-foreground flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Impacto no estoque</p>
                            {draftPlan.stockDeltas.map((d) => (
                              <p key={d.inventoryId} className="text-foreground flex items-center justify-between">
                                <span className="break-words">{d.nome}</span>
                                <span className={cn("tabular-nums", d.deltaQty > 0 ? "text-destructive" : "text-success")}>
                                  {d.deltaQty > 0 ? `baixar ${d.deltaQty}` : `devolver ${-d.deltaQty}`}
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                        {draftPlan?.ok && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Banknote className="h-3.5 w-3.5" /> Caixa (dinheiro): {fmtBrl(draftPlan.oldBreakdown.dinheiro)} → {fmtBrl(draftPlan.newBreakdown.dinheiro)}
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Confirmação: motivo + PIN */}
                    {showConfirm && draftPlan?.ok && (
                      <Card className="border-primary/30 bg-primary/5 min-w-0">
                        <CardContent className="pt-4 space-y-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-foreground">Motivo da correção <span className="text-destructive">*</span></Label>
                            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="min-h-[60px] resize-none bg-background text-sm" placeholder="Descreva o motivo (obrigatório)…" disabled={applying} />
                          </div>
                          <div className="space-y-1.5 max-w-[220px]">
                            <Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN do supervisor <span className="text-destructive">*</span></Label>
                            <Input type="password" inputMode="numeric" maxLength={12} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="h-9 bg-background font-mono tracking-widest" placeholder="PIN numérico" disabled={applying} />
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Ações */}
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={resetEdicao} disabled={applying}>Cancelar edição</Button>
                      {!showConfirm ? (
                        <Button size="sm" className="gap-1.5" disabled={!draftPlan?.ok} onClick={() => setShowConfirm(true)}>
                          <Calculator className="h-4 w-4" /> Pré-visualizar correção
                        </Button>
                      ) : (
                        <Button size="sm" className="gap-1.5" disabled={applying || !draftPlan?.ok || !motivo.trim() || !pin.trim()} onClick={() => void aplicarCorrecaoItens()}>
                          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {applying ? "Aplicando…" : "Aplicar correção"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* 6 · AUDITORIA */}
              <TabsContent value="auditoria" className="mt-0">
                {venda.correcoes.length > 0 ? (
                  <ul className="space-y-3">
                    {venda.correcoes.map((c, i) => (
                      <li key={i} className="rounded-xl border border-border bg-card p-4 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px] border-info/30 bg-info/10 text-info">{c.campos.join(", ") || "correção"}</Badge>
                            <span className="text-sm font-medium text-foreground">{c.operador}</span>
                            {c.supervisorNome && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Supervisor: {c.supervisorNome}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDateTime(c.at)}</span>
                        </div>
                        {c.pagamentoAnterior !== undefined && (
                          <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">
                            <span className="line-through text-muted-foreground">{c.pagamentoAnterior}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{c.pagamentoNovo}</span>
                          </p>
                        )}
                        {c.clienteAnterior !== undefined && (
                          <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">
                            <span className="line-through text-muted-foreground">{c.clienteAnterior ?? "—"}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{c.clienteNovo ?? "—"}</span>
                          </p>
                        )}
                        {c.observacaoAnterior !== undefined && (
                          <p className="text-sm text-foreground flex items-center gap-2 flex-wrap">
                            <span className="line-through text-muted-foreground">{c.observacaoAnterior ?? "—"}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{c.observacaoNova ?? "—"}</span>
                          </p>
                        )}
                        {c.financeiro && (
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 rounded-lg bg-muted/20 p-2.5 text-xs sm:grid-cols-3">
                            <span className="text-muted-foreground">Caixa: <span className="text-foreground">{fmtBrl(c.financeiro.caixaAnterior ?? 0)} → {fmtBrl(c.financeiro.caixaNovo ?? 0)}</span></span>
                            <span className="text-muted-foreground">À prazo: <span className="text-foreground">{fmtBrl(c.financeiro.aPrazoAnterior ?? 0)} → {fmtBrl(c.financeiro.aPrazoNovo ?? 0)}</span></span>
                            <span className="text-muted-foreground">Vale: <span className="text-foreground">{fmtBrl(c.financeiro.creditoValeAnterior ?? 0)} → {fmtBrl(c.financeiro.creditoValeNovo ?? 0)}</span></span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2"><span className="font-medium text-foreground">Motivo:</span> {c.motivo}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={ShieldCheck} title="Sem correções" hint="Esta venda nunca foi corrigida." />
                )}
              </TabsContent>

              {/* 7 · CONTA A RECEBER */}
              <TabsContent value="receber" className="mt-0">
                {venda.titulos.length > 0 ? (
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="text-foreground">Título</TableHead>
                            <TableHead className="text-foreground">Vencimento</TableHead>
                            <TableHead className="text-foreground text-right">Valor</TableHead>
                            <TableHead className="text-foreground text-right">Pago</TableHead>
                            <TableHead className="text-foreground">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {venda.titulos.map((t) => {
                            const b = statusTituloBadge(t.status)
                            return (
                              <TableRow key={t.id} className="border-border">
                                <TableCell className="text-foreground break-words max-w-[360px]">{t.descricao}</TableCell>
                                <TableCell className="text-foreground whitespace-nowrap">{t.vencimento || "—"}</TableCell>
                                <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(t.valor)}</TableCell>
                                <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(t.pago)}</TableCell>
                                <TableCell><Badge variant="outline" className={cn("text-[10px]", b.className)}>{b.label}</Badge></TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState icon={FileText} title="Sem títulos a receber" hint="Venda à vista — não gerou contas a receber." />
                )}
              </TabsContent>

              {/* 8 · CAIXA */}
              <TabsContent value="caixa" className="mt-0">
                {venda.sessao ? (
                  <Card className="border-border bg-card max-w-2xl min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Sessão de caixa</p>
                      <FieldRow label="Sessão" value={venda.sessao.id} mono />
                      <FieldRow label="Operador" value={venda.sessao.operador || "—"} />
                      <FieldRow
                        label="Status"
                        value={
                          <Badge variant="outline" className={cn("text-[10px]", venda.sessao.status === "ABERTA" ? "border-success/20 bg-success/10 text-success" : "border-muted bg-muted/30 text-muted-foreground")}>
                            {venda.sessao.status}
                          </Badge>
                        }
                      />
                      <FieldRow label="Aberta em" value={fmtDateTime(venda.sessao.abertaEm)} />
                      <FieldRow label="Fechada em" value={fmtDateTime(venda.sessao.fechadaEm)} />
                      <FieldRow label="Saldo inicial" value={fmtBrl(venda.sessao.saldoInicial)} />
                    </CardContent>
                  </Card>
                ) : (
                  <EmptyState icon={Wallet} title="Sem sessão de caixa" hint={venda.sessaoId ? "A sessão vinculada não foi encontrada." : "Esta venda não registrou sessão de caixa."} />
                )}
              </TabsContent>

              {/* 9 · HISTÓRICO (timeline + devoluções + cancelamento) */}
              <TabsContent value="historico" className="mt-0 space-y-6">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Linha do tempo</p>
                  <Timeline items={timeline} />
                </div>
                {venda.canceladaEm && (
                  <Card className="border-destructive/20 bg-destructive/5 min-w-0">
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold text-destructive mb-2">Cancelamento</p>
                      <FieldRow label="Cancelada em" value={fmtDateTime(venda.canceladaEm)} />
                      <FieldRow label="Por" value={venda.canceladaPor || "—"} />
                      <FieldRow label="Motivo" value={venda.motivoCancelamento || "—"} />
                      <FieldRow label="Estoque reposto" value={venda.estoqueReposto ? "Sim" : "Não"} />
                      <FieldRow label="Estorno financeiro" value={venda.estornoFinanceiro ? "Sim" : "Não"} />
                    </CardContent>
                  </Card>
                )}
                {venda.devolucoes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Devoluções / trocas</p>
                    <ul className="space-y-2">
                      {venda.devolucoes.map((d) => (
                        <li key={d.id} className="rounded-lg border border-border bg-card p-3 text-sm min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{d.localId} · {d.tipo}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{fmtDateTime(d.at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{fmtBrl(d.valorTotal)} · {d.operador}{d.motivo ? ` · ${d.motivo}` : ""}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
