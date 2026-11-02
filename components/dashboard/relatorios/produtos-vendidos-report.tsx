"use client"

/**
 * RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — tela do relatório "Produtos Mais Vendidos".
 * Dados reais via GET /api/vendas/produtos-vendidos (agregação server-side por loja).
 */
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Info, Package, RefreshCw, Search, Tags, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states"
import { EnterpriseAccessDenied } from "@/components/enterprise/EnterpriseAccessDenied"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"
import { useLojaAtiva } from "@/lib/loja-ativa"
import type {
  OrdemRanking,
  ProdutoVendido,
  RelatorioProdutosVendidos,
} from "@/lib/relatorios/produtos-vendidos"
import type { VarianteResumo } from "@/lib/relatorios/produtos-vendidos-variantes"

type Resposta = RelatorioProdutosVendidos & { ok: true; periodo: { from: string; to: string } }
type RespostaVariantes = {
  ok: true
  truncado: boolean
  variantes: VarianteResumo[]
  quantidadeTotal: number
  vendasAnalisadas: number
}

type Preset = "hoje" | "7d" | "30d" | "mes" | "mes_anterior" | "personalizado"
const PRESETS: { id: Preset; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "personalizado", label: "Personalizado" },
]

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const int = new Intl.NumberFormat("pt-BR")
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })

function isoDia(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function intervaloDoPreset(preset: Exclude<Preset, "personalizado">): { de: string; ate: string } {
  const hoje = new Date()
  const menosDias = (n: number) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() - n)
    return d
  }
  switch (preset) {
    case "hoje":
      return { de: isoDia(hoje), ate: isoDia(hoje) }
    case "7d":
      return { de: isoDia(menosDias(6)), ate: isoDia(hoje) }
    case "30d":
      return { de: isoDia(menosDias(29)), ate: isoDia(hoje) }
    case "mes":
      return { de: isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: isoDia(hoje) }
    case "mes_anterior":
      return {
        de: isoDia(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        ate: isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      }
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const SITUACAO_LABEL: Partial<Record<ProdutoVendido["situacao"], string>> = {
  inativo: "Inativo",
  fora_do_catalogo: "Fora do catálogo",
}

export function ProdutosVendidosReport() {
  const perms = useEnterprisePermissions()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = (lojaAtivaId ?? "").trim()

  const [preset, setPreset] = useState<Preset>("30d")
  const [periodo, setPeriodo] = useState(() => intervaloDoPreset("30d"))
  const [categoria, setCategoria] = useState("")
  const [busca, setBusca] = useState("")
  const [incluirTodos, setIncluirTodos] = useState(false)
  const [ordem, setOrdem] = useState<OrdemRanking>("quantidade")
  const buscaDebounced = useDebounced(busca.trim(), 350)

  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  // Guarda só a chave: o painel sempre lê o produto do resultado ATUAL (período/filtros).
  const [selecionadoChave, setSelecionadoChave] = useState<string | null>(null)
  const selecionado = (selecionadoChave && dados?.produtos.find((p) => p.chave === selecionadoChave)) || null
  const setSelecionado = (p: ProdutoVendido | null) => setSelecionadoChave(p?.chave ?? null)
  const reqId = useRef(0)

  const periodoValido = Boolean(periodo.de && periodo.ate && periodo.de <= periodo.ate)
  const fromIso = periodoValido ? new Date(`${periodo.de}T00:00:00`).toISOString() : ""
  const toIso = periodoValido ? new Date(`${periodo.ate}T23:59:59.999`).toISOString() : ""

  const carregar = useCallback(async () => {
    // Invalida qualquer resposta em voo antes de decidir se há nova consulta.
    const id = ++reqId.current
    if (!storeId || !periodoValido) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const params = new URLSearchParams({ from: fromIso, to: toIso, ordem })
      if (categoria) params.set("categoria", categoria)
      if (buscaDebounced) params.set("q", buscaDebounced)
      if (incluirTodos) params.set("todos", "1")
      const res = await fetch(`/api/vendas/produtos-vendidos?${params}`, {
        cache: "no-store",
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const json = (await res.json().catch(() => null)) as (Resposta | { ok: false; error?: string }) | null
      if (id !== reqId.current) return
      if (!res.ok || !json || json.ok !== true) {
        setErro((json && "error" in json && json.error) || `Falha ao carregar (HTTP ${res.status}).`)
        return
      }
      setDados(json)
    } catch {
      if (id === reqId.current) setErro("Sem conexão com o servidor. Verifique a internet e tente novamente.")
    } finally {
      if (id === reqId.current) setCarregando(false)
    }
  }, [storeId, periodoValido, fromIso, toIso, ordem, categoria, buscaDebounced, incluirTodos])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Troca de loja: limpa o recorte da loja anterior antes de mostrar a nova.
  useEffect(() => {
    setDados(null)
    setCategoria("")
    setSelecionadoChave(null)
  }, [storeId])

  // Mesma regra da API: central de relatórios + módulo de vendas (PDV sozinho não basta).
  if (perms && (!perms.hubs.relatorios || !perms.hubs.vendas || perms.modules?.sales !== true)) {
    return (
      <EnterpriseAccessDenied
        title="Relatório indisponível"
        description="Seu perfil não inclui acesso a relatórios de vendas nesta unidade. Fale com o administrador se precisar."
      />
    )
  }

  const categoriaAtiva = dados?.categorias.find((c) => c.chave === categoria)
  const semVendas = dados && dados.totalProdutos === 0

  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-6 px-4 py-6 lg:px-6">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard/relatorios"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Relatórios
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Produtos mais vendidos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ranking por quantidade e receita a partir das vendas registradas desta loja. Canceladas ficam fora; devoluções são
            descontadas da venda de origem.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando || !storeId}>
          <RefreshCw className={cn("mr-2 h-4 w-4", carregando && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card className="min-w-0">
        <CardContent className="space-y-4 p-4">
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Período">
            {PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={preset === p.id ? "default" : "outline"}
                onClick={() => {
                  setPreset(p.id)
                  if (p.id !== "personalizado") setPeriodo(intervaloDoPreset(p.id))
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pv-de" className="text-xs">De</Label>
              <Input
                id="pv-de"
                type="date"
                value={periodo.de}
                onChange={(e) => {
                  setPreset("personalizado")
                  setPeriodo((p) => ({ ...p, de: e.target.value }))
                }}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pv-ate" className="text-xs">Até</Label>
              <Input
                id="pv-ate"
                type="date"
                value={periodo.ate}
                onChange={(e) => {
                  setPreset("personalizado")
                  setPeriodo((p) => ({ ...p, ate: e.target.value }))
                }}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={categoria || "__todas__"} onValueChange={(v) => setCategoria(v === "__todas__" ? "" : v)}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas__">Todas as categorias</SelectItem>
                  {dados?.categorias.map((c) => (
                    <SelectItem key={c.chave} value={c.chave}>
                      {c.nome}
                    </SelectItem>
                  ))}
                  {categoria && !categoriaAtiva ? <SelectItem value={categoria}>{categoria}</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="pv-busca" className="text-xs">Buscar produto</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pv-busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, SKU ou código de barras"
                  className="pl-8 pr-8"
                />
                {busca ? (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    onClick={() => setBusca("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={incluirTodos} onCheckedChange={setIncluirTodos} />
              Incluir itens avulsos, serviços e O.S.
            </label>
            <div className="flex items-center gap-2" role="group" aria-label="Ordenar ranking">
              <span className="text-xs text-muted-foreground">Ordenar por</span>
              <Button size="sm" variant={ordem === "quantidade" ? "default" : "outline"} onClick={() => setOrdem("quantidade")}>
                Quantidade
              </Button>
              <Button size="sm" variant={ordem === "receita" ? "default" : "outline"} onClick={() => setOrdem("receita")}>
                Receita
              </Button>
            </div>
          </div>
          {!periodoValido ? (
            <p className="text-xs text-destructive">Informe um período válido (data inicial até a final).</p>
          ) : null}
        </CardContent>
      </Card>

      {!storeId ? (
        <EmptyState title="Nenhuma loja selecionada" description="Selecione uma loja para ver o relatório." icon={Package} />
      ) : erro && !dados ? (
        <ErrorState
          title="Não foi possível carregar o relatório"
          description={erro}
          action={{ label: "Tentar novamente", onClick: () => void carregar() }}
        />
      ) : !dados ? (
        <LoadingState message="Calculando vendas do período…" />
      ) : (
        <div className={cn("min-w-0 space-y-6 transition-opacity", carregando && "opacity-60")} aria-busy={carregando}>
          {erro ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {erro} Exibindo o último resultado carregado.
            </p>
          ) : null}

          {/* KPIs */}
          <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              titulo="Itens vendidos (líquido)"
              valor={int.format(dados.totais.quantidadeLiquida)}
              detalhe={`${int.format(dados.totais.quantidadeBruta)} vendidos · ${int.format(dados.totais.quantidadeDevolvida)} devolvidos`}
            />
            <Kpi
              titulo="Receita líquida"
              valor={brl.format(dados.totais.receitaLiquida)}
              detalhe={`${brl.format(dados.totais.receitaBruta)} bruta · ${brl.format(dados.totais.valorDevolvido)} devolvida`}
            />
            <Kpi
              titulo="Vendas no período"
              valor={int.format(dados.vendas.quantidade)}
              detalhe={
                dados.canceladas.quantidade > 0
                  ? `${int.format(dados.canceladas.quantidade)} canceladas excluídas (${brl.format(dados.canceladas.total)})`
                  : "Nenhuma cancelada"
              }
            />
            <Kpi
              titulo={incluirTodos ? "Itens distintos" : "Produtos distintos"}
              valor={int.format(dados.totalProdutos)}
              detalhe={categoriaAtiva ? `Categoria: ${categoriaAtiva.nome}` : "Todas as categorias"}
            />
          </div>

          {semVendas ? (
            <EmptyState
              title="Nenhuma venda encontrada"
              description={
                buscaDebounced || categoria
                  ? "Nenhum produto vendido corresponde aos filtros neste período."
                  : dados.vendas.quantidade > 0 && !incluirTodos
                    ? "As vendas do período não têm produtos do catálogo. Ative “Incluir itens avulsos, serviços e O.S.” para vê-las."
                    : "Não há vendas registradas nesta loja no período selecionado."
              }
              icon={Package}
              dashboardLink={false}
              action={
                buscaDebounced || categoria
                  ? { label: "Limpar filtros", onClick: () => { setBusca(""); setCategoria("") } }
                  : undefined
              }
            />
          ) : (
            <>
              {/* Resumo por categoria */}
              <section className="min-w-0 space-y-3">
                <div className="flex items-center gap-2">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Por categoria</h2>
                  {categoria ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCategoria("")}>
                      Ver todas
                    </Button>
                  ) : null}
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {dados.categorias.map((c) => {
                    const ativa = c.chave === categoria
                    return (
                      <button
                        key={c.chave}
                        type="button"
                        onClick={() => setCategoria(ativa ? "" : c.chave)}
                        aria-pressed={ativa}
                        className={cn(
                          "min-w-0 rounded-xl border p-3 text-left transition-colors",
                          ativa ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30",
                        )}
                      >
                        <p className="truncate text-xs font-medium text-muted-foreground" title={c.nome}>
                          {c.nome}
                        </p>
                        <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{int.format(c.quantidadeLiquida)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {brl.format(c.receitaLiquida)} · {int.format(c.produtos)} {c.produtos === 1 ? "item" : "itens"}
                        </p>
                        {c.quantidadeDevolvida > 0 ? (
                          <p className="truncate text-[11px] text-warning">{int.format(c.quantidadeDevolvida)} devolvidos</p>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Ranking */}
              <section className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    Ranking por {ordem === "receita" ? "receita líquida" : "quantidade líquida"}
                  </h2>
                  {dados.totalProdutos > dados.produtos.length ? (
                    <p className="text-xs text-muted-foreground">
                      Mostrando os {int.format(dados.produtos.length)} primeiros de {int.format(dados.totalProdutos)}. Use a busca ou a
                      categoria para refinar.
                    </p>
                  ) : null}
                </div>

                {/* Desktop */}
                <Card className="hidden min-w-0 overflow-hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead className="text-right">Qtd. líquida</TableHead>
                        <TableHead className="text-right">Receita líquida</TableHead>
                        <TableHead className="text-right">Preço médio</TableHead>
                        <TableHead className="w-40">Participação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dados.produtos.map((p, i) => (
                        <TableRow key={p.chave} className="cursor-pointer" onClick={() => setSelecionado(p)}>
                          <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="max-w-[22rem]">
                            <ProdutoIdentidade p={p} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="font-semibold text-foreground">{int.format(p.quantidadeLiquida)}</span>
                            {p.quantidadeDevolvida > 0 ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {int.format(p.quantidadeBruta)} − {int.format(p.quantidadeDevolvida)} dev.
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="font-semibold text-foreground">{brl.format(p.receitaLiquida)}</span>
                            {p.valorDevolvido > 0 ? (
                              <span className="block text-[11px] text-muted-foreground">
                                {brl.format(p.receitaBruta)} bruta
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{brl.format(p.precoMedio)}</TableCell>
                          <TableCell>
                            <Participacao valor={ordem === "receita" ? p.participacaoReceita : p.participacaoQuantidade} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                {/* Mobile */}
                <div className="space-y-2 md:hidden">
                  {dados.produtos.map((p, i) => (
                    <button
                      key={p.chave}
                      type="button"
                      onClick={() => setSelecionado(p)}
                      className="w-full min-w-0 rounded-xl border border-border bg-card p-3 text-left"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 w-6 shrink-0 text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <ProdutoIdentidade p={p} />
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span>
                              <span className="font-semibold text-foreground">{int.format(p.quantidadeLiquida)}</span>{" "}
                              <span className="text-muted-foreground">un.</span>
                            </span>
                            <span className="font-semibold text-foreground">{brl.format(p.receitaLiquida)}</span>
                            {p.quantidadeDevolvida > 0 ? (
                              <span className="text-muted-foreground">{int.format(p.quantidadeDevolvida)} devolvidos</span>
                            ) : null}
                          </div>
                          <Participacao
                            className="mt-2"
                            valor={ordem === "receita" ? p.participacaoReceita : p.participacaoQuantidade}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          <ComoCalculamos dados={dados} />
        </div>
      )}

      <DetalheProduto
        produto={selecionado}
        onClose={() => setSelecionado(null)}
        storeId={storeId}
        fromIso={fromIso}
        toIso={toIso}
      />
    </div>
  )
}

function Kpi({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe: string }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <p className="truncate text-xs font-medium text-muted-foreground">{titulo}</p>
        <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground sm:text-2xl">{valor}</p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  )
}

function Participacao({ valor, className }: { valor: number; className?: string }) {
  const largura = Math.max(0, Math.min(100, valor * 100))
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${largura}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct.format(valor)}</span>
    </div>
  )
}

function ProdutoIdentidade({ p }: { p: ProdutoVendido }) {
  const situacao = SITUACAO_LABEL[p.situacao]
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground" title={p.nome}>
        {p.nome}
      </p>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
          {p.categoriaNome}
        </Badge>
        {p.sku ? <span className="truncate">SKU {p.sku}</span> : null}
        {situacao ? (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {situacao}
          </Badge>
        ) : null}
      </div>
      {p.nomesNaVenda.length > 0 ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={p.nomesNaVenda.join(" · ")}>
          Vendido como: {p.nomesNaVenda.join(" · ")}
        </p>
      ) : null}
    </div>
  )
}

function ComoCalculamos({ dados }: { dados: Resposta }) {
  const d = dados.diagnostico
  return (
    <details className="group min-w-0 rounded-xl border border-border bg-card/60 p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground">
        <Info className="h-4 w-4 text-muted-foreground" />
        Como os números são calculados
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
        <li>Considera as vendas registradas no banco com data dentro do período, somente desta loja.</li>
        <li>Vendas canceladas não entram no ranking (aparecem apenas no total de canceladas).</li>
        <li>
          Devoluções são descontadas da venda de origem, mesmo que registradas depois do período, e nunca passam do que a venda
          vendeu daquele produto.
        </li>
        <li>
          Receita é a soma do valor das linhas gravadas na venda. Descontos ou acréscimos lançados só no total da venda não são
          distribuídos entre os produtos.
        </li>
        <li>Margem e lucro não são exibidos: o custo do produto guardado hoje não é o custo da época da venda.</li>
        {Math.abs(d.ajusteNaoRateado) >= 0.01 ? (
          <li>
            Diferença entre o total das vendas e a soma das linhas no período: {brl.format(d.ajusteNaoRateado)} (ajustes gerais
            não distribuídos por produto).
          </li>
        ) : null}
        {d.devolucoesSemVenda.documentos > 0 ? (
          <li>
            {int.format(d.devolucoesSemVenda.documentos)} devolução(ões) no período sem venda vinculada encontrada (
            {int.format(d.devolucoesSemVenda.quantidade)} itens, {brl.format(d.devolucoesSemVenda.valor)}) não puderam ser
            descontadas de nenhum produto.
          </li>
        ) : null}
        {d.quantidadeDevolvidaDescartada > 0 ? (
          <li>
            {int.format(d.quantidadeDevolvidaDescartada)} unidade(s) devolvidas acima do vendido na mesma venda foram
            desconsideradas.
          </li>
        ) : null}
      </ul>
    </details>
  )
}

function DetalheProduto({
  produto,
  onClose,
  storeId,
  fromIso,
  toIso,
}: {
  produto: ProdutoVendido | null
  onClose: () => void
  storeId: string
  fromIso: string
  toIso: string
}) {
  const [estado, setEstado] = useState<
    { tipo: "idle" } | { tipo: "carregando" } | { tipo: "erro"; msg: string } | { tipo: "ok"; dados: RespostaVariantes }
  >({ tipo: "idle" })
  const produtoId = produto?.produtoId ?? null
  const reqId = useRef(0)

  const carregar = useCallback(async () => {
    // Toda chamada nova (ou troca de produto/período) descarta respostas antigas em voo.
    const id = ++reqId.current
    if (!produtoId || !storeId || !fromIso) return
    setEstado({ tipo: "carregando" })
    try {
      const params = new URLSearchParams({ produtoId, from: fromIso, to: toIso })
      const res = await fetch(`/api/vendas/produtos-vendidos/variantes?${params}`, {
        cache: "no-store",
        credentials: "include",
        headers: { "x-assistec-loja-id": storeId },
      })
      const json = (await res.json().catch(() => null)) as (RespostaVariantes | { ok: false; error?: string }) | null
      if (id !== reqId.current) return
      if (!res.ok || !json || json.ok !== true) {
        setEstado({ tipo: "erro", msg: (json && "error" in json && json.error) || `HTTP ${res.status}` })
        return
      }
      setEstado({ tipo: "ok", dados: json })
    } catch {
      if (id === reqId.current) setEstado({ tipo: "erro", msg: "Sem conexão com o servidor." })
    }
  }, [produtoId, storeId, fromIso, toIso])

  useEffect(() => {
    setEstado({ tipo: "idle" })
    void carregar()
    const contador = reqId
    return () => {
      contador.current++
    }
  }, [carregar])

  const somenteSemDetalhe = useMemo(
    () => estado.tipo === "ok" && estado.dados.variantes.every((v) => v.origem !== "variante"),
    [estado],
  )

  return (
    <Sheet open={!!produto} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {produto ? (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{produto.nome}</SheetTitle>
              <SheetDescription>
                {produto.categoriaNome}
                {produto.sku ? ` · SKU ${produto.sku}` : ""}
                {produto.codigoBarras ? ` · EAN ${produto.codigoBarras}` : ""}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Linha rotulo="Vendidos (bruto)" valor={int.format(produto.quantidadeBruta)} />
                <Linha rotulo="Devolvidos" valor={int.format(produto.quantidadeDevolvida)} />
                <Linha rotulo="Líquido" valor={int.format(produto.quantidadeLiquida)} destaque />
                <Linha rotulo="Preço médio" valor={brl.format(produto.precoMedio)} />
                <Linha rotulo="Receita bruta" valor={brl.format(produto.receitaBruta)} />
                <Linha rotulo="Receita líquida" valor={brl.format(produto.receitaLiquida)} destaque />
              </div>
              {produto.nomesNaVenda.length > 0 ? (
                <p className="text-xs text-muted-foreground">Também vendido como: {produto.nomesNaVenda.join(" · ")}</p>
              ) : null}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Modelo / cor vendidos</h3>
                {!produtoId ? (
                  <p className="text-xs text-muted-foreground">
                    Item sem cadastro no catálogo atual — não há detalhamento por variante.
                  </p>
                ) : estado.tipo === "carregando" || estado.tipo === "idle" ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : estado.tipo === "erro" ? (
                  <ErrorState compact description={estado.msg} action={{ label: "Tentar novamente", onClick: () => void carregar() }} />
                ) : (
                  <>
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {estado.dados.variantes.map((v) => (
                        <li key={v.chave} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span
                            className={cn("min-w-0 truncate", v.origem === "variante" ? "text-foreground" : "text-muted-foreground")}
                            title={v.rotulo}
                          >
                            {v.rotulo}
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="font-semibold text-foreground">{int.format(v.quantidade)}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{brl.format(v.receita)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Quantidades brutas (antes de devoluções), conforme o modelo/cor registrado no momento da venda.
                      {somenteSemDetalhe ? " Este produto não teve modelo/cor registrado nas vendas do período." : ""}
                      {estado.dados.truncado ? ` Análise limitada às ${int.format(estado.dados.vendasAnalisadas)} vendas mais recentes.` : ""}
                    </p>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-2.5">
      <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={cn("truncate tabular-nums", destaque ? "font-bold text-foreground" : "font-medium text-foreground")}>{valor}</p>
    </div>
  )
}
