"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  History,
  Filter,
  AlertTriangle,
  RefreshCw,
  PackageX,
  CircleDollarSign,
  Barcode,
  Repeat,
  X,
  ArrowRight,
  Activity,
  ArrowDownToLine,
  SlidersHorizontal,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { resolveLojaIdParaConsultaClientes } from "@/lib/clientes-loja-resolve"
import { cn } from "@/lib/utils"
import {
  getAuditoriaEstoque,
  type AuditoriaEstoqueData,
  type AuditoriaEstoqueFiltro,
  type AuditoriaProdutoAlerta,
  type MovimentacaoEstoqueDTO,
} from "@/app/actions/estoque"

// ─── Constantes de exibição ──────────────────────────────────────────────────

const TIPO_META: Record<string, { label: string; className: string }> = {
  entrada: { label: "Entrada", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ajuste: { label: "Ajuste", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  saida: { label: "Saída", className: "border-destructive/30 bg-destructive/10 text-destructive" },
}

const ORIGEM_META: Record<string, string> = {
  manual: "Manual",
  importacao: "Importação",
  os: "Ordem de Serviço",
  pdv: "PDV",
}

const TIPO_OPCOES = [
  { value: "all", label: "Todos os tipos" },
  { value: "entrada", label: "Entradas" },
  { value: "ajuste", label: "Ajustes" },
  { value: "saida", label: "Saídas" },
]

const ORIGEM_OPCOES = [
  { value: "all", label: "Todas as origens" },
  { value: "manual", label: "Manual" },
  { value: "importacao", label: "Importação" },
  { value: "os", label: "Ordem de Serviço" },
  { value: "pdv", label: "PDV" },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0)
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isoDaysAgo(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function isoToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
  loading,
}: {
  label: string
  value: string | number
  icon: typeof Activity
  accent?: "default" | "emerald" | "amber" | "destructive"
  loading?: boolean
}) {
  const accentMap = {
    default: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    destructive: "bg-destructive/10 text-destructive",
  } as const
  return (
    <Card className="bg-card border-border">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-lg p-2", accentMap[accent])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <div className="h-7 w-16 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Alerta ──────────────────────────────────────────────────────────────────

function AlertaCard({
  title,
  icon: Icon,
  total,
  items,
  accent,
  loading,
  emptyLabel,
  renderRight,
}: {
  title: string
  icon: typeof AlertTriangle
  total: number
  items: AuditoriaProdutoAlerta[]
  accent: "amber" | "destructive" | "muted"
  loading?: boolean
  emptyLabel: string
  renderRight: (p: AuditoriaProdutoAlerta) => React.ReactNode
}) {
  const accentMap = {
    amber: { border: "border-l-amber-500", icon: "text-amber-600 dark:text-amber-400" },
    destructive: { border: "border-l-destructive", icon: "text-destructive" },
    muted: { border: "border-l-muted-foreground/40", icon: "text-muted-foreground" },
  } as const
  const a = accentMap[accent]
  return (
    <Card className={cn("border-l-4 bg-card border-border", a.border)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={cn("h-4 w-4", a.icon)} />
          {title}
        </CardTitle>
        <Badge variant={total > 0 ? "secondary" : "outline"} className="tabular-nums">
          {loading ? "…" : total}
        </Badge>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <div className="space-y-1.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{p.nome}</span>
                  {p.sku && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{p.sku}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{renderRight(p)}</span>
              </li>
            ))}
            {total > items.length && (
              <li className="px-2.5 pt-1 text-[10px] text-muted-foreground">
                +{total - items.length} item(ns) não exibido(s)
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AuditoriaEstoque() {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => resolveLojaIdParaConsultaClientes(lojaAtivaId), [lojaAtivaId])

  const [filtro, setFiltro] = useState<AuditoriaEstoqueFiltro>({})
  const [data, setData] = useState<AuditoriaEstoqueData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try {
      const res = await getAuditoriaEstoque(storeId, filtro)
      setData(res)
    } catch (e) {
      toast({
        title: "Falha ao carregar auditoria",
        description: e instanceof Error ? e.message : "Erro inesperado",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [storeId, filtro, toast])

  useEffect(() => {
    void load()
  }, [load])

  const setF = <K extends keyof AuditoriaEstoqueFiltro>(key: K, value: AuditoriaEstoqueFiltro[K]) =>
    setFiltro((prev) => ({ ...prev, [key]: value }))

  const limparFiltros = () => setFiltro({})

  const filtrosAtivos =
    Object.entries(filtro).filter(([, v]) => v !== undefined && v !== "" && v !== false).length > 0

  const kpis = data?.kpis
  const alertas = data?.alertas
  const movimentacoes = data?.movimentacoes ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <History className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Auditoria de Estoque</h1>
            <p className="text-sm text-muted-foreground">
              Livro-razão de movimentações — entradas, ajustes e consumo, com rastreabilidade total.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label="Movimentações hoje" value={kpis?.movimentacoesHoje ?? 0} icon={Activity} loading={loading} />
        <KpiCard label="Entradas hoje" value={kpis?.entradasHoje ?? 0} icon={ArrowDownToLine} accent="emerald" loading={loading} />
        <KpiCard label="Ajustes hoje" value={kpis?.ajustesHoje ?? 0} icon={SlidersHorizontal} accent="amber" loading={loading} />
        <KpiCard
          label="Produtos negativos"
          value={kpis?.produtosNegativos ?? 0}
          icon={PackageX}
          accent={(kpis?.produtosNegativos ?? 0) > 0 ? "destructive" : "default"}
          loading={loading}
        />
        <KpiCard
          label="Valor movimentado hoje"
          value={formatCurrency(kpis?.valorMovimentadoHoje ?? 0)}
          icon={CircleDollarSign}
          loading={loading}
        />
      </div>

      {/* Alertas operacionais */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AlertaCard
          title="Estoque negativo"
          icon={PackageX}
          accent="destructive"
          total={alertas?.totais.estoqueNegativo ?? 0}
          items={alertas?.estoqueNegativo ?? []}
          loading={loading}
          emptyLabel="Nenhum saldo negativo."
          renderRight={(p) => <span className="font-semibold text-destructive">{p.stock}</span>}
        />
        <AlertaCard
          title="Custo zerado"
          icon={CircleDollarSign}
          accent="amber"
          total={alertas?.totais.custoZerado ?? 0}
          items={alertas?.custoZerado ?? []}
          loading={loading}
          emptyLabel="Todos os itens com saldo têm custo."
          renderRight={(p) => <span className="text-muted-foreground">{p.stock} un.</span>}
        />
        <AlertaCard
          title="Sem código de barras"
          icon={Barcode}
          accent="muted"
          total={alertas?.totais.semBarcode ?? 0}
          items={alertas?.semBarcode ?? []}
          loading={loading}
          emptyLabel="Todos os itens têm código de barras."
          renderRight={(p) => <span className="text-muted-foreground">{p.stock} un.</span>}
        />
        <AlertaCard
          title="Ajustes excessivos"
          icon={Repeat}
          accent="amber"
          total={alertas?.totais.ajustesExcessivos ?? 0}
          items={alertas?.ajustesExcessivos ?? []}
          loading={loading}
          emptyLabel="Sem produtos com ajustes recorrentes."
          renderRight={(p) => <span className="text-amber-600 dark:text-amber-400">{p.detalhe}</span>}
        />
      </div>

      {/* Filtros */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtros
            </p>
            {filtrosAtivos && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={limparFiltros}>
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>

          {/* Atalhos de período */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Hoje", di: isoToday(), dfv: isoToday() },
              { label: "7 dias", di: isoDaysAgo(7), dfv: isoToday() },
              { label: "30 dias", di: isoDaysAgo(30), dfv: isoToday() },
              { label: "Tudo", di: "", dfv: "" },
            ].map((p) => {
              const active = (filtro.dataInicio ?? "") === p.di && (filtro.dataFim ?? "") === p.dfv
              return (
                <Button
                  key={p.label}
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setFiltro((prev) => ({
                      ...prev,
                      dataInicio: p.di || undefined,
                      dataFim: p.dfv || undefined,
                    }))
                  }
                >
                  {p.label}
                </Button>
              )
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">De</Label>
              <Input
                type="date"
                value={filtro.dataInicio ?? ""}
                onChange={(e) => setF("dataInicio", e.target.value || undefined)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Até</Label>
              <Input
                type="date"
                value={filtro.dataFim ?? ""}
                onChange={(e) => setF("dataFim", e.target.value || undefined)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select
                value={filtro.produtoId ?? "all"}
                onValueChange={(v) => setF("produtoId", v === "all" ? undefined : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os produtos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os produtos</SelectItem>
                  {(data?.filtros.produtos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Usuário</Label>
              <Select
                value={filtro.usuario ?? "all"}
                onValueChange={(v) => setF("usuario", v === "all" ? undefined : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os usuários" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {(data?.filtros.usuarios ?? []).map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select
                value={filtro.somenteAjustes ? "ajuste" : filtro.tipo ?? "all"}
                onValueChange={(v) => setF("tipo", v === "all" ? undefined : v)}
                disabled={filtro.somenteAjustes}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Origem</Label>
              <Select
                value={filtro.origem ?? "all"}
                onValueChange={(v) => setF("origem", v === "all" ? undefined : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Todas as origens" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGEM_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-4 sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={!!filtro.somenteNegativos}
                  onCheckedChange={(c) => setF("somenteNegativos", c === true || undefined)}
                />
                Estoque negativo
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={!!filtro.somenteAjustes}
                  onCheckedChange={(c) => setF("somenteAjustes", c === true || undefined)}
                />
                Somente ajustes
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de movimentações */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3">
          <CardTitle className="text-sm font-semibold">Movimentações</CardTitle>
          {!loading && data && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {movimentacoes.length} de {data.total}
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 whitespace-nowrap text-xs">Data/hora</TableHead>
                  <TableHead className="h-9 text-xs">Produto</TableHead>
                  <TableHead className="h-9 text-xs">Tipo</TableHead>
                  <TableHead className="h-9 text-xs">Origem</TableHead>
                  <TableHead className="h-9 text-right text-xs">Qtd</TableHead>
                  <TableHead className="h-9 whitespace-nowrap text-right text-xs">Saldo</TableHead>
                  <TableHead className="h-9 whitespace-nowrap text-right text-xs">Custo médio</TableHead>
                  <TableHead className="h-9 text-right text-xs">Valor</TableHead>
                  <TableHead className="h-9 text-xs">Usuário</TableHead>
                  <TableHead className="h-9 text-xs">Fornecedor</TableHead>
                  <TableHead className="h-9 text-xs">Documento</TableHead>
                  <TableHead className="h-9 text-xs">Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(12)].map((__, j) => (
                        <TableCell key={j} className="py-2">
                          <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : movimentacoes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <History className="h-6 w-6" />
                        <p className="text-sm font-medium">Nenhuma movimentação encontrada</p>
                        <p className="text-xs">
                          {filtrosAtivos ? "Ajuste os filtros para ampliar o resultado." : "Registre entradas ou ajustes no estoque."}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  movimentacoes.map((m) => <LinhaMovimentacao key={m.id} m={m} />)
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LinhaMovimentacao({ m }: { m: MovimentacaoEstoqueDTO }) {
  const tipo = TIPO_META[m.tipo] ?? { label: m.tipo, className: "border-border bg-muted text-muted-foreground" }
  const origemLabel = ORIGEM_META[m.origem] ?? m.origem
  const qtdPositiva = m.quantidade > 0
  return (
    <TableRow className="text-xs">
      <TableCell className="whitespace-nowrap py-2 font-mono text-[11px] text-muted-foreground">
        {formatDateTime(m.createdAt)}
      </TableCell>
      <TableCell className="py-2">
        <div className="max-w-[220px]">
          <p className="truncate font-medium text-foreground" title={m.produtoNome}>
            {m.produtoNome}
          </p>
          {m.produtoSku && <p className="font-mono text-[10px] text-muted-foreground">{m.produtoSku}</p>}
        </div>
      </TableCell>
      <TableCell className="py-2">
        <Badge variant="outline" className={cn("text-[10px]", tipo.className)}>
          {tipo.label}
        </Badge>
      </TableCell>
      <TableCell className="py-2">
        <span className="text-muted-foreground">{origemLabel}</span>
      </TableCell>
      <TableCell className="py-2 text-right">
        <span className={cn("font-semibold tabular-nums", qtdPositiva ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {qtdPositiva ? "+" : ""}
          {m.quantidade}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
        <span className="text-muted-foreground">{m.estoqueAntes}</span>
        <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
        <span className={cn("font-medium", m.estoqueDepois < 0 ? "text-destructive" : "text-foreground")}>
          {m.estoqueDepois}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">
        {formatCurrency(m.custoMedioDepois)}
      </TableCell>
      <TableCell className="py-2 text-right tabular-nums">
        {m.valorTotal > 0 ? formatCurrency(m.valorTotal) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-2">
        <span className="text-muted-foreground">{m.usuario || "—"}</span>
      </TableCell>
      <TableCell className="py-2">
        <span className="text-muted-foreground">{m.fornecedor || "—"}</span>
      </TableCell>
      <TableCell className="py-2">
        <span className="font-mono text-[10px] text-muted-foreground">{m.documento || "—"}</span>
      </TableCell>
      <TableCell className="py-2">
        <span className="block max-w-[200px] truncate text-muted-foreground" title={m.motivo || m.observacao || ""}>
          {m.motivo || m.observacao || "—"}
        </span>
      </TableCell>
    </TableRow>
  )
}
