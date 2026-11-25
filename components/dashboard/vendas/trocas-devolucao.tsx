"use client"

/**
 * Troca e Devolução — fluxo COMPARTILHADO por PDV Classic, Assistência, Supermercado,
 * Black e Histórico de Vendas (OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001).
 *
 * Autoridade é o SERVIDOR:
 *  - busca nas vendas persistidas (`/api/ops/trocas/buscar`), não no array do navegador;
 *  - quantidade disponível calculada no servidor a partir das devoluções persistidas
 *    (o `qtyReturned` local de um terminal não conta);
 *  - troca/vale/reembolso/estoque numa única transação (`POST /api/ops/trocas`), com a
 *    nova venda criada pelo motor canônico. Nada local é alterado antes do `ok` do
 *    servidor; sem confirmação a operação fica "pendente" para verificar/reenviar com a
 *    MESMA chave (nunca uma segunda devolução nem nova cobrança).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlertTriangle, History, Loader2, Minus, Package, Plus, Printer, RotateCcw, Search, ShoppingCart, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useConfigEmpresa, configPadrao } from "@/lib/config-empresa"
import { useOperationsStore, type SaleRecord, type InventoryItem } from "@/lib/operations-store"
import { normalizeDocDigits } from "@/lib/cpf"
import { buildValeTrocaEscPos } from "@/lib/escpos"
import { sendEscPosViaProxy, downloadEscPosFile, openThermalHtmlPrint, escapeHtml } from "@/lib/thermal-print"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useCaixa } from "@/components/dashboard/caixa/caixa-provider"
import { readSelectedTerminal } from "@/lib/pdv-terminal"
import { planoTroca, valorDevolucaoLinha } from "@/lib/pdv/trocas/troca-disponibilidade"
import { normalizarTermoBusca } from "@/lib/pdv/trocas/troca-busca-termo"
import {
  buscarVendasTroca,
  carregarVendaTroca,
  enviarTroca,
  lerTrocasPendentes,
  novoOperationId,
  registrarTrocaPendente,
  removerTrocaPendente,
  type BuscaTrocaResultado,
  type ResultadoTroca,
  type TrocaPendente,
  type TrocaRequestBody,
  type VendaTrocaView,
} from "@/lib/pdv/trocas/troca-client"

type DevMode = "troca" | "vale_credito" | "reembolso" | "somente_estoque"
type FormaDif = "dinheiro" | "pix" | "debito" | "credito"
type LinhaView = VendaTrocaView["linhas"][number]
type TrocaCartLine = { produtoId: string; inventoryId: string; name: string; unitPrice: number; quantity: number }

const PERIODOS: Array<{ dias: number; label: string }> = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
  { dias: 365, label: "1 ano" },
  { dias: 0, label: "Tudo" },
]

const MODOS: Array<{ id: DevMode; label: string; icon: typeof RotateCcw; ajuda: string }> = [
  { id: "troca", label: "Troca imediata", icon: RotateCcw, ajuda: "Devolve e leva outro produto agora." },
  { id: "vale_credito", label: "Vale-troca", icon: Wallet, ajuda: "Gera crédito no CPF/CNPJ do cliente." },
  { id: "reembolso", label: "Reembolso", icon: RotateCcw, ajuda: "Devolve o dinheiro ao cliente." },
  { id: "somente_estoque", label: "Apenas estoque", icon: Package, ajuda: "Só retorna o produto ao estoque." },
]

const SITUACAO_LABEL: Record<LinhaView["situacaoCadastro"], string | null> = {
  cadastrado: null,
  inativo: "Produto inativo no cadastro — volta ao estoque do mesmo produto.",
  removido: "Produto removido do cadastro — não volta ao estoque (devolução só financeira).",
  avulso: "Item avulso, sem vínculo de estoque — devolução só financeira.",
  servico: "Serviço — não retorna ao estoque físico.",
  aparelho_imei: "Aparelho por IMEI — devolução ainda não integrada.",
}

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  estorno_cartao: "Estorno no cartão",
}

function formatBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function codigoDaLinha(l: LinhaView): string {
  return l.snapshotBarcode || l.snapshotSku || l.codigoNaVenda || l.cadastroAtual?.barcode || l.cadastroAtual?.sku || ""
}

export function TrocasDevolucao({
  initialSaleId,
  onRegistered,
}: {
  /** Pré-carrega uma venda pelo número (ex.: abertura a partir do Histórico de Vendas). */
  initialSaleId?: string
  /** Mantido por compatibilidade com os chamadores; a venda é sempre relida do servidor. */
  initialSale?: SaleRecord
  /** Disparado após o servidor confirmar a operação (ao fechar o comprovante). */
  onRegistered?: () => void
} = {}) {
  const { config } = useConfigEmpresa()
  const { toast } = useToast()
  const { inventory, devolucoes, refreshSalesFromServer, refreshCatalogFromServer } = useOperationsStore()
  const { lojaAtivaId } = useLojaAtiva()
  const { sessaoId } = useCaixa()
  const searchParams = useSearchParams()
  const nomeLoja = (config.empresa.nomeFantasia || "").trim() || configPadrao.empresa.nomeFantasia

  // ── Busca ───────────────────────────────────────────────────────────────────
  const [busca, setBusca] = useState("")
  const [dias, setDias] = useState(90)
  const [resultado, setResultado] = useState<BuscaTrocaResultado | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState("")
  const buscaRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  // ── Venda selecionada (sempre do servidor) ─────────────────────────────────
  const [venda, setVenda] = useState<VendaTrocaView | null>(null)
  const [carregandoVenda, setCarregandoVenda] = useState(false)
  const [qtyByLine, setQtyByLine] = useState<Record<number, number>>({})
  const [mode, setMode] = useState<DevMode>("troca")
  const [motivo, setMotivo] = useState("")
  const [cpf, setCpf] = useState("")
  const [nome, setNome] = useState("")
  const [mostrarHistorico, setMostrarHistorico] = useState(false)

  // ── Troca imediata ──────────────────────────────────────────────────────────
  const [trocaCart, setTrocaCart] = useState<TrocaCartLine[]>([])
  const [trocaSearch, setTrocaSearch] = useState("")
  const [diffPayMethod, setDiffPayMethod] = useState<FormaDif>("dinheiro")
  const [excessHandling, setExcessHandling] = useState<"vale" | "dinheiro" | null>(null)
  const [formaReembolso, setFormaReembolso] = useState<"dinheiro" | "pix" | "estorno_cartao" | null>(null)

  // ── Envio ───────────────────────────────────────────────────────────────────
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState("")
  const [pendentes, setPendentes] = useState<TrocaPendente[]>([])
  const [cupom, setCupom] = useState<ResultadoTroca | null>(null)

  const lojaId = lojaAtivaId ?? ""

  useEffect(() => {
    if (lojaId) setPendentes(lerTrocasPendentes(lojaId))
  }, [lojaId])

  const resetFormulario = useCallback((v: VendaTrocaView | null) => {
    setQtyByLine({})
    setTrocaCart([])
    setTrocaSearch("")
    setMotivo("")
    setExcessHandling(null)
    setFormaReembolso(null)
    setErroEnvio("")
    setCpf("")
    setNome(v?.clienteNome ?? "")
    setMostrarHistorico(Boolean(v && v.linhas.some((l) => l.disponivel === 0 && l.devolvido > 0)))
  }, [])

  const abrirVenda = useCallback(
    async (pedidoId: string) => {
      if (!lojaId) return
      setCarregandoVenda(true)
      try {
        const v = await carregarVendaTroca(lojaId, pedidoId)
        if (!v) {
          toast({ title: "Venda não encontrada", description: `${pedidoId} não existe nesta loja.`, variant: "destructive" })
          return
        }
        setVenda(v)
        resetFormulario(v)
      } catch (e) {
        toast({ title: "Falha ao carregar a venda", description: e instanceof Error ? e.message : String(e), variant: "destructive" })
      } finally {
        setCarregandoVenda(false)
      }
    },
    [lojaId, resetFormulario, toast],
  )

  // Prefill: Histórico (`initialSaleId`) ou `?sale=` em /dashboard/vendas-arquivo-geral.
  useEffect(() => {
    const id = (initialSaleId || searchParams.get("sale") || "").trim()
    if (id && lojaId) void abrirVenda(id)
  }, [initialSaleId, searchParams, lojaId, abrirVenda])

  const executarBusca = useCallback(
    async (skip = 0) => {
      const q = busca.trim()
      if (q.length < 2) {
        setErroBusca("Digite ao menos 2 caracteres ou bipe o código do produto.")
        return
      }
      if (!lojaId) return
      setBuscando(true)
      setErroBusca("")
      try {
        const r = await buscarVendasTroca(lojaId, q, { dias, skip })
        setResultado((prev) => (skip > 0 && prev ? { ...r, vendas: [...prev.vendas, ...r.vendas] } : r))
        if (skip === 0 && r.vendas.length === 1) void abrirVenda(r.vendas[0]!.pedidoId)
        if (skip === 0 && r.vendas.length === 0) {
          setErroBusca(
            dias > 0
              ? `Nenhuma venda nos últimos ${dias} dias com “${q}”. Amplie o período ou busque pelo nome do produto/cliente.`
              : `Nenhuma venda com “${q}”.`,
          )
        }
      } catch (e) {
        setErroBusca(e instanceof Error ? e.message : String(e))
      } finally {
        setBuscando(false)
      }
    },
    [busca, dias, lojaId, abrirVenda],
  )

  const focarCandidato = (idx: number) => {
    const els = listaRef.current?.querySelectorAll<HTMLButtonElement>("[data-candidato]")
    if (!els || els.length === 0) return
    els[Math.max(0, Math.min(els.length - 1, idx))]?.focus()
  }

  // ── Cálculos (mesma regra pura do servidor; o servidor recalcula e é o que vale) ──
  // Mesmo rateio do servidor (já vem pronto em `valorLiquido` por linha).
  const selecionadas = useMemo(
    () => (venda ? venda.linhas.filter((l) => (qtyByLine[l.lineIndex] ?? 0) > 0) : []),
    [venda, qtyByLine],
  )
  const valorDevolvido = useMemo(
    () =>
      Math.round(
        selecionadas.reduce((s, l) => s + valorDevolucaoLinha(l, l.valorLiquido, l.devolvido, qtyByLine[l.lineIndex] ?? 0), 0) * 100,
      ) / 100,
    [selecionadas, qtyByLine],
  )
  const totalNovaCompra = useMemo(() => Math.round(trocaCart.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100, [trocaCart])
  const plano = useMemo(() => planoTroca(valorDevolvido, totalNovaCompra), [valorDevolvido, totalNovaCompra])

  const pendentesDaVenda = useMemo(() => (venda ? pendentes.filter((p) => p.body.pedidoIdOrigem === venda.pedidoId) : []), [pendentes, venda])
  const devolucoesLocaisNaoConfirmadas = useMemo(
    // Inclui a devolução que o terminal dá como sincronizada mas que NÃO existe no servidor
    // (o servidor antigo respondia "ok" a um número DEV-AAAA-NNNN já usado por outra venda).
    () =>
      venda
        ? devolucoes.filter(
            (d) => d.saleId === venda.pedidoId && (d.syncPending === true || !venda.devolucoes.some((s) => s.localId === d.id)),
          )
        : [],
    [devolucoes, venda],
  )

  const trocaSearchResults = useMemo<InventoryItem[]>(() => {
    const raw = trocaSearch.trim()
    if (!raw) return []
    const q = normalizarTermoBusca(raw)
    return inventory
      .filter((i) => {
        if (normalizarTermoBusca(i.name).includes(q)) return true
        return [i.id, i.dbId, i.sku, i.codigo, i.barcode, i.codigoBarras].some((c) => typeof c === "string" && c.trim() === raw)
      })
      .slice(0, 8)
  }, [trocaSearch, inventory])

  const addTrocaItem = (item: InventoryItem) => {
    const isService = item.category === "Servicos"
    const used = trocaCart.find((l) => l.inventoryId === item.id)?.quantity ?? 0
    if (!isService && used + 1 > item.stock) {
      toast({ title: "Estoque insuficiente", description: `${item.name}: disponível ${item.stock}.`, variant: "destructive" })
      return
    }
    setTrocaCart((prev) => {
      const i = prev.findIndex((l) => l.inventoryId === item.id)
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { produtoId: item.dbId || item.id, inventoryId: item.id, name: item.name, unitPrice: item.price, quantity: 1 }]
    })
    setTrocaSearch("")
  }

  const setQty = (l: LinhaView, q: number) => setQtyByLine((prev) => ({ ...prev, [l.lineIndex]: Math.max(0, Math.min(l.disponivel, q)) }))

  // ── Validação (antes de enviar; o servidor valida de novo) ───────────────────
  const docDigits = normalizeDocDigits(cpf)
  const exigeTitular = mode === "vale_credito" || (mode === "troca" && plano.excedente > 0 && excessHandling === "vale")
  const motivoBloqueio = (() => {
    if (!venda) return "Selecione a venda."
    // Uma operação sem resposta pode ter sido gravada: nova chave aqui criaria uma 2ª troca.
    if (pendentesDaVenda.length > 0) return "Verifique a operação enviada sem confirmação antes de registrar outra."
    if (selecionadas.length === 0) return "Selecione a quantidade a devolver."
    if (mode === "troca" && trocaCart.length === 0) return "Adicione o produto que o cliente vai levar."
    if (mode === "troca" && plano.excedente > 0 && !excessHandling) return "Escolha o destino da sobra."
    if (mode === "reembolso" && !formaReembolso) return "Escolha a forma do reembolso."
    if (mode === "somente_estoque" && !selecionadas.some((l) => l.destino === "retorna_estoque"))
      return "Os itens selecionados não têm vínculo com o estoque."
    if (exigeTitular && (!docDigits || !nome.trim())) return "Informe CPF/CNPJ e nome do titular do vale."
    if (docDigits && docDigits.length !== 11 && docDigits.length !== 14) return "CPF/CNPJ deve ter 11 ou 14 dígitos."
    return ""
  })()

  const concluir = useCallback(
    (r: ResultadoTroca, replayed: boolean) => {
      removerTrocaPendente(lojaId, r.operationId)
      setPendentes(lerTrocasPendentes(lojaId))
      setCupom(r)
      void refreshSalesFromServer()
      void refreshCatalogFromServer()
      if (venda) void abrirVenda(venda.pedidoId)
      toast({
        title: replayed ? "Operação já estava registrada" : r.modo === "troca" ? "Troca concluída" : "Devolução registrada",
        description:
          r.modo === "troca"
            ? r.diferenca.valor > 0
              ? `Nova venda ${r.novaVenda?.pedidoId} · diferença ${formatBrl(r.diferenca.valor)} (${FORMA_LABEL[r.diferenca.forma ?? ""] ?? ""}).`
              : r.excedente.valor > 0
                ? r.excedente.destino === "dinheiro"
                  ? `Devolva ${formatBrl(r.excedente.valor)} em dinheiro ao cliente.`
                  : `Vale de ${formatBrl(r.excedente.valor)} gerado.`
                : `Nova venda ${r.novaVenda?.pedidoId} · sem diferença.`
            : r.valeEmitido > 0
              ? `Vale de ${formatBrl(r.valeEmitido)} para ${r.clienteNome}.`
              : r.reembolso
                ? `Reembolso ${formatBrl(r.reembolso.valor)} (${FORMA_LABEL[r.reembolso.forma]}).`
                : "Itens retornaram ao estoque.",
      })
    },
    [lojaId, refreshSalesFromServer, refreshCatalogFromServer, venda, abrirVenda, toast],
  )

  const enviar = useCallback(
    async (body: TrocaRequestBody) => {
      if (!lojaId || enviando) return
      setEnviando(true)
      setErroEnvio("")
      registrarTrocaPendente(lojaId, body)
      setPendentes(lerTrocasPendentes(lojaId))
      try {
        const r = await enviarTroca(lojaId, body)
        if (r.status === "confirmada") {
          concluir(r.resultado, r.replayed)
          return
        }
        if (r.status === "recusada") {
          // Recusa conclusiva: nada foi gravado — não há o que reenviar com esta chave.
          removerTrocaPendente(lojaId, body.operationId)
          setPendentes(lerTrocasPendentes(lojaId))
          setErroEnvio(r.message)
          if (r.code === "DEVOLUCAO_ACIMA_DO_DISPONIVEL" && venda) void abrirVenda(venda.pedidoId)
          return
        }
        setErroEnvio(`${r.message} A operação pode ter sido gravada: use “Verificar / reenviar” — nada será cobrado ou devolvido duas vezes.`)
      } finally {
        setEnviando(false)
      }
    },
    [lojaId, enviando, concluir, venda, abrirVenda],
  )

  const finalizar = () => {
    if (!venda || motivoBloqueio) return
    const body: TrocaRequestBody = {
      operationId: novoOperationId(),
      pedidoIdOrigem: venda.pedidoId,
      modo: mode,
      linhas: selecionadas.map((l) => ({ lineIndex: l.lineIndex, quantidade: qtyByLine[l.lineIndex] ?? 0 })),
      clienteDoc: docDigits || undefined,
      clienteNome: nome.trim() || undefined,
      motivo: motivo.trim() || undefined,
      sessaoId: sessaoId ?? null,
      terminalId: lojaId ? readSelectedTerminal(lojaId)?.id ?? null : null,
      ...(mode === "troca"
        ? {
            novosItens: trocaCart.map((l) => ({ produtoId: l.produtoId, quantidade: l.quantity })),
            formaDiferenca: diffPayMethod,
            ...(plano.excedente > 0 && excessHandling ? { destinoExcedente: excessHandling } : {}),
          }
        : {}),
      ...(mode === "reembolso" && formaReembolso ? { formaReembolso } : {}),
    }
    void enviar(body)
  }

  const descartarPendente = (operationId: string) => {
    removerTrocaPendente(lojaId, operationId)
    setPendentes(lerTrocasPendentes(lojaId))
    if (venda) void abrirVenda(venda.pedidoId)
  }

  const imprimirVale = async (r: ResultadoTroca) => {
    if (r.valeEmitido <= 0) return
    const bytes = buildValeTrocaEscPos({
      nomeFantasia: nomeLoja,
      nomeCliente: r.clienteNome,
      cpfCliente: r.clienteDoc,
      valorCredito: r.valeEmitido,
      dataLabel: dataHora(r.at),
      devolucaoId: r.operationId,
    })
    const res = await sendEscPosViaProxy(bytes)
    if (res.ok) {
      toast({ title: "Enviado à impressora", description: "Comprovante do vale." })
      return
    }
    toast({ title: "Impressora indisponível", description: res.error, variant: "destructive" })
    downloadEscPosFile(bytes, `vale-${r.operationId}.bin`)
  }

  const fecharCupom = () => {
    setCupom(null)
    onRegistered?.()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Busca */}
      <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 items-center gap-2">
          <RotateCcw className="h-5 w-5 shrink-0 text-primary" />
          <h2 className="text-base font-bold text-foreground">Troca e Devolução</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Bipe o <strong>código de barras</strong> ou digite o <strong>nome do produto</strong>, o <strong>cupom</strong>, o{" "}
          <strong>nome</strong> ou o <strong>CPF/CNPJ do cliente</strong>. A busca consulta todas as vendas salvas da loja.
        </p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={buscaRef}
              autoFocus={!initialSaleId}
              aria-label="Buscar venda por produto, código, cupom ou cliente"
              placeholder="Código de barras · nome do produto · VDA-… · cliente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void executarBusca(0)
                } else if (e.key === "Escape" && busca) {
                  e.preventDefault()
                  e.stopPropagation()
                  setBusca("")
                  setResultado(null)
                  setErroBusca("")
                } else if (e.key === "ArrowDown") {
                  e.preventDefault()
                  focarCandidato(0)
                }
              }}
              className="h-11 pl-9 font-mono text-sm"
            />
          </div>
          <select
            aria-label="Período da busca"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            {PERIODOS.map((p) => (
              <option key={p.dias} value={p.dias}>
                {p.label}
              </option>
            ))}
          </select>
          <Button type="button" className="h-11 px-5 font-semibold" onClick={() => void executarBusca(0)} disabled={buscando}>
            {buscando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar
          </Button>
        </div>
        {erroBusca && <p className="text-xs text-destructive">{erroBusca}</p>}

        {pendentes.some((p) => p.body.pedidoIdOrigem !== venda?.pedidoId) && (
          <div className="min-w-0 space-y-1 rounded-lg border border-primary/40 bg-primary/5 p-2.5 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-primary" /> Operações enviadas sem confirmação do servidor
            </p>
            {pendentes
              .filter((p) => p.body.pedidoIdOrigem !== venda?.pedidoId)
              .map((p) => (
                <button
                  key={p.body.operationId}
                  type="button"
                  className="block font-mono text-primary underline-offset-2 hover:underline"
                  onClick={() => void abrirVenda(p.body.pedidoIdOrigem)}
                >
                  {p.body.pedidoIdOrigem} · {dataHora(p.enviadaEm)} — abrir para verificar
                </button>
              ))}
          </div>
        )}

        {resultado && resultado.vendas.length > 1 && (
          <div ref={listaRef} className="min-w-0 space-y-1.5" role="listbox" aria-label="Vendas encontradas">
            <p className="text-xs font-semibold text-muted-foreground">{resultado.vendas.length} venda(s) encontrada(s) — escolha a de origem:</p>
            {resultado.vendas.map((v, idx) => {
              const linhas = v.linhas.filter((l) => l.corresponde)
              const mostrar = linhas.length > 0 ? linhas : v.linhas.slice(0, 2)
              return (
                <button
                  key={v.pedidoId}
                  type="button"
                  data-candidato
                  onClick={() => void abrirVenda(v.pedidoId)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault()
                      focarCandidato(idx + 1)
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault()
                      if (idx === 0) buscaRef.current?.focus()
                      else focarCandidato(idx - 1)
                    }
                  }}
                  className={`w-full min-w-0 rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    venda?.pedidoId === v.pedidoId ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                    <span className="font-mono text-sm font-bold text-primary">{v.pedidoId}</span>
                    <span className="text-xs text-muted-foreground">{dataHora(v.at)}</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatBrl(v.total)}</span>
                    {v.status !== "concluida" && <span className="rounded bg-muted px-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{v.status.replace("_", " ")}</span>}
                  </div>
                  {mostrar.map((l) => (
                    <p key={l.lineIndex} className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {l.name}
                      {codigoDaLinha(l) ? ` · ${codigoDaLinha(l)}` : ""} · vendido {l.quantity} · devolvido {l.devolvido} · disponível{" "}
                      <span className="font-semibold text-foreground">{l.disponivel}</span>
                    </p>
                  ))}
                  {v.clienteNome && <p className="truncate text-[11px] text-muted-foreground">Cliente: {v.clienteNome}</p>}
                </button>
              )
            })}
            {resultado.hasMore && (
              <Button type="button" variant="outline" size="sm" className="w-full" disabled={buscando} onClick={() => void executarBusca(resultado.vendas.length)}>
                Carregar mais vendas
              </Button>
            )}
          </div>
        )}
      </section>

      {carregandoVenda && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a venda do servidor…
        </div>
      )}

      {venda && !carregandoVenda && (
        <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
          {/* Cabeçalho */}
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Venda de origem</p>
              <p className="font-mono text-base font-bold text-primary">{venda.pedidoId}</p>
              <p className="text-xs text-muted-foreground">
                {dataHora(venda.at)} · {venda.clienteNome || "Cliente não identificado"}
                {venda.status !== "concluida" ? ` · ${venda.status.replace("_", " ")}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
              <p className="text-base font-extrabold tabular-nums text-foreground">{formatBrl(venda.total)}</p>
            </div>
          </div>

          {/* Operações enviadas sem confirmação (mesma chave) */}
          {pendentesDaVenda.map((p) => (
            <div key={p.body.operationId} className="min-w-0 space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-primary" /> Operação enviada em {dataHora(p.enviadaEm)} sem confirmação do servidor
              </p>
              <p className="text-muted-foreground">
                Verifique antes de refazer: o reenvio usa a mesma chave e nunca duplica devolução, venda ou cobrança.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={enviando} onClick={() => void enviar(p.body)}>
                  {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Verificar / reenviar
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={enviando} onClick={() => descartarPendente(p.body.operationId)}>
                  Descartar aviso
                </Button>
              </div>
            </div>
          ))}

          {devolucoesLocaisNaoConfirmadas.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-foreground">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Este terminal tem devolução que não existe no servidor
              </p>
              <p className="mt-1 text-muted-foreground">
                {devolucoesLocaisNaoConfirmadas.map((d) => d.id).join(", ")} — não conta como devolvida. Se ela chegar ao servidor
                depois, será recusada caso a quantidade já tenha sido devolvida aqui.
              </p>
            </div>
          )}

          {/* Itens */}
          <div className="min-w-0 space-y-2">
            <h3 className="text-xs font-bold text-foreground">Quantidade a devolver</h3>
            {venda.linhas.map((l) => {
              const q = qtyByLine[l.lineIndex] ?? 0
              const aviso = SITUACAO_LABEL[l.situacaoCadastro]
              const codigo = codigoDaLinha(l)
              return (
                <div key={l.lineIndex} className="min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {codigo ? `${codigo} · ` : ""}
                        {formatBrl(l.valorLiquido)} · vendido {l.quantity} · devolvido {l.devolvido} · disponível{" "}
                        <span className="font-semibold text-foreground">{l.disponivel}</span>
                        {l.accessoryLabel ? ` · ${l.accessoryLabel}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 self-start rounded-md border border-border bg-background p-0.5 sm:self-center">
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Diminuir ${l.name}`} disabled={q <= 0} onClick={() => setQty(l, q - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-bold tabular-nums text-foreground" aria-live="polite">
                        {q}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label={`Aumentar ${l.name}`}
                        disabled={q >= l.disponivel || l.destino === "aparelho_imei"}
                        onClick={() => setQty(l, q + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {l.disponivel === 0 && l.devolvido > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Já devolvido em {l.devolucoes.map((d) => d.localId).join(", ")}.{" "}
                      <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setMostrarHistorico(true)}>
                        Ver histórico
                      </button>
                    </p>
                  )}
                  {aviso && <p className="mt-1 text-[11px] text-muted-foreground">{aviso}</p>}
                </div>
              )
            })}
            {venda.naoAlocado.length > 0 && (
              <p className="text-[11px] text-destructive">
                Há devolução antiga que não corresponde a nenhum item desta venda ({venda.naoAlocado.map((n) => `${n.localId}: ${n.quantidade}× ${n.nome}`).join("; ")}). Revise com o gerente.
              </p>
            )}
          </div>

          {/* Histórico de trocas/devoluções da venda */}
          {venda.devolucoes.length > 0 && (
            <div className="min-w-0 rounded-lg border border-border">
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground" onClick={() => setMostrarHistorico((s) => !s)} aria-expanded={mostrarHistorico}>
                <History className="h-4 w-4 text-primary" /> Trocas e devoluções desta venda ({venda.devolucoes.length})
              </button>
              {mostrarHistorico && <HistoricoDevolucoes devolucoes={venda.devolucoes} />}
            </div>
          )}

          {/* Modo */}
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de operação">
            {MODOS.map((m) => {
              const Icon = m.icon
              const ativo = mode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  onClick={() => setMode(m.id)}
                  className={`min-w-0 rounded-lg border p-2 text-left transition-colors ${ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:bg-muted/50"}`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${ativo ? "text-primary" : "text-muted-foreground"}`} /> {m.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-tight text-muted-foreground">{m.ajuda}</span>
                </button>
              )
            })}
          </div>

          {/* Nova compra (troca imediata) */}
          {mode === "troca" && (
            <div className="min-w-0 space-y-2 border-t border-border pt-3">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <ShoppingCart className="h-3.5 w-3.5 text-primary" /> Produto que o cliente leva
              </h3>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar novo produto"
                  value={trocaSearch}
                  onChange={(e) => setTrocaSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && trocaSearchResults[0]) {
                      e.preventDefault()
                      addTrocaItem(trocaSearchResults[0])
                    } else if (e.key === "Escape" && trocaSearch) {
                      e.preventDefault()
                      e.stopPropagation()
                      setTrocaSearch("")
                    }
                  }}
                  placeholder="Bipe ou digite o novo produto"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              {trocaSearchResults.length > 0 && (
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-muted/20">
                  {trocaSearchResults.map((p) => {
                    const isService = p.category === "Servicos"
                    const out = !isService && p.stock <= 0
                    return (
                      <button key={p.id} type="button" disabled={out} onClick={() => addTrocaItem(p)} className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-primary/5 disabled:opacity-40">
                        <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{p.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{isService ? "Serviço" : out ? "Sem estoque" : `Estoque ${p.stock}`}</span>
                        <span className="shrink-0 font-bold tabular-nums text-primary">{formatBrl(p.price)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {trocaCart.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Nenhum produto adicionado.</p>
              ) : (
                <div className="space-y-1.5">
                  {trocaCart.map((l) => (
                    <div key={l.inventoryId} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{l.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatBrl(l.unitPrice)} cada</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Diminuir ${l.name}`} onClick={() => setTrocaCart((prev) => prev.map((x) => (x.inventoryId === l.inventoryId ? { ...x, quantity: x.quantity - 1 } : x)).filter((x) => x.quantity > 0))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-5 text-center font-bold tabular-nums text-foreground">{l.quantity}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label={`Aumentar ${l.name}`}
                          onClick={() => {
                            const item = inventory.find((i) => i.id === l.inventoryId)
                            if (item) addTrocaItem(item)
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="w-20 shrink-0 text-right font-bold tabular-nums text-foreground">{formatBrl(l.unitPrice * l.quantity)}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Remover ${l.name}`} onClick={() => setTrocaCart((prev) => prev.filter((x) => x.inventoryId !== l.inventoryId))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {plano.diferenca > 0 && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Forma de pagamento da diferença</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {(["dinheiro", "pix", "debito", "credito"] as const).map((m) => (
                      <Button key={m} type="button" size="sm" variant={diffPayMethod === m ? "default" : "outline"} onClick={() => setDiffPayMethod(m)} className="h-8 px-1 text-xs">
                        {FORMA_LABEL[m]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {plano.excedente > 0 && (
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sobra de {formatBrl(plano.excedente)} a favor do cliente</Label>
                  <div className="grid grid-cols-2 gap-1">
                    <Button type="button" size="sm" variant={excessHandling === "vale" ? "default" : "outline"} onClick={() => setExcessHandling("vale")} className="h-8 text-xs">
                      Gerar vale
                    </Button>
                    <Button type="button" size="sm" variant={excessHandling === "dinheiro" ? "default" : "outline"} onClick={() => setExcessHandling("dinheiro")} className="h-8 text-xs">
                      Devolver em dinheiro
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "reembolso" && (
            <div className="space-y-1 border-t border-border pt-3">
              <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Forma do reembolso</Label>
              <div className="grid grid-cols-3 gap-1">
                {(["dinheiro", "pix", "estorno_cartao"] as const).map((f) => (
                  <Button key={f} type="button" size="sm" variant={formaReembolso === f ? "default" : "outline"} onClick={() => setFormaReembolso(f)} className="h-8 px-1 text-xs">
                    {FORMA_LABEL[f]}
                  </Button>
                ))}
              </div>
              {formaReembolso === "estorno_cartao" && (
                <p className="text-[11px] text-muted-foreground">O estorno na maquininha/adquirente é feito fora do sistema; aqui ele fica registrado como pendente de execução manual.</p>
              )}
            </div>
          )}

          {/* Cliente e motivo */}
          <div className="grid min-w-0 grid-cols-1 gap-2 border-t border-border pt-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground">CPF/CNPJ {exigeTitular ? "(obrigatório para vale)" : "(opcional)"}</Label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="Somente números" className="h-9 text-sm" />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground">Nome {exigeTitular ? "(obrigatório para vale)" : "(opcional)"}</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" className="h-9 text-sm" />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-[10px] font-semibold text-muted-foreground">Motivo</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: não serviu, defeito" className="h-9 text-sm" />
            </div>
          </div>

          {/* Rodapé de confirmação */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 min-w-0 space-y-2 rounded-b-xl border-t border-border bg-card px-4 py-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Devolvido</p>
                <p className="text-sm font-extrabold tabular-nums text-foreground">{formatBrl(mode === "somente_estoque" ? 0 : valorDevolvido)}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{mode === "troca" ? "Nova compra" : "Crédito/reembolso"}</p>
                <p className="text-sm font-extrabold tabular-nums text-foreground">
                  {formatBrl(mode === "troca" ? totalNovaCompra : mode === "somente_estoque" ? 0 : valorDevolvido)}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {mode !== "troca" ? "—" : plano.diferenca > 0 ? "Cliente paga" : plano.excedente > 0 ? "Sobra" : "Diferença"}
                </p>
                <p className={`text-sm font-extrabold tabular-nums ${mode === "troca" && plano.diferenca > 0 ? "text-primary" : "text-foreground"}`}>
                  {mode === "troca" ? formatBrl(plano.diferenca > 0 ? plano.diferenca : plano.excedente) : "—"}
                </p>
              </div>
            </div>
            {erroEnvio && (
              <p role="alert" className="text-xs text-destructive">
                {erroEnvio}
              </p>
            )}
            <Button type="button" className="h-11 w-full font-bold" disabled={Boolean(motivoBloqueio) || enviando} onClick={finalizar}>
              {enviando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando no servidor…
                </>
              ) : mode === "troca" ? (
                "Finalizar troca"
              ) : (
                "Confirmar devolução"
              )}
            </Button>
            {motivoBloqueio && <p className="text-center text-[11px] text-muted-foreground">{motivoBloqueio}</p>}
          </div>
        </section>
      )}

      {cupom && <CupomTroca data={cupom} nomeLoja={nomeLoja} onClose={fecharCupom} onImprimirVale={() => void imprimirVale(cupom)} />}
    </div>
  )
}

function HistoricoDevolucoes({ devolucoes }: { devolucoes: VendaTrocaView["devolucoes"] }) {
  const TIPO: Record<string, string> = { troca: "Troca", vale_credito: "Vale-troca", devolucao: "Reembolso", somente_estoque: "Apenas estoque" }
  return (
    <ul className="divide-y divide-border border-t border-border text-[11px]">
      {devolucoes.map((d) => (
        <li key={d.id} className="space-y-0.5 px-3 py-2">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold text-foreground">
            <span>{TIPO[d.tipo] ?? d.tipo}</span>
            <span className="font-mono text-muted-foreground">{d.localId}</span>
            <span className="text-muted-foreground">{dataHora(d.at)}</span>
            {d.status === "legado" && <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">registro antigo</span>}
          </p>
          <p className="text-muted-foreground">{d.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")} · {formatBrl(d.valorTotal)}</p>
          {d.novaVenda && (
            <p className="text-muted-foreground">
              Venda substituta <span className="font-mono text-foreground">{d.novaVenda.pedidoId}</span> ({formatBrl(d.novaVenda.total)})
              {d.diferenca && d.diferenca.valor > 0 ? ` · diferença ${formatBrl(d.diferenca.valor)} em ${FORMA_LABEL[d.diferenca.forma ?? ""] ?? d.diferenca.forma}` : ""}
            </p>
          )}
          {d.reembolso && <p className="text-muted-foreground">Reembolso {formatBrl(d.reembolso.valor)} · {FORMA_LABEL[d.reembolso.forma] ?? d.reembolso.forma}</p>}
          {(d.valeEmitido ?? 0) > 0 && <p className="text-muted-foreground">Vale emitido {formatBrl(d.valeEmitido ?? 0)}</p>}
          {(d.operador || d.motivo) && (
            <p className="text-muted-foreground">
              {d.operador ? `Operador: ${d.operador}` : ""}
              {d.operador && d.motivo ? " · " : ""}
              {d.motivo ? `Motivo: ${d.motivo}` : ""}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

// ─── Comprovante (somente após confirmação do servidor) ─────────────────────
function CupomTroca({ data, nomeLoja, onClose, onImprimirVale }: { data: ResultadoTroca; nomeLoja: string; onClose: () => void; onImprimirVale: () => void }) {
  const tipoLabel =
    data.modo === "troca" ? "TROCA IMEDIATA" : data.modo === "vale_credito" ? "VALE-TROCA" : data.modo === "somente_estoque" ? "DEVOLUÇÃO AO ESTOQUE" : "DEVOLUÇÃO / REEMBOLSO"
  const quando = dataHora(data.at)
  const imprimir = () => {
    const esc = escapeHtml
    const tabela = (rows: Array<{ nome: string; quantidade: number; valor: number }>) =>
      rows.map((i) => `<tr><td>${esc(i.nome)}</td><td style="text-align:right">${i.quantidade}</td><td style="text-align:right">${formatBrl(i.valor)}</td></tr>`).join("")
    openThermalHtmlPrint(
      `
      <div style="text-align:center;font-weight:700">${esc(nomeLoja)}</div>
      <div style="text-align:center;font-size:11px;margin:2px 0">${esc(tipoLabel)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p style="margin:2px 0;font-size:11px">Data: ${esc(quando)}</p>
      <p style="margin:2px 0;font-size:11px">Operador: ${esc(data.operador || "—")}</p>
      <p style="margin:2px 0;font-size:11px">Venda origem: ${esc(data.vendaOrigem)}</p>
      ${data.novaVenda ? `<p style="margin:2px 0;font-size:11px">Nova venda: ${esc(data.novaVenda.pedidoId)}</p>` : ""}
      ${data.clienteNome ? `<p style="margin:2px 0;font-size:11px">Cliente: ${esc(data.clienteNome)}</p>` : ""}
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p style="font-weight:700;margin:4px 0">Itens devolvidos</p>
      <table style="width:100%;font-size:11px;border-collapse:collapse">${tabela(data.itensDevolvidos.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valor: i.valor })))}</table>
      <p style="text-align:right;margin:4px 0">Total devolvido: <strong>${formatBrl(data.valorDevolvido)}</strong></p>
      ${
        data.itensNovos.length > 0
          ? `<div style="border-top:1px dashed #000;margin:6px 0"></div><p style="font-weight:700;margin:4px 0">Itens novos</p>
             <table style="width:100%;font-size:11px;border-collapse:collapse">${tabela(data.itensNovos.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valor: i.valorTotal })))}</table>
             <p style="text-align:right;margin:4px 0">Total nova compra: <strong>${formatBrl(data.totalNovaCompra)}</strong></p>`
          : ""
      }
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      ${data.creditoAplicado > 0 ? `<p style="margin:2px 0">Crédito da troca utilizado: ${formatBrl(data.creditoAplicado)}</p>` : ""}
      ${data.diferenca.valor > 0 ? `<p style="margin:2px 0">Diferença paga: ${formatBrl(data.diferenca.valor)} (${esc(FORMA_LABEL[data.diferenca.forma ?? ""] ?? "—")})</p>` : ""}
      ${data.excedente.valor > 0 && data.excedente.destino === "dinheiro" ? `<p style="margin:2px 0">Devolvido em dinheiro: ${formatBrl(data.excedente.valor)}</p>` : ""}
      ${data.reembolso ? `<p style="margin:2px 0">Reembolso: ${formatBrl(data.reembolso.valor)} (${esc(FORMA_LABEL[data.reembolso.forma])})</p>` : ""}
      ${data.valeEmitido > 0 ? `<p style="margin:2px 0"><strong>Vale em haver: ${formatBrl(data.valeEmitido)}</strong></p>` : ""}
      ${data.motivo ? `<p style="margin:6px 0 2px 0;font-size:11px">Motivo: ${esc(data.motivo)}</p>` : ""}
      <p style="margin:6px 0 0 0;font-size:10px">Operação: ${esc(data.operationId)}</p>`,
      tipoLabel,
    )
  }
  const Linha = ({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) => (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={forte ? "font-bold text-foreground" : "font-medium text-foreground"}>{valor}</span>
    </div>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-primary" /> Comprovante — {tipoLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto px-5 py-4 text-sm">
          <p className="text-center text-xs text-muted-foreground">
            {nomeLoja} · {quando}
          </p>
          <Linha rotulo="Venda origem" valor={data.vendaOrigem} />
          {data.novaVenda && <Linha rotulo="Nova venda" valor={data.novaVenda.pedidoId} />}
          {data.clienteNome && <Linha rotulo="Cliente" valor={data.clienteNome} />}
          <Separator />
          {data.itensDevolvidos.map((i) => (
            <Linha key={`d${i.lineIndex}`} rotulo={`↩ ${i.quantidade}× ${i.nome}`} valor={formatBrl(i.valor)} />
          ))}
          {data.itensNovos.map((i) => (
            <Linha key={`n${i.produtoId}`} rotulo={`＋ ${i.quantidade}× ${i.nome}`} valor={formatBrl(i.valorTotal)} />
          ))}
          <Separator />
          {data.creditoAplicado > 0 && <Linha rotulo="Crédito da troca utilizado" valor={formatBrl(data.creditoAplicado)} />}
          {data.diferenca.valor > 0 && <Linha rotulo={`Diferença paga (${FORMA_LABEL[data.diferenca.forma ?? ""] ?? "—"})`} valor={formatBrl(data.diferenca.valor)} forte />}
          {data.excedente.valor > 0 && data.excedente.destino === "dinheiro" && <Linha rotulo="Devolver em dinheiro" valor={formatBrl(data.excedente.valor)} forte />}
          {data.reembolso && <Linha rotulo={`Reembolso (${FORMA_LABEL[data.reembolso.forma]})`} valor={formatBrl(data.reembolso.valor)} forte />}
          {data.valeEmitido > 0 && <Linha rotulo="Vale em haver" valor={formatBrl(data.valeEmitido)} forte />}
          {data.motivo && <p className="text-xs text-muted-foreground">Motivo: {data.motivo}</p>}
          <p className="text-[10px] text-muted-foreground">Operação {data.operationId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <Button type="button" size="sm" onClick={imprimir}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
          {data.valeEmitido > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={onImprimirVale}>
              Imprimir vale 80mm
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
