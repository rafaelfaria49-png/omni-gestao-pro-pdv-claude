"use client"

/**
 * PdvRecebimentoModal — Recebimento de Contas a Receber no PDV (F9).
 *
 * Convergência operacional dos 3 PDVs (Clássico, Supermercado, Assistência):
 * mesmo modal, mesmo backend, mesmo fluxo. Reusa endpoints já existentes:
 *  - GET  /api/ops/contas-receber-list (lista títulos da loja)
 *  - POST /api/financeiro/contas-receber/liquidar (baixa total)
 *  - POST /api/financeiro/contas-receber/pagamento-parcial (baixa parcial)
 *
 * Sem schema novo. Auditoria já vem do backend (LogsAuditoria).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Loader2, Search, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { ContaReceberRow } from "@/lib/contas-receber-types"

/** Status considerados "abertos" e elegíveis para recebimento. */
const STATUS_RECEBIVEL = new Set(["pendente", "parcial", "atrasado", "vencido"])

const FORMAS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "cartao_debito", label: "Cartão Débito" },
  { value: "cartao_credito", label: "Cartão Crédito" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
] as const

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function statusLabel(s: string): string {
  const k = (s || "").toLowerCase()
  if (k === "pago") return "Pago"
  if (k === "parcial") return "Parcial"
  if (k === "cancelado") return "Cancelado"
  if (k === "vencido" || k === "atrasado") return "Vencido"
  return "Pendente"
}

function statusBadgeClass(s: string): string {
  const k = (s || "").toLowerCase()
  if (k === "pago") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (k === "parcial") return "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
  if (k === "cancelado") return "border-muted bg-muted/30 text-muted-foreground"
  if (k === "vencido" || k === "atrasado")
    return "border-destructive/40 bg-destructive/10 text-destructive"
  return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

export interface PdvRecebimentoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Cliente atualmente selecionado no PDV — usado para pré-filtrar a lista. */
  preselectedCustomerName?: string | null
  /** Callback acionado após qualquer recebimento bem-sucedido (refresh externo opcional). */
  onReceived?: () => void
}

export function PdvRecebimentoModal({
  open,
  onOpenChange,
  preselectedCustomerName,
  onReceived,
}: PdvRecebimentoModalProps) {
  const { lojaAtivaId } = useLojaAtiva()
  const { toast } = useToast()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [rows, setRows] = useState<ContaReceberRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [parcialValue, setParcialValue] = useState<Record<string, string>>({})
  const [formaPagto, setFormaPagto] = useState<string>("dinheiro")

  const fetchTitulos = useCallback(async () => {
    if (!lojaAtivaId) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch("/api/ops/contas-receber-list", {
        method: "GET",
        headers: { [ASSISTEC_LOJA_HEADER]: lojaAtivaId },
        cache: "no-store",
      })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; rows?: ContaReceberRow[]; error?: string } | null
      if (!r.ok || !j) {
        throw new Error(j?.error || `HTTP ${r.status}`)
      }
      const list = Array.isArray(j.rows) ? j.rows : []
      setRows(list.filter((row) => STATUS_RECEBIVEL.has((row.status || "").toLowerCase())))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [lojaAtivaId])

  // Pré-preencher busca com nome do cliente selecionado no PDV ao abrir.
  useEffect(() => {
    if (!open) return
    setSearch(preselectedCustomerName?.trim() || "")
    setParcialValue({})
    setFormaPagto("dinheiro")
    void fetchTitulos()
  }, [open, preselectedCustomerName, fetchTitulos])

  // Auto-focus na busca
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const c = (r.cliente || "").toLowerCase()
      const d = (r.descricao || "").toLowerCase()
      const id = String(r.id || "").toLowerCase()
      return c.includes(q) || d.includes(q) || id.includes(q)
    })
  }, [rows, search])

  const totalRestante = useMemo(
    () => filtered.reduce((s, r) => s + (Number(r.valor) || 0), 0),
    [filtered],
  )

  const callLiquidar = useCallback(
    async (row: ContaReceberRow) => {
      if (!lojaAtivaId) return
      setBusyId(String(row.id))
      try {
        const r = await fetch("/api/financeiro/contas-receber/liquidar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [ASSISTEC_LOJA_HEADER]: lojaAtivaId,
          },
          body: JSON.stringify({
            localKey: String(row.id),
            formaPagamento: formaPagto,
          }),
        })
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        toast({
          title: "Recebimento confirmado",
          description: `Título ${row.cliente || "—"} liquidado em ${brl(Number(row.valor) || 0)}.`,
        })
        onReceived?.()
        await fetchTitulos()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast({
          variant: "destructive",
          title: "Falha ao receber",
          description: msg,
        })
      } finally {
        setBusyId(null)
      }
    },
    [lojaAtivaId, formaPagto, toast, onReceived, fetchTitulos],
  )

  const callParcial = useCallback(
    async (row: ContaReceberRow) => {
      if (!lojaAtivaId) return
      const raw = parcialValue[String(row.id)] ?? ""
      const valor = Number(raw.replace(/\./g, "").replace(",", "."))
      if (!Number.isFinite(valor) || valor <= 0) {
        toast({ variant: "destructive", title: "Valor inválido", description: "Informe um valor parcial maior que zero." })
        return
      }
      if (valor > (Number(row.valor) || 0) + 0.009) {
        toast({
          variant: "destructive",
          title: "Valor excede o saldo",
          description: `Saldo do título: ${brl(Number(row.valor) || 0)}.`,
        })
        return
      }
      setBusyId(String(row.id))
      try {
        const r = await fetch("/api/financeiro/contas-receber/pagamento-parcial", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [ASSISTEC_LOJA_HEADER]: lojaAtivaId,
          },
          body: JSON.stringify({
            localKey: String(row.id),
            valor,
          }),
        })
        const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null
        if (!r.ok || !j?.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        toast({
          title: "Pagamento parcial registrado",
          description: `${brl(valor)} abatido do título ${row.cliente || "—"}.`,
        })
        setParcialValue((p) => ({ ...p, [String(row.id)]: "" }))
        onReceived?.()
        await fetchTitulos()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        toast({
          variant: "destructive",
          title: "Falha ao registrar parcial",
          description: msg,
        })
      } finally {
        setBusyId(null)
      }
    },
    [lojaAtivaId, parcialValue, toast, onReceived, fetchTitulos],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-0 overflow-hidden bg-card border-border">
        <DialogHeader className="p-6 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-6 h-6 text-primary" />
            Recebimento de Contas (F9)
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/80">
            Liquide ou registre pagamento parcial dos títulos abertos. Movimentação financeira gerada
            automaticamente; histórico em LogsAuditoria.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Linha de busca + forma de pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Buscar (cliente, descrição ou ID)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  className="pl-9 h-10 bg-secondary border-border"
                  placeholder="Ex.: João Silva / Venda PDV / VDA-2026"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
              <Select value={formaPagto} onValueChange={setFormaPagto}>
                <SelectTrigger className="h-10 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Títulos abertos</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{filtered.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo total</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{brl(totalRestante)}</p>
            </div>
            <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 flex items-center justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void fetchTitulos()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Recarregar"}
              </Button>
            </div>
          </div>

          {/* Lista */}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum título em aberto{search ? " para o filtro atual" : ""}.
            </div>
          )}

          <ul className="space-y-2">
            {filtered.map((row) => {
              const id = String(row.id)
              const valor = Number(row.valor) || 0
              const busy = busyId === id
              const parcialStr = parcialValue[id] ?? ""
              return (
                <li
                  key={id}
                  className="rounded-lg border border-border bg-background p-3 space-y-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{row.cliente || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.descricao}</p>
                      <p className="text-[10px] text-muted-foreground/80">
                        Vence: {row.vencimento || "—"} · ID: <span className="font-mono">{id}</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className={`text-[10px] font-bold uppercase ${statusBadgeClass(row.status)}`}>
                        {statusLabel(row.status)}
                      </Badge>
                      <p className="mt-1 text-lg font-extrabold tabular-nums text-foreground">
                        {brl(valor)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end pt-1 border-t border-border/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Valor parcial (opcional)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={parcialStr}
                        onChange={(e) => setParcialValue((p) => ({ ...p, [id]: e.target.value }))}
                        className="h-9 bg-secondary border-border"
                        disabled={busy}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || !parcialStr.trim()}
                      onClick={() => void callParcial(row)}
                      className="h-9 whitespace-nowrap"
                    >
                      Baixa parcial
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void callLiquidar(row)}
                      className="h-9 whitespace-nowrap bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Quitar total
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-card shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
