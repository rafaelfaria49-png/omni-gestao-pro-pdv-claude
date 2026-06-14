"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PackageSearch,
  PackageX,
  Search,
  PlusCircle,
  EyeOff,
  ClipboardList,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  getRelatorioInventario,
  listInventarioSessoes,
  type RelatorioInventarioDTO,
  type RelatorioEncontradoDTO,
  type InventarioSessaoDTO,
} from "@/app/actions/inventario"

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function DiferencaCell({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : value < 0
            ? "text-destructive"
            : "text-muted-foreground"
      )}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  )
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
  loading,
}: {
  label: string
  value: number
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

// ─── Componente ────────────────────────────────────────────────────────────────

type FiltroEncontrados = "todos" | "sem-diferenca" | "com-diferenca"

export function InventarioRelatorios() {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [sessoes, setSessoes] = useState<InventarioSessaoDTO[]>([])
  const [sessaoId, setSessaoId] = useState<string>("")
  const [relatorio, setRelatorio] = useState<RelatorioInventarioDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtroA, setFiltroA] = useState<FiltroEncontrados>("todos")

  // Carrega a lista de sessões e seleciona a mais recente por padrão.
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
      setRelatorio(null)
      setLoading(false)
    }
  }, [storeId, toast])

  const carregarRelatorio = useCallback(
    async (id: string) => {
      if (!storeId || !id) return
      setLoading(true)
      try {
        const res = await getRelatorioInventario(storeId, id)
        if (!res.ok) {
          toast({ title: "Falha ao gerar relatório", description: res.reason, variant: "destructive" })
          return
        }
        setRelatorio(res.relatorio)
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
    if (sessaoId) void carregarRelatorio(sessaoId)
  }, [sessaoId, carregarRelatorio])

  const encontradosFiltrados = useMemo<RelatorioEncontradoDTO[]>(() => {
    const list = relatorio?.encontrados ?? []
    if (filtroA === "sem-diferenca") return list.filter((e) => e.diferenca === 0)
    if (filtroA === "com-diferenca") return list.filter((e) => e.diferenca !== 0)
    return list
  }, [relatorio?.encontrados, filtroA])

  const resumo = relatorio?.resumo

  // Ações da fila de reconciliação — UI apenas (F4 fará o efeito real).
  const acaoReconciliacaoIndisponivel = useCallback(() => {
    toast({
      title: "Ação ainda não disponível",
      description: "Reconciliar, localizar e cadastrar serão liberados na próxima fase (F4). Nada foi alterado.",
    })
  }, [toast])

  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Relatórios do inventário</h2>
          <p className="text-sm text-muted-foreground">
            Auditoria da contagem — somente leitura. <strong>Não altera estoque</strong>, não cadastra e
            não reconcilia automaticamente.
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
          onClick={() => void carregarRelatorio(sessaoId)}
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
            Selecione uma loja ativa para ver os relatórios.
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

      {/* Resumo executivo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Produtos encontrados" value={resumo?.encontrados ?? 0} icon={CheckCircle2} accent="emerald" loading={loading} />
        <KpiCard
          label="Produtos com divergência"
          value={resumo?.divergencias ?? 0}
          icon={AlertTriangle}
          accent={(resumo?.divergencias ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
        <KpiCard
          label="Itens em reconciliação"
          value={resumo?.reconciliacao ?? 0}
          icon={ClipboardList}
          accent={(resumo?.reconciliacao ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
        <KpiCard
          label="Produtos não bipados"
          value={resumo?.naoBipados ?? 0}
          icon={PackageX}
          accent={(resumo?.naoBipados ?? 0) > 0 ? "destructive" : "default"}
          loading={loading}
        />
      </div>

      {/* Relatórios A/B/C/D */}
      <Tabs defaultValue="encontrados" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="encontrados" className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Encontrados
            <Badge variant="secondary" className="ml-1 tabular-nums">{resumo?.encontrados ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="divergencias" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Divergências
            <Badge variant="secondary" className="ml-1 tabular-nums">{resumo?.divergencias ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="reconciliacao" className="gap-2">
            <ClipboardList className="h-4 w-4" /> Reconciliação
            <Badge variant="secondary" className="ml-1 tabular-nums">{resumo?.reconciliacao ?? 0}</Badge>
          </TabsTrigger>
          <TabsTrigger value="nao-bipados" className="gap-2">
            <PackageX className="h-4 w-4" /> Não bipados
            <Badge variant="secondary" className="ml-1 tabular-nums">{resumo?.naoBipados ?? 0}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* A — ENCONTRADOS */}
        <TabsContent value="encontrados">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageSearch className="h-4 w-4 text-primary" /> Relatório A — Encontrados
              </CardTitle>
              <div className="flex items-center gap-1">
                {(
                  [
                    { v: "todos", label: "Todos" },
                    { v: "sem-diferenca", label: "Sem diferença" },
                    { v: "com-diferenca", label: "Com diferença" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.v}
                    size="sm"
                    variant={filtroA === opt.v ? "default" : "outline"}
                    onClick={() => setFiltroA(opt.v)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {encontradosFiltrados.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item nesta visão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Estoque sistema</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {encontradosFiltrados.map((e) => (
                        <TableRow key={e.produtoId}>
                          <TableCell className="max-w-[24rem]">
                            <span className="block truncate font-medium text-foreground">{e.nome}</span>
                            {e.sku && <span className="block truncate text-xs text-muted-foreground">{e.sku}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.codigo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{e.estoqueSistema}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{e.quantidadeContada}</TableCell>
                          <TableCell className="text-right"><DiferencaCell value={e.diferenca} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* B — DIVERGÊNCIAS */}
        <TabsContent value="divergencias">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Relatório B — Divergências
              </CardTitle>
              <p className="text-xs text-muted-foreground">Contado ≠ sistema, ordenado pela maior diferença.</p>
            </CardHeader>
            <CardContent>
              {(relatorio?.divergencias ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma divergência nesta sessão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Sistema</TableHead>
                        <TableHead className="text-right">Contado</TableHead>
                        <TableHead className="text-right">Diferença</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatorio?.divergencias ?? []).map((e) => (
                        <TableRow key={e.produtoId}>
                          <TableCell className="max-w-[24rem]">
                            <span className="block truncate font-medium text-foreground">{e.nome}</span>
                            {e.sku && <span className="block truncate text-xs text-muted-foreground">{e.sku}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.codigo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{e.estoqueSistema}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{e.quantidadeContada}</TableCell>
                          <TableCell className="text-right"><DiferencaCell value={e.diferenca} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* C — FILA DE RECONCILIAÇÃO */}
        <TabsContent value="reconciliacao">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Relatório C — Fila de reconciliação
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Códigos bipados sem produto no catálogo. As ações abaixo serão executadas na F4 — por ora
                nada é alterado.
              </p>
            </CardHeader>
            <CardContent>
              {(relatorio?.reconciliacao ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item em reconciliação.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código bipado</TableHead>
                        <TableHead className="text-right">Qtd. observada</TableHead>
                        <TableHead>Data/hora</TableHead>
                        <TableHead>Sessão</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatorio?.reconciliacao ?? []).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.codigoBipado}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{r.quantidadeContada}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDateTime(r.ultimoBipeEm)}</TableCell>
                          <TableCell className="max-w-[14rem]">
                            <span className="block truncate">{r.sessaoNome || "Sem nome"}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <Button size="sm" variant="outline" className="gap-1" onClick={acaoReconciliacaoIndisponivel}>
                                <Search className="h-3.5 w-3.5" /> Localizar
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1" onClick={acaoReconciliacaoIndisponivel}>
                                <PlusCircle className="h-3.5 w-3.5" /> Cadastrar
                              </Button>
                              <Button size="sm" variant="ghost" className="gap-1" onClick={acaoReconciliacaoIndisponivel}>
                                <EyeOff className="h-3.5 w-3.5" /> Ignorar
                              </Button>
                            </div>
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

        {/* D — NÃO BIPADOS */}
        <TabsContent value="nao-bipados">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageX className="h-4 w-4 text-destructive" /> Relatório D — Produtos não bipados
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Produtos do sistema que não apareceram na contagem. <strong>Não é permitido zerar</strong> —
                apenas conferência pendente.
              </p>
            </CardHeader>
            <CardContent>
              {(relatorio?.naoBipados ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Todos os produtos do sistema foram bipados nesta sessão.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Estoque atual</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatorio?.naoBipados ?? []).map((n) => (
                        <TableRow key={n.produtoId}>
                          <TableCell className="max-w-[24rem]">
                            <span className="block truncate font-medium text-foreground">{n.nome}</span>
                            {n.sku && <span className="block truncate text-xs text-muted-foreground">{n.sku}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{n.codigo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{n.estoqueSistema}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              Conferência pendente
                            </Badge>
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
      </Tabs>
    </div>
  )
}
