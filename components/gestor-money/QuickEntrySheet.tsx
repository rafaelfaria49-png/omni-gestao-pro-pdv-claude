"use client"

import * as React from "react"
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  CheckCircle2,
  Loader2,
  ReceiptText,
  Scale,
} from "lucide-react"
import {
  MEIOS_PAGAMENTO_GASTO,
  type ComprovanteUploadDraft,
  type ConsultaFinanceiraSnapshot,
  type MeioPagamentoGasto,
  type OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import {
  formatarCentavosBRL,
  hojeSaoPaulo,
  parseBRLParaCentavos,
  rotuloMeioPagamento,
} from "@/lib/gestor-money/money"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReceiptAttachmentInput } from "./shared"

export type QuickEntryTab = "despesa" | "receita" | "divida" | "pagamento" | "transferencia"

export function QuickEntrySheet({
  open,
  onOpenChange,
  initialTab = "despesa",
  presetDividaId,
  snapshot,
  gateway,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: QuickEntryTab
  presetDividaId?: string
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [tab, setTab] = React.useState<QuickEntryTab>(initialTab)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const contasAtivas = React.useMemo(() => snapshot.contas.filter((c) => c.ativo), [snapshot.contas])
  const categoriasDespesa = React.useMemo(
    () => snapshot.categorias.filter((c) => c.ativo && c.natureza === "DESPESA"),
    [snapshot.categorias]
  )
  const categoriasReceita = React.useMemo(
    () => snapshot.categorias.filter((c) => c.ativo && c.natureza === "RECEITA"),
    [snapshot.categorias]
  )
  const dividasAbertas = React.useMemo(
    () => snapshot.dividas.filter((d) => d.status !== "quitada"),
    [snapshot.dividas]
  )

  const hoje = hojeSaoPaulo()

  // Form states
  const [descricao, setDescricao] = React.useState("")
  const [valorTexto, setValorTexto] = React.useState("")
  const [data, setData] = React.useState(hoje)
  const [vencimento, setVencimento] = React.useState(hoje)
  const [liquidadoAgora, setLiquidadoAgora] = React.useState(true)
  const [categoriaId, setCategoriaId] = React.useState("")
  const [carteiraId, setCarteiraId] = React.useState("")
  const [carteiraDestinoId, setCarteiraDestinoId] = React.useState("")
  const [formaPagamento, setFormaPagamento] = React.useState<MeioPagamentoGasto>("pix")
  const [contraparte, setContraparte] = React.useState("")
  const [parcelasTotal, setParcelasTotal] = React.useState("1")
  const [dividaId, setDividaId] = React.useState("")
  const [quitarDivida, setQuitarDivida] = React.useState(false)
  const [comprovante, setComprovante] = React.useState<ComprovanteUploadDraft | undefined>(undefined)

  React.useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setError(null)
    setDescricao("")
    setValorTexto("")
    setData(hoje)
    setVencimento(hoje)
    setLiquidadoAgora(true)
    setContraparte("")
    setParcelasTotal("1")
    setQuitarDivida(false)
    setComprovante(undefined)
    setCarteiraId(contasAtivas[0]?.id ?? "")
    setCarteiraDestinoId(contasAtivas[1]?.id ?? contasAtivas[0]?.id ?? "")
    setDividaId(presetDividaId || dividasAbertas[0]?.id || "")
    const cats = initialTab === "receita" ? categoriasReceita : categoriasDespesa
    setCategoriaId(cats[0]?.id ?? "")
  }, [open, initialTab, presetDividaId, hoje, contasAtivas, categoriasDespesa, categoriasReceita, dividasAbertas])

  React.useEffect(() => {
    if (!open) return
    const cats = tab === "receita" ? categoriasReceita : categoriasDespesa
    if (!cats.some((c) => c.id === categoriaId)) {
      setCategoriaId(cats[0]?.id ?? "")
    }
  }, [tab, open, categoriasDespesa, categoriasReceita, categoriaId])

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const dividaSelecionada = dividasAbertas.find((d) => d.id === dividaId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      let feedback: OperacaoFeedback

      let documentoIdReal: string | undefined
      if (gateway.mode === "real" && comprovante?.conteudoBase64) {
        const doc = await gateway.enviarComprovante(seletor, {
          nomeArquivo: comprovante.nomeArquivo,
          conteudoBase64: comprovante.conteudoBase64,
        })
        documentoIdReal = doc.id
      }

      if (tab === "despesa") {
        const centavos = parseBRLParaCentavos(valorTexto)
        if (!centavos || BigInt(centavos) <= BigInt(0)) {
          throw new Error("Informe um valor válido em reais (ex: 125,50).")
        }
        feedback = await gateway.registrarDespesa(seletor, {
          descricao,
          valorCentavos: centavos,
          dataGasto: data,
          pagoAgora: liquidadoAgora,
          vencimento: liquidadoAgora ? undefined : vencimento,
          categoriaId,
          carteiraId,
          formaPagamento,
          contraparte: contraparte || undefined,
          comprovante,
          ...(documentoIdReal ? { documentoId: documentoIdReal } : {}),
        })
      } else if (tab === "receita") {
        const centavos = parseBRLParaCentavos(valorTexto)
        if (!centavos || BigInt(centavos) <= BigInt(0)) {
          throw new Error("Informe um valor válido em reais (ex: 1.500,00).")
        }
        feedback = await gateway.registrarReceita(seletor, {
          descricao,
          valorCentavos: centavos,
          dataRecebimento: data,
          recebidoAgora: liquidadoAgora,
          vencimento: liquidadoAgora ? undefined : vencimento,
          categoriaId,
          carteiraId,
          formaPagamento,
          contraparte: contraparte || undefined,
          comprovante,
        })
      } else if (tab === "divida") {
        const centavos = parseBRLParaCentavos(valorTexto)
        if (!centavos || BigInt(centavos) <= BigInt(0)) {
          throw new Error("Informe o valor original da dívida.")
        }
        feedback = await gateway.registrarDivida(seletor, {
          credor: contraparte,
          descricao,
          valorOriginalCentavos: centavos,
          vencimento,
          parcelasTotal: Math.max(1, Number(parcelasTotal) || 1),
          categoriaId,
          comprovante,
          ...(documentoIdReal ? { documentoId: documentoIdReal } : {}),
        })
      } else if (tab === "pagamento") {
        if (!dividaId) throw new Error("Selecione a dívida para registrar o pagamento.")
        const centavos = quitarDivida ? undefined : parseBRLParaCentavos(valorTexto) ?? undefined
        if (!quitarDivida && (!centavos || BigInt(centavos) <= BigInt(0))) {
          throw new Error("Informe o valor do pagamento parcial ou marque Quitação total.")
        }
        feedback = await gateway.pagarDivida(seletor, {
          dividaId,
          quitar: quitarDivida,
          valorCentavos: centavos,
          carteiraId,
          formaPagamento,
          dataPagamento: data,
          observacao: descricao || undefined,
          comprovante,
          ...(documentoIdReal ? { documentoId: documentoIdReal } : {}),
        })
      } else {
        const centavos = parseBRLParaCentavos(valorTexto)
        if (!centavos || BigInt(centavos) <= BigInt(0)) {
          throw new Error("Informe o valor da transferência.")
        }
        feedback = await gateway.transferir(seletor, {
          carteiraOrigemId: carteiraId,
          carteiraDestinoId,
          valorCentavos: centavos,
          dataTransferencia: data,
          descricao: descricao || "Transferência entre contas",
          comprovante,
        })
      }

      await onSuccess(feedback)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o lançamento.")
    } finally {
      setSubmitting(false)
    }
  }

  const categoriasAtuais = tab === "receita" ? categoriasReceita : categoriasDespesa

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-[540px]"
        data-testid="quick-entry-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Lançamento rápido</DialogTitle>
          <DialogDescription className="text-xs">
            Perfil ativo: <strong>{snapshot.perfil.nomeExibicao}</strong> · Precisão exata em centavos (G004)
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as QuickEntryTab)} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-5 gap-1 rounded-xl p-1">
            <TabsTrigger value="despesa" className="flex-col gap-1 py-2 text-[11px]" data-testid="qe-tab-despesa">
              <ArrowDownCircle className="h-4 w-4 text-rose-500" />
              <span>Despesa</span>
            </TabsTrigger>
            <TabsTrigger value="receita" className="flex-col gap-1 py-2 text-[11px]" data-testid="qe-tab-receita">
              <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
              <span>Receita</span>
            </TabsTrigger>
            <TabsTrigger value="divida" className="flex-col gap-1 py-2 text-[11px]" data-testid="qe-tab-divida">
              <Scale className="h-4 w-4 text-amber-500" />
              <span>Dívida</span>
            </TabsTrigger>
            <TabsTrigger value="pagamento" className="flex-col gap-1 py-2 text-[11px]" data-testid="qe-tab-pagamento">
              <ReceiptText className="h-4 w-4 text-sky-500" />
              <span>Pagar</span>
            </TabsTrigger>
            <TabsTrigger value="transferencia" className="flex-col gap-1 py-2 text-[11px]" data-testid="qe-tab-transferencia">
              <ArrowLeftRight className="h-4 w-4 text-violet-500" />
              <span>Transferir</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {tab === "pagamento" && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="qe-divida">Dívida em aberto</Label>
                {dividasAbertas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma dívida em aberto neste perfil.</p>
                ) : (
                  <Select value={dividaId} onValueChange={setDividaId}>
                    <SelectTrigger id="qe-divida" className="rounded-xl">
                      <SelectValue placeholder="Selecione a dívida" />
                    </SelectTrigger>
                    <SelectContent>
                      {dividasAbertas.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.credor} · {d.descricao} (Restante: {formatarCentavosBRL(d.saldoRestanteCentavos)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {dividaSelecionada && (
                <div className="flex items-center justify-between rounded-lg bg-background/80 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Saldo restante:</span>
                  <span className="font-display font-bold tabular-nums text-foreground">
                    {formatarCentavosBRL(dividaSelecionada.saldoRestanteCentavos)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="qe-quitar" className="text-xs font-medium">
                  Quitar saldo restante integralmente
                </Label>
                <Switch
                  id="qe-quitar"
                  checked={quitarDivida}
                  onCheckedChange={setQuitarDivida}
                />
              </div>
            </div>
          )}

          {tab === "divida" && (
            <div className="space-y-1.5">
              <Label htmlFor="qe-credor">Credor</Label>
              <Input
                id="qe-credor"
                placeholder="Ex: Banco Itaú, Fornecedor Alfa, Clínica..."
                value={contraparte}
                onChange={(e) => setContraparte(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className={tab === "pagamento" && quitarDivida ? "sm:col-span-2" : ""}>
              <Label htmlFor="qe-descricao">
                {tab === "pagamento" ? "Observação (opcional)" : "Descrição"}
              </Label>
              <Input
                id="qe-descricao"
                data-testid="qe-input-descricao"
                placeholder={
                  tab === "transferencia"
                    ? "Ex: Reserva para Pix"
                    : tab === "receita"
                      ? "Ex: Consultoria técnica"
                      : "Ex: Compras da semana"
                }
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                required={tab !== "pagamento"}
                className="mt-1.5 rounded-xl"
              />
            </div>

            {!(tab === "pagamento" && quitarDivida) && (
              <div>
                <Label htmlFor="qe-valor">Valor (R$)</Label>
                <Input
                  id="qe-valor"
                  data-testid="qe-input-valor"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  required
                  className="mt-1.5 rounded-xl font-display font-semibold tabular-nums"
                />
              </div>
            )}
          </div>

          {tab === "transferencia" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Conta de origem</Label>
                <Select value={carteiraId} onValueChange={setCarteiraId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasAtivas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({formatarCentavosBRL(c.saldoCentavos)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Conta de destino</Label>
                <Select value={carteiraDestinoId} onValueChange={setCarteiraDestinoId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {contasAtivas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} ({formatarCentavosBRL(c.saldoCentavos)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tab !== "pagamento" && (
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriasAtuais.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {tab !== "divida" ? (
                <div className="space-y-1.5">
                  <Label>{tab === "receita" ? "Conta de entrada" : "Conta / carteira"}</Label>
                  <Select value={carteiraId} onValueChange={setCarteiraId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contasAtivas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome} ({formatarCentavosBRL(c.saldoCentavos)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="qe-parcelas">Número de parcelas</Label>
                  <Input
                    id="qe-parcelas"
                    type="number"
                    min={1}
                    max={120}
                    value={parcelasTotal}
                    onChange={(e) => setParcelasTotal(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tab !== "divida" && (
              <div className="space-y-1.5">
                <Label htmlFor="qe-data">Data</Label>
                <Input
                  id="qe-data"
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
            )}

            {(tab === "divida" || ((tab === "despesa" || tab === "receita") && !liquidadoAgora)) && (
              <div className="space-y-1.5">
                <Label htmlFor="qe-vencimento">Vencimento</Label>
                <Input
                  id="qe-vencimento"
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
            )}

            {(tab === "despesa" || tab === "receita" || tab === "pagamento") && (
              <div className="space-y-1.5">
                <Label>Meio de pagamento</Label>
                <Select
                  value={formaPagamento}
                  onValueChange={(v) => setFormaPagamento(v as MeioPagamentoGasto)}
                >
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
            )}
          </div>

          {(tab === "despesa" || tab === "receita") && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/25 px-3.5 py-2.5">
              <div>
                <p className="text-xs font-medium text-foreground">
                  {tab === "despesa" ? "Despesa já paga?" : "Receita já recebida?"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {liquidadoAgora
                    ? "Impacta o saldo da conta e o CAIXA_REALIZADO imediatamente."
                    : "Fica registrada como título em aberto até a liquidação."}
                </p>
              </div>
              <Switch checked={liquidadoAgora} onCheckedChange={setLiquidadoAgora} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Comprovante (opcional · G003-STORAGE)</Label>
            <ReceiptAttachmentInput
              value={comprovante}
              onChange={setComprovante}
              disabled={submitting}
              storageDiagnostico={snapshot.storageDiagnostico}
              mode={gateway.mode}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="rounded-xl"
              disabled={submitting || (tab === "pagamento" && dividasAbertas.length === 0)}
              data-testid="qe-submit-button"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar lançamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
