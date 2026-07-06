"use client"

/**
 * Workspace Enterprise de Correção de Venda.
 *
 * Apresenta a venda em 9 abas estilo ERP (resumo, cliente, pagamento, financeiro,
 * produtos, auditoria, conta a receber, caixa e histórico) e concentra as correções
 * pós-venda — todas auditadas; as sensíveis (itens, pagamento, cliente, título) exigem
 * PIN de supervisor, a observação da venda (não-sensível) não. Este arquivo é a camada
 * de apresentação; a lógica vive nos planners/serviços e nas rotas de correção.
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
import { computeCorrecaoPagamentoPlan } from "@/lib/financeiro/correcao-pagamento-plan"
import { parseVencimentoBr } from "@/lib/vendas/correcao-cliente-titulo-plan"
import { computeParcelamentoPlan } from "@/lib/vendas/correcao-parcelamento-plan"
import { avulsoInventoryId } from "@/lib/os-pdv-virtual-lines"
import { listClientes } from "@/app/actions/cadastros"

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
  itens: Array<{ id: string; inventoryId: string | null; nome: string; quantidade: number; precoUnitario: number; lineTotal: number; metadata?: Record<string, string> | null }>
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

// Humaniza a "origem" técnica das movimentações financeiras (UX — não muda dado).
const ORIGEM_LABELS: Record<string, string> = {
  venda: "Venda", "os-faturamento": "Faturamento de OS", devolucao: "Devolução",
  cancelamento_pdv: "Cancelamento", estorno: "Estorno", credito_cliente: "Crédito do cliente",
  recebimento: "Recebimento", "pdv-aprazo": "À prazo",
}
function fmtOrigem(o: string) {
  if (!o) return "—"
  const known = ORIGEM_LABELS[o]
  if (known) return known
  // Fallback legível: troca separadores técnicos por espaço e capitaliza.
  const s = o.replace(/[-_:]+/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—"
}

// Tons de status — uma única paleta para TODOS os badges (mesmo tamanho, padding,
// radius, peso). Só tokens semânticos do tema (sem cor fixa).
type BadgeTone = "success" | "warning" | "info" | "destructive" | "muted"
const BADGE_TONES: Record<BadgeTone, { box: string; dot: string }> = {
  success: { box: "border-success/30 bg-success/10 text-success", dot: "bg-success" },
  warning: { box: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
  info: { box: "border-info/30 bg-info/10 text-info", dot: "bg-info" },
  destructive: { box: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  muted: { box: "border-border bg-muted/40 text-muted-foreground", dot: "bg-muted-foreground" },
}

/** Badge de status padronizado (pílula). `dot` adiciona o ponto colorido (ex.: ● Aberta). */
function StatusBadge({ label, tone, dot }: { label: string; tone: BadgeTone; dot?: boolean }) {
  const t = BADGE_TONES[tone]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none", t.box)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />}
      {label}
    </span>
  )
}

function statusVendaBadge(s: string): { label: string; tone: BadgeTone } {
  if (s === "cancelada") return { label: "Cancelada", tone: "destructive" }
  if (s === "devolvida" || s === "parcialmente_devolvida")
    return { label: s === "devolvida" ? "Devolvida" : "Dev. Parcial", tone: "warning" }
  return { label: "Concluída", tone: "success" }
}

function statusTituloBadge(s: string | null): { label: string; tone: BadgeTone } {
  const v = (s ?? "").toLowerCase()
  if (v === "pago") return { label: "Pago", tone: "success" }
  if (v === "parcial") return { label: "Parcial", tone: "info" }
  if (v === "cancelado" || v === "estornado")
    return { label: v === "cancelado" ? "Cancelado" : "Estornado", tone: "muted" }
  return { label: "Pendente", tone: "warning" }
}

// ── Primitivos de UI internos ────────────────────────────────────────────────────

/** Cabeçalho de seção padronizado: ícone coerente + título (hierarquia única). */
function SectionTitle({ icon: Icon, children, tone, className }: { icon: typeof Info; children: React.ReactNode; tone?: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-sm font-semibold text-foreground", className)}>
      <Icon className={cn("h-4 w-4 shrink-0", tone ?? "text-muted-foreground")} />
      {children}
    </p>
  )
}

function EmptyState({ icon: Icon, title, hint }: { icon: typeof Info; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center min-w-0">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>}
    </div>
  )
}

/**
 * Campo rótulo→valor empilhado (label em cima, valor embaixo). Substitui o antigo
 * FieldRow `justify-between` que "estranhava" rótulo e valor em cards largos.
 * Empilhado + `tabular-nums` mantém os valores alinhados na coluna e os rótulos
 * sem quebra estranha. Pensado para viver dentro de <StatGrid>.
 */
function StatField({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className={cn("text-sm font-medium text-foreground tabular-nums break-words", mono && "font-mono text-xs font-normal text-muted-foreground")}>
        {value}
      </div>
    </div>
  )
}

/** Grade responsiva de StatField: 2 colunas a partir de `sm` para aproveitar a largura. */
function StatGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-x-6 gap-y-3", cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
      {children}
    </div>
  )
}

function KpiCard({ label, value, tone = "text-foreground", icon: Icon }: { label: string; value: string; tone?: string; icon: typeof Info }) {
  return (
    <Card className="border-border bg-card min-w-0">
      <CardContent className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/40">
          <Icon className={cn("h-4 w-4", tone)} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className={cn("text-lg font-bold leading-tight truncate tabular-nums", tone)}>{value}</p>
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

  // ════════════════════════════════════════════════════════════════════════════
  // F3 — Pagamento / Cliente / Conta a Receber (editáveis)
  // ════════════════════════════════════════════════════════════════════════════
  const FORMS: Array<{ key: keyof PaymentBreakdownFull; label: string }> = [
    { key: "dinheiro", label: "Dinheiro" }, { key: "pix", label: "Pix" },
    { key: "cartaoDebito", label: "Débito" }, { key: "cartaoCredito", label: "Crédito" },
    { key: "carne", label: "Carnê" }, { key: "aPrazo", label: "A Prazo" },
    { key: "creditoVale", label: "Vale/Crédito" },
  ]

  // ── Pagamento ────────────────────────────────────────────────────────────────
  const [editPag, setEditPag] = useState(false)
  const [pagDraft, setPagDraft] = useState<Record<string, number>>({})
  const [pagVenc, setPagVenc] = useState("")
  const [pagMotivo, setPagMotivo] = useState("")
  const [pagPin, setPagPin] = useState("")
  const [pagConfirm, setPagConfirm] = useState(false)
  const [pagApplying, setPagApplying] = useState(false)

  const startEditPag = useCallback(() => {
    if (!venda) return
    const pb = venda.paymentBreakdown ?? {}
    const seed: Record<string, number> = {}
    for (const f of FORMS) seed[f.key] = Number(pb[f.key]) || 0
    setPagDraft(seed)
    setPagVenc("")
    setPagMotivo(""); setPagPin(""); setPagConfirm(false); setEditPag(true)
  }, [venda]) // eslint-disable-line react-hooks/exhaustive-deps

  const pagSoma = useMemo(() => Math.round(Object.values(pagDraft).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100, [pagDraft])
  const pagPlan = useMemo(() => {
    if (!venda || !editPag) return null
    return computeCorrecaoPagamentoPlan({ total: venda.total, oldBreakdown: venda.paymentBreakdown, newBreakdown: pagDraft })
  }, [venda, editPag, pagDraft])
  const pagAPrazo = Number(pagDraft.aPrazo) || 0
  const pagPrecisaCliente = pagAPrazo > 0.005 && !(venda?.clienteNome ?? "").trim()
  const pagPrecisaVenc = pagAPrazo > 0.005

  const aplicarPag = useCallback(async () => {
    if (!venda || !pagPlan?.ok || !pagMotivo.trim() || !pagPin.trim()) return
    if (pagPrecisaCliente) { toast({ title: "Cliente obrigatório", description: "Venda à prazo exige cliente. Vincule na aba Cliente.", variant: "destructive" }); return }
    if (pagPrecisaVenc && !parseVencimentoBr(pagVenc).ok) { toast({ title: "Vencimento inválido", description: "Informe o vencimento DD/MM/AAAA do saldo a prazo.", variant: "destructive" }); return }
    setPagApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({
          motivo: pagMotivo.trim(), supervisorPin: pagPin.trim(),
          novaFormaPagamento: pagDraft,
          ...(pagPrecisaVenc ? { aPrazoVencimento: pagVenc.trim() } : {}),
        }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Pagamento não corrigido", description: data.error ?? "Falha.", variant: "destructive" }); return }
      toast({ title: "Pagamento corrigido", description: "Reconciliação financeira aplicada." })
      setEditPag(false); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setPagApplying(false) }
  }, [venda, pagPlan, pagMotivo, pagPin, pagDraft, pagVenc, pagPrecisaCliente, pagPrecisaVenc, storeId, toast, load])

  // ── Cliente ──────────────────────────────────────────────────────────────────
  const [editCli, setEditCli] = useState(false)
  const [cliBusca, setCliBusca] = useState("")
  const [cliLista, setCliLista] = useState<Array<{ id: string; nome: string; documento?: string }>>([])
  const [cliLoading, setCliLoading] = useState(false)
  const [cliSelId, setCliSelId] = useState<string | null>(null)
  const [cliSelNome, setCliSelNome] = useState("")
  const [cliMotivo, setCliMotivo] = useState("")
  const [cliPin, setCliPin] = useState("")
  const [cliApplying, setCliApplying] = useState(false)
  const [qcOpen, setQcOpen] = useState(false)
  const [qcNome, setQcNome] = useState("")
  const [qcFone, setQcFone] = useState("")
  const [qcDoc, setQcDoc] = useState("")
  const [qcSaving, setQcSaving] = useState(false)

  const vendaTemAPrazo = useMemo(() => {
    if (!venda) return false
    return (venda.titulos ?? []).some((t) => {
      const s = (t.status ?? "").toLowerCase()
      return s !== "cancelado" && s !== "estornado"
    }) || (Number(venda.paymentBreakdown?.aPrazo) || 0) > 0.005
  }, [venda])

  const startEditCli = useCallback(() => {
    if (!venda) return
    setCliSelId(venda.clienteId ?? null)
    setCliSelNome(venda.clienteNome ?? "")
    setCliBusca(venda.clienteNome ?? "")
    setCliMotivo(""); setCliPin(""); setEditCli(true); setQcOpen(false)
    setCliLoading(true)
    listClientes(storeId).then((d) => setCliLista((d || []).map((c: Record<string, unknown>) => ({ id: String(c.id), nome: String(c.nome ?? c.name ?? ""), documento: (c.documento as string) ?? (c.document as string) ?? undefined })))).catch(() => setCliLista([])).finally(() => setCliLoading(false))
  }, [venda, storeId])

  const criarClienteRapido = useCallback(async () => {
    if (!qcNome.trim()) return
    setQcSaving(true)
    try {
      const res = await fetch(`/api/clientes/quick`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ name: qcNome.trim(), phone: qcFone.trim() || undefined, document: qcDoc.trim() || undefined }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Cadastro não concluído", description: data.error ?? "Falha.", variant: "destructive" }); return }
      const c = data.cliente
      setCliSelId(c.id); setCliSelNome(c.name); setCliBusca(c.name)
      setCliLista((cur) => [{ id: c.id, nome: c.name, documento: c.document }, ...cur])
      setQcOpen(false); setQcNome(""); setQcFone(""); setQcDoc("")
      toast({ title: "Cliente cadastrado", description: c.name })
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setQcSaving(false) }
  }, [qcNome, qcFone, qcDoc, storeId, toast])

  const limpandoCliente = !cliSelId && !cliSelNome.trim()
  const cliBloqueiaLimpar = limpandoCliente && vendaTemAPrazo

  const aplicarCli = useCallback(async () => {
    if (!venda || !cliMotivo.trim() || !cliPin.trim()) return
    if (cliBloqueiaLimpar) { toast({ title: "Cliente obrigatório", description: "Venda com saldo a prazo não pode ficar sem cliente.", variant: "destructive" }); return }
    setCliApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ motivo: cliMotivo.trim(), supervisorPin: cliPin.trim(), novoClienteId: cliSelId, novoClienteNome: cliSelNome.trim() || null }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Cliente não corrigido", description: data.error ?? "Falha.", variant: "destructive" }); return }
      toast({ title: "Cliente atualizado", description: cliSelNome || "Consumidor final" })
      setEditCli(false); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setCliApplying(false) }
  }, [venda, cliMotivo, cliPin, cliSelId, cliSelNome, cliBloqueiaLimpar, storeId, toast, load])

  // ── Conta a Receber (vencimento/observação) ───────────────────────────────────
  const [editTitId, setEditTitId] = useState<string | null>(null)
  const [titVenc, setTitVenc] = useState("")
  const [titObs, setTitObs] = useState("")
  const [titMotivo, setTitMotivo] = useState("")
  const [titPin, setTitPin] = useState("")
  const [titApplying, setTitApplying] = useState(false)

  const startEditTitulo = useCallback((t: Titulo) => {
    setEditTitId(t.id); setTitVenc(t.vencimento || ""); setTitObs(""); setTitMotivo(""); setTitPin("")
  }, [])

  // ── F4: Reparcelamento ─────────────────────────────────────────────────────
  const [reparcOpen, setReparcOpen] = useState(false)
  const [reparcN, setReparcN] = useState(1)
  const [reparcVenc, setReparcVenc] = useState("")
  const [reparcInterv, setReparcInterv] = useState(30)
  const [reparcMotivo, setReparcMotivo] = useState("")
  const [reparcPin, setReparcPin] = useState("")
  const [reparcApplying, setReparcApplying] = useState(false)

  const aPrazoValor = useMemo(() => Number(venda?.paymentBreakdown?.aPrazo) || 0, [venda])
  const reparcPlan = useMemo(() => {
    if (!venda || !reparcOpen || aPrazoValor <= 0.005) return null
    return computeParcelamentoPlan({ pedidoId: venda.id, totalAPrazo: aPrazoValor, parcelas: reparcN, primeiroVencimento: reparcVenc || undefined, intervaloDias: reparcInterv })
  }, [venda, reparcOpen, aPrazoValor, reparcN, reparcVenc, reparcInterv])

  const startReparc = useCallback(() => {
    if (!venda) return
    const t0 = venda.titulos.find((t) => { const s = (t.status ?? "").toLowerCase(); return s !== "cancelado" && s !== "estornado" })
    setReparcN(venda.titulos.filter((t) => { const s = (t.status ?? "").toLowerCase(); return s !== "cancelado" && s !== "estornado" }).length || 1)
    setReparcVenc(t0?.vencimento ?? "")
    setReparcInterv(30); setReparcMotivo(""); setReparcPin(""); setReparcOpen(true)
  }, [venda])

  const aplicarReparc = useCallback(async () => {
    if (!venda || !reparcPlan?.ok || !reparcMotivo.trim() || !reparcPin.trim()) return
    setReparcApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir-parcelas`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ motivo: reparcMotivo.trim(), supervisorPin: reparcPin.trim(), parcelas: reparcN, primeiroVencimento: reparcVenc.trim(), intervaloDias: reparcInterv }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Reparcelamento não aplicado", description: data.error ?? "Falha.", variant: "destructive" }); return }
      toast({ title: "Reparcelado", description: `${data.parcelas} parcela(s) geradas.` })
      setReparcOpen(false); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setReparcApplying(false) }
  }, [venda, reparcPlan, reparcMotivo, reparcPin, reparcN, reparcVenc, reparcInterv, storeId, toast, load])

  // ── F4: Dados do cliente vinculado (CPF/telefone/e-mail) — reusa PATCH /api/clientes/[id]
  const [editCliDados, setEditCliDados] = useState(false)
  const [cdNome, setCdNome] = useState("")
  const [cdDoc, setCdDoc] = useState("")
  const [cdFone, setCdFone] = useState("")
  const [cdEmail, setCdEmail] = useState("")
  const [cdSaving, setCdSaving] = useState(false)

  const startEditCliDados = useCallback(() => {
    const c = venda?.clienteCompleto
    if (!c) return
    setCdNome(c.name); setCdDoc(c.document || ""); setCdFone(c.phone || ""); setCdEmail(c.email || ""); setEditCliDados(true)
  }, [venda])

  const salvarCliDados = useCallback(async () => {
    if (!venda?.clienteCompleto) return
    setCdSaving(true)
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(venda.clienteCompleto.id)}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ name: cdNome.trim(), phone: cdFone.trim(), email: cdEmail.trim() || null, document: cdDoc.trim() }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Dados não salvos", description: data.error ?? "Falha (telefone válido é obrigatório).", variant: "destructive" }); return }
      toast({ title: "Dados do cliente atualizados", description: cdNome })
      setEditCliDados(false); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setCdSaving(false) }
  }, [venda, cdNome, cdDoc, cdFone, cdEmail, storeId, toast, load])

  // ── F4: Metadados do item (serial/IMEI/lote/garantia/observação)
  const [metaIdx, setMetaIdx] = useState<number | null>(null)
  const [metaVals, setMetaVals] = useState<Record<string, string>>({})
  const [metaMotivo, setMetaMotivo] = useState("")
  const [metaPin, setMetaPin] = useState("")
  const [metaSaving, setMetaSaving] = useState(false)

  const startMeta = useCallback((idx: number, atual?: Record<string, string> | null) => {
    setMetaIdx(idx)
    setMetaVals({ observacao: atual?.observacao ?? "", garantia: atual?.garantia ?? "", serial: atual?.serial ?? "", imei: atual?.imei ?? "", lote: atual?.lote ?? "" })
    setMetaMotivo(""); setMetaPin("")
  }, [])

  const salvarMeta = useCallback(async () => {
    if (!venda || metaIdx === null || !metaMotivo.trim() || !metaPin.trim()) return
    setMetaSaving(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir-item-meta`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ itemIndex: metaIdx, motivo: metaMotivo.trim(), supervisorPin: metaPin.trim(), metadata: metaVals }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Detalhes não salvos", description: data.error ?? "Falha.", variant: "destructive" }); return }
      toast({ title: "Detalhes salvos", description: "Sem impacto em estoque/financeiro." })
      setMetaIdx(null); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setMetaSaving(false) }
  }, [venda, metaIdx, metaMotivo, metaPin, metaVals, storeId, toast, load])

  // ── Observação da venda (sem PIN — campo não-sensível) ───────────────────────
  // Consolida no Workspace a única correção que vivia só no modal antigo. Não toca
  // itens/total/estoque/financeiro: grava apenas payload.observacao via /corrigir.
  const [editObs, setEditObs] = useState(false)
  const [obsDraft, setObsDraft] = useState("")
  const [obsMotivo, setObsMotivo] = useState("")
  const [obsApplying, setObsApplying] = useState(false)

  const startEditObs = useCallback(() => {
    setObsDraft(venda?.observacao ?? "")
    setObsMotivo("")
    setEditObs(true)
  }, [venda])

  const aplicarObs = useCallback(async () => {
    if (!venda || !obsMotivo.trim()) return
    const atual = (venda.observacao ?? "").trim()
    const novo = obsDraft.trim()
    // no_change: nada a aplicar — feedback neutro (nunca toast de erro).
    if (atual === novo) {
      toast({ title: "Nenhuma alteração", description: "A observação não foi modificada." })
      setEditObs(false)
      return
    }
    setObsApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ motivo: obsMotivo.trim(), novaObservacao: novo || null }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Observação não corrigida", description: data.error ?? "Falha.", variant: "destructive" }); return }
      if (data.naoAlterado) toast({ title: "Nenhuma alteração", description: "A observação não foi modificada." })
      else toast({ title: "Observação atualizada", description: "Sem impacto em estoque/financeiro." })
      setEditObs(false); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setObsApplying(false) }
  }, [venda, obsMotivo, obsDraft, storeId, toast, load])

  // Limpa edições F3/F4 ao (re)abrir ou trocar de venda.
  useEffect(() => {
    setEditPag(false); setEditCli(false); setEditTitId(null); setPagConfirm(false); setQcOpen(false)
    setReparcOpen(false); setEditCliDados(false); setMetaIdx(null); setEditObs(false)
  }, [open, vendaId])

  const aplicarTitulo = useCallback(async () => {
    if (!venda || !editTitId || !titMotivo.trim() || !titPin.trim()) return
    if (titVenc.trim() && !parseVencimentoBr(titVenc).ok) { toast({ title: "Vencimento inválido", description: "Use DD/MM/AAAA.", variant: "destructive" }); return }
    setTitApplying(true)
    try {
      const res = await fetch(`/api/vendas/${encodeURIComponent(venda.id)}/corrigir-titulo`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": storeId },
        body: JSON.stringify({ tituloId: editTitId, motivo: titMotivo.trim(), supervisorPin: titPin.trim(), ...(titVenc.trim() ? { novoVencimento: titVenc.trim() } : {}), novaObservacao: titObs.trim() || null }),
      })
      const data = await res.json()
      if (!data.ok) { toast({ title: "Título não corrigido", description: data.error ?? "Falha.", variant: "destructive" }); return }
      toast({ title: "Título atualizado", description: "Conta a receber corrigida." })
      setEditTitId(null); await load()
    } catch { toast({ title: "Erro", description: "Falha de conexão.", variant: "destructive" }) }
    finally { setTitApplying(false) }
  }, [venda, editTitId, titMotivo, titPin, titVenc, titObs, storeId, toast, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w é obrigatório: o Dialog global aplica sm:max-w-lg (512px) e vence
          qualquer max-w-* sem variante em telas ≥640px — sem isso o Workspace inteiro
          renderiza esmagado a 512px. */}
      <DialogContent className="w-[96vw] max-w-[1680px] sm:max-w-[1680px] h-[94vh] rounded-2xl p-0 gap-0 border-border bg-background flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 space-y-0">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2 flex-wrap leading-tight">
                Workspace da Venda
                {statusBadge && <StatusBadge label={statusBadge.label} tone={statusBadge.tone} dot />}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                {venda ? <>{fmtDateTime(venda.at)} · {venda.operador || "Operador —"} · Cupom {venda.id}</> : "Carregando…"}
              </DialogDescription>
            </div>
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <Badge variant="outline" className="gap-1 border-info/30 bg-info/10 text-info text-[10px]">
                <ShieldCheck className="h-3 w-3" /> Alterações auditadas
              </Badge>
              {venda && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">Total</p>
                  <p className="text-lg font-bold text-foreground tabular-nums leading-tight mt-0.5">{fmtBrl(venda.total)}</p>
                </div>
              )}
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
            <div className="shrink-0 border-b border-border px-4 sm:px-6 overflow-x-auto">
              <TabsList className="h-auto bg-transparent p-0 gap-1 flex-nowrap justify-start">
                {TABS.map((t) => {
                  // Contador por aba: o operador vê onde há conteúdo sem precisar clicar.
                  const count =
                    t.key === "produtos" ? venda.itens.length
                    : t.key === "auditoria" ? venda.correcoes.length
                    : t.key === "receber" ? venda.titulos.length
                    : t.key === "financeiro" ? venda.movimentacoesFinanceiras.length
                    : 0
                  return (
                    <TabsTrigger
                      key={t.key}
                      value={t.key}
                      className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                    >
                      <t.icon className="h-4 w-4" />
                      {t.label}
                      {count > 0 && (
                        <span className="ml-0.5 inline-flex items-center rounded-full border border-border bg-muted/60 px-1.5 py-px text-[10px] font-semibold leading-none tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 min-h-0">
              {/* Venda cancelada → ficha somente leitura. Sinaliza por que os botões de
                  correção não aparecem (eles já estão ocultos por status === "cancelada"). */}
              {venda.status === "cancelada" && (
                <div className="mb-5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Venda cancelada — ficha em modo somente leitura. As correções estão desabilitadas; o histórico e os detalhes seguem disponíveis para consulta.</span>
                </div>
              )}
              {/* 1 · RESUMO */}
              <TabsContent value="resumo" className="mt-0 space-y-5">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <KpiCard label="Valor total" value={fmtBrl(venda.total)} tone="text-primary" icon={Receipt} />
                  <KpiCard label="Recebido" value={fmtBrl(sf?.entradaLiquida ?? 0)} tone="text-success" icon={Banknote} />
                  <KpiCard label="À receber" value={fmtBrl(sf?.aPrazoAberto ?? 0)} tone="text-warning" icon={Clock} />
                  <KpiCard label="Vale / crédito" value={fmtBrl(sf?.creditoValeUsado ?? 0)} tone="text-info" icon={Wallet} />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="space-y-4">
                      <SectionTitle icon={Receipt}>Dados da venda</SectionTitle>
                      <StatGrid>
                        <StatField label="Cupom" value={venda.id} mono />
                        <StatField label="Data / hora" value={fmtDateTime(venda.at)} />
                        <StatField label="Operador" value={venda.operador || "—"} />
                        <StatField label="Terminal" value={venda.terminal?.name || venda.terminal?.code || "Sem terminal"} />
                        <StatField label="Cliente" value={venda.clienteNome || "Consumidor final"} />
                        <StatField label="Formas de pagamento" value={venda.pagamentos.map((p) => `${p.label} ${fmtBrl(p.valor)}`).join(" · ") || "—"} />
                      </StatGrid>
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="space-y-4">
                      <SectionTitle icon={Landmark}>Status financeiro</SectionTitle>
                      {sf ? (
                        <StatGrid>
                          <StatField label="Recebido à vista (líquido)" value={fmtBrl(sf.entradaLiquida)} />
                          <StatField label="À prazo (total)" value={fmtBrl(sf.aPrazoTotal)} />
                          <StatField label="À prazo pago" value={fmtBrl(sf.aPrazoPago)} />
                          <StatField label="Vale/crédito usado" value={fmtBrl(sf.creditoValeUsado)} />
                          <StatField label="Desconto" value={fmtBrl(venda.desconto)} />
                          <StatField label="Estornado" value={fmtBrl(sf.estornado)} />
                          <StatField
                            label="Conciliação"
                            value={
                              <span className={cn("inline-flex items-center gap-1", sf.conciliado ? "text-success" : "text-warning")}>
                                {sf.conciliado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                {sf.conciliado ? "Conciliado" : "Verificar"}
                              </span>
                            }
                          />
                        </StatGrid>
                      ) : (
                        <EmptyState icon={Landmark} title="Sem status financeiro" />
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Observação da venda (editável — sem PIN, não-sensível) */}
                <Card className="border-border bg-card min-w-0">
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <SectionTitle icon={FileText}>Observação da venda</SectionTitle>
                      {venda.status !== "cancelada" && !editObs && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditObs}><Pencil className="h-3.5 w-3.5" /> Editar observação</Button>
                      )}
                    </div>
                    {!editObs ? (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {venda.observacao?.trim()
                          ? <span className="text-foreground">{venda.observacao}</span>
                          : <span className="text-muted-foreground">Nenhuma observação registrada.</span>}
                      </p>
                    ) : (
                      <div className="space-y-3 max-w-2xl">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> A observação não afeta itens, total, estoque ou financeiro — por isso não exige PIN.</p>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Nova observação</Label>
                          <Textarea className="min-h-[80px] resize-none bg-background text-sm" placeholder="Observação (ou vazio para remover)" value={obsDraft} onChange={(e) => setObsDraft(e.target.value)} disabled={obsApplying} />
                        </div>
                        <div className="space-y-1.5"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[56px] resize-none bg-background text-sm" value={obsMotivo} onChange={(e) => setObsMotivo(e.target.value)} disabled={obsApplying} /></div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditObs(false)} disabled={obsApplying}>Cancelar</Button>
                          <Button size="sm" className="gap-1.5" disabled={obsApplying || !obsMotivo.trim() || (venda.observacao ?? "").trim() === obsDraft.trim()} onClick={() => void aplicarObs()}>{obsApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {obsApplying ? "Aplicando…" : "Aplicar correção"}</Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* 2 · CLIENTE (editável — F3) */}
              <TabsContent value="cliente" className="mt-0 space-y-4">
                {!editCli ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Trocar o cliente exige motivo e PIN. Venda à prazo sempre exige cliente.</p>
                      {venda.status !== "cancelada" && (
                        <div className="flex gap-2">
                          {venda.clienteCompleto && !editCliDados && (
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditCliDados}><Pencil className="h-3.5 w-3.5" /> Editar dados</Button>
                          )}
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditCli}><RotateCcw className="h-3.5 w-3.5" /> Trocar cliente</Button>
                        </div>
                      )}
                    </div>
                    {venda.clienteCompleto ? (
                      editCliDados ? (
                        <Card className="border-primary/30 bg-primary/5 max-w-2xl min-w-0">
                          <CardContent className="pt-4 space-y-2">
                            <p className="text-xs font-semibold text-foreground">Editar dados do cliente (CPF/telefone/e-mail)</p>
                            <Input className="h-9 text-sm" placeholder="Nome *" value={cdNome} onChange={(e) => setCdNome(e.target.value)} disabled={cdSaving} />
                            <div className="flex gap-2 flex-wrap">
                              <Input className="h-9 text-sm flex-1 min-w-[140px]" placeholder="CPF/CNPJ" value={cdDoc} onChange={(e) => setCdDoc(e.target.value)} disabled={cdSaving} />
                              <Input className="h-9 text-sm flex-1 min-w-[140px]" placeholder="Telefone *" value={cdFone} onChange={(e) => setCdFone(e.target.value)} disabled={cdSaving} />
                            </div>
                            <Input className="h-9 text-sm" placeholder="E-mail" value={cdEmail} onChange={(e) => setCdEmail(e.target.value)} disabled={cdSaving} />
                            <p className="text-[11px] text-muted-foreground">Altera o cadastro do cliente (reflete em cupom/reimpressão e demais vendas). Requer permissão de administrador.</p>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditCliDados(false)} disabled={cdSaving}>Cancelar</Button>
                              <Button size="sm" className="gap-1.5" disabled={cdSaving || !cdNome.trim() || !cdFone.trim()} onClick={() => void salvarCliDados()}>{cdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar dados</Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                      <Card className="border-border bg-card min-w-0">
                        <CardContent className="space-y-4">
                          <SectionTitle icon={User}>Cliente vinculado</SectionTitle>
                          <StatGrid cols={3}>
                            <StatField label="Nome" value={venda.clienteCompleto.name} />
                            <StatField label="Tipo" value={venda.clienteCompleto.kind === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />
                            <StatField label="Documento" value={venda.clienteCompleto.document || venda.clienteCpf || "—"} mono />
                            <StatField label="Telefone" value={venda.clienteCompleto.phone || "—"} />
                            <StatField label="E-mail" value={venda.clienteCompleto.email || "—"} />
                            <StatField label="Cidade" value={venda.clienteCompleto.city || "—"} />
                            <StatField label="Total gasto (histórico)" value={fmtBrl(venda.clienteCompleto.totalSpent)} />
                            <StatField label="Última compra" value={fmtDateTime(venda.clienteCompleto.lastPurchaseAt)} />
                          </StatGrid>
                        </CardContent>
                      </Card>
                      )
                    ) : venda.clienteNome || venda.clienteCpf ? (
                      <Card className="border-border bg-card max-w-2xl min-w-0">
                        <CardContent className="space-y-4">
                          <SectionTitle icon={User}>Cliente (sem cadastro formal)</SectionTitle>
                          <StatGrid>
                            <StatField label="Nome" value={venda.clienteNome || "—"} />
                            <StatField label="CPF/CNPJ no cupom" value={venda.clienteCpf || "—"} mono />
                          </StatGrid>
                        </CardContent>
                      </Card>
                    ) : (
                      <EmptyState icon={User} title="Consumidor final" hint="Esta venda não tem cliente vinculado." />
                    )}
                  </>
                ) : (
                  <div className="space-y-4 max-w-2xl">
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>Correções alteram o cupom e o vínculo de Conta a Receber. Revise antes de aplicar.</span>
                    </div>
                    {/* Busca de cliente */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Buscar cliente cadastrado</Label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-8 h-9 text-sm" placeholder="Nome ou documento…" value={cliBusca} onChange={(e) => { setCliBusca(e.target.value) }} />
                      </div>
                      {cliLoading ? (
                        <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                          {cliLista.filter((c) => { const s = cliBusca.trim().toLowerCase(); return !s || c.nome.toLowerCase().includes(s) || (c.documento ?? "").toLowerCase().includes(s) }).slice(0, 30).map((c) => (
                            <button key={c.id} type="button" onClick={() => { setCliSelId(c.id); setCliSelNome(c.nome); setCliBusca(c.nome) }} className={cn("w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground flex justify-between gap-2", cliSelId === c.id && "bg-accent")}>
                              <span className="break-words">{c.nome}</span>{c.documento && <span className="text-[10px] text-muted-foreground shrink-0">{c.documento}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Cadastro rápido */}
                    {!qcOpen ? (
                      <Button size="sm" variant="ghost" className="gap-1.5 text-primary" onClick={() => setQcOpen(true)}><Plus className="h-3.5 w-3.5" /> Cadastrar novo cliente</Button>
                    ) : (
                      <Card className="border-primary/30 bg-primary/5">
                        <CardContent className="pt-4 space-y-2">
                          <p className="text-xs font-semibold text-foreground">Cadastro rápido</p>
                          <Input className="h-9 text-sm" placeholder="Nome *" value={qcNome} onChange={(e) => setQcNome(e.target.value)} />
                          <div className="flex gap-2">
                            <Input className="h-9 text-sm" placeholder="Telefone" value={qcFone} onChange={(e) => setQcFone(e.target.value)} />
                            <Input className="h-9 text-sm" placeholder="CPF/CNPJ" value={qcDoc} onChange={(e) => setQcDoc(e.target.value)} />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setQcOpen(false)} disabled={qcSaving}>Cancelar</Button>
                            <Button size="sm" className="gap-1.5" disabled={qcSaving || !qcNome.trim()} onClick={() => void criarClienteRapido()}>{qcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar cliente</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    {/* Seleção atual / limpar */}
                    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm flex items-center justify-between gap-2">
                      <span className="text-foreground">Selecionado: <span className="font-medium">{cliSelNome || "Consumidor final (sem cliente)"}</span></span>
                      {(cliSelId || cliSelNome) && <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => { setCliSelId(null); setCliSelNome(""); setCliBusca("") }}>Limpar</Button>}
                    </div>
                    {cliBloqueiaLimpar && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Esta venda tem saldo a prazo — não pode ficar sem cliente.</div>
                    )}
                    {/* Motivo + PIN */}
                    <div className="space-y-1.5"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[56px] resize-none bg-background text-sm" value={cliMotivo} onChange={(e) => setCliMotivo(e.target.value)} disabled={cliApplying} /></div>
                    <div className="space-y-1.5 max-w-[220px]"><Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN supervisor <span className="text-destructive">*</span></Label><Input type="password" inputMode="numeric" maxLength={12} value={cliPin} onChange={(e) => setCliPin(e.target.value.replace(/\D/g, ""))} className="h-9 bg-background font-mono tracking-widest" disabled={cliApplying} /></div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditCli(false)} disabled={cliApplying}>Cancelar edição</Button>
                      <Button size="sm" className="gap-1.5" disabled={cliApplying || !cliMotivo.trim() || !cliPin.trim() || cliBloqueiaLimpar} onClick={() => void aplicarCli()}>{cliApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {cliApplying ? "Aplicando…" : "Aplicar correção"}</Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* 3 · PAGAMENTO (editável — F3) */}
              <TabsContent value="pagamento" className="mt-0 space-y-4">
                {!editPag ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Corrigir pagamento reconcilia caixa, financeiro e Conta a Receber. Exige motivo e PIN.</p>
                      {venda.status !== "cancelada" && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={startEditPag}><Pencil className="h-3.5 w-3.5" /> Editar pagamento</Button>
                      )}
                    </div>
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
                  </>
                ) : (
                  <div className="space-y-4 max-w-xl">
                    <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>A soma das formas deve fechar com o total ({fmtBrl(venda.total)}). À prazo/vale geram efeitos reconciliados automaticamente.</span>
                    </div>
                    <Card className="border-border bg-card min-w-0">
                      <CardContent className="pt-4 space-y-2">
                        {FORMS.map((f) => (
                          <div key={f.key} className="flex items-center justify-between gap-3">
                            <Label className="text-sm text-foreground">{f.label}</Label>
                            <Input type="number" min={0} step="0.01" value={pagDraft[f.key] ?? 0}
                              onChange={(e) => setPagDraft((cur) => ({ ...cur, [f.key]: Math.max(0, Number(e.target.value) || 0) }))}
                              className="h-8 w-32 text-right text-sm" />
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                          <span className="text-foreground">Soma</span>
                          <span className={cn("tabular-nums", Math.abs(pagSoma - venda.total) <= 0.01 ? "text-success" : "text-destructive")}>{fmtBrl(pagSoma)} / {fmtBrl(venda.total)}</span>
                        </div>
                      </CardContent>
                    </Card>
                    {pagPrecisaVenc && (
                      <div className="space-y-1.5 max-w-[220px]">
                        <Label className="text-xs text-foreground">Vencimento do saldo a prazo <span className="text-destructive">*</span></Label>
                        <Input placeholder="DD/MM/AAAA" value={pagVenc} onChange={(e) => setPagVenc(e.target.value)} className="h-9 bg-background text-sm" disabled={pagApplying} />
                      </div>
                    )}
                    {pagPrecisaCliente && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Venda à prazo exige cliente. Vincule um cliente na aba Cliente antes de aplicar.</div>
                    )}
                    {pagPlan && !pagPlan.ok && pagPlan.errorCode !== "no_change" && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {pagPlan.error}</div>
                    )}
                    {pagPlan?.ok && (
                      <Card className="border-border bg-card min-w-0">
                        <CardContent className="pt-4 text-xs space-y-1">
                          <p className="font-semibold text-muted-foreground flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" /> Pré-visualização do impacto</p>
                          <p className="text-foreground flex justify-between"><span>Caixa (à vista)</span><span className="tabular-nums">{fmtBrl(pagPlan.oldCashReal)} → {fmtBrl(pagPlan.cashTarget)}</span></p>
                          <p className="text-foreground flex justify-between"><span>À prazo</span><span className="tabular-nums">{fmtBrl(pagPlan.oldAPrazo)} → {fmtBrl(pagPlan.newAPrazo)}</span></p>
                          <p className="text-foreground flex justify-between"><span>Vale/crédito</span><span className="tabular-nums">{fmtBrl(pagPlan.oldCreditoVale)} → {fmtBrl(pagPlan.creditoTarget)}</span></p>
                          {pagPlan.cancelAllAPrazo && <p className="text-muted-foreground">• Títulos à prazo desta venda serão estornados/cancelados.</p>}
                          {pagPlan.criarTituloValor !== null && <p className="text-muted-foreground">• Será criado título à prazo de {fmtBrl(pagPlan.criarTituloValor)}.</p>}
                        </CardContent>
                      </Card>
                    )}
                    {pagConfirm && pagPlan?.ok && (
                      <Card className="border-primary/30 bg-primary/5 min-w-0">
                        <CardContent className="pt-4 space-y-3">
                          <div className="space-y-1.5"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[56px] resize-none bg-background text-sm" value={pagMotivo} onChange={(e) => setPagMotivo(e.target.value)} disabled={pagApplying} /></div>
                          <div className="space-y-1.5 max-w-[220px]"><Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN supervisor <span className="text-destructive">*</span></Label><Input type="password" inputMode="numeric" maxLength={12} value={pagPin} onChange={(e) => setPagPin(e.target.value.replace(/\D/g, ""))} className="h-9 bg-background font-mono tracking-widest" disabled={pagApplying} /></div>
                        </CardContent>
                      </Card>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditPag(false)} disabled={pagApplying}>Cancelar edição</Button>
                      {!pagConfirm ? (
                        <Button size="sm" className="gap-1.5" disabled={!pagPlan?.ok || pagPrecisaCliente} onClick={() => setPagConfirm(true)}><Calculator className="h-4 w-4" /> Pré-visualizar correção</Button>
                      ) : (
                        <Button size="sm" className="gap-1.5" disabled={pagApplying || !pagPlan?.ok || !pagMotivo.trim() || !pagPin.trim() || pagPrecisaCliente || (pagPrecisaVenc && !pagVenc.trim())} onClick={() => void aplicarPag()}>{pagApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {pagApplying ? "Aplicando…" : "Aplicar correção"}</Button>
                      )}
                    </div>
                  </div>
                )}
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
                              <TableCell className="text-xs text-muted-foreground">{fmtOrigem(m.origem)}</TableCell>
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
                                <TableHead className="text-foreground text-center w-28">Detalhes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {venda.itens.map((it, idx) => {
                                const md = it.metadata && typeof it.metadata === "object" ? it.metadata : null
                                const mdResumo = md ? Object.entries(md).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") : ""
                                return (
                                  <TableRow key={it.id} className="border-border">
                                    <TableCell className="text-foreground break-words max-w-[420px]">
                                      {it.nome}
                                      {mdResumo && <div className="text-[10px] text-muted-foreground mt-0.5 break-words">{mdResumo}</div>}
                                    </TableCell>
                                    <TableCell className="text-center tabular-nums text-foreground">{it.quantidade}</TableCell>
                                    <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(it.precoUnitario)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-foreground">{fmtBrl(it.lineTotal)}</TableCell>
                                    <TableCell className="text-center">
                                      {venda.status !== "cancelada" && (
                                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => startMeta(idx, md)}><Pencil className="h-3 w-3" /> {md ? "Editar" : "Add"}</Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ) : (
                      <EmptyState icon={Package} title="Sem itens" hint="Esta venda não tem itens registrados." />
                    )}

                    {/* Editor de metadados do item (serial/IMEI/lote/garantia/observação — sem estoque) */}
                    {metaIdx !== null && venda.itens[metaIdx] && (
                      <Card className="border-primary/30 bg-primary/5 min-w-0">
                        <CardContent className="pt-4 space-y-2">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Detalhes de “{venda.itens[metaIdx].nome}” — não altera quantidade/estoque/total</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Nº de série</Label><Input className="h-8 text-sm" value={metaVals.serial ?? ""} onChange={(e) => setMetaVals((c) => ({ ...c, serial: e.target.value }))} disabled={metaSaving} /></div>
                            <div className="space-y-1"><Label className="text-xs text-muted-foreground">IMEI</Label><Input className="h-8 text-sm" value={metaVals.imei ?? ""} onChange={(e) => setMetaVals((c) => ({ ...c, imei: e.target.value }))} disabled={metaSaving} /></div>
                            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Lote</Label><Input className="h-8 text-sm" value={metaVals.lote ?? ""} onChange={(e) => setMetaVals((c) => ({ ...c, lote: e.target.value }))} disabled={metaSaving} /></div>
                            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Garantia</Label><Input className="h-8 text-sm" placeholder="ex.: 90 dias" value={metaVals.garantia ?? ""} onChange={(e) => setMetaVals((c) => ({ ...c, garantia: e.target.value }))} disabled={metaSaving} /></div>
                          </div>
                          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Observação do item</Label><Input className="h-8 text-sm" value={metaVals.observacao ?? ""} onChange={(e) => setMetaVals((c) => ({ ...c, observacao: e.target.value }))} disabled={metaSaving} /></div>
                          <div className="space-y-1"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[44px] resize-none bg-background text-sm" value={metaMotivo} onChange={(e) => setMetaMotivo(e.target.value)} disabled={metaSaving} /></div>
                          <div className="space-y-1 max-w-[200px]"><Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN supervisor <span className="text-destructive">*</span></Label><Input type="password" inputMode="numeric" maxLength={12} value={metaPin} onChange={(e) => setMetaPin(e.target.value.replace(/\D/g, ""))} className="h-8 bg-background font-mono tracking-widest" disabled={metaSaving} /></div>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setMetaIdx(null)} disabled={metaSaving}>Cancelar</Button>
                            <Button size="sm" className="gap-1.5" disabled={metaSaving || !metaMotivo.trim() || !metaPin.trim()} onClick={() => void salvarMeta()}>{metaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar detalhes</Button>
                          </div>
                        </CardContent>
                      </Card>
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

              {/* 7 · CONTA A RECEBER (editável — F3: vencimento/observação de título aberto) */}
              <TabsContent value="receber" className="mt-0 space-y-3">
                {venda.titulos.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Apenas títulos em aberto podem ter vencimento/observação editados. Recebimento/estorno seguem no Contas a Receber.</p>

                    {/* Reparcelamento (F4) */}
                    {aPrazoValor > 0.005 && venda.status !== "cancelada" && (
                      !reparcOpen ? (
                        <div className="flex justify-end">
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={startReparc}><Calculator className="h-3.5 w-3.5" /> Reparcelar saldo à prazo</Button>
                        </div>
                      ) : (
                        <Card className="border-primary/30 bg-primary/5 min-w-0">
                          <CardContent className="pt-4 space-y-3">
                            <p className="text-xs font-semibold text-foreground">Reparcelar {fmtBrl(aPrazoValor)} à prazo</p>
                            <div className="flex flex-wrap gap-3 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Parcelas</Label>
                                <div className="flex gap-1">
                                  {[1, 2, 3, 6, 12].map((n) => (
                                    <Button key={n} size="sm" variant={reparcN === n ? "default" : "outline"} className="h-8 w-9 p-0" onClick={() => setReparcN(n)}>{n}</Button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-1 max-w-[150px]"><Label className="text-xs text-muted-foreground">1º vencimento</Label><Input placeholder="DD/MM/AAAA" value={reparcVenc} onChange={(e) => setReparcVenc(e.target.value)} className="h-8 bg-background text-sm" disabled={reparcApplying} /></div>
                              <div className="space-y-1 max-w-[110px]"><Label className="text-xs text-muted-foreground">Intervalo (dias)</Label><Input type="number" min={1} value={reparcInterv} onChange={(e) => setReparcInterv(Math.max(1, Math.round(Number(e.target.value) || 30)))} className="h-8 bg-background text-sm" disabled={reparcApplying} /></div>
                            </div>
                            {reparcPlan && !reparcPlan.ok && (
                              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {reparcPlan.error}</div>
                            )}
                            {reparcPlan?.ok && (
                              <div className="rounded-lg border border-border bg-muted/20 p-2 text-xs space-y-0.5">
                                <p className="font-semibold text-muted-foreground">Pré-visualização das parcelas</p>
                                {reparcPlan.itens.map((p) => (
                                  <p key={p.numero} className="text-foreground flex justify-between"><span>Parcela {p.numero}/{reparcPlan.parcelas}</span><span className="tabular-nums">{fmtBrl(p.valor)} · venc. {p.vencimento}</span></p>
                                ))}
                              </div>
                            )}
                            <div className="space-y-1"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[48px] resize-none bg-background text-sm" value={reparcMotivo} onChange={(e) => setReparcMotivo(e.target.value)} disabled={reparcApplying} /></div>
                            <div className="space-y-1 max-w-[200px]"><Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN supervisor <span className="text-destructive">*</span></Label><Input type="password" inputMode="numeric" maxLength={12} value={reparcPin} onChange={(e) => setReparcPin(e.target.value.replace(/\D/g, ""))} className="h-8 bg-background font-mono tracking-widest" disabled={reparcApplying} /></div>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setReparcOpen(false)} disabled={reparcApplying}>Cancelar</Button>
                              <Button size="sm" className="gap-1.5" disabled={reparcApplying || !reparcPlan?.ok || !reparcMotivo.trim() || !reparcPin.trim()} onClick={() => void aplicarReparc()}>{reparcApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {reparcApplying ? "Aplicando…" : "Aplicar reparcelamento"}</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    )}
                    <div className="space-y-2">
                      {venda.titulos.map((t) => {
                        const b = statusTituloBadge(t.status)
                        const st = (t.status ?? "").toLowerCase()
                        const editavel = !["pago", "parcial", "cancelado", "estornado"].includes(st)
                        const emEdicao = editTitId === t.id
                        return (
                          <Card key={t.id} className="border-border bg-card min-w-0">
                            <CardContent className="pt-4 space-y-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground break-words">{t.descricao}</span>
                                <StatusBadge label={b.label} tone={b.tone} />
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                                <span className="text-muted-foreground">Valor: <span className="text-foreground tabular-nums">{fmtBrl(t.valor)}</span></span>
                                <span className="text-muted-foreground">Pago: <span className="text-foreground tabular-nums">{fmtBrl(t.pago)}</span></span>
                                <span className="text-muted-foreground">Vencimento: <span className="text-foreground">{t.vencimento || "—"}</span></span>
                              </div>
                              {!emEdicao ? (
                                <div className="flex justify-end">
                                  {editavel ? (
                                    <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => startEditTitulo(t)}><Pencil className="h-3.5 w-3.5" /> Editar vencimento / obs.</Button>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">Título recebido/encerrado — edição bloqueada.</span>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2 border-t border-border pt-2">
                                  <div className="flex flex-wrap gap-3">
                                    <div className="space-y-1 max-w-[180px]"><Label className="text-xs text-muted-foreground">Novo vencimento</Label><Input placeholder="DD/MM/AAAA" value={titVenc} onChange={(e) => setTitVenc(e.target.value)} className="h-8 bg-background text-sm" disabled={titApplying} /></div>
                                    <div className="space-y-1 flex-1 min-w-[180px]"><Label className="text-xs text-muted-foreground">Observação</Label><Input value={titObs} onChange={(e) => setTitObs(e.target.value)} className="h-8 bg-background text-sm" disabled={titApplying} /></div>
                                  </div>
                                  <div className="space-y-1"><Label className="text-xs text-foreground">Motivo <span className="text-destructive">*</span></Label><Textarea className="min-h-[48px] resize-none bg-background text-sm" value={titMotivo} onChange={(e) => setTitMotivo(e.target.value)} disabled={titApplying} /></div>
                                  <div className="space-y-1 max-w-[200px]"><Label className="text-xs text-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> PIN supervisor <span className="text-destructive">*</span></Label><Input type="password" inputMode="numeric" maxLength={12} value={titPin} onChange={(e) => setTitPin(e.target.value.replace(/\D/g, ""))} className="h-8 bg-background font-mono tracking-widest" disabled={titApplying} /></div>
                                  <div className="flex justify-end gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setEditTitId(null)} disabled={titApplying}>Cancelar</Button>
                                    <Button size="sm" className="gap-1.5" disabled={titApplying || !titMotivo.trim() || !titPin.trim()} onClick={() => void aplicarTitulo()}>{titApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Aplicar</Button>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <EmptyState icon={FileText} title="Sem títulos a receber" hint="Venda à vista — não gerou contas a receber." />
                )}
              </TabsContent>

              {/* 8 · CAIXA */}
              <TabsContent value="caixa" className="mt-0">
                {venda.sessao ? (
                  <Card className="border-border bg-card min-w-0">
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <SectionTitle icon={Wallet}>Sessão do Caixa</SectionTitle>
                        <StatusBadge
                          dot
                          tone={venda.sessao.status === "ABERTA" ? "success" : "muted"}
                          label={venda.sessao.status ? venda.sessao.status.charAt(0).toUpperCase() + venda.sessao.status.slice(1).toLowerCase() : "—"}
                        />
                      </div>
                      <StatGrid cols={3}>
                        <StatField label="Operador" value={venda.sessao.operador || "—"} />
                        <StatField label="Terminal" value={venda.terminal?.name || venda.terminal?.code || "—"} />
                        <StatField label="Saldo inicial" value={fmtBrl(venda.sessao.saldoInicial)} />
                        <StatField label="Início" value={fmtDateTime(venda.sessao.abertaEm)} />
                        <StatField label="Fechamento" value={fmtDateTime(venda.sessao.fechadaEm)} />
                      </StatGrid>
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
                    <CardContent className="space-y-4">
                      <SectionTitle icon={XCircle} tone="text-destructive" className="text-destructive">Cancelamento</SectionTitle>
                      <StatGrid>
                        <StatField label="Cancelada em" value={fmtDateTime(venda.canceladaEm)} />
                        <StatField label="Por" value={venda.canceladaPor || "—"} />
                        <StatField label="Motivo" value={venda.motivoCancelamento || "—"} />
                        <StatField label="Estoque reposto" value={venda.estoqueReposto ? "Sim" : "Não"} />
                        <StatField label="Estorno financeiro" value={venda.estornoFinanceiro ? "Sim" : "Não"} />
                      </StatGrid>
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
                            <span className="font-medium text-foreground capitalize">{d.tipo.replace(/[-_]+/g, " ")}</span>
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
