"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ClipboardList,
  RefreshCw,
  Copy,
  EyeOff,
  CheckCircle2,
  PackagePlus,
  Repeat,
  Barcode,
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
  lerProdutosACadastrar,
  definirStatusProdutoACadastrar,
  contarOcorrenciasPorCodigo,
  normalizarCodigoCadastro,
  type ProdutoACadastrarRecord,
  type ProdutoACadastrarStatus,
} from "@/lib/pdv-produtos-a-cadastrar"

function formatCurrency(v: number | null) {
  if (v === null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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

const STATUS_META: Record<ProdutoACadastrarStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  cadastrado: { label: "Cadastrado", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ignorado: { label: "Ignorado", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
}

type Filtro = "todos" | ProdutoACadastrarStatus

const FILTROS: { v: Filtro; label: string }[] = [
  { v: "todos", label: "Todos" },
  { v: "pendente", label: "Pendentes" },
  { v: "cadastrado", label: "Cadastrados" },
  { v: "ignorado", label: "Ignorados" },
]

export function ProdutosACadastrar() {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [registros, setRegistros] = useState<ProdutoACadastrarRecord[]>([])
  const [filtro, setFiltro] = useState<Filtro>("pendente")

  const carregar = useCallback(() => {
    if (!storeId) {
      setRegistros([])
      return
    }
    setRegistros(lerProdutosACadastrar(storeId))
  }, [storeId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const ocorrenciasPorCodigo = useMemo(() => contarOcorrenciasPorCodigo(registros), [registros])

  const visiveis = useMemo(
    () => (filtro === "todos" ? registros : registros.filter((r) => r.status === filtro)),
    [registros, filtro]
  )

  const contagem = useMemo(() => {
    let pendente = 0
    let cadastrado = 0
    let ignorado = 0
    for (const r of registros) {
      if (r.status === "pendente") pendente += 1
      else if (r.status === "cadastrado") cadastrado += 1
      else ignorado += 1
    }
    return { pendente, cadastrado, ignorado, total: registros.length }
  }, [registros])

  const mudarStatus = useCallback(
    (id: string, status: ProdutoACadastrarStatus) => {
      if (!storeId) return
      setRegistros(definirStatusProdutoACadastrar(storeId, id, status))
    },
    [storeId]
  )

  const copiarDados = useCallback(
    async (r: ProdutoACadastrarRecord) => {
      const linhas = [
        `Nome: ${r.nome}`,
        `Código/SKU: ${r.codigo ?? "—"}`,
        `Preço de venda: ${formatCurrency(r.precoVenda)}`,
        `Custo: ${formatCurrency(r.custo)}`,
        `Qtd vendida: ${r.quantidade}`,
        `Venda: ${r.vendaId}`,
      ].join("\n")
      try {
        await navigator.clipboard.writeText(linhas)
        toast({ title: "Dados copiados", description: "Cole no cadastro do produto." })
      } catch {
        toast({ title: "Não foi possível copiar", description: "Copie manualmente os dados da linha.", variant: "destructive" })
      }
    },
    [toast]
  )

  // "Cadastrar produto" com pré-preenchimento seguro é follow-up (Cadastros é HUB isolado).
  const cadastrarProduto = useCallback(
    (r: ProdutoACadastrarRecord) => {
      toast({
        title: "Cadastro pré-preenchido — em breve",
        description: `Use "Copiar dados" e cadastre "${r.nome}" em Estoque/Produtos. O pré-preenchimento automático chega numa próxima fase.`,
      })
    },
    [toast]
  )

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <ClipboardList className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Produtos a cadastrar</h1>
          <p className="text-sm text-muted-foreground">
            Itens avulsos vendidos no balcão (INSERT) que ainda não estão no catálogo. Lista de revisão —{" "}
            <strong>não altera estoque nem cria produto</strong>.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="gap-2" onClick={carregar}>
        <RefreshCw className="h-4 w-4" />
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
            Selecione uma loja ativa para ver a fila.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-4 w-4 text-primary" /> Fila
            <span className="text-sm font-normal text-muted-foreground">
              · {contagem.pendente} pendente(s) · {contagem.cadastrado} cadastrado(s) · {contagem.ignorado} ignorado(s)
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            {FILTROS.map((f) => (
              <Button
                key={f.v}
                size="sm"
                variant={filtro === f.v ? "default" : "outline"}
                onClick={() => setFiltro(f.v)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {visiveis.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {registros.length === 0
                ? "Nenhum item avulso vendido ainda. Vendas com Item Avulso (INSERT) aparecem aqui."
                : "Nenhum item nesta visão."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nome digitado</TableHead>
                    <TableHead>Código/SKU</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Preço venda</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Venda</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((r) => {
                    const meta = STATUS_META[r.status]
                    const codigoNorm = normalizarCodigoCadastro(r.codigo)
                    const ocorrencias = codigoNorm ? ocorrenciasPorCodigo.get(codigoNorm) ?? 1 : 1
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.criadoEm)}</TableCell>
                        <TableCell className="max-w-[16rem]">
                          <span className="block truncate font-medium text-foreground">{r.nome}</span>
                        </TableCell>
                        <TableCell>
                          {codigoNorm ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1 font-mono text-xs">
                                <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
                                {codigoNorm}
                              </span>
                              {ocorrencias > 1 && (
                                <Badge variant="outline" className="w-fit gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                  <Repeat className="h-3 w-3" /> Mesmo código vendido {ocorrencias}×
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">sem código</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{r.quantidade}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(r.precoVenda)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(r.custo)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.vendaId}</TableCell>
                        <TableCell className="max-w-[10rem]">
                          <span className="block truncate text-muted-foreground">{r.operador ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => void copiarDados(r)}>
                              <Copy className="h-3.5 w-3.5" /> Copiar
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => cadastrarProduto(r)}>
                              <PackagePlus className="h-3.5 w-3.5" /> Cadastrar
                            </Button>
                            {r.status !== "cadastrado" && (
                              <Button size="sm" variant="ghost" className="gap-1 text-emerald-600 dark:text-emerald-400" onClick={() => mudarStatus(r.id, "cadastrado")}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Cadastrado
                              </Button>
                            )}
                            {r.status !== "ignorado" && (
                              <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => mudarStatus(r.id, "ignorado")}>
                                <EyeOff className="h-3.5 w-3.5" /> Ignorar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        A fila fica salva neste dispositivo/navegador (por loja). Não sincroniza entre terminais nesta fase.
      </p>
    </div>
  )
}
