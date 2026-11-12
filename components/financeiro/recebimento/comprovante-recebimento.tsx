"use client"

/**
 * Comprovante NÃO FISCAL de recebimento no Financeiro HUB.
 *
 *  - `ComprovanteRecebimentoPainel`: tela de sucesso DEPOIS da confirmação do servidor,
 *    com Imprimir comprovante / Concluir sem imprimir / Reimprimir. Nada aqui grava baixa.
 *  - `SegundaViaRecebimentoDialog`: lista os pagamentos REAIS do título (ledger) e
 *    reimprime o comprovante da operação original.
 *
 * Impressão: `lib/contas-receber-recibo.ts` (mesmo cupom térmico do PDV), bobina da
 * configuração da loja (`useStoreSettings().impressaoConfig`). Falha de impressão só
 * muda o aviso — o recebimento já está gravado.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Loader2, Printer, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { imprimirReciboLote, resolveReciboLojaNome } from "@/lib/contas-receber-recibo"
import {
  buscarSegundaVia,
  listarPagamentosTitulo,
  type PagamentoTitulo,
  type RecebimentoHubResultado,
} from "@/lib/financeiro/recebimento-hub-client"
import { rotuloFormaRecebimento } from "@/lib/financeiro/formas-recebimento-hub"
import { cn } from "@/lib/utils"

const EPS = 0.009

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export type ImpressaoEstado = "nao_tentada" | "aberta" | "falhou"

export type ComprovanteDados = {
  operacaoId: string | null
  cliente: string
  recebidoEm: string | null
  formaPagamento: string | null
  itens: Array<{ descricao: string; valorRecebido: number; saldoRestante: number }>
  totalRecebido: number
  saldoDevedorCliente: number | null
  segundaVia?: boolean
}

export function comprovanteDeResultado(r: RecebimentoHubResultado): ComprovanteDados {
  return {
    operacaoId: r.operacaoId,
    cliente: r.cliente,
    recebidoEm: r.recebidoEm,
    formaPagamento: r.formaPagamento,
    itens: r.itens.map((i) => ({ descricao: i.descricao, valorRecebido: i.valorRecebido, saldoRestante: i.saldoDepois })),
    totalRecebido: r.totalRecebido,
    saldoDevedorCliente: r.saldoDevedorCliente,
  }
}

/** Impressão do comprovante com a identidade e a bobina reais da loja ativa. */
export function useImprimirComprovante() {
  const { empresaDocumentos } = useLojaAtiva()
  const { impressaoConfig } = useStoreSettings()
  const lojaNome = useMemo(
    () => resolveReciboLojaNome(empresaDocumentos?.nomeFantasia, empresaDocumentos?.razaoSocial),
    [empresaDocumentos?.nomeFantasia, empresaDocumentos?.razaoSocial],
  )
  const bobina: "58mm" | "80mm" = impressaoConfig?.bobinaTamanho === "58mm" ? "58mm" : "80mm"
  const imprimir = useCallback(
    async (c: ComprovanteDados): Promise<boolean> => {
      try {
        return await imprimirReciboLote(
          {
            lojaNome,
            cliente: c.cliente,
            dataPagamento: c.recebidoEm ? new Date(c.recebidoEm) : new Date(NaN),
            formaPagamento: rotuloFormaRecebimento(c.formaPagamento) || "Não registrada",
            itens: c.itens.map((i) => ({ descricao: i.descricao, valorRecebido: i.valorRecebido, saldoRestante: i.saldoRestante })),
            totalRecebido: c.totalRecebido,
            saldoDevedorAtual: c.saldoDevedorCliente,
            operacaoId: c.operacaoId ?? undefined,
            segundaVia: c.segundaVia,
          },
          { bobina },
        )
      } catch (e) {
        console.error("[financeiro] comprovante:", e)
        return false
      }
    },
    [lojaNome, bobina],
  )
  return { imprimir, bobina }
}

function AvisoImpressao({ estado }: { estado: ImpressaoEstado }) {
  if (estado === "nao_tentada") return null
  return (
    <p
      role="status"
      className={cn(
        "rounded-md border px-3 py-2 text-xs",
        estado === "falhou" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      {estado === "falhou"
        ? "Não foi possível abrir a impressão. O recebimento continua gravado — tente de novo ou verifique a impressora."
        : "Comprovante enviado ao diálogo de impressão. Se não saiu na impressora, use Reimprimir."}
    </p>
  )
}

/** Tela de sucesso: aparece SOMENTE com a confirmação do servidor em mãos. */
export function ComprovanteRecebimentoPainel({
  resultado,
  onConcluir,
}: {
  resultado: RecebimentoHubResultado
  onConcluir: () => void
}) {
  const { imprimir, bobina } = useImprimirComprovante()
  const [estado, setEstado] = useState<ImpressaoEstado>("nao_tentada")
  const [imprimindo, setImprimindo] = useState(false)
  const dados = useMemo(() => comprovanteDeResultado(resultado), [resultado])

  const onImprimir = async () => {
    if (imprimindo) return
    setImprimindo(true)
    const ok = await imprimir(dados)
    setEstado(ok ? "aberta" : "falhou")
    setImprimindo(false)
  }

  const qtd = resultado.itens.length
  return (
    <div className="min-w-0 space-y-4" data-testid="comprovante-recebimento">
      <div className="flex flex-col items-center gap-1 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
        <h3 className="text-base font-semibold">
          {resultado.jaRegistrado ? "Recebimento já estava registrado" : "Recebimento confirmado"}
        </h3>
        <p className="text-3xl font-bold tabular-nums">{brl(resultado.totalRecebido)}</p>
        <p className="text-sm text-muted-foreground">
          {qtd === 1 ? "1 título" : `${qtd} títulos`} de {resultado.cliente} · {rotuloFormaRecebimento(resultado.formaPagamento)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {dataHora(resultado.recebidoEm)} · operação <span className="font-mono">{resultado.operacaoId.slice(0, 8)}</span>
        </p>
      </div>

      <ul className="mx-auto max-w-lg space-y-1">
        {resultado.itens.map((i) => (
          <li key={i.localKey} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate">{i.descricao || "Título"}</span>
              <span className="text-[11px] text-muted-foreground">
                {i.saldoDepois > EPS ? `abatido — resta ${brl(i.saldoDepois)}` : "quitado"}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{brl(i.valorRecebido)}</span>
          </li>
        ))}
      </ul>

      {resultado.saldoDevedorCliente != null ? (
        <p className="text-center text-xs text-muted-foreground">
          Saldo devedor do cliente nesta loja: <strong className="tabular-nums text-foreground">{brl(resultado.saldoDevedorCliente)}</strong>
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Títulos sem vínculo de cadastro: o comprovante mostra o saldo de cada título recebido.
        </p>
      )}

      <AvisoImpressao estado={estado} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">Comprovante não fiscal · bobina {bobina}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1" onClick={() => void onImprimir()} disabled={imprimindo}>
            {imprimindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {estado === "nao_tentada" ? "Imprimir comprovante" : "Reimprimir comprovante"}
          </Button>
          <Button onClick={onConcluir}>{estado === "nao_tentada" ? "Concluir sem imprimir" : "Concluir"}</Button>
        </div>
      </div>
    </div>
  )
}

/** 2ª via: pagamentos REAIS do título (ledger do servidor), sem nova baixa. */
export function SegundaViaRecebimentoDialog({
  open,
  onOpenChange,
  localKey,
  titulo,
  storeId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  localKey: string | null
  titulo: string
  storeId: string | null
}) {
  const { imprimir } = useImprimirComprovante()
  const [pagamentos, setPagamentos] = useState<PagamentoTitulo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [imprimindo, setImprimindo] = useState<number | null>(null)
  const [estado, setEstado] = useState<ImpressaoEstado>("nao_tentada")

  const carregar = useCallback(async () => {
    if (!localKey || !storeId) {
      setErro(storeId ? null : "Nenhuma loja ativa.")
      return
    }
    setCarregando(true)
    setErro(null)
    const r = await listarPagamentosTitulo({ fetchImpl: fetch, storeId, lojaHeader: ASSISTEC_LOJA_HEADER, localKey })
    if (r.ok) setPagamentos(r.pagamentos)
    else {
      setPagamentos(null)
      setErro(r.mensagem)
    }
    setCarregando(false)
  }, [localKey, storeId])

  useEffect(() => {
    if (!open) return
    setPagamentos(null)
    setEstado("nao_tentada")
    void carregar()
  }, [open, carregar])

  const reimprimir = async (p: PagamentoTitulo) => {
    if (!localKey || !storeId || imprimindo != null) return
    setImprimindo(p.index)
    setErro(null)
    const r = await buscarSegundaVia({ fetchImpl: fetch, storeId, lojaHeader: ASSISTEC_LOJA_HEADER, localKey, index: p.index })
    if (!r.ok) {
      setErro(r.mensagem)
      setImprimindo(null)
      return
    }
    const ok = await imprimir({
      operacaoId: r.recibo.operacaoId,
      cliente: r.recibo.cliente,
      recebidoEm: r.recibo.recebidoEm,
      formaPagamento: r.recibo.formaPagamento,
      itens: r.recibo.itens,
      totalRecebido: r.recibo.totalRecebido,
      // Saldo total da ÉPOCA não é reconstruível com segurança: a 2ª via traz o saldo de cada título.
      saldoDevedorCliente: null,
      segundaVia: true,
    })
    setEstado(ok ? "aberta" : "falhou")
    setImprimindo(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comprovantes de recebimento</DialogTitle>
          <DialogDescription>{titulo} · reimpressão a partir do pagamento registrado (nenhuma nova baixa).</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          {carregando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando pagamentos…
            </p>
          ) : null}
          {erro ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="min-w-0">{erro}</span>
              <Button size="sm" variant="outline" onClick={() => void carregar()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Tentar de novo
              </Button>
            </div>
          ) : null}
          {pagamentos && pagamentos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum recebimento registrado neste título ainda.
            </p>
          ) : null}
          {pagamentos?.map((p) => (
            <div key={p.index} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium tabular-nums">{brl(p.valor)}</span>
                <span className="text-[11px] text-muted-foreground">
                  {dataHora(p.at)}
                  {p.loteId ? <> · operação <span className="font-mono">{p.loteId.slice(0, 8)}</span></> : null}
                  {p.estornado ? " · estornado" : ""}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1"
                disabled={p.estornado || imprimindo != null}
                title={p.estornado ? "Pagamento estornado — sem comprovante válido" : undefined}
                onClick={() => void reimprimir(p)}
              >
                {imprimindo === p.index ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                Reimprimir
              </Button>
            </div>
          ))}
          <AvisoImpressao estado={estado} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
