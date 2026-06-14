"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  LayoutDashboard,
  RefreshCw,
  Loader2,
  PlayCircle,
  History,
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  PackageX,
  Boxes,
  ScanLine,
  Wrench,
  ArrowRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"
import {
  getInventarioDashboard,
  getInventarioHistorico,
  type InventarioSessaoDTO,
  type InventarioSessaoHistoricoDTO,
  type RelatorioInventarioDTO,
} from "@/app/actions/inventario"

function formatDateTime(iso: string | null) {
  if (!iso) return "—"
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

const SESSAO_STATUS_META: Record<string, { label: string; className: string }> = {
  aberta: { label: "Aberta", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  finalizada: { label: "Finalizada", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
  cancelada: { label: "Cancelada", className: "border-destructive/30 bg-destructive/10 text-destructive" },
}

function StatusBadge({ status }: { status: string }) {
  const meta = SESSAO_STATUS_META[status] ?? SESSAO_STATUS_META.finalizada
  return <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>{meta.label}</Badge>
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
  loading,
}: {
  label: string
  value: number | string
  icon: typeof CheckCircle2
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
            <div className="h-7 w-12 animate-pulse rounded bg-muted" />
          ) : (
            <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

type DashboardData = {
  sessaoAtiva: InventarioSessaoDTO | null
  ultimaSessao: InventarioSessaoDTO | null
  kpis: RelatorioInventarioDTO["resumo"] | null
}

/**
 * Painel do Inventário Assistido (F5): dashboard + retomar sessão + histórico.
 * `onIrParaContagem`/`onAbrirRelatorio` navegam entre as abas da página (sem rota nova).
 */
export function InventarioPainel({
  onIrParaContagem,
  onAbrirRelatorio,
}: {
  onIrParaContagem?: () => void
  onAbrirRelatorio?: (sessaoId: string) => void
}) {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [dash, setDash] = useState<DashboardData | null>(null)
  const [historico, setHistorico] = useState<InventarioSessaoHistoricoDTO[]>([])
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!storeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [d, h] = await Promise.all([getInventarioDashboard(storeId), getInventarioHistorico(storeId)])
      if (d.ok) setDash({ sessaoAtiva: d.sessaoAtiva, ultimaSessao: d.ultimaSessao, kpis: d.kpis })
      else toast({ title: "Falha ao carregar painel", description: d.reason, variant: "destructive" })
      if (h.ok) setHistorico(h.sessoes)
      else toast({ title: "Falha ao carregar histórico", description: h.reason, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [storeId, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const kpis = dash?.kpis
  const sessaoAtiva = dash?.sessaoAtiva ?? null

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <LayoutDashboard className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Painel do inventário</h2>
          <p className="text-sm text-muted-foreground">Visão geral, sessão em andamento e histórico de contagens.</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => void carregar()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Atualizar
      </Button>
    </div>
  )

  if (!storeId) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione uma loja ativa para ver o painel.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Retomar sessão em andamento */}
      {sessaoAtiva && (
        <Card className="border-l-4 border-l-emerald-500 bg-card border-border">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Existe uma sessão de inventário em andamento.</p>
                <p className="text-xs text-muted-foreground">
                  {(sessaoAtiva.nome || "Sem nome")} · {sessaoAtiva.operador || "—"} · início {formatDateTime(sessaoAtiva.iniciadoEm)}
                </p>
              </div>
            </div>
            <Button size="sm" className="gap-2 shrink-0" onClick={() => onIrParaContagem?.()}>
              Continuar contagem <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Indicadores operacionais (sessão ativa, senão última finalizada) */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {sessaoAtiva ? "Sessão em andamento" : dash?.ultimaSessao ? `Última sessão · ${formatDateTime(dash.ultimaSessao.finalizadoEm)}` : "Sem sessões ainda"}
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard label="Produtos contados" value={kpis?.encontrados ?? 0} icon={ScanLine} accent="emerald" loading={loading} />
          <KpiCard label="Divergências" value={kpis?.divergencias ?? 0} icon={AlertTriangle} accent={(kpis?.divergencias ?? 0) > 0 ? "amber" : "default"} loading={loading} />
          <KpiCard label="Reconciliações" value={kpis?.reconciliacao ?? 0} icon={ClipboardList} accent={(kpis?.reconciliacao ?? 0) > 0 ? "amber" : "default"} loading={loading} />
          <KpiCard label="Ajustes aplicados" value={kpis?.ajustesAplicados ?? 0} icon={Wrench} loading={loading} />
          <KpiCard label="Não bipados" value={kpis?.naoBipados ?? 0} icon={PackageX} accent={(kpis?.naoBipados ?? 0) > 0 ? "destructive" : "default"} loading={loading} />
        </div>
      </div>

      {/* Resumo da última sessão (quando não há sessão ativa) */}
      {!sessaoAtiva && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PlayCircle className="h-4 w-4 text-muted-foreground" /> Sessão ativa
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Nenhuma sessão em andamento.{" "}
              <button className="font-medium text-primary hover:underline" onClick={() => onIrParaContagem?.()}>
                Iniciar contagem
              </button>
              .
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-muted-foreground" /> Última sessão
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {dash?.ultimaSessao ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-foreground">{dash.ultimaSessao.nome || "Sem nome"}</span>
                  <StatusBadge status={dash.ultimaSessao.status} />
                </div>
              ) : (
                <span className="text-muted-foreground">Nenhuma sessão finalizada.</span>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Histórico de sessões */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Histórico de sessões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
          ) : historico.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma sessão ainda. Inicie a primeira contagem na aba “Contagem”.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Sessão</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Divergências</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(s.iniciadoEm)}</TableCell>
                      <TableCell className="max-w-[14rem]">
                        <span className="flex items-center gap-1.5">
                          <Boxes className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium text-foreground">{s.nome || "Sem nome"}</span>
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[10rem]">
                        <span className="block truncate text-muted-foreground">{s.operador ?? "—"}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.storeId}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.unidadesContadas}
                        <span className="ml-1 text-xs text-muted-foreground">un.</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.divergencias == null ? <span className="text-muted-foreground">—</span> : s.divergencias}
                      </TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => onAbrirRelatorio?.(s.id)}>
                          Abrir relatório <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
