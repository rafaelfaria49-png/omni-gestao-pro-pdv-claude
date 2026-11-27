"use client"

import * as React from "react"
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  History,
  Layers,
  Plus,
  ShoppingBag,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MEIOS_PAGAMENTO_GASTO,
  type CartaoCicloResumo,
  type CartaoCreditoResumo,
  type ConsultaFinanceiraSnapshot,
  type MeioPagamentoGasto,
  type OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  formatarDataBR,
  hojeSaoPaulo,
  parseBRLParaCentavos,
  parseBigIntCentavos,
  percentualCentavos,
  rotuloMeioPagamento,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { EmptyStateCard, StatusPill } from "./shared"

export function CreditCardsView({
  snapshot,
  gateway,
  onMutationSuccess,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onMutationSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [selectedCardId, setSelectedCardId] = React.useState<string>(snapshot.cartoes[0]?.id ?? "")
  const [novoCartaoOpen, setNovoCartaoOpen] = React.useState(false)
  const [novaCompraOpen, setNovaCompraOpen] = React.useState(false)
  const [faturaParaPagar, setFaturaParaPagar] = React.useState<{
    cartao: CartaoCreditoResumo
    ciclo: CartaoCicloResumo
  } | null>(null)

  React.useEffect(() => {
    if (!snapshot.cartoes.some((c) => c.id === selectedCardId)) {
      setSelectedCardId(snapshot.cartoes[0]?.id ?? "")
    }
  }, [snapshot.cartoes, selectedCardId])

  const cartaoAtivo = snapshot.cartoes.find((c) => c.id === selectedCardId) ?? snapshot.cartoes[0]

  // Novo cartão form
  const [nome, setNome] = React.useState("")
  const [bandeira, setBandeira] = React.useState("Mastercard")
  const [ultimos4, setUltimos4] = React.useState("")
  const [limiteTexto, setLimiteTexto] = React.useState("")
  const [fechamentoDia, setFechamentoDia] = React.useState("5")
  const [vencimentoDia, setVencimentoDia] = React.useState("12")

  // Nova compra form
  const [descCompra, setDescCompra] = React.useState("")
  const [estabelecimento, setEstabelecimento] = React.useState("")
  const [valorCompraTexto, setValorCompraTexto] = React.useState("")
  const [parcelas, setParcelas] = React.useState("1")
  const [categoriaId, setCategoriaId] = React.useState(
    snapshot.categorias.find((c) => c.natureza === "DESPESA" && c.ativo)?.id ?? ""
  )
  const [dataCompra, setDataCompra] = React.useState(hojeSaoPaulo())

  // Pagar fatura form
  const [carteiraId, setCarteiraId] = React.useState(snapshot.contas.find((c) => c.ativo)?.id ?? "")
  const [formaPagamento, setFormaPagamento] = React.useState<MeioPagamentoGasto>("pix")
  const [dataPagamento, setDataPagamento] = React.useState(hojeSaoPaulo())

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleCriarCartao = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const limiteCentavos = parseBRLParaCentavos(limiteTexto)
      if (!limiteCentavos || BigInt(limiteCentavos) <= BigInt(0)) {
        throw new Error("Informe um limite válido.")
      }
      const fb = await gateway.criarCartao(seletor, {
        nome,
        bandeira,
        ultimos4,
        limiteCentavos,
        fechamentoDia: Number(fechamentoDia) || 5,
        vencimentoDia: Number(vencimentoDia) || 12,
      })
      await onMutationSuccess(fb)
      setNovoCartaoOpen(false)
      setNome("")
      setUltimos4("")
      setLimiteTexto("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar cartão.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cartaoAtivo) return
    setError(null)
    setSubmitting(true)
    try {
      const valorTotalCentavos = parseBRLParaCentavos(valorCompraTexto)
      if (!valorTotalCentavos || BigInt(valorTotalCentavos) <= BigInt(0)) {
        throw new Error("Informe o valor total da compra.")
      }
      const fb = await gateway.registrarCompraCartao(seletor, {
        cartaoId: cartaoAtivo.id,
        descricao: descCompra,
        estabelecimento,
        valorTotalCentavos,
        parcelasTotal: Math.max(1, Number(parcelas) || 1),
        categoriaId,
        dataCompra,
      })
      await onMutationSuccess(fb)
      setNovaCompraOpen(false)
      setDescCompra("")
      setEstabelecimento("")
      setValorCompraTexto("")
      setParcelas("1")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao lançar compra no cartão.")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePagarFatura = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!faturaParaPagar) return
    setError(null)
    setSubmitting(true)
    try {
      const fb = await gateway.pagarFatura(seletor, {
        cartaoId: faturaParaPagar.cartao.id,
        cicloId: faturaParaPagar.ciclo.id,
        carteiraId,
        formaPagamento,
        dataPagamento,
      })
      await onMutationSuccess(fb)
      setFaturaParaPagar(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao pagar fatura.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-cartoes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Cartões de crédito</h2>
          <p className="text-xs text-muted-foreground">
            Instrumentos e ciclos G004 · Controle de limite, faturas, fechamento, vencimento e parcelamentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cartaoAtivo && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl text-xs"
              data-testid="btn-nova-compra-cartao"
              onClick={() => {
                setError(null)
                setNovaCompraOpen(true)
              }}
            >
              <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
              Lançar compra
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="rounded-xl text-xs"
            data-testid="btn-novo-cartao"
            onClick={() => {
              setError(null)
              setNovoCartaoOpen(true)
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Novo cartão
          </Button>
        </div>
      </div>

      {snapshot.cartoes.length === 0 ? (
        <EmptyStateCard
          icon={<CreditCard className="h-5 w-5" />}
          title="Nenhum cartão cadastrado"
          description="Adicione um cartão de crédito para acompanhar limite disponível, ciclos de fatura e compras parceladas."
          actionLabel="Cadastrar cartão"
          onAction={() => setNovoCartaoOpen(true)}
        />
      ) : (
        <>
          {/* Card visual selector */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.cartoes.map((card) => {
              const usoPct = percentualCentavos(card.usadoCentavos, card.limiteCentavos)
              const selected = card.id === cartaoAtivo?.id
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedCardId(card.id)}
                  data-testid={`credit-card-${card.id}`}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-5 text-left text-white shadow-md transition-all",
                    "bg-gradient-to-br",
                    card.corGradiente,
                    selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-90 hover:opacity-100"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-white/75">{card.bandeira}</p>
                      <h3 className="mt-0.5 font-display text-base font-bold">{card.nome}</h3>
                    </div>
                    <CreditCard className="h-5 w-5 text-white/80" />
                  </div>

                  <p className="mt-4 font-mono text-sm tracking-widest text-white/90">
                    •••• •••• •••• {card.ultimos4}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[10px] uppercase text-white/70">Usado</p>
                      <p className="font-display text-sm font-bold tabular-nums">
                        {formatarCentavosBRL(card.usadoCentavos)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-white/70">Disponível</p>
                      <p className="font-display text-sm font-bold tabular-nums text-emerald-300">
                        {formatarCentavosBRL(card.disponivelCentavos)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          usoPct > 80 ? "bg-rose-400" : "bg-emerald-300"
                        )}
                        style={{ width: `${Math.min(100, Math.max(3, usoPct))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/75">
                      <span>Limite {formatarCentavosBRL(card.limiteCentavos)}</span>
                      <span>
                        Fecha dia {card.fechamentoDia} · Vence dia {card.vencimentoDia}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Active Card Details */}
          {cartaoAtivo && (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-foreground">
                    {cartaoAtivo.nome} · •••• {cartaoAtivo.ultimos4}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Fechamento: dia <strong>{cartaoAtivo.fechamentoDia}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Vencimento: dia <strong>{cartaoAtivo.vencimentoDia}</strong>
                    </span>
                    <span>
                      Uso do limite: <strong>{percentualCentavos(cartaoAtivo.usadoCentavos, cartaoAtivo.limiteCentavos).toFixed(1)}%</strong>
                    </span>
                  </div>
                </div>
                <div className="w-full sm:w-48">
                  <Progress
                    value={percentualCentavos(cartaoAtivo.usadoCentavos, cartaoAtivo.limiteCentavos)}
                    className="h-2"
                  />
                </div>
              </div>

              <Tabs defaultValue="faturas">
                <TabsList className="mb-4 rounded-xl">
                  <TabsTrigger value="faturas" className="rounded-lg text-xs">
                    Faturas ({cartaoAtivo.ciclos.length})
                  </TabsTrigger>
                  <TabsTrigger value="parceladas" className="rounded-lg text-xs">
                    Parceladas ({cartaoAtivo.comprasParceladas.length})
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-lg text-xs">
                    Histórico ({cartaoAtivo.historico.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="faturas" className="mt-0 space-y-2.5">
                  {cartaoAtivo.ciclos.map((ciclo) => {
                    const temSaldo = parseBigIntCentavos(ciclo.restanteCentavos) > BigInt(0)
                    return (
                      <div
                        key={ciclo.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-display text-sm font-semibold text-foreground">
                              Fatura {ciclo.competencia}
                            </p>
                            <StatusPill status={ciclo.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Fechamento {formatarDataBR(ciclo.fechamentoEm)} · Vencimento {formatarDataBR(ciclo.vencimento)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-display text-sm font-bold tabular-nums text-foreground">
                              {formatarCentavosBRL(ciclo.totalCentavos)}
                            </p>
                            {temSaldo ? (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                Restante {formatarCentavosBRL(ciclo.restanteCentavos)}
                              </p>
                            ) : (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Liquidada</p>
                            )}
                          </div>
                          {temSaldo && ciclo.status !== "futura" && (
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-xl text-xs"
                              data-testid={`pay-invoice-${ciclo.id}`}
                              onClick={() => {
                                setError(null)
                                setFaturaParaPagar({ cartao: cartaoAtivo, ciclo })
                              }}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              Pagar fatura
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </TabsContent>

                <TabsContent value="parceladas" className="mt-0 space-y-2.5">
                  {cartaoAtivo.comprasParceladas.length === 0 ? (
                    <EmptyStateCard
                      icon={<Layers className="h-5 w-5" />}
                      title="Nenhuma compra parcelada ativa"
                      description="Compras parceladas neste cartão aparecerão aqui com acompanhamento parcela a parcela."
                    />
                  ) : (
                    cartaoAtivo.comprasParceladas.map((cp) => (
                      <div
                        key={cp.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{cp.descricao}</p>
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                              {cp.parcelaAtual}/{cp.parcelasTotal}x
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {cp.estabelecimento} · {cp.categoriaNome} · Compra em {formatarDataBR(cp.dataCompra)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-sm font-bold tabular-nums text-foreground">
                            {formatarCentavosBRL(cp.valorParcelaCentavos)}/mês
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Total {formatarCentavosBRL(cp.valorTotalCentavos)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value="historico" className="mt-0 space-y-2.5">
                  {cartaoAtivo.historico.length === 0 ? (
                    <EmptyStateCard
                      icon={<History className="h-5 w-5" />}
                      title="Sem movimentações no cartão"
                      description="Lançamentos e pagamentos de fatura aparecerão neste histórico."
                    />
                  ) : (
                    cartaoAtivo.historico.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-2.5 text-xs"
                      >
                        <div>
                          <p className="font-medium text-foreground">{h.descricao}</p>
                          <p className="text-muted-foreground">
                            {formatarDataBR(h.data)} · Fatura {h.competencia}
                            {h.parcelaTexto ? ` · ${h.parcelaTexto}` : ""}
                            {h.categoriaNome ? ` · ${h.categoriaNome}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "font-display font-bold tabular-nums",
                            h.tipo === "PAGAMENTO_FATURA"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-foreground"
                          )}
                        >
                          {h.tipo === "PAGAMENTO_FATURA" ? "− " : ""}
                          {formatarCentavosBRL(h.valorCentavos)}
                        </span>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </>
      )}

      {/* Dialog: Novo Cartão */}
      <Dialog open={novoCartaoOpen} onOpenChange={setNovoCartaoOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display">Cadastrar cartão de crédito</DialogTitle>
            <DialogDescription className="text-xs">Contrato G004 · CartaoInstrumento isolado por perfil.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriarCartao} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Nome do cartão</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: XP Visa Infinite"
                required
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bandeira</Label>
                <Input value={bandeira} onChange={(e) => setBandeira(e.target.value)} required className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Últimos 4 dígitos</Label>
                <Input
                  value={ultimos4}
                  onChange={(e) => setUltimos4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4821"
                  maxLength={4}
                  required
                  className="rounded-xl font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Limite (R$)</Label>
                <Input
                  value={limiteTexto}
                  onChange={(e) => setLimiteTexto(e.target.value)}
                  placeholder="10.000,00"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia fech.</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={fechamentoDia}
                  onChange={(e) => setFechamentoDia(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia venc.</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={vencimentoDia}
                  onChange={(e) => setVencimentoDia(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setNovoCartaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting}>
                Cadastrar cartão
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nova Compra no Cartão */}
      <Dialog open={novaCompraOpen} onOpenChange={setNovaCompraOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-display">Lançar compra no cartão</DialogTitle>
            <DialogDescription className="text-xs">
              {cartaoAtivo?.nome} · Disponível: {formatarCentavosBRL(cartaoAtivo?.disponivelCentavos)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegistrarCompra} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input
                  value={descCompra}
                  onChange={(e) => setDescCompra(e.target.value)}
                  placeholder="Ex: Notebook trabalho"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Estabelecimento</Label>
                <Input
                  value={estabelecimento}
                  onChange={(e) => setEstabelecimento(e.target.value)}
                  placeholder="Ex: Amazon"
                  required
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Valor total (R$)</Label>
                <Input
                  value={valorCompraTexto}
                  onChange={(e) => setValorCompraTexto(e.target.value)}
                  placeholder="1.200,00"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={dataCompra}
                  onChange={(e) => setDataCompra(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.categorias
                    .filter((c) => c.natureza === "DESPESA" && c.ativo)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setNovaCompraOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting}>
                Lançar compra
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pagar Fatura */}
      <Dialog open={Boolean(faturaParaPagar)} onOpenChange={(open) => !open && setFaturaParaPagar(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display">Pagar fatura</DialogTitle>
            <DialogDescription className="text-xs">
              {faturaParaPagar?.cartao.nome} · Competência {faturaParaPagar?.ciclo.competencia} · Valor:{" "}
              <strong>{formatarCentavosBRL(faturaParaPagar?.ciclo.restanteCentavos)}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePagarFatura} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Conta de débito</Label>
              <Select value={carteiraId} onValueChange={setCarteiraId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.contas
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({formatarCentavosBRL(c.saldoCentavos)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Meio</Label>
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
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFaturaParaPagar(null)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting}>
                Confirmar pagamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
