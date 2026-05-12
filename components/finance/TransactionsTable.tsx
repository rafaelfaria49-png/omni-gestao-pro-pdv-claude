"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Search,
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import type { FinanceTransaction } from "./useFinanceDashboard"

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const fmtDate = (s?: string | null) => {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

type Tx = FinanceTransaction & {
  category?: { name: string; color: string; icon: string } | null
  account?: { name: string } | null
}

type Filters = {
  q: string
  type: string
  status: string
  page: number
}

type Pagination = { page: number; limit: number; total: number; pages: number }

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5" /> Pago</Badge>
  if (status === "canceled")
    return <Badge variant="outline" className="gap-1 text-muted-foreground text-[10px]"><XCircle className="h-2.5 w-2.5" /> Cancelado</Badge>
  return <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px]"><Clock className="h-2.5 w-2.5" /> Pendente</Badge>
}

type NewTxForm = {
  accountId: string
  type: "income" | "expense"
  status: "pending" | "paid"
  description: string
  amount: string
  dueDate: string
  paymentMethod: string
  notes: string
}

const EMPTY_FORM: NewTxForm = {
  accountId: "",
  type: "expense",
  status: "pending",
  description: "",
  amount: "",
  dueDate: new Date().toISOString().split("T")[0]!,
  paymentMethod: "",
  notes: "",
}

function NewTransactionModal({
  open,
  onClose,
  onCreated,
  accounts,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  accounts: { id: string; name: string }[]
}) {
  const [form, setForm] = useState<NewTxForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, accountId: accounts[0]?.id ?? "" })
  }, [open, accounts])

  const set = (k: keyof NewTxForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }))

  async function submit() {
    if (!form.description || !form.amount || !form.dueDate || !form.accountId) {
      toast.error("Preencha todos os campos obrigatórios")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/finance/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: form.accountId,
          type: form.type,
          status: form.status,
          description: form.description,
          amount: parseFloat(form.amount.replace(",", ".")),
          dueDate: form.dueDate,
          paymentMethod: form.paymentMethod || undefined,
          notes: form.notes || undefined,
          paidAt: form.status === "paid" ? new Date().toISOString() : undefined,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? "Falha ao salvar")
      toast.success("Lançamento criado!")
      onCreated()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
          <DialogDescription>Registre uma receita ou despesa</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v as "income" | "expense" }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status *</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as "pending" | "paid" }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Conta *</Label>
            <Select value={form.accountId} onValueChange={(v) => setForm((p) => ({ ...p, accountId: v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Descrição *</Label>
            <Input className="h-8 text-xs" value={form.description} onChange={set("description")} maxLength={240} placeholder="Ex: Aluguel, Serviço..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input className="h-8 text-xs" value={form.amount} onChange={set("amount")} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento *</Label>
              <Input type="date" className="h-8 text-xs" value={form.dueDate} onChange={set("dueDate")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Forma de pagamento</Label>
            <Input className="h-8 text-xs" value={form.paymentMethod} onChange={set("paymentMethod")} placeholder="PIX, Cartão, Dinheiro..." />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea className="resize-none text-xs" rows={2} value={form.notes} onChange={set("notes")} placeholder="Notas adicionais..." maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Salvar lançamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TransactionsTable({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [filters, setFilters] = useState<Filters>({ q: "", type: "", status: "", page: 1 })
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (f: Filters) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (f.q) params.set("q", f.q)
      if (f.type) params.set("type", f.type)
      if (f.status) params.set("status", f.status)
      params.set("page", String(f.page))
      params.set("limit", "50")
      const res = await fetch(`/api/finance/transactions?${params}`)
      const json = await res.json()
      if (json.ok) {
        setTransactions(json.transactions as Tx[])
        setPagination(json.pagination as Pagination)
      } else {
        setError(json.error ?? "Falha ao carregar")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void load(filters) }, filters.q ? 400 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters, load])

  async function markPaid(id: string) {
    try {
      const res = await fetch("/api/finance/transactions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "paid", paidAt: new Date().toISOString() }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast.success("Marcado como pago!")
      void load(filters)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    }
  }

  async function cancelTx(id: string) {
    try {
      const res = await fetch(`/api/finance/transactions?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast.success("Cancelado.")
      void load(filters)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    }
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const totalIncome = useMemo(() => transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0), [transactions])
  const totalExpense = useMemo(() => transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0), [transactions])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-9 text-xs"
            placeholder="Buscar por descrição..."
            value={filters.q}
            onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value, page: 1 }))}
            maxLength={120}
          />
        </div>

        <Select value={filters.type || "all"} onValueChange={(v) => setFilters((p) => ({ ...p, type: v === "all" ? "" : v, page: 1 }))}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <Filter className="mr-1.5 h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status || "all"} onValueChange={(v) => setFilters((p) => ({ ...p, status: v === "all" ? "" : v, page: 1 }))}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" className="h-8 gap-1 text-xs ml-auto" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo lançamento
        </Button>
      </div>

      {/* Summary strip */}
      {!loading && transactions.length > 0 && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><ArrowDownCircle className="mr-1 inline h-3 w-3 text-emerald-600" />{fmt(totalIncome)} em receitas</span>
          <span><ArrowUpCircle className="mr-1 inline h-3 w-3 text-destructive" />{fmt(totalExpense)} em despesas</span>
          <span className="ml-auto">{pagination.total} transação{pagination.total !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Table */}
      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          <Button variant="ghost" size="sm" onClick={() => void load(filters)} className="ml-auto h-6 text-xs">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selected.size === transactions.length && transactions.length > 0}
                      onChange={() => setSelected(selected.size === transactions.length ? new Set() : new Set(transactions.map((t) => t.id)))}
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Descrição</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Categoria</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Conta</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Vencimento</th>
                  <th className="px-3 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium text-muted-foreground uppercase tracking-wide">Valor</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 rounded" /></td>
                      ))}
                    </tr>
                  ))
                  : transactions.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-muted-foreground">
                          Nenhuma transação encontrada. Ajuste os filtros ou crie um novo lançamento.
                        </td>
                      </tr>
                    )
                    : transactions.map((tx) => {
                      const isIncome = tx.type === "income"
                      const isSelected = selected.has(tx.id)
                      return (
                        <tr
                          key={tx.id}
                          className={`border-b border-border/50 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                        >
                          <td className="px-3 py-2.5">
                            <input type="checkbox" className="rounded" checked={isSelected} onChange={() => toggleSelect(tx.id)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs ${isIncome ? "text-emerald-600" : "text-destructive"}`}>
                                {isIncome ? <ArrowDownCircle className="h-3 w-3" /> : <ArrowUpCircle className="h-3 w-3" />}
                              </span>
                              <span className="font-medium text-foreground">{tx.description}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            {tx.category ? (
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tx.category.color }} />
                                <span className="text-muted-foreground">{tx.category.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{tx.account?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(tx.dueDate)}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={tx.status} /></td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={`font-semibold ${isIncome ? "text-emerald-600" : "text-destructive"}`}>
                              {isIncome ? "+" : "-"}{fmt(tx.amount)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              {tx.status === "pending" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-emerald-600 hover:text-emerald-700"
                                  title="Marcar como pago"
                                  onClick={() => void markPaid(tx.id)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {tx.status !== "canceled" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  title="Cancelar"
                                  onClick={() => void cancelTx(tx.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
              <span>Página {pagination.page} de {pagination.pages} · {pagination.total} registros</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pagination.page <= 1}
                  onClick={() => setFilters((p) => ({ ...p, page: p.page - 1 }))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <NewTransactionModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => void load(filters)}
        accounts={accounts}
      />
    </div>
  )
}
