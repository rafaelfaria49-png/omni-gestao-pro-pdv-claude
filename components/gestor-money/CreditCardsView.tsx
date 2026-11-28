"use client"

import * as React from "react"
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
  History,
  Layers,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
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
import {
  GestorMoneyBoundaryError,
  type GestorMoneyGateway,
} from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  formatarDataBR,
  hojeSaoPaulo,
  parseBRLParaCentavos,
  parseBigIntCentavos,
  rotuloMeioPagamento,
} from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
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

function centavosParaInputBRL(centavos: string | null): string {
  if (centavos === null) return ""
  const valor = Number(parseBigIntCentavos(centavos)) / 100
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatarTimestampBR(iso: string): string {
  const data = formatarDataBR(iso)
  const horaMatch = /T(\d{2}:\d{2})/.exec(iso)
  return horaMatch ? `${data} às ${horaMatch[1]}` : data
}

function rotuloAcaoLimite(acao: "CADASTRO" | "ALTERACAO" | "REMOCAO"): string {
  if (acao === "CADASTRO") return "Cadastro inicial"
  if (acao === "REMOCAO") return "Remoção de limite"
  return "Alteração de limite"
}

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
  const [editarCartaoOpen, setEditarCartaoOpen] = React.useState(false)
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
  const [motivoInicial, setMotivoInicial] = React.useState("")
  const [fechamentoDia, setFechamentoDia] = React.useState("5")
  const [vencimentoDia, setVencimentoDia] = React.useState("12")

  // Editar cartão / limite form
  const [editNome, setEditNome] = React.useState("")
  const [editBandeira, setEditBandeira] = React.useState("")
  const [editUltimos4, setEditUltimos4] = React.useState("")
  const [editLimiteTexto, setEditLimiteTexto] = React.useState("")
  const [editRemoverLimite, setEditRemoverLimite] = React.useState(false)
  const [editMotivo, setEditMotivo] = React.useState("")

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
  const [pagamentoParcial, setPagamentoParcial] = React.useState(false)
  const [valorParcialFatura, setValorParcialFatura] = React.useState("")

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [errorCode, setErrorCode] = React.useState<string | null>(null)

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const abrirModalEditar = (card: CartaoCreditoResumo) => {
    setError(null)
    setErrorCode(null)
    setEditNome(card.nome)
    setEditBandeira(card.bandeira)
    setEditUltimos4(card.ultimos4)
    setEditRemoverLimite(card.limiteCentavos === null)
    setEditLimiteTexto(centavosParaInputBRL(card.limiteCentavos))
    setEditMotivo("")
    setEditarCartaoOpen(true)
  }

  const handleCriarCartao = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setErrorCode(null)
    setSubmitting(true)
    try {
      let limiteCentavos: string | null | undefined = undefined
      if (limiteTexto.trim()) {
        const parsedLimite = parseBRLParaCentavos(limiteTexto)
        if (parsedLimite === null) {
          throw new Error("Informe um valor de limite válido em reais (ex: 5.000,00) ou deixe em branco.")
        }
        limiteCentavos = parsedLimite
      }
      const fb = await gateway.criarCartao(seletor, {
        nome,
        bandeira,
        ultimos4,
        ...(limiteCentavos !== undefined ? { limiteCentavos } : {}),
        ...(motivoInicial.trim() ? { motivo: motivoInicial.trim() } : {}),
        fechamentoDia: Number(fechamentoDia) || 5,
        vencimentoDia: Number(vencimentoDia) || 12,
      })
      await onMutationSuccess(fb)
      setNovoCartaoOpen(false)
      setNome("")
      setUltimos4("")
      setLimiteTexto("")
      setMotivoInicial("")
    } catch (err) {
      setErrorCode(err instanceof GestorMoneyBoundaryError ? err.code : null)
      setError(err instanceof Error ? err.message : "Erro ao cadastrar cartão.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditarCartao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cartaoAtivo) return
    setError(null)
    setErrorCode(null)
    setSubmitting(true)
    try {
      let limiteCentavos: string | null | undefined = undefined
      if (editRemoverLimite) {
        limiteCentavos = null
      } else if (editLimiteTexto.trim()) {
        const parsedLimite = parseBRLParaCentavos(editLimiteTexto)
        if (parsedLimite === null) {
          throw new Error("Informe um limite válido em reais (ex: 8.500,00) ou marque remover limite.")
        }
        limiteCentavos = parsedLimite
      }

      const fb = await gateway.editarCartao(seletor, {
        cartaoId: cartaoAtivo.id,
        nome: editNome.trim() || undefined,
        bandeira: editBandeira.trim() || undefined,
        ultimos4: editUltimos4.trim() || undefined,
        ...(limiteCentavos !== undefined ? { limiteCentavos } : {}),
        ...(editMotivo.trim() ? { motivo: editMotivo.trim() } : {}),
      })
      await onMutationSuccess(fb)
      setEditarCartaoOpen(false)
    } catch (err) {
      setErrorCode(err instanceof GestorMoneyBoundaryError ? err.code : null)
      setError(err instanceof Error ? err.message : "Erro ao atualizar cartão/limite.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cartaoAtivo) return
    setError(null)
    setErrorCode(null)
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
      setErrorCode(err instanceof GestorMoneyBoundaryError ? err.code : null)
      setError(err instanceof Error ? err.message : "Erro ao lançar compra no cartão.")
    } finally {
      setSubmitting(false)
    }
  }

  const handlePagarFatura = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!faturaParaPagar) return
    setError(null)
    setErrorCode(null)
    setSubmitting(true)
    try {
      let valorCentavos: string | undefined = undefined
      if (pagamentoParcial) {
        const parsedValor = parseBRLParaCentavos(valorParcialFatura)
        if (!parsedValor || BigInt(parsedValor) <= BigInt(0)) {
          throw new Error("Informe um valor válido para o pagamento parcial da fatura.")
        }
        valorCentavos = parsedValor
      }
      const fb = await gateway.pagarFatura(seletor, {
        cartaoId: faturaParaPagar.cartao.id,
        cicloId: faturaParaPagar.ciclo.id,
        carteiraId,
        formaPagamento,
        dataPagamento,
        ...(valorCentavos ? { valorCentavos } : {}),
      })
      await onMutationSuccess(fb)
      setFaturaParaPagar(null)
      setPagamentoParcial(false)
      setValorParcialFatura("")
    } catch (err) {
      setErrorCode(err instanceof GestorMoneyBoundaryError ? err.code : null)
      setError(err instanceof Error ? err.message : "Erro ao pagar fatura.")
    } finally {
      setSubmitting(false)
    }
  }

  const erroLimiteInsuficiente =
    errorCode === "limite_cartao_insuficiente" || errorCode === "limite_insuficiente"

  const compraValorCentavosPreview = parseBRLParaCentavos(valorCompraTexto)
  const compraAcimaDisponivelAviso = Boolean(
    cartaoAtivo &&
      cartaoAtivo.disponivelCentavos !== null &&
      compraValorCentavosPreview &&
      parseBigIntCentavos(compraValorCentavosPreview) > parseBigIntCentavos(cartaoAtivo.disponivelCentavos)
  )

  return (
    <div className="space-y-6" data-testid="gestor-money-cartoes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Cartões de crédito</h2>
          <p className="text-xs text-muted-foreground">
            Contratos canônicos G004/G005 · Limite total/utilizado/disponível, histórico imutável, parcelamentos e faturas por ciclo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cartaoAtivo && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl text-xs"
                data-testid="btn-editar-limite-cartao"
                onClick={() => abrirModalEditar(cartaoAtivo)}
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Editar limite
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl text-xs"
                data-testid="btn-nova-compra-cartao"
                onClick={() => {
                  setError(null)
                  setErrorCode(null)
                  setNovaCompraOpen(true)
                }}
              >
                <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                Lançar compra
              </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            className="rounded-xl text-xs"
            data-testid="btn-novo-cartao"
            onClick={() => {
              setError(null)
              setErrorCode(null)
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
          description="Adicione um cartão de crédito para acompanhar limite total, utilizado e disponível, ciclos de fatura e compras parceladas."
          actionLabel="Cadastrar cartão"
          onAction={() => setNovoCartaoOpen(true)}
        />
      ) : (
        <>
          {/* Card visual selector — consumes ONLY backend canonical values */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.cartoes.map((card) => {
              const temLimite = card.limiteCentavos !== null
              const usoPct = card.limiteComprometidoPercentual
              const excedido =
                card.limiteExcedidoCentavos !== null &&
                parseBigIntCentavos(card.limiteExcedidoCentavos) > BigInt(0)
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
                      <p className="text-[10px] uppercase text-white/70">Utilizado</p>
                      <p
                        className="font-display text-sm font-bold tabular-nums"
                        data-testid={`card-used-${card.id}`}
                      >
                        {formatarCentavosBRL(card.usadoCentavos)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-white/70">Disponível</p>
                      {card.disponivelCentavos !== null ? (
                        <p
                          className={cn(
                            "font-display text-sm font-bold tabular-nums",
                            excedido ? "text-rose-300" : "text-emerald-300"
                          )}
                          data-testid={`card-available-${card.id}`}
                        >
                          {formatarCentavosBRL(card.disponivelCentavos)}
                        </p>
                      ) : (
                        <p
                          className="text-xs font-medium text-white/75"
                          data-testid={`card-limit-unavailable-${card.id}`}
                        >
                          Não informado
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    {temLimite ? (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            excedido || (usoPct !== null && usoPct > 80) ? "bg-rose-400" : "bg-emerald-300"
                          )}
                          style={{
                            width: `${usoPct !== null ? Math.min(100, Math.max(usoPct > 0 ? 3 : 0, usoPct)) : 0}%`,
                          }}
                        />
                      </div>
                    ) : (
                      <div className="rounded-md bg-black/25 px-2 py-1 text-[10px] text-white/80">
                        Limite não informado · clique em &ldquo;Editar limite&rdquo; para definir
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-white/75">
                      <span data-testid={`card-total-limit-${card.id}`}>
                        {temLimite ? `Limite ${formatarCentavosBRL(card.limiteCentavos!)}` : "Limite não informado"}
                      </span>
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
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base font-semibold text-foreground">
                      {cartaoAtivo.nome} · •••• {cartaoAtivo.ultimos4}
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => abrirModalEditar(cartaoAtivo)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Editar
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Fechamento: dia <strong>{cartaoAtivo.fechamentoDia}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Vencimento: dia <strong>{cartaoAtivo.vencimentoDia}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      Comprometimento integral na compra · Recomposição no pagamento
                    </span>
                  </div>
                </div>

                {cartaoAtivo.limiteCentavos !== null && cartaoAtivo.limiteComprometidoPercentual !== null && (
                  <div className="w-full space-y-1 sm:w-52">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Uso do limite</span>
                      <strong className="tabular-nums text-foreground" data-testid="active-card-limit-pct">
                        {cartaoAtivo.limiteComprometidoPercentual.toFixed(2)}%
                      </strong>
                    </div>
                    <Progress
                      value={Math.min(100, Math.max(0, cartaoAtivo.limiteComprometidoPercentual))}
                      className="h-2"
                    />
                  </div>
                )}
              </div>

              {/* Canonical Limit KPIs Strip (zero frontend recalculation) */}
              <div
                className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3"
                data-testid="active-card-limit-summary"
              >
                <div className="rounded-xl border border-border/80 bg-muted/25 px-3.5 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Limite total</p>
                  <p className="mt-0.5 font-display text-base font-bold tabular-nums text-foreground">
                    {cartaoAtivo.limiteCentavos !== null
                      ? formatarCentavosBRL(cartaoAtivo.limiteCentavos)
                      : "Não informado"}
                  </p>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/25 px-3.5 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Limite utilizado (todas as parcelas)</p>
                  <p className="mt-0.5 font-display text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {formatarCentavosBRL(cartaoAtivo.usadoCentavos)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/80 bg-muted/25 px-3.5 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Limite disponível</p>
                  <p
                    className={cn(
                      "mt-0.5 font-display text-base font-bold tabular-nums",
                      cartaoAtivo.disponivelCentavos === null
                        ? "text-muted-foreground"
                        : cartaoAtivo.limiteExcedidoCentavos !== null &&
                            parseBigIntCentavos(cartaoAtivo.limiteExcedidoCentavos) > BigInt(0)
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    {cartaoAtivo.disponivelCentavos !== null
                      ? formatarCentavosBRL(cartaoAtivo.disponivelCentavos)
                      : "Não informado"}
                  </p>
                  {cartaoAtivo.limiteExcedidoCentavos !== null &&
                    parseBigIntCentavos(cartaoAtivo.limiteExcedidoCentavos) > BigInt(0) && (
                      <p className="mt-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                        Excedido em {formatarCentavosBRL(cartaoAtivo.limiteExcedidoCentavos)}
                      </p>
                    )}
                </div>
              </div>

              <Tabs defaultValue="faturas">
                <TabsList className="mb-4 flex flex-wrap h-auto gap-1 rounded-xl p-1">
                  <TabsTrigger value="faturas" className="rounded-lg text-xs" data-testid="tab-faturas">
                    Faturas ({cartaoAtivo.ciclos.length})
                  </TabsTrigger>
                  <TabsTrigger value="parceladas" className="rounded-lg text-xs" data-testid="tab-parceladas">
                    Parceladas ({cartaoAtivo.comprasParceladas.length})
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-lg text-xs" data-testid="tab-historico-cartao">
                    Movimentações ({cartaoAtivo.historico.length})
                  </TabsTrigger>
                  <TabsTrigger value="limites" className="rounded-lg text-xs" data-testid="tab-historico-limites">
                    Histórico de limites ({cartaoAtivo.historicoLimites.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="faturas" className="mt-0 space-y-2.5">
                  {cartaoAtivo.ciclos.map((ciclo) => {
                    const temSaldo = parseBigIntCentavos(ciclo.restanteCentavos) > BigInt(0)
                    const temPago = parseBigIntCentavos(ciclo.pagoCentavos) > BigInt(0)
                    return (
                      <div
                        key={ciclo.id}
                        data-testid={`invoice-cycle-${ciclo.competencia}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-sm font-semibold text-foreground">
                              Fatura {ciclo.competencia}
                            </p>
                            <StatusPill status={ciclo.status} />
                            {typeof ciclo.quantidadeTitulos === "number" && (
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {ciclo.quantidadeTitulos}{" "}
                                {ciclo.quantidadeTitulos === 1 ? "lançamento" : "lançamentos"}
                              </span>
                            )}
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
                                {temPago ? ` · Pago ${formatarCentavosBRL(ciclo.pagoCentavos)}` : ""}
                              </p>
                            ) : (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                {parseBigIntCentavos(ciclo.totalCentavos) > BigInt(0) ? "Liquidada" : "Sem saldo"}
                              </p>
                            )}
                          </div>
                          {temSaldo && (
                            <Button
                              type="button"
                              size="sm"
                              variant={ciclo.status === "futura" ? "outline" : "default"}
                              className="rounded-xl text-xs"
                              data-testid={`pay-invoice-${ciclo.id}`}
                              onClick={() => {
                                setError(null)
                                setErrorCode(null)
                                setPagamentoParcial(false)
                                setValorParcialFatura("")
                                setFaturaParaPagar({ cartao: cartaoAtivo, ciclo })
                              }}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                              {ciclo.status === "futura" ? "Antecipar" : "Pagar fatura"}
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
                      description="Compras parceladas comprometem o limite integralmente no ato e aparecerão aqui parcela a parcela."
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
                            {!cp.ativa && <StatusPill status="paga" />}
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
                            Total comprometido {formatarCentavosBRL(cp.valorTotalCentavos)}
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

                <TabsContent value="limites" className="mt-0 space-y-2.5" data-testid="card-limit-history-panel">
                  {cartaoAtivo.historicoLimites.length === 0 ? (
                    <EmptyStateCard
                      icon={<SlidersHorizontal className="h-5 w-5" />}
                      title="Nenhuma alteração de limite registrada"
                      description="Toda definição, alteração ou remoção de limite é gravada de forma imutável em cartoes_limites_eventos (G004)."
                      actionLabel="Definir limite"
                      onAction={() => abrirModalEditar(cartaoAtivo)}
                    />
                  ) : (
                    cartaoAtivo.historicoLimites.map((ev) => (
                      <div
                        key={ev.id}
                        data-testid={`limit-event-${ev.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                ev.acao === "CADASTRO"
                                  ? "border-sky-500/30 bg-sky-500/12 text-sky-600 dark:text-sky-300"
                                  : ev.acao === "REMOCAO"
                                    ? "border-rose-500/30 bg-rose-500/12 text-rose-600 dark:text-rose-300"
                                    : "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300"
                              )}
                            >
                              {rotuloAcaoLimite(ev.acao)}
                            </span>
                            <span className="text-muted-foreground">{formatarTimestampBR(ev.criadoEm)}</span>
                          </div>
                          {ev.motivo && <p className="text-foreground">{ev.motivo}</p>}
                        </div>
                        <div className="text-right font-display tabular-nums">
                          <span className="text-muted-foreground">
                            {ev.limiteAnteriorCentavos !== null
                              ? formatarCentavosBRL(ev.limiteAnteriorCentavos)
                              : "Não informado"}
                          </span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span className="font-bold text-foreground">
                            {ev.limiteNovoCentavos !== null
                              ? formatarCentavosBRL(ev.limiteNovoCentavos)
                              : "Não informado"}
                          </span>
                        </div>
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
        <DialogContent className="rounded-2xl sm:max-w-[460px]" data-testid="dialog-novo-cartao">
          <DialogHeader>
            <DialogTitle className="font-display">Cadastrar cartão de crédito</DialogTitle>
            <DialogDescription className="text-xs">
              Contrato canônico G004 · Limite opcional (em branco mantém &ldquo;Não informado&rdquo;, nunca R$ 0,00).
            </DialogDescription>
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
                data-testid="input-novo-cartao-nome"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bandeira</Label>
                <Input
                  value={bandeira}
                  onChange={(e) => setBandeira(e.target.value)}
                  required
                  className="rounded-xl"
                />
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
                  data-testid="input-novo-cartao-ultimos4"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Limite (R$)</Label>
                <Input
                  value={limiteTexto}
                  onChange={(e) => setLimiteTexto(e.target.value)}
                  placeholder="Opcional"
                  className="rounded-xl tabular-nums"
                  data-testid="input-novo-cartao-limite"
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
            {limiteTexto.trim() && (
              <div className="space-y-1.5">
                <Label>Motivo do limite inicial (opcional)</Label>
                <Input
                  value={motivoInicial}
                  onChange={(e) => setMotivoInicial(e.target.value)}
                  placeholder="Ex: Limite inicial aprovado pelo emissor"
                  maxLength={500}
                  className="rounded-xl"
                />
              </div>
            )}
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setNovoCartaoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting} data-testid="btn-submit-novo-cartao">
                Cadastrar cartão
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Cartão / Limite */}
      <Dialog open={editarCartaoOpen} onOpenChange={setEditarCartaoOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[460px]" data-testid="dialog-editar-cartao">
          <DialogHeader>
            <DialogTitle className="font-display">Editar cartão e limite</DialogTitle>
            <DialogDescription className="text-xs">
              Alterações de limite são auditadas de forma imutável em cartoes_limites_eventos (G004).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditarCartao} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Nome do cartão</Label>
              <Input
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bandeira</Label>
                <Input value={editBandeira} onChange={(e) => setEditBandeira(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>Últimos 4 dígitos</Label>
                <Input
                  value={editUltimos4}
                  onChange={(e) => setEditUltimos4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  className="rounded-xl font-mono"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-foreground">Deixar limite como não informado</p>
                  <p className="text-[11px] text-muted-foreground">
                    Registra evento REMOCAO e define limiteCentavos como null.
                  </p>
                </div>
                <Switch
                  checked={editRemoverLimite}
                  onCheckedChange={setEditRemoverLimite}
                  data-testid="switch-remover-limite"
                />
              </div>

              {!editRemoverLimite && (
                <div className="space-y-1.5 pt-1">
                  <Label>Novo limite (R$)</Label>
                  <Input
                    value={editLimiteTexto}
                    onChange={(e) => setEditLimiteTexto(e.target.value)}
                    placeholder="Ex: 15.000,00"
                    className="rounded-xl font-display font-semibold tabular-nums"
                    data-testid="input-editar-limite"
                  />
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <Label>Motivo da alteração (opcional)</Label>
                <Input
                  value={editMotivo}
                  onChange={(e) => setEditMotivo(e.target.value)}
                  placeholder="Ex: Aumento concedido pelo banco"
                  maxLength={500}
                  className="rounded-xl"
                  data-testid="input-editar-limite-motivo"
                />
              </div>
            </div>

            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setEditarCartaoOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={submitting}
                data-testid="btn-submit-editar-cartao"
              >
                Salvar alterações
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nova Compra no Cartão */}
      <Dialog open={novaCompraOpen} onOpenChange={setNovaCompraOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[460px]" data-testid="dialog-nova-compra-cartao">
          <DialogHeader>
            <DialogTitle className="font-display">Lançar compra no cartão</DialogTitle>
            <DialogDescription className="text-xs">
              {cartaoAtivo?.nome} ·{" "}
              {cartaoAtivo?.disponivelCentavos !== null && cartaoAtivo?.disponivelCentavos !== undefined
                ? `Disponível: ${formatarCentavosBRL(cartaoAtivo.disponivelCentavos)} de ${formatarCentavosBRL(cartaoAtivo.limiteCentavos)}`
                : `Utilizado: ${formatarCentavosBRL(cartaoAtivo?.usadoCentavos)} (limite não informado)`}
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
                  data-testid="input-compra-descricao"
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
                  data-testid="input-compra-estabelecimento"
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
                  className="rounded-xl tabular-nums"
                  data-testid="input-compra-valor"
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
                  data-testid="input-compra-parcelas"
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

            {Number(parcelas) > 1 && (
              <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-700 dark:text-sky-300">
                Comprometimento integral: o valor total desta compra compromete o limite do cartão no ato, com parcelas distribuídas em {Number(parcelas)} ciclos mensais.
              </div>
            )}

            {compraAcimaDisponivelAviso && !erroLimiteInsuficiente && (
              <div
                className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300"
                data-testid="card-limit-precheck-warning"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  O valor digitado excede o limite disponível atual ({formatarCentavosBRL(cartaoAtivo?.disponivelCentavos)}). O motor G004 recusará a operação por limite insuficiente.
                </span>
              </div>
            )}

            {error && (
              <div
                className="space-y-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-300"
                data-testid={erroLimiteInsuficiente ? "card-insufficient-limit-alert" : "card-purchase-error"}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
                {erroLimiteInsuficiente && cartaoAtivo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-lg border-rose-500/40 text-[11px]"
                    onClick={() => {
                      setNovaCompraOpen(false)
                      abrirModalEditar(cartaoAtivo)
                    }}
                  >
                    Ajustar limite do cartão
                  </Button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setNovaCompraOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="rounded-xl"
                disabled={submitting}
                data-testid="btn-submit-compra-cartao"
              >
                Lançar compra
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Pagar Fatura */}
      <Dialog open={Boolean(faturaParaPagar)} onOpenChange={(open) => !open && setFaturaParaPagar(null)}>
        <DialogContent className="rounded-2xl sm:max-w-[440px]" data-testid="dialog-pagar-fatura">
          <DialogHeader>
            <DialogTitle className="font-display">Pagar fatura</DialogTitle>
            <DialogDescription className="text-xs">
              {faturaParaPagar?.cartao.nome} · Competência {faturaParaPagar?.ciclo.competencia} · Restante:{" "}
              <strong>{formatarCentavosBRL(faturaParaPagar?.ciclo.restanteCentavos)}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePagarFatura} className="space-y-3.5">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/25 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium text-foreground">Pagamento parcial</p>
                <p className="text-[11px] text-muted-foreground">
                  Recompõe o limite disponível exatamente no valor pago (G004).
                </p>
              </div>
              <Switch
                checked={pagamentoParcial}
                onCheckedChange={setPagamentoParcial}
                data-testid="switch-fatura-parcial"
              />
            </div>

            {pagamentoParcial && (
              <div className="space-y-1.5">
                <Label>Valor do pagamento parcial (R$)</Label>
                <Input
                  value={valorParcialFatura}
                  onChange={(e) => setValorParcialFatura(e.target.value)}
                  placeholder="Ex: 500,00"
                  required
                  className="rounded-xl font-display font-semibold tabular-nums"
                  data-testid="input-fatura-valor-parcial"
                />
              </div>
            )}

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
              <Button
                type="submit"
                className="rounded-xl"
                disabled={submitting}
                data-testid="btn-submit-pagar-fatura"
              >
                Confirmar pagamento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
