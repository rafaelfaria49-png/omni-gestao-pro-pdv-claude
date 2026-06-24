"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ListChecks,
  RefreshCw,
  Loader2,
  Search,
  PackageSearch,
  CheckCircle2,
  ScanBarcode,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
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
import {
  getInventarioProgresso,
  listProdutosNaoConferidos,
  type ProdutoNaoConferidoDTO,
  type ProdutosNaoConferidosFacets,
  type FiltroEstoqueNaoConferido,
} from "@/app/actions/inventario"

const PAGE_SIZE = 50
const TODOS = "__todos__"

const VAZIO_FACETS: ProdutosNaoConferidosFacets = { categorias: [], marcas: [], fornecedores: [] }

function formatBRL(n: number) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * INVENTARIO_CONTINUO_V01 — Lista PERMANENTE de "Produtos ainda não conferidos".
 *
 * Base no catálogo completo da loja, escopada à campanha em andamento (sessão ativa, senão a
 * última). Conforme um produto é contado na aba "Contagem", ele some desta lista. SOMENTE LEITURA.
 */
export function InventarioAConferir({ onIrParaContagem }: { onIrParaContagem?: () => void } = {}) {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [loadingSessao, setLoadingSessao] = useState(true)
  const [sessaoId, setSessaoId] = useState<string | null>(null)
  const [campanhaAtiva, setCampanhaAtiva] = useState(false)
  const [totalCatalogo, setTotalCatalogo] = useState(0)
  const [conferidos, setConferidos] = useState(0)
  const [percentual, setPercentual] = useState(0)

  // Filtros
  const [categoria, setCategoria] = useState(TODOS)
  const [marca, setMarca] = useState(TODOS)
  const [fornecedor, setFornecedor] = useState(TODOS)
  const [estoque, setEstoque] = useState<FiltroEstoqueNaoConferido>("todos")
  const [buscaInput, setBuscaInput] = useState("")
  const [busca, setBusca] = useState("")

  // Resultado
  const [itens, setItens] = useState<ProdutoNaoConferidoDTO[]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<ProdutosNaoConferidosFacets>(VAZIO_FACETS)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  const carregarSessao = useCallback(async () => {
    if (!storeId) {
      setLoadingSessao(false)
      return
    }
    setLoadingSessao(true)
    try {
      const res = await getInventarioProgresso(storeId)
      if (!res.ok) {
        toast({ title: "Falha ao carregar campanha", description: res.reason, variant: "destructive" })
        return
      }
      if (!res.progresso) {
        setSessaoId(null)
        return
      }
      setSessaoId(res.progresso.sessao.id)
      setCampanhaAtiva(res.progresso.ativa)
      setTotalCatalogo(res.progresso.totalCatalogo)
      setConferidos(res.progresso.conferidos)
      setPercentual(res.progresso.percentual)
    } finally {
      setLoadingSessao(false)
    }
  }, [storeId, toast])

  useEffect(() => {
    void carregarSessao()
  }, [carregarSessao])

  const carregarLista = useCallback(async () => {
    if (!storeId || !sessaoId) return
    setLoading(true)
    try {
      const res = await listProdutosNaoConferidos(
        storeId,
        sessaoId,
        {
          categoria: categoria === TODOS ? null : categoria,
          marca: marca === TODOS ? null : marca,
          fornecedor: fornecedor === TODOS ? null : fornecedor,
          estoque,
          busca: busca || null,
        },
        { take: PAGE_SIZE, skip: page * PAGE_SIZE },
      )
      if (!res.ok) {
        toast({ title: "Falha ao listar", description: res.reason, variant: "destructive" })
        return
      }
      setItens(res.itens)
      setTotal(res.total)
      setFacets(res.facets)
    } finally {
      setLoading(false)
    }
  }, [storeId, sessaoId, categoria, marca, fornecedor, estoque, busca, page, toast])

  useEffect(() => {
    void carregarLista()
  }, [carregarLista])

  // Qualquer mudança de filtro volta para a primeira página.
  const onFiltroChange = useCallback(<T,>(setter: (v: T) => void) => {
    return (v: T) => {
      setter(v)
      setPage(0)
    }
  }, [])

  const aplicarBusca = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setBusca(buscaInput.trim())
      setPage(0)
    },
    [buscaInput],
  )

  const restantes = total
  const ultimaPagina = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  const inicio = total === 0 ? 0 : page * PAGE_SIZE + 1
  const fim = Math.min(total, (page + 1) * PAGE_SIZE)

  const header = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <ListChecks className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Produtos a conferir</h2>
          <p className="text-sm text-muted-foreground">
            Catálogo completo da loja que ainda <strong>não foi bipado</strong> nesta campanha. Conforme
            você conta na aba “Contagem”, o produto sai daqui automaticamente.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => void carregarSessao()} disabled={loadingSessao}>
        {loadingSessao ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
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
            Selecione uma loja ativa para ver os produtos a conferir.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!loadingSessao && !sessaoId) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <PackageSearch className="h-8 w-8 text-muted-foreground/60" />
            <p>
              Nenhuma campanha de inventário ainda. Inicie uma contagem na aba “Contagem” para começar a
              acompanhar o que falta conferir.
            </p>
            <Button size="sm" className="gap-2" onClick={() => onIrParaContagem?.()}>
              <ScanBarcode className="h-4 w-4" /> Ir para a contagem
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {/* Headline: catálogo / conferidos / restantes + barra */}
      <Card className="bg-card border-border">
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                Produtos do catálogo: <span className="font-semibold tabular-nums text-foreground">{totalCatalogo.toLocaleString("pt-BR")}</span>
              </span>
              <span className="text-muted-foreground">
                Conferidos: <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{conferidos.toLocaleString("pt-BR")}</span>
              </span>
              <span className="text-muted-foreground">
                Restantes (filtro atual): <span className="font-semibold tabular-nums text-foreground">{restantes.toLocaleString("pt-BR")}</span>
              </span>
            </div>
            <Badge
              variant="outline"
              className={
                campanhaAtiva
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
              }
            >
              {campanhaAtiva ? "Campanha em andamento" : "Última campanha"}
            </Badge>
          </div>
          <Progress value={percentual} aria-label={`${percentual}% conferido`} />
          <p className="text-xs text-muted-foreground">{percentual}% do catálogo conferido.</p>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 text-primary" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={onFiltroChange(setCategoria)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {facets.categorias.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Marca</Label>
            <Select value={marca} onValueChange={onFiltroChange(setMarca)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {facets.marcas.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fornecedor</Label>
            <Select value={fornecedor} onValueChange={onFiltroChange(setFornecedor)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {facets.fornecedores.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estoque</Label>
            <Select value={estoque} onValueChange={onFiltroChange((v: string) => setEstoque(v as FiltroEstoqueNaoConferido))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="positivo">Estoque positivo</SelectItem>
                <SelectItem value="negativo">Estoque negativo</SelectItem>
                <SelectItem value="zero">Sem estoque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={aplicarBusca} className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs" htmlFor="conf-busca">Buscar por nome, SKU ou código</Label>
              <Input
                id="conf-busca"
                placeholder="Ex.: capa, 7891234..."
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" className="gap-2">
              <Search className="h-4 w-4" /> Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageSearch className="h-4 w-4 text-primary" /> Ainda não conferidos
            <Badge variant="secondary" className="tabular-nums">{total.toLocaleString("pt-BR")}</Badge>
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void carregarLista()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar lista
          </Button>
        </CardHeader>
        <CardContent>
          {loading && itens.length === 0 ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted/60" />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <p className="font-medium text-foreground">Nada a conferir com os filtros atuais.</p>
              <p>Todos os produtos deste recorte já foram bipados nesta campanha.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Estoque</TableHead>
                      <TableHead className="text-right">Valor em estoque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((p) => (
                      <TableRow key={p.produtoId}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.codigo ?? "—"}</TableCell>
                        <TableCell className="max-w-[20rem]">
                          <span className="block truncate font-medium text-foreground">{p.nome}</span>
                          {p.sku && p.sku !== p.codigo && (
                            <span className="block truncate text-xs text-muted-foreground">{p.sku}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.categoria ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.marca ?? "—"}</TableCell>
                        <TableCell className="max-w-[10rem] text-xs text-muted-foreground">
                          <span className="block truncate">{p.fornecedor ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{p.estoque}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatBRL(p.valorEmEstoque)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {inicio.toLocaleString("pt-BR")}–{fim.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Página {page + 1} de {ultimaPagina + 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setPage((p) => Math.min(ultimaPagina, p + 1))}
                    disabled={page >= ultimaPagina || loading}
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
