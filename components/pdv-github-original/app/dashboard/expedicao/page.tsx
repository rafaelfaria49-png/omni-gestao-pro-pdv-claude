"use client"

import { useState, useMemo } from "react"
import {
  Truck,
  Package,
  PackageCheck,
  FileText,
  Printer,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  Eye,
  Repeat2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// ─── Mock Data ───────────────────────────────────────────────────────────────

type NfeStatus = "pendente" | "emitida"
type LabelStatus = "aguardando" | "impressa"
type MarketplaceId = "ML" | "SP" | "AZ" | "NS" | "todos"

interface Order {
  id: string
  marketplace: Exclude<MarketplaceId, "todos">
  customer: string
  nfe: NfeStatus
  label: LabelStatus
}

const MOCK_ORDERS: Order[] = [
  { id: "#24-001", marketplace: "ML", customer: "João Silva", nfe: "pendente", label: "aguardando" },
  { id: "#24-002", marketplace: "SP", customer: "Maria Souza", nfe: "emitida", label: "impressa" },
  { id: "#24-003", marketplace: "AZ", customer: "Pedro Costa", nfe: "pendente", label: "aguardando" },
  { id: "#24-004", marketplace: "ML", customer: "Ana Ferreira", nfe: "emitida", label: "aguardando" },
  { id: "#24-005", marketplace: "NS", customer: "Carlos Lima", nfe: "pendente", label: "aguardando" },
  { id: "#24-006", marketplace: "SP", customer: "Fernanda Dias", nfe: "emitida", label: "impressa" },
  { id: "#24-007", marketplace: "ML", customer: "Roberto Nunes", nfe: "pendente", label: "aguardando" },
  { id: "#24-008", marketplace: "AZ", customer: "Juliana Martins", nfe: "emitida", label: "impressa" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MARKETPLACE_META: Record<Exclude<MarketplaceId, "todos">, { label: string; color: string }> = {
  ML: { label: "Mercado Livre", color: "bg-yellow-400 text-yellow-900" },
  SP: { label: "Shopee", color: "bg-orange-500 text-white" },
  AZ: { label: "Amazon", color: "bg-sky-600 text-white" },
  NS: { label: "Nuvemshop", color: "bg-violet-600 text-white" },
}

function MarketplaceBadge({ id }: { id: Exclude<MarketplaceId, "todos"> }) {
  const meta = MARKETPLACE_META[id]
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${meta.color}`}
    >
      {id}
    </span>
  )
}

function NfeBadge({ status }: { status: NfeStatus }) {
  if (status === "emitida") {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/15">
        <CheckCircle2 className="h-3 w-3" />
        Emitida
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">
      <Clock className="h-3 w-3" />
      Pendente
    </Badge>
  )
}

function LabelBadge({ status }: { status: LabelStatus }) {
  if (status === "impressa") {
    return (
      <Badge className="gap-1 bg-sky-500/15 text-sky-600 border-sky-500/30 hover:bg-sky-500/15">
        <CheckCircle2 className="h-3 w-3" />
        Impressa
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Aguardando
    </Badge>
  )
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-xl ${accent}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ExpedicaoPage() {
  const [search, setSearch] = useState("")
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceId>("todos")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return MOCK_ORDERS.filter((o) => {
      const matchSearch =
        search === "" ||
        o.id.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.toLowerCase().includes(search.toLowerCase())
      const matchMP = marketplaceFilter === "todos" || o.marketplace === marketplaceFilter
      return matchSearch && matchMP
    })
  }, [search, marketplaceFilter])

  const allSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id))

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected)
      filtered.forEach((o) => next.delete(o.id))
      setSelected(next)
    } else {
      const next = new Set(selected)
      filtered.forEach((o) => next.add(o.id))
      setSelected(next)
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const pendentes = MOCK_ORDERS.filter((o) => o.nfe === "pendente").length
  const aguardandoColeta = MOCK_ORDERS.filter((o) => o.label === "aguardando").length
  const enviadosHoje = MOCK_ORDERS.filter((o) => o.label === "impressa").length

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 lg:px-8 xl:px-10">

        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-glow">
              <Truck className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Central de Expedição
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Fature pedidos e imprima etiquetas em lote.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button className="gap-2 whitespace-nowrap">
              <FileText className="h-4 w-4" />
              Emitir NF-e em Lote
            </Button>
            <Button className="gap-2 whitespace-nowrap">
              <Printer className="h-4 w-4" />
              Imprimir Etiquetas (ZPL/PDF)
            </Button>
          </div>
        </div>

        {/* ── Metric Cards ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            icon={Package}
            label="Pedidos Pendentes"
            value={pendentes}
            accent="bg-amber-500/15 text-amber-600"
          />
          <MetricCard
            icon={Clock}
            label="Aguardando Coleta"
            value={aguardandoColeta}
            accent="bg-sky-500/15 text-sky-600"
          />
          <MetricCard
            icon={PackageCheck}
            label="Enviados Hoje"
            value={enviadosHoje}
            accent="bg-emerald-500/15 text-emerald-600"
          />
        </div>

        {/* ── Orders Table ── */}
        <div className="rounded-2xl border border-border bg-card shadow-card">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número do pedido ou cliente..."
                className="pl-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={marketplaceFilter}
              onValueChange={(v) => setMarketplaceFilter(v as MarketplaceId)}
            >
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Filtrar por Marketplace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Marketplaces</SelectItem>
                <SelectItem value="ML">Mercado Livre</SelectItem>
                <SelectItem value="SP">Shopee</SelectItem>
                <SelectItem value="AZ">Amazon</SelectItem>
                <SelectItem value="NS">Nuvemshop</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selection info bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-4 py-2.5 text-sm">
              <span className="font-medium text-primary">
                {selected.size} pedido{selected.size > 1 ? "s" : ""} selecionado{selected.size > 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">—</span>
              <button
                type="button"
                className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Limpar seleção
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status NF-e</TableHead>
                  <TableHead>Status Etiqueta</TableHead>
                  <TableHead className="w-12 text-right pr-4">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                      Nenhum pedido encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((order) => (
                    <TableRow
                      key={order.id}
                      className={selected.has(order.id) ? "bg-primary/5" : ""}
                      data-state={selected.has(order.id) ? "selected" : undefined}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selected.has(order.id)}
                          onCheckedChange={() => toggleOne(order.id)}
                          aria-label={`Selecionar ${order.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium text-foreground">
                        {order.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <MarketplaceBadge id={order.marketplace} />
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {MARKETPLACE_META[order.marketplace].label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-foreground">{order.customer}</TableCell>
                      <TableCell>
                        <NfeBadge status={order.nfe} />
                      </TableCell>
                      <TableCell>
                        <LabelBadge status={order.label} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Ações do pedido</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="gap-2">
                              <Eye className="h-4 w-4" />
                              Ver Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <FileText className="h-4 w-4" />
                              Emitir NF-e
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <Printer className="h-4 w-4" />
                              Imprimir Etiqueta
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <Repeat2 className="h-4 w-4" />
                              Atualizar Status
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""} exibido{filtered.length !== 1 ? "s" : ""}
            {MOCK_ORDERS.length !== filtered.length && ` de ${MOCK_ORDERS.length} no total`}
          </div>
        </div>
      </main>
    </div>
  )
}
