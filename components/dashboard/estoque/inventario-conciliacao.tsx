"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Scale,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PackageX,
  Lock,
  Calculator,
  ArrowRightLeft,
  Clock,
  ShieldAlert,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  getConciliacaoInventario,
  simularConciliacaoInventario,
  aplicarConciliacaoInventario,
  listInventarioSessoes,
  type ConciliacaoInventarioDTO,
  type ConciliacaoItemDTO,
  type ConciliacaoNaoEncontradoDTO,
  type SimularConciliacaoResult,
  type InventarioSessaoDTO,
} from "@/app/actions/inventario"

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function formatBRL(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const SESSAO_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
}

function rotuloSessao(s: InventarioSessaoDTO): string {
  const nome = s.nome || "Sem nome"
  const status = SESSAO_STATUS_LABEL[s.status] ?? s.status
  return `${nome} · ${status} · ${formatDateTime(s.iniciadoEm)}`
}

/** Número assinado com cor (verde = positivo, vermelho = negativo). */
function Signed({ value, zeroMuted = true }: { value: number; zeroMuted?: boolean }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : value < 0
            ? "text-destructive"
            : zeroMuted
              ? "text-muted-foreground"
              : "text-foreground"
      )}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
  loading,
}: {
  label: string
  value: string | number
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
            <div className="h-7 w-14 animate-pulse rounded bg-muted" />
          ) : (
            <p className="truncate text-xl font-bold tabular-nums text-foreground">{value}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

const GRUPO_BADGE: Record<string, { label: string; className: string }> = {
  ok: { label: "Conciliado", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  com_movimentacao: { label: "Conciliado (c/ movimentação)", className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  com_divergencia: { label: "Divergência", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  nao_encontrado: { label: "Não encontrado", className: "border-destructive/30 bg-destructive/10 text-destructive" },
  suspeito_antigo: { label: "Suspeito antigo", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function InventarioConciliacao({ sessaoIdInicial }: { sessaoIdInicial?: string | null } = {}) {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [sessoes, setSessoes] = useState<InventarioSessaoDTO[]>([])
  const [sessaoId, setSessaoId] = useState<string>("")
  const [conc, setConc] = useState<ConciliacaoInventarioDTO | null>(null)
  const [loading, setLoading] = useState(true)

  // Seleção para aplicar (por produtoId).
  const [selDiv, setSelDiv] = useState<Set<string>>(new Set())
  const [selNao, setSelNao] = useState<Set<string>>(new Set())

  // Simulação / aplicação.
  const [simulando, setSimulando] = useState(false)
  const [simulacao, setSimulacao] = useState<Extract<SimularConciliacaoResult, { ok: true }> | null>(null)
  const [aplicando, setAplicando] = useState(false)

  const carregarSessoes = useCallback(async () => {
    if (!storeId) {
      setLoading(false)
      return
    }
    const res = await listInventarioSessoes(storeId)
    if (!res.ok) {
      toast({ title: "Falha ao listar sessões", description: res.reason, variant: "destructive" })
      setLoading(false)
      return
    }
    setSessoes(res.sessoes)
    setSessaoId((prev) => prev || res.sessoes[0]?.id || "")
    if (res.sessoes.length === 0) {
      setConc(null)
      setLoading(false)
    }
  }, [storeId, toast])

  const carregarConciliacao = useCallback(
    async (id: string) => {
      if (!storeId || !id) return
      setLoading(true)
      setSelDiv(new Set())
      setSelNao(new Set())
      try {
        const res = await getConciliacaoInventario(storeId, id)
        if (!res.ok) {
          toast({ title: "Falha na conciliação", description: res.reason, variant: "destructive" })
          return
        }
        setConc(res.conciliacao)
      } finally {
        setLoading(false)
      }
    },
    [storeId, toast]
  )

  useEffect(() => {
    void carregarSessoes()
  }, [carregarSessoes])

  useEffect(() => {
    if (sessaoId) void carregarConciliacao(sessaoId)
  }, [sessaoId, carregarConciliacao])

  useEffect(() => {
    if (sessaoIdInicial) setSessaoId(sessaoIdInicial)
  }, [sessaoIdInicial])

  const totais = conc?.totais
  const sessaoFinalizada = conc?.sessao.status === "finalizada"

  // 5 grupos visuais: conciliados (sem mov.), com movimentação, divergência real,
  // não encontrados e suspeitos antigos.
  const conciliadosOk = useMemo<ConciliacaoItemDTO[]>(
    () => (conc?.itens ?? []).filter((i) => i.grupo === "ok"),
    [conc?.itens]
  )
  const conciliadosMov = useMemo<ConciliacaoItemDTO[]>(
    () => (conc?.itens ?? []).filter((i) => i.grupo === "com_movimentacao"),
    [conc?.itens]
  )
  const conciliados = useMemo<ConciliacaoItemDTO[]>(
    () => (conc?.itens ?? []).filter((i) => i.grupo !== "com_divergencia"),
    [conc?.itens]
  )
  const divergencias = useMemo<ConciliacaoItemDTO[]>(
    () => (conc?.itens ?? []).filter((i) => i.grupo === "com_divergencia"),
    [conc?.itens]
  )
  const naoEncontrados = conc?.naoEncontrados ?? []
  const naoEncSomente = useMemo<ConciliacaoNaoEncontradoDTO[]>(
    () => (conc?.naoEncontrados ?? []).filter((n) => n.grupo === "nao_encontrado"),
    [conc?.naoEncontrados]
  )
  const suspeitos = useMemo<ConciliacaoNaoEncontradoDTO[]>(
    () => (conc?.naoEncontrados ?? []).filter((n) => n.grupo === "suspeito_antigo"),
    [conc?.naoEncontrados]
  )

  // Itens elegíveis para seleção (pendentes de ajuste).
  const divPendentes = useMemo(() => divergencias.filter((d) => !d.ajusteAplicado), [divergencias])
  const naoPendentes = useMemo(() => naoEncontrados.filter((n) => !n.ajusteAplicado), [naoEncontrados])

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const totalSelecionado = selDiv.size + selNao.size

  const abrirSimulacao = useCallback(async () => {
    if (!conc || !storeId || totalSelecionado === 0) return
    setSimulando(true)
    setSimulacao(null)
    try {
      const res = await simularConciliacaoInventario(storeId, conc.sessao.id, {
        divergenciaProdutoIds: [...selDiv],
        naoEncontradoProdutoIds: [...selNao],
      })
      if (!res.ok) {
        toast({ title: "Falha ao simular", description: res.reason, variant: "destructive" })
        return
      }
      setSimulacao(res)
    } finally {
      setSimulando(false)
    }
  }, [conc, storeId, totalSelecionado, selDiv, selNao, toast])

  const confirmarAplicacao = useCallback(async () => {
    if (!conc || !storeId) return
    setAplicando(true)
    try {
      const res = await aplicarConciliacaoInventario(storeId, conc.sessao.id, {
        divergenciaProdutoIds: [...selDiv],
        naoEncontradoProdutoIds: [...selNao],
      })
      if (!res.ok) {
        toast({ title: "Não foi possível aplicar", description: res.reason, variant: "destructive" })
        return
      }
      const { divergenciasAplicadas, naoEncontradosZerados, pulados, falhas } = res.resumo
      toast({
        title: "Conciliação aplicada",
        description: `${divergenciasAplicadas} divergência(s) ajustada(s), ${naoEncontradosZerados} produto(s) zerado(s).${
          pulados ? ` ${pulados} já estavam aplicados.` : ""
        }${falhas.length ? ` ${falhas.length} falha(s).` : ""}`,
        variant: falhas.length ? "destructive" : undefined,
      })
      setSimulacao(null)
      await carregarConciliacao(conc.sessao.id)
    } finally {
      setAplicando(false)
    }
  }, [conc, storeId, selDiv, selNao, toast, carregarConciliacao])

  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <Scale className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Conciliação inteligente</h2>
          <p className="text-sm text-muted-foreground">
            Considera vendas, OS, devoluções e entradas <strong>após a contagem</strong> para não acusar
            divergência falsa em inventários de vários dias.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {sessoes.length > 0 && (
          <Select value={sessaoId} onValueChange={setSessaoId}>
            <SelectTrigger className="w-[18rem] max-w-full">
              <SelectValue placeholder="Selecione a sessão" />
            </SelectTrigger>
            <SelectContent>
              {sessoes.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {rotuloSessao(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void carregarConciliacao(sessaoId)}
          disabled={loading || !sessaoId}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>
    </div>
  )

  if (!storeId) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione uma loja ativa para conciliar.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!loading && sessoes.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma sessão de inventário ainda. Inicie uma contagem na aba “Contagem”.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Produtos contados" value={totais?.contados ?? 0} icon={CheckCircle2} accent="default" loading={loading} />
        <KpiCard
          label="Conciliados (c/ movimentação)"
          value={totais?.comMovimentacao ?? 0}
          icon={ArrowRightLeft}
          accent="emerald"
          loading={loading}
        />
        <KpiCard
          label="Com divergência real"
          value={totais?.comDivergencia ?? 0}
          icon={AlertTriangle}
          accent={(totais?.comDivergencia ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
        <KpiCard
          label="Não encontrados"
          value={totais?.naoEncontrados ?? 0}
          icon={PackageX}
          accent={(totais?.naoEncontrados ?? 0) > 0 ? "destructive" : "default"}
          loading={loading}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Produtos cadastrados" value={totais?.cadastrados ?? 0} icon={Scale} loading={loading} />
        <KpiCard label="Suspeitos antigos" value={totais?.suspeitosAntigos ?? 0} icon={Clock} accent="default" loading={loading} />
        <KpiCard
          label="Impacto a custo (não encontrados)"
          value={formatBRL(totais?.impactoCustoNaoEncontrados ?? 0)}
          icon={PackageX}
          accent={(totais?.impactoCustoNaoEncontrados ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
        <KpiCard
          label="Impacto a venda (não encontrados)"
          value={formatBRL(totais?.impactoVendaNaoEncontrados ?? 0)}
          icon={PackageX}
          accent={(totais?.impactoVendaNaoEncontrados ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
      </div>

      {/* Barra de ação: seleção + simular */}
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            {sessaoFinalizada ? (
              <>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Selecione divergências e/ou não encontrados, <strong>simule</strong> o impacto e aplique. Cada
                  ajuste é auditado no livro-razão de estoque. Itens já aplicados são pulados.
                </span>
              </>
            ) : (
              <>
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Esta sessão ainda está <strong>aberta</strong>. Encerre o inventário (aba “Contagem”) para
                  liberar a aplicação — a conciliação abaixo é uma <strong>prévia ao vivo</strong>.
                </span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">{totalSelecionado} selecionado(s)</Badge>
            <Button className="gap-2" disabled={totalSelecionado === 0 || simulando} onClick={() => void abrirSimulacao()}>
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Simular conciliação
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="conciliados" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="conciliados" className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Conciliados
            <Badge variant="secondary" className="ml-1 tabular-nums">{conciliados.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="divergencias" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Divergências
            <Badge variant="secondary" className="ml-1 tabular-nums">{divergencias.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="nao-encontrados" className="gap-2">
            <PackageX className="h-4 w-4" /> Não encontrados
            <Badge variant="secondary" className="ml-1 tabular-nums">{naoEncontrados.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* CONCILIADOS (OK + com movimentação) — separados em dois grupos visuais */}
        <TabsContent value="conciliados">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Conciliados
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Contado + movimentação após a contagem = estoque atual. Nada a ajustar.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {conciliados.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item conciliado nesta visão.</p>
              ) : (
                <>
                  <GrupoSecao
                    icon={CheckCircle2}
                    iconClassName="text-emerald-600 dark:text-emerald-400"
                    label="Conciliados (sem movimentação)"
                    hint="Contado = estoque atual, sem venda/entrada após a contagem."
                    count={conciliadosOk.length}
                  >
                    <ItensConciliadosTable items={conciliadosOk} />
                  </GrupoSecao>
                  <GrupoSecao
                    icon={ArrowRightLeft}
                    iconClassName="text-sky-600 dark:text-sky-400"
                    label="Com movimentação após contagem"
                    hint="Houve venda/OS/entrada depois da contagem; o sistema recalculou e bate."
                    count={conciliadosMov.length}
                  >
                    <ItensConciliadosTable items={conciliadosMov} />
                  </GrupoSecao>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DIVERGÊNCIAS REAIS */}
        <TabsContent value="divergencias">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Divergências reais
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Mesmo considerando as movimentações, ainda sobra diferença. Aplicar grava o saldo esperado hoje.
                </p>
              </div>
              {divPendentes.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelDiv((prev) =>
                      prev.size === divPendentes.length ? new Set() : new Set(divPendentes.map((d) => d.produtoId))
                    )
                  }
                >
                  {selDiv.size === divPendentes.length ? "Limpar seleção" : "Selecionar todos"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {divergencias.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma divergência real nesta sessão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Mov. pós</TableHead>
                        <TableHead className="text-right">Esperado hoje</TableHead>
                        <TableHead className="text-right">Atual</TableHead>
                        <TableHead className="text-right">Divergência</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {divergencias.map((d) => (
                        <TableRow key={d.produtoId} data-state={selDiv.has(d.produtoId) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selDiv.has(d.produtoId)}
                              disabled={d.ajusteAplicado}
                              onCheckedChange={() => toggle(setSelDiv, d.produtoId)}
                              aria-label={`Selecionar ${d.nome}`}
                            />
                          </TableCell>
                          <TableCell className="max-w-[20rem]">
                            <span className="block truncate font-medium text-foreground">{d.nome}</span>
                            {d.sku && <span className="block truncate text-xs text-muted-foreground">{d.sku}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{d.quantidadeContada}</TableCell>
                          <TableCell className="text-right"><Signed value={d.movimentacaoPosContagem} /></TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{d.saldoEsperadoHoje}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{d.estoqueAtual}</TableCell>
                          <TableCell className="text-right"><Signed value={d.divergenciaReal} zeroMuted={false} /></TableCell>
                          <TableCell>
                            {d.ajusteAplicado ? (
                              <Badge variant="outline" className="whitespace-nowrap border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                Ajustado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="whitespace-nowrap border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                Pendente
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NÃO ENCONTRADOS */}
        <TabsContent value="nao-encontrados">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageX className="h-4 w-4 text-destructive" /> Produtos não encontrados
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Estoque positivo no sistema, não bipados no inventário. Zerar gera baixa oficial auditada — só
                  depois de checar prateleira, depósito, balcão e caixa.
                </p>
              </div>
              {naoPendentes.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelNao((prev) =>
                      prev.size === naoPendentes.length ? new Set() : new Set(naoPendentes.map((n) => n.produtoId))
                    )
                  }
                >
                  {selNao.size === naoPendentes.length ? "Limpar seleção" : "Selecionar todos"}
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {naoEncontrados.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Todos os produtos com estoque foram conferidos nesta sessão.
                </p>
              ) : (
                <>
                  <GrupoSecao
                    icon={PackageX}
                    iconClassName="text-destructive"
                    label="Não encontrados / não bipados"
                    hint="Com estoque no sistema, ausentes na contagem. Confira prateleira, depósito e caixa antes de zerar."
                    count={naoEncSomente.length}
                  >
                    <NaoEncontradosTable items={naoEncSomente} sel={selNao} onToggle={(id) => toggle(setSelNao, id)} />
                  </GrupoSecao>
                  <GrupoSecao
                    icon={Clock}
                    iconClassName="text-muted-foreground"
                    label="Suspeitos antigos"
                    hint="Sem movimentação há muito tempo (ou nunca). Provável estoque fantasma — revise com atenção."
                    count={suspeitos.length}
                  >
                    <NaoEncontradosTable items={suspeitos} sel={selNao} onToggle={(id) => toggle(setSelNao, id)} />
                  </GrupoSecao>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Diálogo de simulação → aplicar */}
      <Dialog open={simulacao !== null} onOpenChange={(o) => { if (!o) setSimulacao(null) }}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Calculator className="h-5 w-5 text-primary" /> Simulação da conciliação
            </DialogTitle>
            <DialogDescription>
              Revise o impacto antes de aplicar. Nada foi alterado ainda.
            </DialogDescription>
          </DialogHeader>

          {simulacao && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Resumo label="Produtos a alterar" value={simulacao.simulacao.produtosAlterados} />
                <Resumo label="Produtos a zerar" value={simulacao.simulacao.produtosZerados} />
                <Resumo label="Unidades baixadas" value={simulacao.simulacao.unidadesBaixadas} accent="destructive" />
                <Resumo label="Unidades adicionadas" value={simulacao.simulacao.unidadesAdicionadas} accent="emerald" />
                <Resumo label="Divergências +" value={simulacao.simulacao.divergenciasPositivas} />
                <Resumo label="Divergências −" value={simulacao.simulacao.divergenciasNegativas} />
                <Resumo label="Impacto a custo" value={formatBRL(simulacao.simulacao.custoImpactado)} />
                <Resumo label="Impacto a venda" value={formatBRL(simulacao.simulacao.vendaImpactado)} />
              </div>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Responsável: <span className="font-medium text-foreground">{simulacao.operador ?? "—"}</span>
                </span>
                {!sessaoFinalizada && (
                  <span className="mt-1 flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Lock className="h-3.5 w-3.5" /> Encerre a sessão para liberar a aplicação.
                  </span>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setSimulacao(null)} disabled={aplicando}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarAplicacao()}
              disabled={aplicando || !sessaoFinalizada || (simulacao?.simulacao.produtosAlterados ?? 0) === 0}
            >
              {aplicando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Aplicar conciliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Resumo({
  label,
  value,
  accent = "default",
}: {
  label: string
  value: string | number
  accent?: "default" | "emerald" | "destructive"
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "destructive"
        ? "text-destructive"
        : "text-foreground"
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", color)}>{value}</p>
    </div>
  )
}

/** Seção de grupo da conciliação: cabeçalho (ícone + rótulo + contagem + dica) + conteúdo. */
function GrupoSecao({
  icon: Icon,
  iconClassName,
  label,
  hint,
  count,
  children,
}: {
  icon: typeof CheckCircle2
  iconClassName?: string
  label: string
  hint?: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Badge variant="secondary" className="tabular-nums">{count}</Badge>
        {hint && <span className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:min-w-0">{hint}</span>}
      </div>
      {count === 0 ? (
        <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          Nenhum item neste grupo.
        </p>
      ) : (
        children
      )}
    </div>
  )
}

/** Tabela de itens conciliados (sem seleção) — reusada nos grupos OK e com movimentação. */
function ItensConciliadosTable({ items }: { items: ConciliacaoItemDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead className="text-right">Contado</TableHead>
            <TableHead className="text-right">Mov. pós-contagem</TableHead>
            <TableHead className="text-right">Saldo esperado hoje</TableHead>
            <TableHead className="text-right">Estoque atual</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => {
            const badge = GRUPO_BADGE[i.grupo]
            return (
              <TableRow key={i.produtoId}>
                <TableCell className="max-w-[22rem]">
                  <span className="block truncate font-medium text-foreground">{i.nome}</span>
                  {i.sku && <span className="block truncate text-xs text-muted-foreground">{i.sku}</span>}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{i.quantidadeContada}</TableCell>
                <TableCell className="text-right"><Signed value={i.movimentacaoPosContagem} /></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{i.saldoEsperadoHoje}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{i.estoqueAtual}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("whitespace-nowrap", badge.className)}>{badge.label}</Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** Tabela de não encontrados (com seleção) — reusada nos grupos não encontrado e suspeito antigo. */
function NaoEncontradosTable({
  items,
  sel,
  onToggle,
}: {
  items: ConciliacaoNaoEncontradoDTO[]
  sel: Set<string>
  onToggle: (produtoId: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Produto</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Estoque</TableHead>
            <TableHead className="text-right">Custo</TableHead>
            <TableHead className="text-right">Impacto custo</TableHead>
            <TableHead>Última venda</TableHead>
            <TableHead>Últ. movimentação</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((n) => {
            const badge = GRUPO_BADGE[n.grupo]
            return (
              <TableRow key={n.produtoId} data-state={sel.has(n.produtoId) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={sel.has(n.produtoId)}
                    disabled={n.ajusteAplicado}
                    onCheckedChange={() => onToggle(n.produtoId)}
                    aria-label={`Selecionar ${n.nome}`}
                  />
                </TableCell>
                <TableCell className="max-w-[18rem]">
                  <span className="block truncate font-medium text-foreground">{n.nome}</span>
                  {n.sku && <span className="block truncate text-xs text-muted-foreground">{n.sku}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{n.categoria ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{n.estoqueAtual}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatBRL(n.precoCusto)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(n.impactoCusto)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(n.ultimaVendaEm)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(n.ultimaMovimentacaoEm)}</TableCell>
                <TableCell>
                  {n.ajusteAplicado ? (
                    <Badge variant="outline" className="whitespace-nowrap border-muted-foreground/30 bg-muted text-muted-foreground">
                      Zerado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn("whitespace-nowrap", badge.className)}>
                      {n.grupo === "suspeito_antigo" && <Clock className="mr-1 h-3 w-3" />}
                      {badge.label}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
