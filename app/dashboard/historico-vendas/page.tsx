"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Printer,
  Trash2,
  Receipt,
  Search,
  TrendingUp,
  ShoppingBag,
  Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

type SaleStatus = "concluida" | "cancelada"

type Sale = {
  id: string
  coupon: string
  datetime: Date
  customer: string
  total: number
  method: string
  status: SaleStatus
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const INITIAL_SALES: Sale[] = [
  {
    id: "sale_001",
    coupon: "#0001",
    datetime: new Date(2026, 3, 29, 9, 14, 0),
    customer: "Consumidor",
    total: 350.0,
    method: "PIX",
    status: "concluida",
  },
  {
    id: "sale_002",
    coupon: "#0002",
    datetime: new Date(2026, 3, 29, 10, 2, 0),
    customer: "Ana Lima",
    total: 97.9,
    method: "Cartão Crédito",
    status: "concluida",
  },
  {
    id: "sale_003",
    coupon: "#0003",
    datetime: new Date(2026, 3, 29, 10, 45, 0),
    customer: "Carlos Rocha",
    total: 210.0,
    method: "Dinheiro",
    status: "cancelada",
  },
  {
    id: "sale_004",
    coupon: "#0004",
    datetime: new Date(2026, 3, 29, 11, 30, 0),
    customer: "Júlia Mendes",
    total: 485.0,
    method: "A Prazo",
    status: "concluida",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function StatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-0.5 text-xs font-semibold",
        status === "concluida"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {status === "concluida" ? "Concluída" : "Cancelada"}
    </Badge>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoricoVendasPage() {
  const [sales, setSales] = useState<Sale[]>(INITIAL_SALES)
  const [search, setSearch] = useState("")
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null)

  // ── Derived stats ────────────────────────────────────────────────────────────
  const concluded = sales.filter((s) => s.status === "concluida")
  const totalRevenue = concluded.reduce((acc, s) => acc + s.total, 0)
  const cancelCount = sales.filter((s) => s.status === "cancelada").length

  // ── Filtered rows ─────────────────────────────────────────────────────────────
  const filtered = sales.filter((s) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      s.coupon.toLowerCase().includes(term) ||
      s.customer.toLowerCase().includes(term) ||
      s.method.toLowerCase().includes(term)
    )
  })

  // ── Actions ───────────────────────────────────────────────────────────────────
  const confirmCancel = () => {
    if (!cancelTarget) return
    setSales((prev) =>
      prev.map((s) => (s.id === cancelTarget.id ? { ...s, status: "cancelada" } : s)),
    )
    setCancelTarget(null)
  }

  const handleReprint = (sale: Sale) => {
    // In production: trigger thermal printer / PDF
    window.alert(`Reimprimindo cupom ${sale.coupon} — ${sale.customer}`)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">

      {/* ── Page header ── */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Receipt className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Histórico de Vendas
            </h1>
            <p className="text-sm text-muted-foreground">
              Consulte, reimprima ou cancele vendas anteriores.
            </p>
          </div>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: ShoppingBag,
            label: "Vendas Concluídas",
            value: concluded.length,
            sub: "neste período",
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            icon: TrendingUp,
            label: "Faturamento Total",
            value: brl(totalRevenue),
            sub: "vendas concluídas",
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-500/10",
          },
          {
            icon: Ban,
            label: "Cancelamentos",
            value: cancelCount,
            sub: "neste período",
            color: "text-destructive",
            bg: "bg-destructive/10",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", m.bg)}>
              <m.icon className={cn("h-5 w-5", m.color)} />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={cn("text-2xl font-black tabular-nums", m.color)}>{m.value}</p>
              <p className="text-[10px] text-muted-foreground">{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cupom, cliente ou forma de pagamento…"
            className="h-10 rounded-xl border-border bg-card pl-9 text-sm"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-36 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Data / Hora
              </TableHead>
              <TableHead className="w-24 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nº Cupom
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagamento
              </TableHead>
              <TableHead className="w-32 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Valor Total
              </TableHead>
              <TableHead className="w-32 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-32 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                  Nenhuma venda encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="border-border transition-colors hover:bg-muted/40"
                >
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {format(sale.datetime, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-foreground">
                      {sale.coupon}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{sale.customer}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sale.method}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-foreground">
                    {brl(sale.total)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sale.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Reprint */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Reimprimir cupom"
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground"
                        onClick={() => handleReprint(sale)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>

                      {/* Cancel — only for concluded sales */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Cancelar venda"
                        disabled={sale.status === "cancelada"}
                        className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                        onClick={() => setCancelTarget(sale)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Cancel confirmation dialog ── */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <Trash2 className="h-5 w-5 text-destructive" />
              Cancelar venda {cancelTarget?.coupon}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja cancelar esta venda? Os produtos retornarão ao
              estoque e esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {cancelTarget && (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-semibold text-foreground">{cancelTarget.customer}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Valor</span>
                <span className="font-bold tabular-nums text-destructive">
                  {brl(cancelTarget.total)}
                </span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Manter Venda</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmCancel}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
