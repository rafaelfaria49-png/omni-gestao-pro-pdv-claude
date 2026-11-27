"use client"

import * as React from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Paperclip,
  Plus,
  Scale,
  Search,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MEIOS_PAGAMENTO_GASTO,
  type ComprovanteUploadDraft,
  type ConsultaFinanceiraSnapshot,
  type DividaResumo,
  type MeioPagamentoGasto,
  type OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  formatarDataBR,
  hojeSaoPaulo,
  parseBRLParaCentavos,
  percentualCentavos,
  rotuloMeioPagamento,
  somarCentavos,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { EmptyStateCard, ReceiptAttachmentInput, StatusPill } from "./shared"
import type { QuickEntryTab } from "./QuickEntrySheet"

export function DebtsView({
  snapshot,
  gateway,
  onOpenQuickEntry,
  onMutationSuccess,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onOpenQuickEntry: (tab: QuickEntryTab) => void
  onMutationSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [filtroStatus, setFiltroStatus] = React.useState<"todas" | "abertas" | "quitadas">("todas")
  const [busca, setBusca] = React.useState("")
  const [expandidaId, setExpandidaId] = React.useState<string | null>(snapshot.dividas[0]?.id ?? null)

  // Modal de pagamento parcial / quitação
  const [dividaAlvo, setDividaAlvo] = React.useState<{ divida: DividaResumo; quitar: boolean } | null>(null)
  const [valorParcial, setValorParcial] = React.useState("")
  const [carteiraId, setCarteiraId] = React.useState(snapshot.contas.find((c) => c.ativo)?.id ?? "")
  const [formaPagamento, setFormaPagamento] = React.useState<MeioPagamentoGasto>("pix")
  const [dataPagamento, setDataPagamento] = React.useState(hojeSaoPaulo())
  const [observacao, setObservacao] = React.useState("")
  const [comprovante, setComprovante] = React.useState<ComprovanteUploadDraft | undefined>(undefined)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const totalOriginal = somarCentavos(snapshot.dividas.map((d) => d.valorOriginalCentavos))
  const totalPago = somarCentavos(snapshot.dividas.map((d) => d.valorPagoCentavos))
  const totalRestante = somarCentavos(snapshot.dividas.map((d) => d.saldoRestanteCentavos))
  const progressoGeral = percentualCentavos(totalPago, totalOriginal)

  const dividasFiltradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase()
    return snapshot.dividas.filter((d) => {
      if (filtroStatus === "abertas" && d.status === "quitada") return false
      if (filtroStatus === "quitadas" && d.status !== "quitada") return false
      if (q && !`${d.credor} ${d.descricao} ${d.categoriaNome}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [snapshot.dividas, filtroStatus, busca])

  const abrirModalPagamento = (divida: DividaResumo, quitar: boolean) => {
    setDividaAlvo({ divida, quitar })
    setValorParcial("")
    setCarteiraId(snapshot.contas.find((c) => c.ativo)?.id ?? "")
    setFormaPagamento("pix")
    setDataPagamento(hojeSaoPaulo())
    setObservacao("")
    setComprovante(undefined)
    setError(null)
  }

  const confirmarPagamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dividaAlvo) return
    setError(null)
    setSubmitting(true)
    try {
      const seletor =
        snapshot.perfil.tipo === "PESSOAL"
          ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
          : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

      const centavos = dividaAlvo.quitar ? undefined : parseBRLParaCentavos(valorParcial) ?? undefined
      if (!dividaAlvo.quitar && (!centavos || BigInt(centavos) <= BigInt(0))) {
        throw new Error("Informe um valor de pagamento parcial válido.")
      }

      const fb = await gateway.pagarDivida(seletor, {
        dividaId: dividaAlvo.divida.id,
        quitar: dividaAlvo.quitar,
        valorCentavos: centavos,
        carteiraId,
        formaPagamento,
        dataPagamento,
        observacao: observacao || undefined,
        comprovante,
      })
      await onMutationSuccess(fb)
      setDividaAlvo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar pagamento.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-dividas">
      {/* Header summary */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Valor original total</p>
          <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-foreground">
            {formatarCentavosBRL(totalOriginal)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Total amortizado / pago</p>
          <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatarCentavosBRL(totalPago)}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/25 bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Saldo restante</p>
          <p className="mt-1.5 font-display text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatarCentavosBRL(totalRestante)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progresso de quitação</span>
            <span className="font-semibold tabular-nums text-foreground">{progressoGeral.toFixed(1)}%</span>
          </div>
          <Progress value={progressoGeral} className="mt-3 h-2" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            {snapshot.dividas.filter((d) => d.status === "quitada").length} de {snapshot.dividas.length} quitadas
          </p>
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["todas", "abertas", "quitadas"] as const).map((st) => (
            <Button
              key={st}
              type="button"
              size="sm"
              variant={filtroStatus === st ? "default" : "outline"}
              className="rounded-xl text-xs capitalize"
              onClick={() => setFiltroStatus(st)}
            >
              {st === "todas" ? "Todas" : st === "abertas" ? "Em aberto" : "Quitadas"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar credor ou descrição..."
              className="h-9 rounded-xl pl-9 text-xs"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-xl text-xs"
            onClick={() => onOpenQuickEntry("divida")}
            data-testid="btn-nova-divida"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nova dívida
          </Button>
        </div>
      </div>

      {/* Debt cards */}
      {dividasFiltradas.length === 0 ? (
        <EmptyStateCard
          icon={<Scale className="h-5 w-5" />}
          title="Nenhuma dívida encontrada"
          description="Ajuste o filtro de busca ou registre uma nova dívida para acompanhar parcelas, pagamentos parciais e quitação."
          actionLabel="Registrar dívida"
          onAction={() => onOpenQuickEntry("divida")}
        />
      ) : (
        <div className="space-y-3.5">
          {dividasFiltradas.map((d) => {
            const pct = percentualCentavos(d.valorPagoCentavos, d.valorOriginalCentavos)
            const aberta = expandidaId === d.id
            const quitada = d.status === "quitada"
            return (
              <div
                key={d.id}
                data-testid={`debt-card-${d.id}`}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-semibold text-foreground">{d.credor}</h3>
                        <StatusPill status={d.status} />
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Parcelas {d.parcelasPagas}/{d.parcelasTotal}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{d.descricao}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Categoria: {d.categoriaNome} · Próx. vencimento: <strong>{formatarDataBR(d.vencimento)}</strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!quitada && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-xs"
                            data-testid={`debt-partial-${d.id}`}
                            onClick={() => abrirModalPagamento(d, false)}
                          >
                            <Wallet className="mr-1.5 h-3.5 w-3.5" />
                            Pagamento parcial
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                            data-testid={`debt-settle-${d.id}`}
                            onClick={() => abrirModalPagamento(d, true)}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Quitar
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-xl text-xs"
                        onClick={() => setExpandidaId(aberta ? null : d.id)}
                      >
                        Histórico ({d.historico.length})
                        {aberta ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Numbers breakdown */}
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-muted/35 p-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Original</p>
                      <p className="font-display text-sm font-semibold tabular-nums text-foreground">
                        {formatarCentavosBRL(d.valorOriginalCentavos)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Pago</p>
                      <p className="font-display text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatarCentavosBRL(d.valorPagoCentavos)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Restante</p>
                      <p
                        className={cn(
                          "font-display text-sm font-bold tabular-nums",
                          quitada ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {formatarCentavosBRL(d.saldoRestanteCentavos)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Evolução da quitação</span>
                      <span className="tabular-nums font-medium">{pct.toFixed(1)}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                </div>

                {/* History timeline */}
                {aberta && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3.5 sm:px-5">
                    <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Histórico de movimentações da dívida
                    </p>
                    <div className="space-y-2">
                      {d.historico.map((h) => (
                        <div
                          key={h.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-foreground">
                              {h.tipo === "QUITACAO"
                                ? "Quitação integral"
                                : h.tipo === "PAGAMENTO_PARCIAL"
                                  ? "Pagamento parcial"
                                  : "Registro da dívida"}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {formatarDataBR(h.dataPagamento)}
                              {h.formaPagamento ? ` · ${rotuloMeioPagamento(h.formaPagamento)}` : ""}
                              {h.carteiraNome ? ` · ${h.carteiraNome}` : ""}
                            </span>
                            {h.observacao && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">{h.observacao}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {h.documentoId && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                                <Paperclip className="h-3 w-3" />
                                Comprovante
                              </span>
                            )}
                            <span className="font-display font-bold tabular-nums text-foreground">
                              {formatarCentavosBRL(h.valorCentavos)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Partial payment / Settlement dialog */}
      <Dialog open={Boolean(dividaAlvo)} onOpenChange={(open) => !open && setDividaAlvo(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-display">
              {dividaAlvo?.quitar ? "Quitar dívida integralmente" : "Registrar pagamento parcial"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {dividaAlvo?.divida.credor} · Saldo restante:{" "}
              <strong>{formatarCentavosBRL(dividaAlvo?.divida.saldoRestanteCentavos)}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={confirmarPagamento} className="space-y-4">
            {!dividaAlvo?.quitar && (
              <div className="space-y-1.5">
                <Label htmlFor="debt-pay-value">Valor do pagamento parcial (R$)</Label>
                <Input
                  id="debt-pay-value"
                  data-testid="debt-pay-value"
                  inputMode="decimal"
                  placeholder="Ex: 400,00"
                  value={valorParcial}
                  onChange={(e) => setValorParcial(e.target.value)}
                  required
                  className="rounded-xl font-display font-semibold tabular-nums"
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Conta de saída</Label>
                <Select value={carteiraId} onValueChange={setCarteiraId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.contas
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Meio de pagamento</Label>
                <Select value={formaPagamento} onValueChange={(v) => setFormaPagamento(v as MeioPagamentoGasto)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEIOS_PAGAMENTO_GASTO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {rotuloMeioPagamento(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="debt-pay-date">Data do pagamento</Label>
                <Input
                  id="debt-pay-date"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="debt-pay-obs">Observação</Label>
                <Input
                  id="debt-pay-obs"
                  placeholder="Ex: Parcela 13/30"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <ReceiptAttachmentInput value={comprovante} onChange={setComprovante} disabled={submitting} />
            {error && (
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDividaAlvo(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting} data-testid="debt-pay-submit">
                Confirmar {dividaAlvo?.quitar ? "quitação" : "pagamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
