"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PackageSearch,
  PackageX,
  PlusCircle,
  EyeOff,
  ClipboardList,
  Wrench,
  ShieldAlert,
  Lock,
  FileSpreadsheet,
  FileDown,
  MapPin,
  Link2,
  Package,
} from "lucide-react"
import * as XLSX from "xlsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  getRelatorioInventario,
  listInventarioSessoes,
  aplicarAjusteInventario,
  aplicarZeragemNaoBipado,
  classificarReconciliacao,
  vincularPendenciaInventario,
  type RelatorioInventarioDTO,
  type RelatorioEncontradoDTO,
  type RelatorioNaoBipadoDTO,
  type RelatorioReconciliacaoDTO,
  type InventarioSessaoDTO,
} from "@/app/actions/inventario"
import {
  construirPlanilhasInventario,
  montarCsv,
  nomeArquivoExport,
} from "@/lib/estoque/inventario-export"
import {
  CLASSIFICACAO_RECONCILIACAO,
  type ClassificacaoReconciliacao,
} from "@/lib/estoque/inventario-reconciliacao"
import { InventarioAssociarProdutoModal } from "@/components/dashboard/estoque/inventario-associar-produto-modal"
import { InventarioCadastroRapidoModal } from "@/components/dashboard/estoque/inventario-cadastro-rapido-modal"
import { criarProdutoRapido } from "@/lib/estoque/inventario-cadastro-rapido-submit"
import type { CadastroRapidoForm } from "@/lib/estoque/inventario-cadastro-rapido"

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

const RECON_CLASS_META: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  localizado: { label: "Localizado", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  cadastrar_depois: { label: "Cadastrar depois", className: "border-primary/30 bg-primary/10 text-primary" },
  ignorado: { label: "Ignorado", className: "border-muted-foreground/30 bg-muted text-muted-foreground" },
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

type AjusteAlvo = {
  tipo: "divergencia" | "ausencia"
  produtoId: string
  nome: string
  sistema: number
  novo: number
}

export function InventarioRelatorios({ sessaoIdInicial }: { sessaoIdInicial?: string | null } = {}) {
  const { toast } = useToast()
  const router = useRouter()
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

  // Histórico → "Abrir relatório": seleciona a sessão pedida pela página.
  useEffect(() => {
    if (sessaoIdInicial) setSessaoId(sessaoIdInicial)
  }, [sessaoIdInicial])

  const encontradosFiltrados = useMemo<RelatorioEncontradoDTO[]>(() => {
    const list = relatorio?.encontrados ?? []
    if (filtroA === "sem-diferenca") return list.filter((e) => e.diferenca === 0)
    if (filtroA === "com-diferenca") return list.filter((e) => e.diferenca !== 0)
    return list
  }, [relatorio?.encontrados, filtroA])

  const resumo = relatorio?.resumo

  // ── F4 · Revisão e ajuste seguro ─────────────────────────────────────────────
  const sessaoFinalizada = relatorio?.sessao.status === "finalizada"
  const rotuloSessaoMotivo = useMemo(() => {
    const s = relatorio?.sessao
    return (s?.nome ?? "").trim() || s?.id || ""
  }, [relatorio?.sessao])

  const [ajusteAlvo, setAjusteAlvo] = useState<AjusteAlvo | null>(null)
  const [motivoAjuste, setMotivoAjuste] = useState("")
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false)

  const abrirAjusteDivergencia = useCallback(
    (e: RelatorioEncontradoDTO) => {
      setMotivoAjuste(`Inventário físico — sessão ${rotuloSessaoMotivo}`)
      setAjusteAlvo({ tipo: "divergencia", produtoId: e.produtoId, nome: e.nome, sistema: e.estoqueSistema, novo: e.quantidadeContada })
    },
    [rotuloSessaoMotivo]
  )

  const abrirZeragem = useCallback(
    (n: RelatorioNaoBipadoDTO) => {
      setMotivoAjuste(`Ausência confirmada no inventário — sessão ${rotuloSessaoMotivo}`)
      setAjusteAlvo({ tipo: "ausencia", produtoId: n.produtoId, nome: n.nome, sistema: n.estoqueSistema, novo: 0 })
    },
    [rotuloSessaoMotivo]
  )

  const confirmarAjuste = useCallback(async () => {
    if (!ajusteAlvo || !relatorio || !storeId) return
    const motivo = motivoAjuste.trim()
    if (!motivo) {
      toast({ title: "Motivo obrigatório", description: "Descreva o motivo do ajuste.", variant: "destructive" })
      return
    }
    setAplicandoAjuste(true)
    try {
      const res =
        ajusteAlvo.tipo === "divergencia"
          ? await aplicarAjusteInventario(storeId, relatorio.sessao.id, ajusteAlvo.produtoId, { motivo })
          : await aplicarZeragemNaoBipado(storeId, relatorio.sessao.id, ajusteAlvo.produtoId, { motivo })
      if (!res.ok) {
        toast({ title: "Não foi possível ajustar", description: res.reason, variant: "destructive" })
        return
      }
      toast({
        title: res.semMudanca ? "Estoque já estava correto" : "Ajuste aplicado",
        description: res.semMudanca
          ? `${ajusteAlvo.nome}: o estoque já era ${ajusteAlvo.novo}. Item marcado como ajustado.`
          : `${ajusteAlvo.nome}: estoque ajustado para ${res.estoqueDepois}.`,
      })
      setAjusteAlvo(null)
      await carregarRelatorio(relatorio.sessao.id)
    } finally {
      setAplicandoAjuste(false)
    }
  }, [ajusteAlvo, relatorio, storeId, motivoAjuste, toast, carregarRelatorio])

  // ── Exportação (CSV / XLSX) ──────────────────────────────────────────────────
  const exportarCsv = useCallback(() => {
    if (!relatorio) return
    const abas = construirPlanilhasInventario(relatorio)
    const csv = montarCsv(abas)
    // BOM para o Excel reconhecer UTF-8 (acentos).
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = nomeArquivoExport(relatorio.sessao, "csv")
    a.click()
    URL.revokeObjectURL(url)
  }, [relatorio])

  const exportarXlsx = useCallback(() => {
    if (!relatorio) return
    const abas = construirPlanilhasInventario(relatorio)
    const wb = XLSX.utils.book_new()
    for (const aba of abas) {
      const ws = XLSX.utils.aoa_to_sheet(aba.linhas)
      // Nome da aba ≤ 31 chars (limite do Excel).
      XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31))
    }
    XLSX.writeFile(wb, nomeArquivoExport(relatorio.sessao, "xlsx"))
  }, [relatorio])

  // ── Reconciliação F6: vínculo de fechamento (Cadastrar produto / Associar existente) ────────────
  const [associarAlvo, setAssociarAlvo] = useState<RelatorioReconciliacaoDTO | null>(null)
  const [vinculandoId, setVinculandoId] = useState<string | null>(null)
  // Cadastro rápido in-place (INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001): cria o produto e
  // fecha a pendência SEM sair do inventário (antes, "Cadastrar produto" navegava para Cadastros).
  const [cadastrarAlvo, setCadastrarAlvo] = useState<RelatorioReconciliacaoDTO | null>(null)
  const [cadastrando, setCadastrando] = useState(false)

  // Atalho preservado: cadastro COMPLETO (com fiscal) na tela de Cadastros, levando o contexto
  // da pendência (prefil + vínculo automático ao salvar). Usado como link secundário do modal.
  const abrirCadastrarProduto = useCallback(
    (r: RelatorioReconciliacaoDTO) => {
      const params = new URLSearchParams()
      params.set("prefillBarcode", r.codigoBipado)
      params.set("prefillQtd", String(r.quantidadeContada))
      if (r.nomeRapido) params.set("prefillNome", r.nomeRapido)
      params.set("inventarioContagemId", r.id)
      params.set("inventarioSessaoId", r.sessaoId)
      params.set("inventarioStoreId", storeId)
      router.push(`/dashboard/estoque?${params.toString()}`)
    },
    [storeId, router]
  )

  const handleCadastrarRapido = useCallback(
    async (form: CadastroRapidoForm) => {
      if (!cadastrarAlvo || !relatorio || !storeId) return
      setCadastrando(true)
      try {
        const res = await criarProdutoRapido(storeId, form, {
          sessaoId: relatorio.sessao.id,
          pendenciaCodigo: cadastrarAlvo.codigoBipado,
        })
        if (res.ok === "duplicate") {
          // EAN/SKU já existe na loja: não duplica — oferece associar a pendência ao item existente.
          toast({
            title: "Produto já cadastrado",
            description: `Já existe "${res.produto.name}" com este código/EAN/SKU. Use "Associar produto" para vincular a pendência a ele.`,
            variant: "destructive",
          })
          setCadastrarAlvo(null)
          setAssociarAlvo(cadastrarAlvo)
          return
        }
        if (!res.ok) {
          toast({ title: "Não foi possível cadastrar", description: res.erro, variant: "destructive" })
          return
        }
        // Produto criado → fecha a pendência apontando para ele (grava alias do código bipado).
        const vinc = await vincularPendenciaInventario(storeId, relatorio.sessao.id, cadastrarAlvo.id, res.produtoId, "cadastrado")
        if (!vinc.ok) {
          toast({
            title: "Produto cadastrado, mas a pendência não foi fechada",
            description: `${vinc.reason} Use "Associar produto" para concluir o vínculo.`,
            variant: "destructive",
          })
          setCadastrarAlvo(null)
          await carregarRelatorio(relatorio.sessao.id)
          return
        }
        toast({
          title: "Produto cadastrado e vinculado",
          description: "Cadastro salvo para operação. Complete o fiscal depois em Cadastros.",
        })
        setCadastrarAlvo(null)
        await carregarRelatorio(relatorio.sessao.id)
      } finally {
        setCadastrando(false)
      }
    },
    [cadastrarAlvo, relatorio, storeId, toast, carregarRelatorio]
  )

  const handleAssociarSelecionar = useCallback(
    async (produto: { id: string; nome: string }) => {
      if (!associarAlvo || !relatorio || !storeId) return
      setVinculandoId(associarAlvo.id)
      try {
        const res = await vincularPendenciaInventario(storeId, relatorio.sessao.id, associarAlvo.id, produto.id, "associado")
        if (!res.ok) {
          toast({ title: "Não foi possível associar", description: res.reason, variant: "destructive" })
          return
        }
        toast({
          title: "Pendência associada",
          description: res.codigoVinculado
            ? `Código "${res.codigoVinculado}" vinculado a "${produto.nome}". Nas próximas contagens ele será reconhecido automaticamente.`
            : `"${associarAlvo.codigoBipado}" vinculado ao produto "${produto.nome}".`,
        })
        setAssociarAlvo(null)
        await carregarRelatorio(relatorio.sessao.id)
      } finally {
        setVinculandoId(null)
      }
    },
    [associarAlvo, relatorio, storeId, toast, carregarRelatorio]
  )

  // ── Reconciliação: classificação operacional (não cadastra produto) ──────────
  const [classificandoId, setClassificandoId] = useState<string | null>(null)
  const classificar = useCallback(
    async (contagemId: string, classificacao: ClassificacaoReconciliacao) => {
      if (!relatorio || !storeId) return
      setClassificandoId(contagemId)
      try {
        const res = await classificarReconciliacao(storeId, relatorio.sessao.id, contagemId, classificacao)
        if (!res.ok) {
          toast({ title: "Não foi possível classificar", description: res.reason, variant: "destructive" })
          return
        }
        await carregarRelatorio(relatorio.sessao.id)
      } finally {
        setClassificandoId(null)
      }
    },
    [relatorio, storeId, toast, carregarRelatorio]
  )

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
          onClick={exportarCsv}
          disabled={loading || !relatorio}
          title="Exportar CSV (abas A/B/C/D)"
        >
          <FileDown className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={exportarXlsx}
          disabled={loading || !relatorio}
          title="Exportar XLSX (abas A/B/C/D)"
        >
          <FileSpreadsheet className="h-4 w-4" /> XLSX
        </Button>
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

      {/* Resumo de ajustes (F4) */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Divergências pendentes"
          value={resumo?.divergenciasPendentes ?? 0}
          icon={Wrench}
          accent={(resumo?.divergenciasPendentes ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
        <KpiCard label="Ajustes aplicados" value={resumo?.ajustesAplicados ?? 0} icon={CheckCircle2} accent="emerald" loading={loading} />
        <KpiCard label="Zerados por ausência" value={resumo?.zeradosPorAusencia ?? 0} icon={PackageX} loading={loading} />
        <KpiCard
          label="Itens em reconciliação"
          value={resumo?.reconciliacao ?? 0}
          icon={ClipboardList}
          accent={(resumo?.reconciliacao ?? 0) > 0 ? "amber" : "default"}
          loading={loading}
        />
      </div>

      {/* Relatórios A/B/C/D + Revisão de ajustes */}
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
          <TabsTrigger value="revisao" className="gap-2">
            <Wrench className="h-4 w-4" /> Revisão de ajustes
            <Badge variant="secondary" className="ml-1 tabular-nums">{resumo?.divergenciasPendentes ?? 0}</Badge>
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

        {/* REVISÃO DE AJUSTES (F4) — ação humana explícita, só com a sessão encerrada */}
        <TabsContent value="revisao">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4 text-primary" /> Revisão de ajustes
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Aplica o saldo contado às divergências. Cada ajuste é individual, exige confirmação e
                motivo, e usa o registro auditado de estoque.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!sessaoFinalizada && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Esta sessão ainda está <strong>aberta</strong>. Encerre o inventário (aba “Contagem”)
                    para liberar os ajustes — assim a contagem fica congelada antes de alterar o estoque.
                  </span>
                </div>
              )}
              {(relatorio?.divergencias ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma divergência para ajustar.</p>
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
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatorio?.divergencias ?? []).map((e) => (
                        <TableRow key={e.produtoId}>
                          <TableCell className="max-w-[22rem]">
                            <span className="block truncate font-medium text-foreground">{e.nome}</span>
                            {e.sku && <span className="block truncate text-xs text-muted-foreground">{e.sku}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.codigo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{e.estoqueSistema}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{e.quantidadeContada}</TableCell>
                          <TableCell className="text-right"><DiferencaCell value={e.diferenca} /></TableCell>
                          <TableCell>
                            {e.ajusteAplicado ? (
                              <Badge variant="outline" className="whitespace-nowrap border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                Ajustado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="whitespace-nowrap border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                Pendente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {e.ajusteAplicado ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Concluído
                              </span>
                            ) : (
                              <Button size="sm" className="gap-1" disabled={!sessaoFinalizada} onClick={() => abrirAjusteDivergencia(e)}>
                                <Wrench className="h-3.5 w-3.5" /> Aplicar ajuste
                              </Button>
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

        {/* C — FILA DE RECONCILIAÇÃO */}
        <TabsContent value="reconciliacao">
          <div className="space-y-4">
            {/* Fila ativa — pendências sem vínculo */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Relatório C — Fila de reconciliação
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Códigos bipados sem produto no catálogo. Use <strong>Cadastrar produto</strong> ou{" "}
                  <strong>Associar produto existente</strong> para fechar a pendência — ou classifique para
                  organizar o trabalho. Nenhuma ação altera estoque.
                </p>
              </CardHeader>
              <CardContent>
                {(relatorio?.reconciliacao ?? []).filter((r) => !r.vinculo).length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {(relatorio?.reconciliacao ?? []).length > 0
                      ? "Todas as pendências já foram resolvidas."
                      : "Nenhum item em reconciliação."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código bipado</TableHead>
                          <TableHead>Nome rápido</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead className="text-right">Leituras</TableHead>
                          <TableHead>Primeiro bipe</TableHead>
                          <TableHead>Últ. bipe</TableHead>
                          <TableHead>Classificação</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(relatorio?.reconciliacao ?? []).filter((r) => !r.vinculo).map((r) => {
                          const cls = RECON_CLASS_META[r.classificacao] ?? RECON_CLASS_META.pendente
                          const ocupado = classificandoId === r.id || vinculandoId === r.id
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.codigoBipado}</TableCell>
                              <TableCell className="max-w-[12rem]">
                                {r.nomeRapido
                                  ? <span className="block truncate text-sm">{r.nomeRapido}</span>
                                  : <span className="text-xs text-muted-foreground">—</span>
                                }
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">{r.quantidadeContada}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {r.numeroLeituras > 0 ? r.numeroLeituras : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.primeiroBipeEm)}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.ultimoBipeEm)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn("whitespace-nowrap", cls.className)}>{cls.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  {/* Ações de fechamento (F6) */}
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="gap-1"
                                    disabled={ocupado || cadastrando}
                                    onClick={() => setCadastrarAlvo(r)}
                                  >
                                    <Package className="h-3.5 w-3.5" /> Cadastrar rápido
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={ocupado}
                                    onClick={() => setAssociarAlvo(r)}
                                  >
                                    <Link2 className="h-3.5 w-3.5" /> Associar produto
                                  </Button>
                                  {/* Classificações operacionais (F5 — mantidas, soft labels) */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={ocupado}
                                    onClick={() => void classificar(r.id, CLASSIFICACAO_RECONCILIACAO.LOCALIZADO)}
                                  >
                                    <MapPin className="h-3.5 w-3.5" /> Localizado
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1"
                                    disabled={ocupado}
                                    onClick={() => void classificar(r.id, CLASSIFICACAO_RECONCILIACAO.CADASTRAR_DEPOIS)}
                                  >
                                    <PlusCircle className="h-3.5 w-3.5" /> Cadastrar depois
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1"
                                    disabled={ocupado}
                                    onClick={() => void classificar(r.id, CLASSIFICACAO_RECONCILIACAO.IGNORADO)}
                                  >
                                    <EyeOff className="h-3.5 w-3.5" /> Ignorar
                                  </Button>
                                  {r.classificacao !== "pendente" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1 text-muted-foreground"
                                      disabled={ocupado}
                                      onClick={() => void classificar(r.id, CLASSIFICACAO_RECONCILIACAO.PENDENTE)}
                                    >
                                      Limpar
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

            {/* Seção lateral "Cadastro concluído" — itens com vínculo de fechamento */}
            {(relatorio?.reconciliacao ?? []).some((r) => r.vinculo) && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Cadastro concluído
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Pendências resolvidas nesta sessão (produto cadastrado ou associado). O código bipado
                    foi vinculado ao produto e será reconhecido automaticamente nas próximas contagens.
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código bipado</TableHead>
                          <TableHead>Nome rápido</TableHead>
                          <TableHead className="text-right">Qtd.</TableHead>
                          <TableHead>Resolução</TableHead>
                          <TableHead>Resolvido em</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(relatorio?.reconciliacao ?? []).filter((r) => r.vinculo).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">
                              <span
                                className="inline-flex items-center gap-1"
                                title="Código vinculado ao produto — reconhecido nas próximas contagens"
                              >
                                <Link2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                {r.codigoBipado}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[12rem]">
                              {r.nomeRapido
                                ? <span className="block truncate text-sm">{r.nomeRapido}</span>
                                : <span className="text-xs text-muted-foreground">—</span>
                              }
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.quantidadeContada}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="whitespace-nowrap border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                {r.vinculo?.tipo === "cadastrado" ? "Produto cadastrado" : "Produto associado"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.vinculo ? formatDateTime(r.vinculo.vinculadoEm) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* D — NÃO BIPADOS */}
        <TabsContent value="nao-bipados">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageX className="h-4 w-4 text-destructive" /> Relatório D — Produtos não bipados
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Produtos do sistema que não apareceram na contagem. <strong>Nunca zere em lote.</strong> O
                ajuste é individual, com confirmação forte — só depois de checar prateleira, depósito,
                balcão e caixa.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!sessaoFinalizada && (relatorio?.naoBipados ?? []).length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Encerre a sessão (aba “Contagem”) para liberar a zeragem por ausência.</span>
                </div>
              )}
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
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(relatorio?.naoBipados ?? []).map((n) => (
                        <TableRow key={n.produtoId}>
                          <TableCell className="max-w-[22rem]">
                            <span className="block truncate font-medium text-foreground">{n.nome}</span>
                            {n.sku && <span className="block truncate text-xs text-muted-foreground">{n.sku}</span>}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{n.codigo ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{n.estoqueSistema}</TableCell>
                          <TableCell>
                            {n.ajusteAplicado ? (
                              <Badge variant="outline" className="whitespace-nowrap border-muted-foreground/30 bg-muted text-muted-foreground">
                                Zerado por ausência
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="whitespace-nowrap border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                Conferência pendente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {n.ajusteAplicado ? (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-destructive"
                                disabled={!sessaoFinalizada}
                                onClick={() => abrirZeragem(n)}
                              >
                                <PackageX className="h-3.5 w-3.5" /> Confirmar ausência e zerar
                              </Button>
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
      </Tabs>

      {/* Modal de associação de produto existente (F6) */}
      <InventarioAssociarProdutoModal
        open={associarAlvo !== null}
        storeId={storeId}
        vinculando={vinculandoId === associarAlvo?.id}
        onSelecionar={(produto) => void handleAssociarSelecionar(produto)}
        onFechar={() => setAssociarAlvo(null)}
      />

      {/* Cadastro rápido in-place — cria produto + fecha pendência sem sair do inventário */}
      <InventarioCadastroRapidoModal
        open={cadastrarAlvo !== null}
        storeId={storeId}
        codigoBipado={cadastrarAlvo?.codigoBipado ?? ""}
        quantidadeInicial={cadastrarAlvo?.quantidadeContada ?? 1}
        nomeInicial={cadastrarAlvo?.nomeRapido ?? null}
        salvando={cadastrando}
        onConfirmar={(form) => void handleCadastrarRapido(form)}
        onCancelar={() => setCadastrarAlvo(null)}
        onAbrirCadastroCompleto={cadastrarAlvo ? () => abrirCadastrarProduto(cadastrarAlvo) : undefined}
      />

      {/* Confirmação de ajuste (divergência) / zeragem por ausência */}
      <Dialog open={ajusteAlvo !== null} onOpenChange={(o) => { if (!o) setAjusteAlvo(null) }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              {ajusteAlvo?.tipo === "ausencia" ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : (
                <Wrench className="h-5 w-5 text-primary" />
              )}
              {ajusteAlvo?.tipo === "ausencia" ? "Confirmar ausência e zerar" : "Aplicar ajuste de estoque"}
            </DialogTitle>
            <DialogDescription>
              {ajusteAlvo ? (
                <>
                  Este ajuste vai alterar o estoque de <span className="font-medium text-foreground">{ajusteAlvo.nome}</span>{" "}
                  de <span className="font-semibold text-foreground">{ajusteAlvo.sistema}</span> para{" "}
                  <span className="font-semibold text-foreground">{ajusteAlvo.novo}</span>.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {ajusteAlvo?.tipo === "ausencia" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Este produto existe no sistema, mas não foi encontrado no inventário. Confirme que ele não
              está em prateleira, depósito, balcão ou caixa antes de zerar.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="inv-ajuste-motivo">Motivo</Label>
            <Input
              id="inv-ajuste-motivo"
              value={motivoAjuste}
              onChange={(e) => setMotivoAjuste(e.target.value)}
              placeholder="Motivo do ajuste"
            />
            <p className="text-xs text-muted-foreground">
              Registrado no histórico de movimentação de estoque (auditoria).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setAjusteAlvo(null)} disabled={aplicandoAjuste}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={ajusteAlvo?.tipo === "ausencia" ? "destructive" : "default"}
              onClick={() => void confirmarAjuste()}
              disabled={aplicandoAjuste || !motivoAjuste.trim()}
            >
              {aplicandoAjuste ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {ajusteAlvo?.tipo === "ausencia" ? "Zerar estoque" : "Confirmar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
