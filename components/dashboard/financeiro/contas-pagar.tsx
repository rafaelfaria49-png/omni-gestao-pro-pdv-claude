"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Plus,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Calendar,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useFinanceiro } from "@/lib/financeiro-store"
import type { ContaPagarItem } from "@/lib/financeiro-types"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useToast } from "@/hooks/use-toast"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

function todayISO(): string {
  return new Date().toISOString().split("T")[0]
}

function effectiveStatus(c: ContaPagarItem): ContaPagarItem["status"] {
  if (c.status === "pago") return "pago"
  const d = c.dataVencimento
  if (d < todayISO()) return "atrasado"
  return "pendente"
}

type ContaPagarServerRow = Record<string, unknown> & {
  id?: unknown
  localKey?: unknown
  descricao?: unknown
  fornecedor?: unknown
  fornecedorNome?: unknown
  valor?: unknown
  dataVencimento?: unknown
  vencimento?: unknown
  status?: unknown
  categoria?: unknown
}

type ContaPagarServerSummary = {
  quantidade: number
  totalAberto: number
  totalVencido: number
  totalPago: number
  totalParcial: number
  porStatus?: Record<string, number>
}

type ContaPagarApiAudit = {
  pago?: number
  restante?: number
  vencido?: boolean
  fornecedorNome?: string
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function safeNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function normalizeStatusFromServer(raw: unknown): ContaPagarItem["status"] {
  const s = safeStr(raw).toLowerCase().trim()
  if (s === "pago") return "pago"
  if (s === "vencido" || s === "atrasado") return "atrasado"
  // parcial/pendente/cancelado/estornado → painel legado não tem status dedicado; tratamos como pendente
  return "pendente"
}

function normalizeContaPagarRowFromServer(r: ContaPagarServerRow): ContaPagarItem | null {
  const id = (safeStr(r.id) || safeStr(r.localKey)).trim()
  if (!id) return null

  const descricao = safeStr(r.descricao).trim()
  const fornecedor = (safeStr(r.fornecedor) || safeStr(r.fornecedorNome)).trim()
  const valor = safeNum(r.valor)
  const dataVencimento = (safeStr(r.dataVencimento) || safeStr(r.vencimento)).trim()
  const categoria = safeStr(r.categoria).trim() || "Outros"

  if (!descricao || !dataVencimento) return null

  return {
    id,
    descricao,
    fornecedor,
    valor,
    dataVencimento,
    status: normalizeStatusFromServer(r.status),
    categoria,
  }
}

function rowsToPersistPayload(contas: ContaPagarItem[]): Record<string, unknown>[] {
  return contas.map((c) => ({
    id: c.id,
    localKey: c.id,
    descricao: c.descricao,
    fornecedor: c.fornecedor,
    fornecedorNome: c.fornecedor,
    valor: c.valor,
    dataVencimento: c.dataVencimento,
    vencimento: c.dataVencimento,
    status: c.status,
    categoria: c.categoria,
  }))
}

/** Server wins: preserva títulos locais ainda não persistidos, server sobrescreve os demais. */
function mergeContasPagarServerWins(local: ContaPagarItem[], server: ContaPagarItem[]): ContaPagarItem[] {
  const serverIds = new Set(server.map((r) => String(r.id)))
  const localOnly = local.filter((r) => !serverIds.has(String(r.id)))
  return [...server, ...localOnly].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
}

export function ContasPagar() {
  const { contasPagar, setContasPagar } = useFinanceiro()
  const { toast } = useToast()
  const { lojaAtivaId, lojas } = useLojaAtiva()
  const lojaId = lojaAtivaId ?? lojas[0]?.id ?? ""
  const [filtro, setFiltro] = useState("todos")
  const [busca, setBusca] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ContaPagarItem | null>(null)
  const [serverSummary, setServerSummary] = useState<ContaPagarServerSummary | null>(null)
  const [acaoOpen, setAcaoOpen] = useState(false)
  const [acaoConta, setAcaoConta] = useState<ContaPagarItem | null>(null)
  const [acaoTipo, setAcaoTipo] = useState<"pagamento_parcial" | "liquidar" | "estornar" | "estornar_ultimo">(
    "pagamento_parcial",
  )
  const [acaoForm, setAcaoForm] = useState({ valor: "", observacao: "", motivo: "" })
  const [loading, setLoading] = useState(false)
  const [acaoSaving, setAcaoSaving] = useState(false)
  const [formSaving, setFormSaving] = useState(false)
  const [form, setForm] = useState({
    descricao: "",
    fornecedor: "",
    valor: "",
    dataVencimento: todayISO(),
    categoria: "Despesas Fixas",
    status: "pendente" as ContaPagarItem["status"],
  })

  const openAcao = (
    conta: ContaPagarItem,
    tipo: "pagamento_parcial" | "liquidar" | "estornar" | "estornar_ultimo",
  ) => {
    setAcaoConta(conta)
    setAcaoTipo(tipo)
    setAcaoForm({ valor: "", observacao: "", motivo: "" })
    setAcaoOpen(true)
  }

  const persistToServer = async (nextRows: ContaPagarItem[], successMsg: string) => {
    if (!lojaId) {
      toast({ title: "Não foi possível salvar", description: "Loja não configurada.", variant: "destructive" })
      return
    }
    setFormSaving(true)
    try {
      const res = await fetch("/api/ops/contas-pagar-persist", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          [ASSISTEC_LOJA_HEADER]: lojaId,
        },
        body: JSON.stringify({ lojaId, rows: rowsToPersistPayload(nextRows) }),
      })
      if (res.ok) {
        setContasPagar(nextRows)
        toast({ title: successMsg })
        setDialogOpen(false)
      } else {
        console.error("[contas-pagar] persist HTTP", res.status)
        toast({
          title: "Não foi possível salvar",
          description: "Verifique a conexão e tente novamente.",
          variant: "destructive",
        })
      }
    } catch (err: unknown) {
      console.error("[contas-pagar] persist rede", err)
      toast({
        title: "Não foi possível salvar",
        description: "Verifique a conexão e tente novamente.",
        variant: "destructive",
      })
    } finally {
      setFormSaving(false)
    }
  }

  const applyServerResultToLocal = (contaId: string, titulo: unknown, audit: unknown) => {
    const t = titulo as { status?: unknown }
    const a = audit as ContaPagarApiAudit | null
    const byStatus = normalizeStatusFromServer(t?.status)
    const restante = a && typeof a.restante === "number" ? a.restante : null
    const nextStatus: ContaPagarItem["status"] = restante != null && restante <= 0.009 ? "pago" : byStatus
    setContasPagar((prev) =>
      prev.map((x) => (x.id === contaId ? { ...x, status: nextStatus, fornecedor: x.fornecedor || (a?.fornecedorNome ?? "") } : x)),
    )
  }

  const callApi = async (path: string, body: Record<string, unknown>) => {
    if (!lojaId) throw new Error("missing_loja")
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assistec-loja-id": lojaId },
      body: JSON.stringify({ lojaId, ...body }),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok === false) {
      const err = safeStr(json.error) || `Falha (${res.status})`
      throw new Error(err)
    }
    return json
  }

  const confirmarAcao = async () => {
    const conta = acaoConta
    if (!conta) return
    setAcaoSaving(true)
    try {
      if (acaoTipo === "pagamento_parcial") {
        const valor = parseFloat(acaoForm.valor.replace(",", "."))
        if (!Number.isFinite(valor) || valor <= 0) {
          toast({ title: "Valor inválido", variant: "destructive" })
          setAcaoSaving(false)
          return
        }
        const json = await callApi("/api/financeiro/contas-pagar/pagamento-parcial", {
          localKey: conta.id,
          valor,
          observacao: acaoForm.observacao?.trim() || undefined,
        })
        applyServerResultToLocal(conta.id, json.titulo, json.audit)
        toast({ title: "Pagamento parcial registrado" })
      }

      if (acaoTipo === "liquidar") {
        const json = await callApi("/api/financeiro/contas-pagar/liquidar", {
          localKey: conta.id,
          observacao: acaoForm.observacao?.trim() || undefined,
        })
        applyServerResultToLocal(conta.id, json.titulo, json.audit)
        toast({ title: "Conta liquidada" })
      }

      if (acaoTipo === "estornar") {
        const json = await callApi("/api/financeiro/contas-pagar/estornar", {
          localKey: conta.id,
          motivo: acaoForm.motivo?.trim() || undefined,
        })
        applyServerResultToLocal(conta.id, json.titulo, json.audit)
        toast({ title: "Estorno registrado (título)" })
      }

      if (acaoTipo === "estornar_ultimo") {
        const json = await callApi("/api/financeiro/contas-pagar/estornar-ultimo-pagamento", {
          localKey: conta.id,
          motivo: acaoForm.motivo?.trim() || undefined,
        })
        applyServerResultToLocal(conta.id, json.titulo, json.audit)
        toast({ title: "Estorno do último pagamento registrado" })
      }
      setAcaoOpen(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast({ title: "Falha no servidor", description: msg, variant: "destructive" })
    } finally {
      setAcaoSaving(false)
    }
  }

  const refreshFromServer = async () => {
    if (!lojaId) return
    setLoading(true)
    try {
      const res = await fetch("/api/ops/contas-pagar-list", {
        method: "GET",
        credentials: "include",
        headers: {
          [ASSISTEC_LOJA_HEADER]: lojaId,
        },
      })
      if (!res.ok) throw new Error(`list_failed_${res.status}`)
      const json = (await res.json()) as { ok?: unknown; rows?: unknown; summary?: unknown }
      const rowsRaw = Array.isArray(json.rows) ? (json.rows as unknown[]) : []
      const next: ContaPagarItem[] = []
      for (const item of rowsRaw) {
        if (!item || typeof item !== "object") continue
        const norm = normalizeContaPagarRowFromServer(item as ContaPagarServerRow)
        if (norm) next.push(norm)
      }
      setContasPagar((prev) => mergeContasPagarServerWins(prev, next))
      if (json.summary && typeof json.summary === "object") {
        const s = json.summary as Partial<ContaPagarServerSummary>
        if (typeof s.totalAberto === "number") {
          setServerSummary(s as ContaPagarServerSummary)
        }
      }
    } catch (e) {
      console.warn("[contas-pagar] fallback para localStorage:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshFromServer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId])

  const contasComStatus = useMemo(
    () =>
      contasPagar.map((c) => ({
        ...c,
        status: effectiveStatus(c),
      })),
    [contasPagar]
  )

  const contasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return contasComStatus.filter((c) => {
      const matchFiltro = filtro === "todos" || c.status === filtro
      const matchBusca =
        !q ||
        c.descricao.toLowerCase().includes(q) ||
        c.fornecedor.toLowerCase().includes(q)
      return matchFiltro && matchBusca
    })
  }, [contasComStatus, filtro, busca])

  const resumo = useMemo(() => {
    const pendentes = contasComStatus.filter((c) => c.status === "pendente" || c.status === "atrasado")
    const totalPagar = pendentes.reduce((s, c) => s + c.valor, 0)
    const hoje = todayISO()
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    const amanhaStr = amanha.toISOString().split("T")[0]
    const vencendo = contasComStatus.filter(
      (c) =>
        (c.status === "pendente" || c.status === "atrasado") &&
        (c.dataVencimento === hoje || c.dataVencimento === amanhaStr)
    ).length
    const atrasados = contasComStatus.filter((c) => c.status === "atrasado").length
    const pagoMes = contasComStatus
      .filter((c) => c.status === "pago")
      .reduce((s, c) => s + c.valor, 0)
    const totalPagarOut = serverSummary?.totalAberto ?? totalPagar
    const pagoOut = serverSummary?.totalPago ?? pagoMes
    return { totalPagar: totalPagarOut, vencendo, atrasados, pagoMes: pagoOut }
  }, [contasComStatus, serverSummary])

  const openNovo = () => {
    setEditing(null)
    setForm({
      descricao: "",
      fornecedor: "",
      valor: "",
      dataVencimento: todayISO(),
      categoria: "Despesas Fixas",
      status: "pendente",
    })
    setDialogOpen(true)
  }

  const openEdit = (c: ContaPagarItem) => {
    setEditing(c)
    setForm({
      descricao: c.descricao,
      fornecedor: c.fornecedor,
      valor: String(c.valor),
      dataVencimento: c.dataVencimento,
      categoria: c.categoria,
      status: c.status === "atrasado" ? "pendente" : c.status,
    })
    setDialogOpen(true)
  }

  const salvar = () => {
    const valor = parseFloat(form.valor.replace(",", "."))
    if (!form.descricao.trim() || !Number.isFinite(valor) || valor <= 0) {
      toast({ title: "Preencha descrição e valor válidos", variant: "destructive" })
      return
    }
    const row: ContaPagarItem = {
      id: editing?.id ?? `cp-${Date.now()}`,
      descricao: form.descricao.trim(),
      fornecedor: form.fornecedor.trim(),
      valor,
      dataVencimento: form.dataVencimento,
      status: form.status,
      categoria: form.categoria,
    }
    const next = editing
      ? contasPagar.map((x) => (x.id === editing.id ? row : x))
      : [...contasPagar, row]
    
    void persistToServer(next, editing ? "Conta atualizada" : "Conta adicionada")
  }

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pago":
        return { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Pago" }
      case "atrasado":
        return { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", label: "Atrasado" }
      default:
        return { icon: Clock, color: "text-warning", bg: "bg-warning/10", label: "Pendente" }
    }
  }

  const fmtData = (iso: string) => {
    const [y, m, d] = iso.split("-")
    if (!y || !m || !d) return iso
    return `${d}/${m}/${y}`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total a Pagar</p>
            <p className="text-xl font-bold text-foreground">
              {resumo.totalPagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Vencem hoje/amanhã</p>
            <p className="text-xl font-bold text-warning">{resumo.vencendo}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Atrasados</p>
            <p className="text-xl font-bold text-destructive">{resumo.atrasados}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pago (marcados)</p>
            <p className="text-xl font-bold text-success">
              {resumo.pagoMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "todos", label: "Todos" },
            { key: "pendente", label: "Pendentes" },
            { key: "atrasado", label: "Atrasados" },
            { key: "pago", label: "Pagos" },
          ].map((item) => (
            <Button
              key={item.key}
              variant={filtro === item.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFiltro(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conta..."
              className="pl-10"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button onClick={openNovo}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Conta
          </Button>
        </div>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Contas a Pagar</CardTitle>
          <CardDescription>Despesas com data de vencimento para agenda de boletos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-40 sm:w-60" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap justify-end">
                    <div className="space-y-1.5 text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                      <Skeleton className="h-3 w-16 ml-auto" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-8 w-12 rounded-md" />
                  </div>
                </div>
              ))
            ) : contasFiltradas.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Nenhuma conta a pagar encontrada.
              </div>
            ) : (
              contasFiltradas.map((conta) => {
                const statusConfig = getStatusConfig(conta.status)
                const StatusIcon = statusConfig.icon

                return (
                  <div
                    key={conta.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", statusConfig.bg)}>
                        <StatusIcon className={cn("w-5 h-5", statusConfig.color)} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{conta.descricao}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {conta.fornecedor} • {conta.categoria}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap justify-end">
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {conta.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          Venc.: {fmtData(conta.dataVencimento)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          statusConfig.bg,
                          statusConfig.color
                        )}
                      >
                        {statusConfig.label}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(conta)}>
                        Editar
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Ações">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openAcao(conta, "pagamento_parcial")}>
                            Pagamento parcial
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAcao(conta, "liquidar")}>Liquidar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openAcao(conta, "estornar")}>Estornar (título)</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openAcao(conta, "estornar_ultimo")}>
                            Estornar último pagamento
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={acaoOpen} onOpenChange={setAcaoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acaoTipo === "pagamento_parcial" && "Pagamento parcial"}
              {acaoTipo === "liquidar" && "Liquidar conta"}
              {acaoTipo === "estornar" && "Estornar título"}
              {acaoTipo === "estornar_ultimo" && "Estornar último pagamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {acaoTipo === "pagamento_parcial" && (
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input value={acaoForm.valor} onChange={(e) => setAcaoForm((f) => ({ ...f, valor: e.target.value }))} autoFocus />
              </div>
            )}
            {(acaoTipo === "pagamento_parcial" || acaoTipo === "liquidar") && (
              <div className="space-y-1">
                <Label>Observação</Label>
                <Input
                  value={acaoForm.observacao}
                  onChange={(e) => setAcaoForm((f) => ({ ...f, observacao: e.target.value }))}
                  autoFocus={acaoTipo === "liquidar"}
                />
              </div>
            )}
            {(acaoTipo === "estornar" || acaoTipo === "estornar_ultimo") && (
              <div className="space-y-1">
                <Label>Motivo</Label>
                <Input value={acaoForm.motivo} onChange={(e) => setAcaoForm((f) => ({ ...f, motivo: e.target.value }))} autoFocus />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcaoOpen(false)} disabled={acaoSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarAcao()} disabled={acaoSaving}>
              {acaoSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirmando…
                </>
              ) : (
                "Confirmar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conta" : "Nova conta a pagar"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Fornecedor</Label>
              <Input
                value={form.fornecedor}
                onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Data de vencimento</Label>
                <Input
                  type="date"
                  value={form.dataVencimento}
                  onChange={(e) => setForm((f) => ({ ...f, dataVencimento: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v as ContaPagarItem["status"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formSaving}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={formSaving}>
              {formSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
