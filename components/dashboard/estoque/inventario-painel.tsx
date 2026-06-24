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
  ListChecks,
  Gauge,
  PlusCircle,
  Link2,
  Clock,
  CalendarDays,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
  getInventarioProgresso,
  getInventarioSaneamentoTimeline,
  type InventarioSessaoDTO,
  type InventarioSessaoHistoricoDTO,
  type RelatorioInventarioDTO,
  type InventarioProgressoDTO,
  type InventarioSaneamentoDTO,
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
 * Painel do Inventário Assistido: dashboard de PROGRESSO + saneamento + retomar sessão + histórico.
 * `onIrParaContagem`/`onIrParaAConferir`/`onAbrirRelatorio` navegam entre as abas (sem rota nova).
 */
export function InventarioPainel({
  onIrParaContagem,
  onIrParaAConferir,
  onAbrirRelatorio,
}: {
  onIrParaContagem?: () => void
  onIrParaAConferir?: () => void
  onAbrirRelatorio?: (sessaoId: string) => void
}) {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [dash, setDash] = useState<DashboardData | null>(null)
  const [historico, setHistorico] = useState<InventarioSessaoHistoricoDTO[]>([])
  const [progresso, setProgresso] = useState<InventarioProgressoDTO | null>(null)
  const [saneamento, setSaneamento] = useState<InventarioSaneamentoDTO | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!storeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [d, h, p, s] = await Promise.all([
        getInventarioDashboard(storeId),
        getInventarioHistorico(storeId),
        getInventarioProgresso(storeId),
        getInventarioSaneamentoTimeline(storeId),
      ])
      if (d.ok) setDash({ sessaoAtiva: d.sessaoAtiva, ultimaSessao: d.ultimaSessao, kpis: d.kpis })
      else toast({ title: "Falha ao carregar painel", description: d.reason, variant: "destructive" })
      if (h.ok) setHistorico(h.sessoes)
      else toast({ title: "Falha ao carregar histórico", description: h.reason, variant: "destructive" })
      if (p.ok) setProgresso(p.progresso)
      if (s.ok) setSaneamento(s.saneamento)
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

      {/* Retomar sessão em andamento — continua de onde parou (mesmo após dias/desligar o PC) */}
      {sessaoAtiva && (
        <Card className="border-l-4 border-l-emerald-500 bg-card border-border">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">O inventário está em andamento.</p>
                <p className="text-xs text-muted-foreground">
                  {(sessaoAtiva.nome || "Sem nome")} · {sessaoAtiva.operador || "—"} · início {formatDateTime(sessaoAtiva.iniciadoEm)}
                  {progresso && <> · <span className="font-medium text-foreground">{progresso.percentual}%</span> conferido</>}
                </p>
                {progresso?.ultimoProduto && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    Último: <span className="font-medium text-foreground">{progresso.ultimoProduto}</span> · {formatDateTime(progresso.ultimoBipeEm)}
                  </p>
                )}
              </div>
            </div>
            <Button size="sm" className="gap-2 shrink-0" onClick={() => onIrParaContagem?.()}>
              Continuar inventário <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dashboard "Progresso do inventário" / "Ainda falta conferir" */}
      {progresso && <ProgressoCard progresso={progresso} onIrParaAConferir={onIrParaAConferir} />}

      {/* Histórico do saneamento — hoje / ontem / semana */}
      {saneamento && <SaneamentoCard saneamento={saneamento} />}

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

/** Item compacto rótulo + valor (com ícone e acento opcional). */
function MiniStat({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string
  value: number | string
  icon: typeof CheckCircle2
  accent?: "default" | "emerald" | "amber" | "destructive"
}) {
  const color = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    destructive: "text-destructive",
  } as const
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-0.5 text-lg font-bold tabular-nums", color[accent])}>{value}</p>
    </div>
  )
}

/**
 * Dashboard "Progresso do inventário" / "Ainda falta conferir": barra de progresso + total do
 * catálogo, conferidos e restantes, mais o detalhamento (novos, reconciliados, divergências,
 * suspeitos). Atualiza a cada recarga do painel.
 */
function ProgressoCard({
  progresso,
  onIrParaAConferir,
}: {
  progresso: InventarioProgressoDTO
  onIrParaAConferir?: () => void
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-primary" /> Progresso do inventário
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => onIrParaAConferir?.()}>
          <ListChecks className="h-4 w-4" /> Produtos a conferir
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline: catálogo / conferidos / restantes / % */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Catálogo: <span className="font-semibold tabular-nums text-foreground">{progresso.totalCatalogo.toLocaleString("pt-BR")}</span>
            </span>
            <span className="text-muted-foreground">
              Conferidos: <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{progresso.conferidos.toLocaleString("pt-BR")}</span>
            </span>
            <span className="text-muted-foreground">
              Restantes: <span className="font-semibold tabular-nums text-foreground">{progresso.naoConferidos.toLocaleString("pt-BR")}</span>
            </span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-primary">{progresso.percentual}%</span>
        </div>
        <Progress value={progresso.percentual} aria-label={`${progresso.percentual}% conferido`} />

        {/* Detalhamento */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MiniStat label="Unidades contadas" value={progresso.unidadesContadas.toLocaleString("pt-BR")} icon={Boxes} />
          <MiniStat label="Novos encontrados" value={progresso.novosEncontrados} icon={PlusCircle} accent={progresso.novosEncontrados > 0 ? "amber" : "default"} />
          <MiniStat label="Reconciliados" value={progresso.reconciliados} icon={Link2} accent={progresso.reconciliados > 0 ? "emerald" : "default"} />
          <MiniStat label="Divergências" value={progresso.divergencias} icon={AlertTriangle} accent={progresso.divergencias > 0 ? "amber" : "default"} />
          <MiniStat label="Suspeitos antigos" value={progresso.suspeitosAntigos} icon={Clock} accent={progresso.suspeitosAntigos > 0 ? "destructive" : "default"} />
        </div>
        {progresso.naoConferidos === 0 && progresso.totalCatalogo > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Catálogo inteiro conferido nesta campanha. Revise os não encontrados na aba “Conciliação” antes de fechar.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Histórico do saneamento: o que foi feito hoje, ontem e na semana (conferidos/novos/reconciliados). */
function SaneamentoCard({ saneamento }: { saneamento: InventarioSaneamentoDTO }) {
  const blocos = [
    { titulo: "Hoje", dados: saneamento.hoje },
    { titulo: "Ontem", dados: saneamento.ontem },
    { titulo: "Semana", dados: saneamento.semana },
  ] as const
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" /> Histórico do saneamento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {saneamento.sessao.operador || "—"} · {saneamento.ativa ? "campanha em andamento" : "última campanha"}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {blocos.map((b) => (
          <div key={b.titulo} className="rounded-md border border-border bg-background p-3">
            <p className="mb-2 text-sm font-semibold text-foreground">{b.titulo}</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground"><ScanLine className="h-3.5 w-3.5" /> Conferidos</span>
                <span className="font-semibold tabular-nums text-foreground">{b.dados.conferidos}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground"><PlusCircle className="h-3.5 w-3.5" /> Novos cadastrados</span>
                <span className="font-semibold tabular-nums text-foreground">{b.dados.novos}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground"><Link2 className="h-3.5 w-3.5" /> Reconciliados</span>
                <span className="font-semibold tabular-nums text-foreground">{b.dados.reconciliados}</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
