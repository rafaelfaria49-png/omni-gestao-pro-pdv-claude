"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ClipboardCheck,
  ScanBarcode,
  Play,
  Square,
  RefreshCw,
  Loader2,
  PackageSearch,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { cn } from "@/lib/utils"
import {
  iniciarInventario,
  getInventarioAtivo,
  registrarBipe,
  registrarPendenciaInventario,
  listInventarioContagens,
  encerrarInventario,
  type InventarioSessaoDTO,
  type InventarioContagemDTO,
} from "@/app/actions/inventario"
import { InventarioPendenciaModal } from "@/components/dashboard/estoque/inventario-pendencia-modal"

// ─── Resolução de código via endpoint existente ────────────────────────────────
// Reusa `GET /api/ops/inventory/lookup` (match exato barcode/sku/id no catálogo inteiro da
// loja). Retorna o id Prisma (`dbId`) do produto, que a Server Action re-valida no banco.

type LookupResult =
  | { kind: "found"; produtoId: string; nome: string }
  | { kind: "none" }
  | { kind: "error" }

async function resolverProdutoPorCodigo(code: string, storeId: string): Promise<LookupResult> {
  try {
    const res = await fetch(
      `/api/ops/inventory/lookup?code=${encodeURIComponent(code)}&lojaId=${encodeURIComponent(storeId)}`,
      { credentials: "include", headers: { [ASSISTEC_LOJA_HEADER]: storeId } }
    )
    if (!res.ok) return { kind: "error" }
    const json = (await res.json()) as { items?: Array<{ dbId?: unknown; name?: unknown }> }
    const items = Array.isArray(json.items) ? json.items : []
    const first = items.find((i) => typeof i.dbId === "string" && i.dbId)
    if (!first) return { kind: "none" }
    return {
      kind: "found",
      produtoId: String(first.dbId),
      nome: typeof first.name === "string" ? first.name : code,
    }
  } catch {
    return { kind: "error" }
  }
}

// ─── Helpers de exibição ───────────────────────────────────────────────────────

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

const STATUS_META: Record<string, { label: string; className: string }> = {
  encontrado: {
    label: "Encontrado",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  reconciliacao: {
    label: "Reconciliação necessária",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
}

// ─── Componente ────────────────────────────────────────────────────────────────

export function InventarioAssistido() {
  const { toast } = useToast()
  const { lojaAtivaId } = useLojaAtiva()
  const storeId = useMemo(() => (lojaAtivaId ?? "").trim(), [lojaAtivaId])

  const [loading, setLoading] = useState(true)
  const [sessao, setSessao] = useState<InventarioSessaoDTO | null>(null)
  const [contagens, setContagens] = useState<InventarioContagemDTO[]>([])

  // Form de abertura
  const [nome, setNome] = useState("")
  const [operador, setOperador] = useState("")
  const [iniciando, setIniciando] = useState(false)

  // Bipagem
  const [codigo, setCodigo] = useState("")
  const [bipando, setBipando] = useState(false)
  const [ultimoBipe, setUltimoBipe] = useState<InventarioContagemDTO | null>(null)
  const [encerrando, setEncerrando] = useState(false)
  const [recarregando, setRecarregando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Modal de pendência (código sem produto resolvido)
  const [pendenciaCodigo, setPendenciaCodigo] = useState<string | null>(null)
  const [registrandoPendencia, setRegistrandoPendencia] = useState(false)

  const carregar = useCallback(async () => {
    if (!storeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await getInventarioAtivo(storeId)
      if (!res.ok) {
        toast({ title: "Falha ao carregar inventário", description: res.reason, variant: "destructive" })
        return
      }
      setSessao(res.sessao)
      setContagens(res.contagens)
      setUltimoBipe(null)
    } finally {
      setLoading(false)
    }
  }, [storeId, toast])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Foca o leitor assim que a sessão fica ativa.
  useEffect(() => {
    if (sessao) inputRef.current?.focus()
  }, [sessao])

  const handleIniciar = useCallback(async () => {
    if (!storeId) {
      toast({ title: "Selecione uma loja", description: "Nenhuma unidade ativa.", variant: "destructive" })
      return
    }
    setIniciando(true)
    try {
      const res = await iniciarInventario(storeId, { nome, operador })
      if (!res.ok) {
        toast({ title: "Não foi possível iniciar", description: res.reason, variant: "destructive" })
        return
      }
      setSessao(res.sessao)
      setContagens([])
      setUltimoBipe(null)
      setNome("")
      setOperador("")
    } finally {
      setIniciando(false)
    }
  }, [storeId, nome, operador, toast])

  const handleBipe = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const code = codigo.trim()
      if (!code || !sessao || !storeId) return
      setBipando(true)
      try {
        const lookup = await resolverProdutoPorCodigo(code, storeId)
        if (lookup.kind === "error") {
          toast({
            title: "Falha ao consultar produto",
            description: "Não foi possível verificar o código agora. Tente novamente.",
            variant: "destructive",
          })
          return
        }
        if (lookup.kind === "none") {
          // Código sem produto: abre o modal de captura em vez de registrar direto. Quantidade
          // observada + nome rápido (opcional) só vão para a fila depois da confirmação humana.
          setPendenciaCodigo(code)
          setCodigo("")
          return
        }
        const res = await registrarBipe(storeId, { sessaoId: sessao.id, codigo: code, produtoId: lookup.produtoId })
        if (!res.ok) {
          toast({ title: "Falha ao registrar bipe", description: res.reason, variant: "destructive" })
          return
        }
        setContagens(res.contagens)
        setUltimoBipe(res.contagem)
        setCodigo("")
      } finally {
        setBipando(false)
        inputRef.current?.focus()
      }
    },
    [codigo, sessao, storeId, toast]
  )

  const jaPendenteDoModal = useMemo(() => {
    if (!pendenciaCodigo) return null
    const row = contagens.find((c) => c.codigoBipado === pendenciaCodigo && c.status === "reconciliacao")
    return row ? { quantidadeContada: row.quantidadeContada } : null
  }, [pendenciaCodigo, contagens])

  const handleCancelarPendencia = useCallback(() => {
    setPendenciaCodigo(null)
    inputRef.current?.focus()
  }, [])

  const handleConfirmarPendencia = useCallback(
    async (dados: { quantidade: number; nomeRapido: string }) => {
      if (!pendenciaCodigo || !sessao || !storeId) return
      setRegistrandoPendencia(true)
      try {
        const res = await registrarPendenciaInventario(storeId, {
          sessaoId: sessao.id,
          codigo: pendenciaCodigo,
          quantidade: dados.quantidade,
          nomeRapido: dados.nomeRapido || null,
        })
        if (!res.ok) {
          toast({ title: "Falha ao registrar pendência", description: res.reason, variant: "destructive" })
          return
        }
        setContagens(res.contagens)
        setUltimoBipe(res.contagem)
        toast({
          title: "Produto não cadastrado",
          description: "Separe uma unidade física. O item ficou na fila de reconciliação para identificar depois.",
        })
        setPendenciaCodigo(null)
      } finally {
        setRegistrandoPendencia(false)
        inputRef.current?.focus()
      }
    },
    [pendenciaCodigo, sessao, storeId, toast]
  )

  const handleRecarregar = useCallback(async () => {
    if (!sessao || !storeId) return
    setRecarregando(true)
    try {
      const res = await listInventarioContagens(storeId, sessao.id)
      if (res.ok) setContagens(res.contagens)
      else toast({ title: "Falha ao atualizar", description: res.reason, variant: "destructive" })
    } finally {
      setRecarregando(false)
    }
  }, [sessao, storeId, toast])

  const handleEncerrar = useCallback(async () => {
    if (!sessao || !storeId) return
    const ok = window.confirm(
      "Encerrar o inventário? A contagem será congelada. Nenhum estoque será alterado."
    )
    if (!ok) return
    setEncerrando(true)
    try {
      const res = await encerrarInventario(storeId, sessao.id)
      if (!res.ok) {
        toast({ title: "Falha ao encerrar", description: res.reason, variant: "destructive" })
        return
      }
      toast({ title: "Sessão encerrada", description: "Nenhum estoque foi alterado." })
      setSessao(null)
      setContagens([])
      setUltimoBipe(null)
    } finally {
      setEncerrando(false)
    }
  }, [sessao, storeId, toast])

  const resumo = useMemo(() => {
    let unidades = 0
    let reconciliacao = 0
    let divergencias = 0
    for (const c of contagens) {
      unidades += c.quantidadeContada
      if (c.status === "reconciliacao") reconciliacao += 1
      else if (c.diferenca != null && c.diferenca !== 0) divergencias += 1
    }
    return { linhas: contagens.length, unidades, reconciliacao, divergencias }
  }, [contagens])

  // ─── Render ──────────────────────────────────────────────────────────────────

  const header = (
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-primary/10 p-2.5">
        <ClipboardCheck className="h-6 w-6 text-primary" />
      </div>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Inventário Assistido</h1>
        <p className="text-sm text-muted-foreground">
          Conferência física por bipagem. A contagem é registrada à parte — <strong>não altera o
          estoque</strong>. Ajustes e reconciliação são feitos depois, com revisão.
        </p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione uma loja ativa para iniciar o inventário.
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!sessao) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="mx-auto w-full max-w-xl bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-primary" />
              Iniciar inventário
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-nome">Nome da sessão</Label>
              <Input
                id="inv-nome"
                placeholder="Ex.: Contagem geral — Junho"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-operador">Operador</Label>
              <Input
                id="inv-operador"
                placeholder="Seu nome (padrão: usuário logado)"
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
              />
            </div>
            <Button className="w-full gap-2" onClick={() => void handleIniciar()} disabled={iniciando}>
              {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar inventário
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho + sessão ativa */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        {header}
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => void handleEncerrar()}
          disabled={encerrando}
        >
          {encerrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          Encerrar inventário
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm">
          <div className="min-w-0">
            <span className="text-muted-foreground">Sessão: </span>
            <span className="font-medium text-foreground">{sessao.nome || "Sem nome"}</span>
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Operador: </span>
            <span className="font-medium text-foreground">{sessao.operador || "—"}</span>
          </div>
          <div className="min-w-0">
            <span className="text-muted-foreground">Início: </span>
            <span className="font-medium text-foreground">{formatDateTime(sessao.iniciadoEm)}</span>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            Aberta
          </Badge>
        </CardContent>
      </Card>

      {/* Bipagem */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanBarcode className="h-4 w-4 text-primary" />
            Bipar produto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={handleBipe} className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              autoFocus
              inputMode="text"
              placeholder="Bipe ou digite o código e pressione Enter"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              disabled={bipando}
              className="text-base"
            />
            <Button type="submit" className="gap-2 sm:w-40" disabled={bipando || !codigo.trim()}>
              {bipando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
              Registrar
            </Button>
          </form>

          {ultimoBipe ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                ultimoBipe.status === "reconciliacao"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              )}
            >
              {ultimoBipe.status === "reconciliacao" ? (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {ultimoBipe.status === "reconciliacao" ? (
                  <>
                    Código <span className="font-mono font-medium">{ultimoBipe.codigoBipado}</span> não
                    encontrado — enviado para reconciliação.
                  </>
                ) : (
                  <>
                    <span className="font-medium">{ultimoBipe.produtoNome || ultimoBipe.codigoBipado}</span>{" "}
                    contado.
                  </>
                )}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">Contado: {ultimoBipe.quantidadeContada}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Cada leitura incrementa a quantidade contada. Códigos não cadastrados vão para a fila de
              reconciliação (nunca cadastram nem zeram nada automaticamente).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista ao vivo */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageSearch className="h-4 w-4 text-primary" />
            Contagem ao vivo
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="secondary" className="tabular-nums">{resumo.linhas} itens</Badge>
              <Badge variant="secondary" className="tabular-nums">{resumo.unidades} un.</Badge>
              {resumo.divergencias > 0 && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 tabular-nums dark:text-amber-400">
                  {resumo.divergencias} divergência(s)
                </Badge>
              )}
              {resumo.reconciliacao > 0 && (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 tabular-nums dark:text-amber-400">
                  {resumo.reconciliacao} reconciliação
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleRecarregar()} disabled={recarregando}>
              {recarregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {contagens.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum item contado ainda. Bipe o primeiro produto acima.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contagens.map((c) => {
                    const meta = STATUS_META[c.status] ?? STATUS_META.encontrado
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.codigoBipado}</TableCell>
                        <TableCell className="max-w-[22rem]">
                          <span className="block truncate">
                            {c.produtoNome || <span className="text-muted-foreground">Não cadastrado</span>}
                          </span>
                          {c.produtoSku && (
                            <span className="block truncate text-xs text-muted-foreground">{c.produtoSku}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c.estoqueSistema ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{c.quantidadeContada}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold tabular-nums",
                            c.diferenca == null
                              ? "text-muted-foreground"
                              : c.diferenca > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : c.diferenca < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                          )}
                        >
                          {c.diferenca == null ? "—" : c.diferenca > 0 ? `+${c.diferenca}` : c.diferenca}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
                            {meta.label}
                          </Badge>
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

      <InventarioPendenciaModal
        open={pendenciaCodigo !== null}
        codigo={pendenciaCodigo ?? ""}
        jaPendente={jaPendenteDoModal}
        registrando={registrandoPendencia}
        onConfirmar={(dados) => void handleConfirmarPendencia(dados)}
        onCancelar={handleCancelarPendencia}
      />
    </div>
  )
}
