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
  Clock,
  Boxes,
  Pencil,
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
  registrarContagemProduto,
  registrarPendenciaInventario,
  getContextoContagemProduto,
  listInventarioContagens,
  encerrarInventario,
  type InventarioSessaoDTO,
  type InventarioContagemDTO,
} from "@/app/actions/inventario"
import { resumirContagens, type ModoContagem } from "@/lib/estoque/inventario-core"
import { InventarioPendenciaModal } from "@/components/dashboard/estoque/inventario-pendencia-modal"
import { InventarioContagemModal } from "@/components/dashboard/estoque/inventario-contagem-modal"

// ─── Resolução de código via endpoint existente ────────────────────────────────
// Reusa `GET /api/ops/inventory/lookup` (match exato barcode/sku/id no catálogo inteiro da
// loja). Retorna o id Prisma (`dbId`) do produto, que a Server Action re-valida no banco.

type LookupResult =
  | { kind: "found"; produtoId: string; nome: string; sku: string | null; estoqueSistema: number | null }
  | { kind: "none" }
  | { kind: "error" }

async function resolverProdutoPorCodigo(code: string, storeId: string): Promise<LookupResult> {
  try {
    const res = await fetch(
      `/api/ops/inventory/lookup?code=${encodeURIComponent(code)}&lojaId=${encodeURIComponent(storeId)}`,
      { credentials: "include", headers: { [ASSISTEC_LOJA_HEADER]: storeId } }
    )
    if (!res.ok) return { kind: "error" }
    const json = (await res.json()) as {
      items?: Array<{ dbId?: unknown; name?: unknown; sku?: unknown; stock?: unknown }>
    }
    const items = Array.isArray(json.items) ? json.items : []
    const first = items.find((i) => typeof i.dbId === "string" && i.dbId)
    if (!first) return { kind: "none" }
    return {
      kind: "found",
      produtoId: String(first.dbId),
      nome: typeof first.name === "string" ? first.name : code,
      sku: typeof first.sku === "string" && first.sku ? first.sku : null,
      estoqueSistema: typeof first.stock === "number" ? first.stock : null,
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

/**
 * Limite de linhas RENDERIZADAS na tabela "Contagem ao vivo". O estado (`contagens`) continua
 * completo — KPIs/resumo/último bipe usam a lista inteira; só a tabela corta as 100 mais recentes
 * para não pintar milhares de linhas por bipe. Visão completa fica em Relatórios / Atualizar.
 */
const LIMITE_CONTAGEM_RENDER = 100

/**
 * Merge/upsert de UMA linha de contagem no estado local (caminho quente do bipe): remove a versão
 * anterior da mesma linha (por id) e a recoloca no topo — espelha a ordenação do servidor
 * (`ultimoBipeEm desc`, mais recente primeiro). Evita reler a sessão inteira por bipe; sem duplicar.
 */
function mergeContagem(
  prev: InventarioContagemDTO[],
  contagem: InventarioContagemDTO,
): InventarioContagemDTO[] {
  const semAnterior = prev.filter((item) => item.id !== contagem.id)
  return [contagem, ...semAnterior]
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

  // Modal de contagem (produto cadastrado → informar quantidade + modo substituir/somar).
  // Aberto tanto pela bipagem quanto pelo botão "Editar" da tabela ao vivo (modo/qtd iniciais).
  const [contagemProduto, setContagemProduto] = useState<{
    codigo: string
    produtoId: string
    nome: string
    sku: string | null
    estoqueSistema: number | null
    jaContado: number
    ultimaContagemEm: string | null
    movimentacaoPosContagem: number
    modoInicial?: ModoContagem
    quantidadeInicial?: number
  } | null>(null)
  const [registrandoContagem, setRegistrandoContagem] = useState(false)

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
        // Produto cadastrado: abre o modal de contagem para informar a quantidade física real
        // e o modo (substituir / somar). A persistência só acontece na confirmação. O contexto
        // (já contado, última contagem, movimentação posterior) alimenta a observabilidade.
        const existente = contagens.find(
          (c) => c.produtoId === lookup.produtoId && c.status === "encontrado"
        )
        let movimentacaoPosContagem = 0
        if (existente) {
          const ctx = await getContextoContagemProduto(storeId, sessao.id, lookup.produtoId)
          if (ctx.ok) movimentacaoPosContagem = ctx.contexto.movimentacaoPosContagem
        }
        setContagemProduto({
          codigo: code,
          produtoId: lookup.produtoId,
          nome: lookup.nome,
          sku: lookup.sku,
          estoqueSistema: lookup.estoqueSistema,
          jaContado: existente?.quantidadeContada ?? 0,
          ultimaContagemEm: existente?.ultimoBipeEm ?? null,
          movimentacaoPosContagem,
        })
        setCodigo("")
      } finally {
        setBipando(false)
        inputRef.current?.focus()
      }
    },
    [codigo, sessao, storeId, contagens, toast]
  )

  const handleCancelarContagem = useCallback(() => {
    setContagemProduto(null)
    inputRef.current?.focus()
  }, [])

  const handleConfirmarContagem = useCallback(
    async (dados: { quantidade: number; modo: ModoContagem }) => {
      if (!contagemProduto || !sessao || !storeId) return
      setRegistrandoContagem(true)
      try {
        const res = await registrarContagemProduto(storeId, {
          sessaoId: sessao.id,
          codigo: contagemProduto.codigo,
          produtoId: contagemProduto.produtoId,
          quantidade: dados.quantidade,
          modo: dados.modo,
        })
        if (!res.ok) {
          toast({ title: "Falha ao registrar contagem", description: res.reason, variant: "destructive" })
          return
        }
        setContagens((prev) => mergeContagem(prev, res.contagem))
        setUltimoBipe(res.contagem)
        setContagemProduto(null)
      } finally {
        setRegistrandoContagem(false)
        inputRef.current?.focus()
      }
    },
    [contagemProduto, sessao, storeId, toast]
  )

  // Editar a quantidade de uma linha já contada (produto cadastrado). Reusa o MESMO modal e a
  // MESMA action — abre em "substituir" com o total atual, mas o operador pode trocar p/ "somar".
  const handleEditarContagem = useCallback(
    async (c: InventarioContagemDTO) => {
      if (!sessao || !storeId || !c.produtoId) return
      let movimentacaoPosContagem = 0
      const ctx = await getContextoContagemProduto(storeId, sessao.id, c.produtoId)
      if (ctx.ok) movimentacaoPosContagem = ctx.contexto.movimentacaoPosContagem
      setContagemProduto({
        codigo: c.codigoBipado,
        produtoId: c.produtoId,
        nome: c.produtoNome || c.codigoBipado,
        sku: c.produtoSku,
        estoqueSistema: c.estoqueSistema,
        jaContado: c.quantidadeContada,
        ultimaContagemEm: c.ultimoBipeEm,
        movimentacaoPosContagem,
        modoInicial: "substituir",
        quantidadeInicial: c.quantidadeContada,
      })
    },
    [sessao, storeId]
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
        setContagens((prev) => mergeContagem(prev, res.contagem))
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

  const resumo = useMemo(() => resumirContagens(contagens), [contagens])

  // Apenas as N linhas mais recentes são renderizadas na tabela ao vivo (a lista já vem ordenada
  // do mais recente para o mais antigo). O estado completo é preservado para resumo/KPIs/export.
  const contagensVisiveis = useMemo(() => contagens.slice(0, LIMITE_CONTAGEM_RENDER), [contagens])
  const contagensOcultas = contagens.length - contagensVisiveis.length

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
        <CardContent className="space-y-3 py-4">
          {/* Metadados da sessão */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
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
          </div>

          {/* Resumo operacional ao vivo */}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatInline label="Produtos contados" value={resumo.produtosContados} icon={PackageSearch} />
            <StatInline label="Unidades contadas" value={resumo.unidadesContadas} icon={Boxes} />
            <StatInline
              label="Divergências"
              value={resumo.divergencias}
              icon={AlertTriangle}
              accent={resumo.divergencias > 0 ? "amber" : "default"}
            />
            <StatInline
              label="Reconciliação"
              value={resumo.reconciliacao}
              icon={ScanBarcode}
              accent={resumo.reconciliacao > 0 ? "amber" : "default"}
            />
            <StatInline
              label="Último bipe"
              value={resumo.ultimoProduto ?? "—"}
              sub={resumo.ultimoBipeEm ? formatDateTime(resumo.ultimoBipeEm) : "Nenhum ainda"}
              icon={Clock}
            />
          </div>
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
              Ao identificar um produto cadastrado você informa a quantidade contada (substituir ou
              somar). Códigos não cadastrados vão para a fila de reconciliação (nunca cadastram nem
              zeram nada automaticamente).
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
              <Badge variant="secondary" className="tabular-nums">{contagens.length} itens</Badge>
              <Badge variant="secondary" className="tabular-nums">{resumo.unidadesContadas} un.</Badge>
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
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contagensVisiveis.map((c) => {
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
                        <TableCell className="text-right">
                          {c.produtoId && c.status === "encontrado" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => void handleEditarContagem(c)}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Editar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {contagensOcultas > 0 && (
                <p className="border-t border-border px-1 pt-3 text-center text-xs text-muted-foreground">
                  Mostrando os {LIMITE_CONTAGEM_RENDER} itens mais recentes. Use Atualizar/Relatórios
                  para visão completa.
                </p>
              )}
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

      <InventarioContagemModal
        open={contagemProduto !== null}
        codigo={contagemProduto?.codigo ?? ""}
        produto={
          contagemProduto
            ? { nome: contagemProduto.nome, sku: contagemProduto.sku, estoqueSistema: contagemProduto.estoqueSistema }
            : null
        }
        jaContado={contagemProduto?.jaContado ?? 0}
        ultimaContagemEm={contagemProduto?.ultimaContagemEm ?? null}
        movimentacaoPosContagem={contagemProduto?.movimentacaoPosContagem ?? 0}
        modoInicial={contagemProduto?.modoInicial}
        quantidadeInicial={contagemProduto?.quantidadeInicial}
        registrando={registrandoContagem}
        onConfirmar={(dados) => void handleConfirmarContagem(dados)}
        onCancelar={handleCancelarContagem}
      />
    </div>
  )
}

/** Stat compacto do resumo operacional da sessão (rótulo + valor + sub opcional). */
function StatInline({
  label,
  value,
  sub,
  icon: Icon,
  accent = "default",
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  accent?: "default" | "amber"
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn(
          "truncate text-base font-semibold tabular-nums text-foreground",
          accent === "amber" && "text-amber-600 dark:text-amber-400"
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
