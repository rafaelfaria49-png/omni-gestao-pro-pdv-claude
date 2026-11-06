"use client"

import { kgReturnBlocked as saleKgReturnBlocked } from "@/lib/vendas/manual-kg-contract"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Search, Package, Wallet, RotateCcw, Printer, Plus, Minus, X, ShoppingCart } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { useConfigEmpresa, configPadrao } from "@/lib/config-empresa"
import { useOperationsStore, nextDevolucaoId, classificarRespostaDevolucao, type SaleRecord, type InventoryItem } from "@/lib/operations-store"
import { normalizeDocDigits } from "@/lib/cpf"
import { buildValeTrocaEscPos } from "@/lib/escpos"
import { sendEscPosViaProxy, downloadEscPosFile, openThermalHtmlPrint, escapeHtml } from "@/lib/thermal-print"
import { appendAuditLog } from "@/lib/audit-log"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useCaixa } from "@/components/dashboard/caixa/caixa-provider"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { listarPendenciasDevolucao, type PendenciaDevolucao } from "@/lib/pdv/devolucao/pendencias"
import {
  PENDING_SALE_DESCRIPTION,
  PENDING_SALE_TITLE,
  findUnresolvedSaleLines,
  unresolvedSaleLinesDescription,
} from "@/lib/pdv-finalize-integrity"

/** Modos de operação expostos na UI. `troca`/`vale_credito` geram crédito local; `devolucao`/`somente_estoque` não. */
type DevMode = "devolucao" | "troca" | "vale_credito" | "somente_estoque"

/**
 * PDV-F8-TROCA-IMEDIATA-INTEGRACAO-SEGURA-001 — política: reembolso em dinheiro
 * não tem fluxo financeiro aprovado (G-H01..03 / CASH_HANDOVER_RECOVERY). O caminho
 * fica BLOQUEADO na tela e no servidor; sobra de troca vira vale, nunca dinheiro.
 */
export const REEMBOLSO_DINHEIRO_BLOQUEADO = true
export const REEMBOLSO_BLOQUEADO_TEXTO =
  "Reembolso em dinheiro bloqueado: ainda não há fluxo financeiro aprovado. Use Vale-Troca ou Troca Imediata."

type ServerDevolucaoOk = {
  ok: true
  idempotente: boolean
  devolucaoId: string
  localId: string
  valorTotal: number
  creditoEmitido: number
  saldoCreditoCliente: number
  operador: string
  itens: Array<{ inventoryId: string; produtoId?: string; nome: string; quantidade: number; valorUnitario: number; valorTotal: number }>
}

/** Linha de venda como a tela usa: `produtoId` = identidade histórica; bloqueio = sem política. */
type LinhaVendaF8 = SaleRecord["lines"][number] & { bloqueioDevolucao?: string }

/**
 * Funde linhas repetidas do mesmo item (o Clássico cria uma linha por bipe): a tela e o
 * teto trabalham por item, nunca contam o mesmo produto duas vezes.
 */
export function fundirLinhasPorItem(lines: LinhaVendaF8[]): LinhaVendaF8[] {
  const out: LinhaVendaF8[] = []
  const idx = new Map<string, number>()
  for (const l of lines) {
    const i = idx.get(l.inventoryId)
    if (i === undefined) {
      idx.set(l.inventoryId, out.length)
      out.push({ ...l })
      continue
    }
    const cur = out[i]!
    cur.quantity += l.quantity
    cur.lineTotal = Math.round((cur.lineTotal + l.lineTotal) * 100) / 100
    cur.qtyReturned = (cur.qtyReturned ?? 0) + (l.qtyReturned ?? 0)
    cur.produtoId = cur.produtoId || l.produtoId
    cur.bloqueioDevolucao = cur.bloqueioDevolucao || l.bloqueioDevolucao
  }
  return out
}

/** Motivo de bloqueio por política da linha (servidor informa; offline: linha virtual). */
export function bloqueioLinhaDevolucao(l: LinhaVendaF8): string | null {
  if (l.bloqueioDevolucao) return l.bloqueioDevolucao
  if (isVirtualSaleLine(l.inventoryId)) {
    return "Não devolvível: serviço/item avulso não gera vale nem volta ao estoque (sem política aprovada)."
  }
  return null
}

/** O que o espelho local precisa para registrar uma devolução já gravada no servidor. */
type PendingMirror = {
  saleId: string
  tipo: "troca" | "vale_credito" | "somente_estoque"
  lines: { inventoryId: string; quantity: number }[]
  cpf: string
  nome: string
  payload: Record<string, unknown>
  motivo: string
}

type ServerDevolucaoResult =
  | { kind: "ok"; data: ServerDevolucaoOk }
  | { kind: "rejected"; status: number; message: string; code?: string }
  /** Sem resposta: o servidor PODE ter gravado — o reenvio usa o MESMO localId. */
  | { kind: "network"; message: string }

type TentativaIncerta = { fp: string; localId: string; body: Record<string, unknown>; mirror: PendingMirror }

/**
 * Tentativa sem resposta sobrevive a fechar/reabrir o F8 e a recarregar a aba
 * (sessionStorage por loja): reabrir e mudar o formulário não pode gerar um 2º localId
 * para a mesma devolução física. Falha de storage não bloqueia (vale o ref em memória).
 */
const tentativaKey = (lojaId: string) => `omnigestao:devolucao-incerta:${lojaId}`
function lerTentativaIncerta(lojaId: string | null | undefined): TentativaIncerta | null {
  if (!lojaId) return null
  try {
    const raw = sessionStorage.getItem(tentativaKey(lojaId))
    const v = raw ? (JSON.parse(raw) as TentativaIncerta) : null
    return v && typeof v.localId === "string" && typeof v.fp === "string" ? v : null
  } catch {
    return null
  }
}
function gravarTentativaIncerta(lojaId: string | null | undefined, v: TentativaIncerta | null) {
  if (!lojaId) return
  try {
    if (v) sessionStorage.setItem(tentativaKey(lojaId), JSON.stringify(v))
    else sessionStorage.removeItem(tentativaKey(lojaId))
  } catch {
    /* storage indisponível: segue só em memória */
  }
}

async function postDevolucaoServidor(lojaId: string, body: Record<string, unknown>): Promise<ServerDevolucaoResult> {
  let res: Response
  try {
    res = await fetch("/api/ops/devolucao", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaId },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { kind: "network", message: e instanceof Error ? e.message : String(e) }
  }
  const json = (await res.json().catch(() => null)) as (Partial<ServerDevolucaoOk> & { error?: string; code?: string }) | null
  if (res.ok && json && json.ok === true && typeof json.localId === "string") {
    return { kind: "ok", data: json as ServerDevolucaoOk }
  }
  if (res.status >= 500 || !json) {
    return { kind: "network", message: json?.error || `HTTP ${res.status}` }
  }
  return { kind: "rejected", status: res.status, message: json.error || `HTTP ${res.status}`, code: json.code }
}

export function TrocasDevolucao({
  initialSaleId,
  initialSale,
  onRegistered,
}: {
  /** Pré-carrega uma venda pelo ID (ex.: abertura a partir do Histórico de Vendas). */
  initialSaleId?: string
  /** Snapshot da venda (ex.: de `/api/ops/vendas-list`) quando ainda não está no localStorage. */
  initialSale?: SaleRecord
  /** Disparado após o servidor confirmar a devolução — usado para refresh externo (histórico). */
  onRegistered?: () => void
} = {}) {
  const { config } = useConfigEmpresa()
  const { toast } = useToast()
  const {
    sales,
    devolucoes,
    registrarDevolucao,
    inventory,
    finalizeSaleTransaction,
    caixa,
    retomarDevolucaoPendente,
    registrarEncaminhamentoDevolucao,
  } = useOperationsStore()
  const { lojaAtivaId } = useLojaAtiva()
  const { sessaoId } = useCaixa()
  const searchParams = useSearchParams()

  const [busca, setBusca] = useState("")
  const [showSearch, setShowSearch] = useState(!initialSaleId)
  const [sale, setSale] = useState<SaleRecord | null>(null)
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<DevMode>("vale_credito")
  const [motivo, setMotivo] = useState("")
  const [cpfExtra, setCpfExtra] = useState("")
  const [nomeExtra, setNomeExtra] = useState("")
  const [lastDevolucao, setLastDevolucao] = useState<{
    id: string
    credit: number
    nome: string
    cpf: string
  } | null>(null)
  const [candidateSales, setCandidateSales] = useState<SaleRecord[] | null>(null)
  const [candidateLabel, setCandidateLabel] = useState("")
  /** "servidor" = venda e saldo devolvível lidos do banco da loja; "local" = só deste navegador (offline). */
  const [saleSource, setSaleSource] = useState<"servidor" | "local">("local")
  const [buscando, setBuscando] = useState(false)
  /** Uma gravação por vez: duplo clique/Enter não abre duas devoluções. */
  const [enviando, setEnviando] = useState(false)
  const enviandoRef = useRef(false)
  /** Mesma intenção ⇒ mesmo localId: reenvio após resposta perdida é replay, não 2ª devolução. */
  const pendingDevRef = useRef<TentativaIncerta | null>(null)
  const definirTentativa = (v: TentativaIncerta | null) => {
    pendingDevRef.current = v
    gravarTentativaIncerta(lojaAtivaId, v)
  }
  useEffect(() => {
    pendingDevRef.current = lerTentativaIncerta(lojaAtivaId)
  }, [lojaAtivaId])
  /**
   * Pendências do terminal (fila, venda de origem ausente, bloqueio persistente, recusas,
   * encaminhadas) — PDV-F8-FINALIZACAO-COMPLETA-001. Só leitura + ações supervisionadas.
   */
  const pendencias = useMemo(() => listarPendenciasDevolucao(devolucoes), [devolucoes])
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [encaminhando, setEncaminhando] = useState<string | null>(null)

  const encaminharAoFinanceiro = async (p: PendenciaDevolucao) => {
    if (!lojaAtivaId || encaminhando) return
    const justificativa = (justificativas[p.dev.id] ?? "").trim()
    if (!justificativa) {
      toast({ title: "Justificativa obrigatória", description: "Descreva o que foi entregue ao cliente.", variant: "destructive" })
      return
    }
    setEncaminhando(p.dev.id)
    try {
      const res = await fetch("/api/ops/devolucao/pendencias", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-assistec-loja-id": lojaAtivaId },
        body: JSON.stringify({
          localId: p.dev.id,
          vendaLocalId: p.dev.saleId,
          categoria: p.categoria,
          estado: p.estado === "AGUARDANDO_SINCRONIZACAO" ? "BLOQUEIO_PERSISTENTE" : p.estado,
          valorDeclarado: p.valorDeclarado,
          motivoRecusa: p.dev.syncRejectedReason || p.dev.syncRejectedCode || p.motivo,
          justificativa,
          itens: p.dev.lines.map((l) => ({ inventoryId: l.inventoryId, ...(l.produtoId ? { produtoId: l.produtoId } : {}), nome: l.name, quantidade: l.quantity })),
        }),
      })
      const j = (await res.json().catch(() => null)) as { ok?: boolean; ref?: string; at?: string; operador?: string; error?: string } | null
      if (!res.ok || !j?.ok || !j.ref) {
        toast({ title: "Encaminhamento não registrado", description: j?.error || `HTTP ${res.status}`, variant: "destructive" })
        return
      }
      registrarEncaminhamentoDevolucao(p.dev.id, {
        ref: j.ref,
        at: j.at || new Date().toISOString(),
        operador: j.operador || "—",
        categoria: p.categoria,
        valorDeclarado: p.valorDeclarado,
      })
      toast({ title: "Encaminhado ao Financeiro", description: `Referência ${j.ref}. Nenhum lançamento foi criado.` })
    } catch {
      toast({ title: "Sem conexão", description: "O encaminhamento exige conexão com o servidor. Nada foi alterado.", variant: "destructive" })
    } finally {
      setEncaminhando(null)
    }
  }
  /**
   * Troca cuja devolução JÁ foi gravada no servidor mas a nova venda não concluiu:
   * o vale existe (persistido) e o reenvio só refaz a venda — nunca outra devolução.
   */
  const [trocaRecovery, setTrocaRecovery] = useState<{
    saleId: string
    dev: ServerDevolucaoOk
    cpf: string
    nome: string
    /** Nova venda já registrada (pendente de sincronização) — nunca finalizar de novo. */
    novaVendaPendenteId?: string
  } | null>(null)
  const trocaBipeRef = useRef<HTMLInputElement>(null)

  // ── Troca imediata (modo `troca`): mini-carrinho de novos itens ────────────
  type TrocaCartLine = { inventoryId: string; name: string; unitPrice: number; quantity: number }
  const [trocaCart, setTrocaCart] = useState<TrocaCartLine[]>([])
  const [trocaSearch, setTrocaSearch] = useState("")
  /** Forma de pagamento da DIFERENÇA (quando novo > devolvido). */
  const [diffPayMethod, setDiffPayMethod] = useState<"dinheiro" | "pix" | "debito" | "credito">("dinheiro")
  // Sobra (devolvido > novo) é SEMPRE vale: "devolver dinheiro" saiu — sem fluxo aprovado.

  // ── Cupom de troca/devolução (abre automaticamente após confirmar) ────────
  type CupomTrocaData = {
    tipo: "devolucao" | "vale_credito" | "troca" | "somente_estoque"
    /** localId da devolução (chave de negócio impressa no vale). */
    devolucaoId: string
    /** id técnico no servidor — ausente quando a devolução ainda está na fila offline. */
    devolucaoServerId?: string
    devolucaoPendente?: boolean
    vendaOrigemId: string
    novaVendaId?: string | null
    /** Nova venda gravada só localmente, aguardando sincronização. */
    novaVendaPendente?: boolean
    clienteNome: string
    clienteCpf: string
    operador: string
    itensDevolvidos: { nome: string; quantidade: number; valorTotal: number }[]
    itensNovos: { nome: string; quantidade: number; valorTotal: number }[]
    valorDevolvido: number
    totalNovaCompra: number
    creditoGerado: number
    creditoUtilizado: number
    saldoFinal: number
    diferencaPaga: number
    diferencaForma: string | null
    motivo: string
    at: string
  }
  const [cupomData, setCupomData] = useState<CupomTrocaData | null>(null)
  const [cupomOpen, setCupomOpen] = useState(false)

  // Prefill via prop `initialSaleId` (Histórico) ou query `?sale=` em /dashboard/vendas-arquivo-geral
  useEffect(() => {
    const id = (initialSaleId || searchParams.get("sale") || "").trim()
    if (!id) return
    setBusca(id)
    setShowSearch(false)
    const upper = id.toUpperCase()
    const idNorm = id.replace(/\s/g, "").toUpperCase()

    // Aberta pelo Histórico: reconsulta o servidor (devolvível agregado de todos os
    // terminais) e só cai no snapshot/cópia local se o servidor não responder.
    let cancelado = false
    const fallback = () => {
      if (cancelado) return
      if (initialSale && (initialSale.id.toUpperCase() === upper || initialSale.id.replace(/\s/g, "").toUpperCase() === idNorm)) {
        aplicarVenda(initialSale)
        return
      }
      const s = sales.find((x) => x.id.toUpperCase() === upper || x.id.replace(/\s/g, "").toUpperCase() === idNorm)
      if (s) aplicarVenda(s)
    }
    if (lojaAtivaId) {
      void fetch(`/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(id)}`, {
        credentials: "include",
        headers: { "x-assistec-loja-id": lojaAtivaId },
      })
        .then(async (res) => {
          const j = res.ok ? ((await res.json()) as { vendas?: SaleRecord[] }) : null
          const v = j?.vendas?.find((x) => x.id.toUpperCase() === upper)
          if (cancelado) return
          if (v) aplicarVenda(v, "servidor")
          else fallback()
        })
        .catch(fallback)
      return () => { cancelado = true }
    }
    fallback()
    return () => { cancelado = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill roda por venda pedida, não a cada mudança do store
  }, [initialSaleId, initialSale, searchParams, lojaAtivaId])

  useEffect(() => {
    // Venda vinda do servidor já traz o devolvível agregado de TODOS os terminais;
    // a cópia local pode estar atrasada e não deve sobrescrevê-la.
    if (!sale || saleSource === "servidor") return
    const fresh = sales.find((x) => x.id === sale.id)
    if (!fresh) return
    const lines = fundirLinhasPorItem(fresh.lines as LinhaVendaF8[])
    if (JSON.stringify(lines) !== JSON.stringify(sale.lines)) setSale({ ...fresh, lines })
  }, [sales, sale, saleSource])

  const kgReturnBlocked = !!sale && saleKgReturnBlocked(sale, inventory)

  const nomeLoja =
    (config.empresa.nomeFantasia || "").trim() || configPadrao.empresa.nomeFantasia

  const aplicarVenda = (s: SaleRecord, source: "servidor" | "local" = "local") => {
    setSaleSource(source)
    setTrocaRecovery(null)
    // Tentativa incerta (sem resposta) NÃO é descartada ao trocar de venda: a próxima
    // gravação reenvia a original primeiro (ver gravarDevolucaoConfirmada).
    s = { ...s, lines: fundirLinhasPorItem(s.lines as LinhaVendaF8[]) }
    setSale(s)
    setCandidateSales(null)
    setCandidateLabel("")
    setShowSearch(false)
    const q: Record<string, string> = {}
    for (const l of s.lines) {
      const max = l.quantity - (l.qtyReturned ?? 0)
      q[l.inventoryId] = max > 0 ? "0" : "0"
    }
    setQtyByLine(q)
    setCpfExtra(s.customerCpf ?? "")
    setNomeExtra(s.customerName ?? "")
    setLastDevolucao(null)
    toast({ title: "Venda localizada", description: s.id })
  }

  /**
   * Busca AUTORITATIVA no servidor da loja (venda | código de barras/SKU/ID | cliente).
   * Sem conexão cai na busca local deste navegador, sinalizada como "dados locais".
   */
  const encontrarVenda = async () => {
    const raw = busca.trim()
    if (!raw) {
      toast({ title: "Informe a busca", description: "ID da venda, nome do cliente ou código do produto.", variant: "destructive" })
      return
    }
    if (buscando) return
    setCandidateSales(null)
    setCandidateLabel("")
    if (lojaAtivaId) {
      setBuscando(true)
      try {
        const res = await fetch(`/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(raw)}`, {
          credentials: "include",
          headers: { "x-assistec-loja-id": lojaAtivaId },
        })
        if (res.ok) {
          const j = (await res.json()) as { criterio: string; produtoNome?: string; vendas: SaleRecord[] }
          const vendas = Array.isArray(j.vendas) ? j.vendas : []
          if (vendas.length === 1) {
            aplicarVenda(vendas[0]!, "servidor")
            return
          }
          if (vendas.length > 1) {
            setSaleSource("servidor")
            setCandidateSales(vendas)
            setCandidateLabel(
              j.criterio === "produto"
                ? `Últimas vendas com “${j.produtoNome ?? raw}” (origem da troca)`
                : `Vendas encontradas para “${raw}”`,
            )
            toast({ title: "Selecione a venda", description: "Escolha de qual cupom sairá a devolução." })
            return
          }
          setSale(null)
          setLastDevolucao(null)
          toast({
            title: "Não encontrado",
            description:
              j.criterio === "produto"
                ? `O produto “${j.produtoNome ?? raw}” não consta em vendas desta loja.`
                : "Nenhuma venda, cliente ou produto correspondente nesta loja.",
            variant: "destructive",
          })
          return
        }
        if (res.status < 500 && res.status !== 0) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null
          toast({ title: "Busca recusada", description: j?.error || `HTTP ${res.status}`, variant: "destructive" })
          return
        }
      } catch {
        /* sem conexão → busca local abaixo */
      } finally {
        setBuscando(false)
      }
      toast({
        title: "Sem conexão com o servidor",
        description: "Mostrando apenas vendas deste navegador. A troca imediata exige conexão.",
      })
    }
    encontrarVendaLocal(raw)
  }

  const encontrarVendaLocal = (raw: string) => {
    setSaleSource("local")

    const idUpper = raw.toUpperCase()
    const idNorm = raw.replace(/\s/g, "").toUpperCase()
    const qLower = raw.toLowerCase()
    const digitsOnly = raw.replace(/\D/g, "")

    const byId = sales.find(
      (x) =>
        x.id.toUpperCase() === idUpper ||
        x.id.replace(/\s/g, "").toUpperCase() === idNorm
    )
    if (byId) {
      aplicarVenda(byId)
      return
    }

    const byName = sales.filter((s) => (s.customerName || "").toLowerCase().includes(qLower))
    if (byName.length === 1) {
      aplicarVenda(byName[0]!)
      return
    }
    if (byName.length > 1) {
      setCandidateSales(byName.slice(0, 8))
      setCandidateLabel(`Vendas com cliente contendo “${raw}”`)
      toast({ title: "Várias vendas", description: "Escolha o cupom correto na lista abaixo." })
      return
    }

    const invMatch =
      inventory.find(
        (i) =>
          i.id === raw ||
          (digitsOnly.length >= 8 && i.id.replace(/\D/g, "") === digitsOnly) ||
          i.name.toLowerCase().includes(qLower)
      ) ?? null

    if (invMatch) {
      const last5 = sales
        .filter((s) => s.lines.some((l) => l.inventoryId === invMatch.id))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 5)
      if (last5.length === 0) {
        setSale(null)
        toast({
          title: "Nenhuma venda",
          description: `O produto “${invMatch.name}” ainda não consta em vendas registradas.`,
          variant: "destructive",
        })
        return
      }
      if (last5.length === 1) {
        aplicarVenda(last5[0]!)
        return
      }
      setCandidateSales(last5)
      setCandidateLabel(`Últimas vendas com “${invMatch.name}” (origem da troca)`)
      toast({ title: "Selecione a venda", description: "Escolha de qual cupom sairá a devolução." })
      return
    }

    setSale(null)
    setLastDevolucao(null)
    toast({
      title: "Não encontrado",
      description: "Nenhuma venda, cliente ou produto correspondente.",
      variant: "destructive",
    })
  }

  const linhasComMax = useMemo(() => {
    if (!sale) return []
    return sale.lines.map((l) => ({
      ...l,
      maxReturn: l.quantity - (l.qtyReturned ?? 0),
    }))
  }, [sale])

  // ── Cálculos da troca imediata ─────────────────────────────────────────────
  /** Valor devolvido baseado nas quantidades atuais × preço unitário da venda original. */
  const valorDevolvido = useMemo(() => {
    if (!sale) return 0
    let total = 0
    for (const l of linhasComMax) {
      const q = Math.max(0, parseInt(qtyByLine[l.inventoryId] || "0", 10) || 0)
      if (q > 0 && l.quantity > 0) total += (l.lineTotal / l.quantity) * q
    }
    return Math.round(total * 100) / 100
  }, [sale, linhasComMax, qtyByLine])

  const totalNovaCompra = useMemo(
    () => Math.round(trocaCart.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100,
    [trocaCart],
  )

  const diferenca = Math.round((totalNovaCompra - valorDevolvido) * 100) / 100
  /** Quanto cabe abater do vale (= mínimo entre devolvido e nova compra). */
  const valePassivelAbatimento = Math.round(Math.min(valorDevolvido, totalNovaCompra) * 100) / 100
  const creditoRestante = Math.round(Math.max(0, valorDevolvido - totalNovaCompra) * 100) / 100

  /** Buscar produtos para a aba "Troca imediata" — limitado a 8 sugestões. */
  const trocaSearchResults = useMemo<InventoryItem[]>(() => {
    const q = trocaSearch.trim().toLowerCase()
    if (!q) return []
    const exact = findExactTrocaItem(inventory, trocaSearch)
    const rest = inventory.filter((i) => i !== exact && i.name.toLowerCase().includes(q))
    return (exact ? [exact, ...rest] : rest).slice(0, 8)
  }, [trocaSearch, inventory])

  /** Leitor de código de barras: Enter com código exato adiciona direto (como no bipe do PDV). */
  const bipeTrocaItem = () => {
    const raw = trocaSearch.trim()
    if (!raw) return
    const exact = findExactTrocaItem(inventory, raw)
    if (exact) {
      addTrocaItem(exact)
      queueMicrotask(() => trocaBipeRef.current?.focus())
      return
    }
    if (trocaSearchResults.length === 1) {
      addTrocaItem(trocaSearchResults[0]!)
      queueMicrotask(() => trocaBipeRef.current?.focus())
      return
    }
    toast({
      title: "Produto não encontrado",
      description: `Nenhum produto com código, SKU ou ID “${raw}”.`,
      variant: "destructive",
    })
  }

  const addTrocaItem = (item: InventoryItem) => {
    const isService = item.category === "Servicos"
    if (!isService && item.stock <= 0) {
      toast({ title: "Sem estoque", description: `${item.name} está sem estoque.`, variant: "destructive" })
      return
    }
    const existing = trocaCart.find((l) => l.inventoryId === item.id)
    const used = existing?.quantity ?? 0
    if (!isService && used + 1 > item.stock) {
      toast({ title: "Estoque insuficiente", description: `${item.name}: máx ${item.stock}.`, variant: "destructive" })
      return
    }
    setTrocaCart((prev) => {
      const i = prev.findIndex((l) => l.inventoryId === item.id)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], quantity: next[i].quantity + 1 }
        return next
      }
      return [...prev, { inventoryId: item.id, name: item.name, unitPrice: item.price, quantity: 1 }]
    })
    setTrocaSearch("")
  }

  const decTrocaItem = (inventoryId: string) => {
    setTrocaCart((prev) =>
      prev
        .map((l) => (l.inventoryId === inventoryId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    )
  }

  const incTrocaItem = (inventoryId: string) => {
    const item = inventory.find((i) => i.id === inventoryId)
    if (!item) return
    const isService = item.category === "Servicos"
    const existing = trocaCart.find((l) => l.inventoryId === inventoryId)
    const used = existing?.quantity ?? 0
    if (!isService && used + 1 > item.stock) {
      toast({ title: "Estoque insuficiente", description: `${item.name}: máx ${item.stock}.`, variant: "destructive" })
      return
    }
    setTrocaCart((prev) =>
      prev.map((l) => (l.inventoryId === inventoryId ? { ...l, quantity: l.quantity + 1 } : l)),
    )
  }

  const removeTrocaItem = (inventoryId: string) => {
    setTrocaCart((prev) => prev.filter((l) => l.inventoryId !== inventoryId))
  }

  // Limpa o mini-carrinho ao trocar de venda ou mudar de modo (sai de "troca")
  useEffect(() => {
    if (mode !== "troca") setTrocaCart([])
  }, [mode, sale?.id])

  /** Linhas a devolver validadas contra o saldo devolvível exibido (o servidor revalida sob lock). */
  const coletarLinhasDevolucao = (): { inventoryId: string; quantity: number }[] | null => {
    const lines: { inventoryId: string; quantity: number }[] = []
    for (const l of linhasComMax) {
      const q = Math.max(0, parseInt(qtyByLine[l.inventoryId] || "0", 10) || 0)
      if (q > 0) {
        const bloqueio = bloqueioLinhaDevolucao(l)
        if (bloqueio) {
          toast({ title: "Item não devolvível", description: `${l.name}: ${bloqueio}`, variant: "destructive" })
          return null
        }
        if (q > l.maxReturn) {
          toast({ title: "Quantidade inválida", description: `${l.name}: máximo ${l.maxReturn}`, variant: "destructive" })
          return null
        }
        lines.push({ inventoryId: l.inventoryId, quantity: q })
      }
    }
    if (lines.length === 0) {
      toast({ title: "Nada a devolver", description: "Informe quantidades do item a devolver.", variant: "destructive" })
      return null
    }
    return lines
  }

  /**
   * Grava a devolução NO SERVIDOR e espera a resposta (fonte da verdade de valor,
   * crédito e saldo devolvível). Só depois espelha localmente, com o mesmo localId.
   *
   * Tentativa SEM resposta fica "incerta" (o servidor pode ter gravado). Enquanto
   * estiver incerta, qualquer nova intenção (CPF corrigido, quantidade mudada, outra
   * venda) primeiro reenvia a tentativa ORIGINAL com o mesmo localId: se ela tinha
   * sido gravada, o operador é avisado e nada novo é criado — uma devolução física
   * nunca vira duas no servidor.
   */
  const gravarDevolucaoConfirmada = async (args: {
    tipo: "troca" | "vale_credito" | "somente_estoque"
    lines: { inventoryId: string; quantity: number }[]
    cpf: string
    nome: string
    payload: Record<string, unknown>
  }): Promise<ServerDevolucaoResult & { localId?: string }> => {
    if (!sale || !lojaAtivaId) return { kind: "rejected", status: 400, message: "Loja ou venda não selecionada." }
    const fp = [sale.id, args.tipo, args.cpf, ...args.lines.map((l) => `${l.inventoryId}:${l.quantity}`).sort()].join("#")

    const incerta = pendingDevRef.current
    if (incerta && incerta.fp !== fp) {
      const anterior = await postDevolucaoServidor(lojaAtivaId, incerta.body)
      if (anterior.kind === "network") return { ...anterior, localId: incerta.localId }
      definirTentativa(null)
      if (anterior.kind === "ok") {
        espelharDevolucao(incerta.mirror, anterior.data)
        if (incerta.mirror.tipo === "troca" && incerta.mirror.saleId === sale.id) {
          setTrocaRecovery({ saleId: sale.id, dev: anterior.data, cpf: incerta.mirror.cpf, nome: incerta.mirror.nome })
        }
        return {
          kind: "rejected",
          status: 409,
          message: `A tentativa anterior sem confirmação FOI gravada (${anterior.data.localId}, vale ${formatBrl(anterior.data.creditoEmitido)}). Nada novo foi registrado — revise antes de continuar.`,
        }
      }
      // A anterior não foi gravada (recusa de negócio): segue com a intenção nova.
    }

    const localId = incerta && incerta.fp === fp ? incerta.localId : nextDevolucaoId(devolucoes)
    const body = {
      localId,
      vendaLocalId: sale.id,
      sessaoId: sessaoId || undefined,
      tipo: args.tipo,
      clienteNome: args.nome,
      clienteDoc: args.cpf,
      motivo: motivo.trim(),
      itens: args.lines.map((l) => {
        const sl = sale.lines.find((x) => x.inventoryId === l.inventoryId)
        // Identidade histórica (Produto.id da venda) quando o servidor a informou.
        return {
          inventoryId: l.inventoryId,
          ...(sl?.produtoId ? { produtoId: sl.produtoId } : {}),
          nome: sl?.name ?? "",
          quantidade: l.quantity,
        }
      }),
      payload: { ...args.payload, localId },
    }
    const mirror = { saleId: sale.id, ...args, motivo: motivo.trim() }
    const r = await postDevolucaoServidor(lojaAtivaId, body)
    if (r.kind === "ok") {
      espelharDevolucao(mirror, r.data)
      definirTentativa(null)
    } else if (r.kind === "rejected" && classificarRespostaDevolucao(r.status, r.code) !== "aguardar") {
      // Recusa definitiva (ou localId de outra devolução): nada foi gravado com este id —
      // a próxima tentativa é intenção nova.
      definirTentativa(null)
    } else {
      // Rede/5xx ou recusa transitória (período fechado, venda ainda não sincronizada):
      // mantém o MESMO localId — o reenvio é reconhecido como replay se já estiver gravado.
      definirTentativa({ fp, localId, body, mirror })
    }
    return { ...r, localId }
  }

  /** Espelho local (estoque/crédito/histórico deste navegador) do que o servidor gravou — sem reenvio. */
  const espelharDevolucao = (m: PendingMirror, data: ServerDevolucaoOk) => {
    registrarDevolucao({
      saleId: m.saleId,
      lines: m.lines,
      mode: m.tipo === "somente_estoque" ? "somente_estoque" : "vale_credito",
      customerCpf: m.cpf,
      customerName: m.nome,
      sessaoId: sessaoId ?? undefined,
      tipo: m.tipo,
      motivo: m.motivo,
      payload: m.payload,
      serverConfirmed: {
        localId: data.localId,
        creditIssued: data.creditoEmitido,
        lines: data.itens.map((i) => ({ inventoryId: i.inventoryId, ...(i.produtoId ? { produtoId: i.produtoId } : {}), name: i.nome, quantity: i.quantidade, valor: i.valorTotal })),
      },
    })
  }

  const exigirTitular = (): { cpf: string; nome: string } | null => {
    if (!sale) return null
    const cpf = normalizeDocDigits(sale.customerCpf || "") || normalizeDocDigits(cpfExtra)
    const nome = (sale.customerName || nomeExtra).trim()
    if (!cpf) {
      toast({ title: "CPF obrigatório", description: "Informe o CPF/CNPJ do cliente: o vale fica no nome do titular.", variant: "destructive" })
      return null
    }
    if (!nome) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do cliente.", variant: "destructive" })
      return null
    }
    return { cpf, nome }
  }

  /**
   * TROCA IMEDIATA (mesma tela):
   * 1) devolução gravada e CONFIRMADA no servidor (lock da venda, teto por item,
   *    vale do valor devolvido criado uma vez) — sem conexão, nada é registrado;
   * 2) nova venda pelo motor canônico (`finalizeSaleTransaction`), abatendo do vale
   *    min(devolvido, nova compra) e cobrando só a diferença positiva;
   * 3) sobra (devolvido > nova) permanece como vale — reembolso em dinheiro bloqueado.
   * Se (2) falhar, o vale já existe no servidor: a tela guarda a devolução confirmada
   * e "Concluir nova venda" refaz SÓ a venda (nunca outra devolução).
   */
  const handleFinalizarTroca = async () => {
    if (!sale || enviandoRef.current) return
    if (!caixa.isOpen) {
      toast({ title: "Caixa fechado", description: "Abra o caixa antes de finalizar a troca.", variant: "destructive" })
      return
    }
    if (trocaCart.length === 0) {
      toast({ title: "Sem itens novos", description: "Adicione ao menos um produto/serviço à nova compra.", variant: "destructive" })
      return
    }
    // Guard fail-closed pré-motor (PDV-MOTOR-INTEGRITY-N1): item novo sem cadastro
    // bloqueia ANTES de qualquer gravação — nem a devolução sai.
    const unresolvedTroca = findUnresolvedSaleLines(
      trocaCart.map((l) => ({ inventoryId: l.inventoryId, name: l.name })),
      inventory.map((i) => i.id),
    )
    if (unresolvedTroca.length > 0) {
      toast({ title: "Item não pode ser vendido", description: unresolvedSaleLinesDescription(unresolvedTroca), variant: "destructive" })
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    try {
      let dev: ServerDevolucaoOk
      let cpf: string
      let nome: string
      let itensDevolvidos: { nome: string; quantidade: number; valorTotal: number }[]

      if (trocaRecovery && trocaRecovery.saleId === sale.id && trocaRecovery.novaVendaPendenteId) {
        toast({
          title: "Nova venda já registrada",
          description: `A venda ${trocaRecovery.novaVendaPendenteId} aguarda sincronização: use Vendas → Reenviar sync. Nada novo foi feito.`,
        })
        return
      }
      if (trocaRecovery && trocaRecovery.saleId === sale.id) {
        // Retomada: a devolução já está gravada — só refaz a nova venda.
        dev = trocaRecovery.dev
        cpf = trocaRecovery.cpf
        nome = trocaRecovery.nome
      } else {
        if (saleSource !== "servidor") {
          toast({
            title: "Troca imediata exige conexão",
            description: "Busque a venda com o servidor disponível. Nada foi registrado.",
            variant: "destructive",
          })
          return
        }
        const titular = exigirTitular()
        if (!titular) return
        cpf = titular.cpf
        nome = titular.nome
        const lines = coletarLinhasDevolucao()
        if (!lines) return
        const r = await gravarDevolucaoConfirmada({
          tipo: "troca",
          lines,
          cpf,
          nome,
          payload: { saleId: sale.id, linhas: lines, modo: "troca_imediata", motivo: motivo.trim() },
        })
        if (r.kind === "network") {
          toast({
            title: "Sem confirmação do servidor",
            description:
              "Não foi possível confirmar a devolução. Nenhuma venda nova foi feita. Tente de novo: o reenvio usa o mesmo identificador e nunca duplica.",
            variant: "destructive",
          })
          return
        }
        if (r.kind === "rejected") {
          toast({ title: "Devolução recusada", description: r.message, variant: "destructive" })
          return
        }
        dev = r.data
        setTrocaRecovery({ saleId: sale.id, dev, cpf, nome })
      }
      itensDevolvidos = dev.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valorTotal: i.valorTotal }))

      // Valores autoritativos: o devolvido é o que o servidor gravou.
      const devolvidoServidor = Math.round(dev.valorTotal * 100) / 100
      const usaVale = Math.round(Math.min(devolvidoServidor, totalNovaCompra) * 100) / 100
      const diff = Math.round((totalNovaCompra - usaVale) * 100) / 100
      const sobraVale = Math.round(Math.max(0, devolvidoServidor - totalNovaCompra) * 100) / 100

      const pb = { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: usaVale }
      if (diff > 0) {
        if (diffPayMethod === "dinheiro") pb.dinheiro = diff
        else if (diffPayMethod === "pix") pb.pix = diff
        else if (diffPayMethod === "debito") pb.cartaoDebito = diff
        else if (diffPayMethod === "credito") pb.cartaoCredito = diff
      }

      const novaVenda = await finalizeSaleTransaction({
        lines: trocaCart.map((l) => ({ inventoryId: l.inventoryId, quantity: l.quantity, name: l.name, unitPrice: l.unitPrice })),
        total: totalNovaCompra,
        paymentBreakdown: pb,
        customerCpf: cpf,
        customerName: nome,
      })
      if (!novaVenda.ok) {
        toast({
          title: "Vale gerado — nova venda não concluída",
          description: `${novaVenda.reason} O vale de ${formatBrl(dev.creditoEmitido)} (${dev.localId}) está salvo no CPF do cliente. Corrija e use “Concluir nova venda”.`,
          variant: "destructive",
          duration: 9000,
        })
        return
      }

      const auditBase = `dev ${dev.localId} → venda ${novaVenda.saleId} | devolvido ${devolvidoServidor.toFixed(2)} | nova ${totalNovaCompra.toFixed(2)} | vale usado ${usaVale.toFixed(2)} | diff ${diff.toFixed(2)} (${diff > 0 ? diffPayMethod : "-"}) | sobra em vale ${sobraVale.toFixed(2)}`

      // PENDING (CORREÇÃO-01): a nova venda ainda NÃO confirmou — sem cupom, sem
      // callback de conclusão e com o mini-carrinho mantido. A devolução e o vale JÁ
      // estão gravados no servidor (estado de retomada visível); o reenvio da venda
      // usa a MESMA identidade (Vendas → Reenviar sync). Tudo abaixo é CONFIRMED.
      if (novaVenda.pending) {
        setTrocaRecovery((cur) => (cur ? { ...cur, novaVendaPendenteId: novaVenda.saleId } : cur))
        appendAuditLog({
          action: "devolucao_vale",
          userLabel: `${nomeLoja} (PDV)`,
          detail: `[troca_imediata DEVOLUÇÃO CONFIRMADA · VENDA PENDENTE — AGUARDANDO CONFIRMAÇÃO] ${auditBase}`,
        })
        toast({
          title: PENDING_SALE_TITLE,
          description: `Devolução ${dev.localId} e vale confirmados no servidor. ${PENDING_SALE_DESCRIPTION}`,
          duration: 6000,
        })
        return
      }

      appendAuditLog({ action: "devolucao_vale", userLabel: `${nomeLoja} (PDV)`, detail: `[troca_imediata] ${auditBase}` })
      onRegistered?.()
      setTrocaRecovery(null)
      setLastDevolucao({ id: dev.localId, credit: dev.creditoEmitido, nome, cpf })

      setCupomData({
        tipo: "troca",
        devolucaoId: dev.localId,
        devolucaoServerId: dev.devolucaoId,
        vendaOrigemId: sale.id,
        novaVendaId: novaVenda.saleId,
        clienteNome: nome,
        clienteCpf: cpf,
        operador: dev.operador || "—",
        itensDevolvidos,
        itensNovos: trocaCart.map((l) => ({ nome: l.name, quantidade: l.quantity, valorTotal: Math.round(l.unitPrice * l.quantity * 100) / 100 })),
        valorDevolvido: devolvidoServidor,
        totalNovaCompra,
        creditoGerado: dev.creditoEmitido,
        creditoUtilizado: usaVale,
        saldoFinal: sobraVale,
        diferencaPaga: diff > 0 ? diff : 0,
        diferencaForma: diff > 0 ? diffPayMethod : null,
        motivo: motivo.trim(),
        at: new Date().toISOString(),
      })
      setCupomOpen(true)

      toast({
        title: "Troca finalizada",
        description:
          diff > 0
            ? `Cobrado ${formatBrl(diff)} em ${diffPayMethod}.`
            : sobraVale > 0
              ? `Vale de ${formatBrl(sobraVale)} permanece no CPF do cliente.`
              : "Troca casada sem diferença.",
      })
      setTrocaCart([])
      setQtyByLine({})
      setSale(null)
      setShowSearch(true)
      setBusca("")
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  const handleRegistrar = async () => {
    if (!sale || enviandoRef.current) return
    if (mode === "devolucao" && REEMBOLSO_DINHEIRO_BLOQUEADO) {
      toast({ title: "Reembolso bloqueado", description: REEMBOLSO_BLOQUEADO_TEXTO, variant: "destructive" })
      return
    }
    if (mode === "troca") return
    const titular = exigirTitular()
    if (!titular) return
    const { cpf, nome } = titular
    const lines = coletarLinhasDevolucao()
    if (!lines) return
    const tipo: "vale_credito" | "somente_estoque" = mode === "vale_credito" ? "vale_credito" : "somente_estoque"
    const payload = { saleId: sale.id, linhas: lines, modo: tipo, motivo: motivo.trim() }

    enviandoRef.current = true
    setEnviando(true)
    let creditIssued = 0
    let devolucaoLocalId = ""
    let devolucaoServerId: string | undefined
    let operadorCupom = "—"
    let itensDev: { nome: string; quantidade: number; valorTotal: number }[] = []
    let pendenteSync = false
    try {
      const r = saleSource === "servidor" ? await gravarDevolucaoConfirmada({ tipo, lines, cpf, nome, payload }) : null
      if (r && r.kind === "rejected") {
        toast({ title: "Devolução recusada", description: r.message, variant: "destructive" })
        return
      }
      if (r && r.kind === "ok") {
        creditIssued = r.data.creditoEmitido
        devolucaoLocalId = r.data.localId
        devolucaoServerId = r.data.devolucaoId
        operadorCupom = r.data.operador || "—"
        itensDev = r.data.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, valorTotal: i.valorTotal }))
      } else {
        if (r && r.kind === "network" && pendingDevRef.current) {
          // Sem resposta: o servidor PODE ter gravado. Não cria pendência local com outro
          // id (duplicaria) — o operador reenvia e o mesmo localId vira replay.
          toast({
            title: "Sem confirmação do servidor",
            description: "A devolução pode ou não ter sido gravada. Toque em Confirmar de novo: o reenvio não duplica.",
            variant: "destructive",
          })
          return
        }
        // Venda só deste navegador (sem conexão): fila local existente; o servidor
        // valida tudo de novo ao sincronizar e recusa o que não tiver lastro.
        const local = registrarDevolucao({
          saleId: sale.id,
          lines,
          mode: tipo,
          customerCpf: cpf,
          customerName: nome,
          sessaoId: sessaoId ?? undefined,
          tipo,
          motivo: motivo.trim(),
          payload,
        })
        if (!local.ok) {
          toast({ title: "Devolução não registrada", description: local.reason, variant: "destructive" })
          return
        }
        pendenteSync = true
        creditIssued = local.creditIssued
        devolucaoLocalId = local.devolucaoId
        itensDev = lines.map((req) => {
          const sl = sale.lines.find((l) => l.inventoryId === req.inventoryId)
          const valorUnit = sl && sl.quantity > 0 ? sl.lineTotal / sl.quantity : 0
          return { nome: sl?.name ?? req.inventoryId, quantidade: req.quantity, valorTotal: Math.round(valorUnit * req.quantity * 100) / 100 }
        })
      }
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }

    appendAuditLog({
      action: "devolucao_vale",
      userLabel: `${nomeLoja} (PDV)`,
      detail: `${devolucaoLocalId} | venda ${sale.id} | modo ${mode} | crédito ${creditIssued.toFixed(2)}${pendenteSync ? " | PENDENTE DE SINCRONIZAÇÃO" : ""}${motivo.trim() ? ` | motivo ${motivo.trim()}` : ""}`,
    })

    onRegistered?.()
    setLastDevolucao({ id: devolucaoLocalId, credit: creditIssued, nome, cpf })

    const valorDevTotal = Math.round(itensDev.reduce((s, i) => s + i.valorTotal, 0) * 100) / 100
    setCupomData({
      tipo,
      devolucaoId: devolucaoLocalId,
      devolucaoServerId,
      devolucaoPendente: pendenteSync,
      vendaOrigemId: sale.id,
      novaVendaId: null,
      clienteNome: nome,
      clienteCpf: cpf,
      operador: operadorCupom,
      itensDevolvidos: itensDev,
      itensNovos: [],
      valorDevolvido: valorDevTotal,
      totalNovaCompra: 0,
      creditoGerado: creditIssued,
      creditoUtilizado: 0,
      saldoFinal: creditIssued,
      diferencaPaga: 0,
      diferencaForma: null,
      motivo: motivo.trim(),
      at: new Date().toISOString(),
    })
    setCupomOpen(true)

    const gerouCredito = creditIssued > 0
    toast({
      title: pendenteSync ? "Devolução pendente de sincronização" : gerouCredito ? "Crédito em haver gerado" : "Devolução registrada",
      description: pendenteSync
        ? "Sem conexão: será validada pelo servidor ao sincronizar."
        : gerouCredito
          ? `${formatBrl(creditIssued)} para ${nome}`
          : "Itens retornaram ao estoque.",
    })
  }

  const imprimirVale = async () => {
    if (!lastDevolucao || lastDevolucao.credit <= 0) {
      toast({ title: "Sem comprovante", description: "Gere um vale (modo crédito) antes de imprimir.", variant: "destructive" })
      return
    }
    const bytes = buildValeTrocaEscPos({
      nomeFantasia: nomeLoja,
      nomeCliente: lastDevolucao.nome,
      cpfCliente: lastDevolucao.cpf,
      valorCredito: lastDevolucao.credit,
      dataLabel: new Date().toLocaleString("pt-BR"),
      devolucaoId: lastDevolucao.id,
    })
    const res = await sendEscPosViaProxy(bytes)
    if (res.ok) {
      toast({ title: "Enviado à impressora", description: "Comprovante ESC/POS." })
      return
    }
    toast({ title: "Impressora indisponível", description: res.error, variant: "destructive" })
    downloadEscPosFile(bytes, `vale-${lastDevolucao.id}.bin`)
    const br = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    openThermalHtmlPrint(
      `
      <div style="text-align:center;font-weight:700">COMPROVANTE VALE-TROCA</div>
      <div style="text-align:center;font-size:10px;margin:4px 0">${escapeHtml(nomeLoja)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p><strong>Cliente:</strong> ${escapeHtml(lastDevolucao.nome)}</p>
      <p><strong>CPF/CNPJ:</strong> ${escapeHtml(lastDevolucao.cpf)}</p>
      <p><strong>Crédito:</strong> ${br.format(lastDevolucao.credit)}</p>
      <p><strong>Data:</strong> ${escapeHtml(new Date().toLocaleString("pt-BR"))}</p>
      <p><strong>ID devolução:</strong> ${escapeHtml(lastDevolucao.id)}</p>
    `,
      "Vale-troca"
    )
  }

  return (
    <div className="space-y-6 w-full">
      {pendencias.length > 0 && (
        <PainelPendenciasDevolucao
          pendencias={pendencias}
          justificativas={justificativas}
          onJustificativa={(id, v) => setJustificativas((prev) => ({ ...prev, [id]: v }))}
          onRetomar={(id) => {
            retomarDevolucaoPendente(id)
            toast({ title: "Retomada enviada", description: `${id}: reenviada com o mesmo identificador.` })
          }}
          onEncaminhar={encaminharAoFinanceiro}
          encaminhando={encaminhando}
        />
      )}
      {(!sale || showSearch) && (
        <Card className="bg-card border-border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl font-bold">
              <RotateCcw className="w-6 h-6 text-primary" />
              Troca e Devolução
            </CardTitle>
            <CardDescription className="text-sm">
              Busque pelo <strong>ID do cupom</strong>, <strong>nome do cliente</strong> ou <strong>código/bip do produto</strong>.
              Ao bipar um item, listamos as últimas vendas em que ele aparece para você escolher a origem da troca. Os itens
              retornam ao estoque; use <strong>crédito em haver</strong> vinculado ao CPF quando aplicável.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Venda, cliente ou código de barras do produto</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="VDA-2026-0001 · João Silva · código do produto"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void encontrarVenda()
                      }
                    }}
                    autoFocus
                    aria-label="Venda, cliente ou código de barras do produto"
                    className="h-11 pl-9 font-mono text-sm border-border bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  className="h-11 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-6"
                  onClick={() => void encontrarVenda()}
                  disabled={buscando}
                >
                  {buscando ? "Buscando…" : "Buscar Venda"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {candidateSales && candidateSales.length > 0 && (
        <Card className="border-primary/30 bg-primary/5 shadow-inner">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{candidateLabel || "Escolha a venda"}</CardTitle>
            <CardDescription>Selecione o cupom de origem da troca ou devolução.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {candidateSales.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                className="h-auto w-full flex-col items-start gap-1 py-3 px-4 text-left border-border/80 hover:border-primary hover:bg-background/80 transition-all sm:flex-row sm:items-center sm:justify-between"
                onClick={() => aplicarVenda(s, saleSource)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-primary">{s.id}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm font-medium text-foreground">
                    {s.customerName || "Consumidor Final"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold tabular-nums text-foreground">{formatBrl(s.total)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(s.at).toLocaleString("pt-BR")}</span>
                </div>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {sale && (
        <div className="w-full space-y-4">
          {kgReturnBlocked && <p role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">Devolução parcial e troca de venda KG indisponíveis. O contrato de crédito e reposição por peso depende de validação própria. Use o cancelamento integral autorizado.</p>}
          {/* Cabeçalho Compacto da Venda de Origem */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl border border-border bg-muted/15">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-muted-foreground uppercase tracking-wider">Origem:</span>
                  <span className="font-mono text-sm font-bold text-primary">{sale.id}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <span>Realizada em {new Date(sale.at).toLocaleString("pt-BR")}</span>
                  {initialSaleId && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSale(null)
                          setShowSearch(true)
                          setBusca("")
                        }}
                        className="text-primary hover:underline font-semibold"
                      >
                        Trocar venda
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Total da Venda</span>
              <span className="text-base font-extrabold text-foreground tabular-nums">{formatBrl(sale.total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Coluna Esquerda: Dados do Cliente e Modo de Operação (lg:col-span-4) */}
            <div className="lg:col-span-4 space-y-3">
              {/* CPF / Nome */}
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/10 p-2.5">
                <h3 className="font-bold text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Search className="w-3 h-3 text-primary" />
                  Identificação do Cliente
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] font-semibold text-muted-foreground">CPF/CNPJ (se não veio)</Label>
                    <Input
                      value={cpfExtra}
                      onChange={(e) => setCpfExtra(e.target.value)}
                      placeholder="Somente números"
                      className="h-7 text-xs border-border bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] font-semibold text-muted-foreground">Nome do Cliente</Label>
                    <Input
                      value={nomeExtra}
                      onChange={(e) => setNomeExtra(e.target.value)}
                      placeholder="Nome completo"
                      className="h-7 text-xs border-border bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                    />
                  </div>
                </div>
              </div>

                {/* Modo de Operação */}
                <div className="space-y-1.5">
                  <Label className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Modo de Operação
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Tile 1: Troca Imediata */}
                    <button
                      type="button"
                      onClick={() => setMode("troca")}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${
                        mode === "troca"
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${mode === "troca" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-[11px] text-foreground font-sans leading-none">Troca Imediata</span>
                    </button>

                    {/* Tile 2: Vale Crédito */}
                    <button
                      type="button"
                      onClick={() => setMode("vale_credito")}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${
                        mode === "vale_credito"
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <Wallet className={`w-3.5 h-3.5 shrink-0 ${mode === "vale_credito" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-[11px] text-foreground font-sans leading-none">Vale-Troca</span>
                    </button>

                    {/* Tile 3: Devolução/Reembolso */}
                    <button
                      type="button"
                      onClick={() => setMode("devolucao")}
                      disabled={REEMBOLSO_DINHEIRO_BLOQUEADO}
                      title={REEMBOLSO_DINHEIRO_BLOQUEADO ? REEMBOLSO_BLOQUEADO_TEXTO : undefined}
                      aria-label={REEMBOLSO_DINHEIRO_BLOQUEADO ? "Reembolso (bloqueado)" : "Reembolso"}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        mode === "devolucao"
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${mode === "devolucao" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-[11px] text-foreground font-sans leading-none">
                        Reembolso{REEMBOLSO_DINHEIRO_BLOQUEADO ? " · bloqueado" : ""}
                      </span>
                    </button>

                    {/* Tile 4: Somente Estoque */}
                    <button
                      type="button"
                      onClick={() => setMode("somente_estoque")}
                      className={`flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all ${
                        mode === "somente_estoque"
                          ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                          : "border-border bg-background hover:bg-muted/50"
                      }`}
                    >
                      <Package className={`w-3.5 h-3.5 shrink-0 ${mode === "somente_estoque" ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-semibold text-[11px] text-foreground font-sans leading-none">Apenas Estoque</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Quantidades, Carrinho (se Troca), Resumo e Ações (lg:col-span-8) */}
              <div className="lg:col-span-8 space-y-3">
                {/* Seleção de Itens a Devolver */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                    <Package className="w-3.5 h-3.5 text-primary" />
                    <h3 className="font-bold text-xs text-foreground">Selecione as Quantidades a Devolver</h3>
                  </div>

                  <div className="space-y-2">
                    {linhasComMax.map((l) => {
                      const currentQty = parseInt(qtyByLine[l.inventoryId] || "0", 10) || 0
                      const bloqueio = bloqueioLinhaDevolucao(l)
                      return (
                        <div
                          key={l.inventoryId}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-border bg-muted/20"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-xs text-foreground truncate">{l.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Vendido: {l.quantity} · Devolvido: {l.qtyReturned ?? 0} · Disponível: <span className="font-medium text-foreground">{bloqueio ? 0 : l.maxReturn}</span>
                            </p>
                            {bloqueio && (
                              <p className="text-[10px] text-destructive mt-0.5" data-testid="linha-bloqueada-devolucao">{bloqueio}</p>
                            )}
                          </div>

                          {/* Incrementador +/- Premium Compacto */}
                          <div className="flex items-center gap-1 bg-background border border-border rounded-md p-0.5 self-start sm:self-center shadow-sm">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6.5 w-6.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                              disabled={l.maxReturn <= 0 || currentQty <= 0}
                              aria-label={`Devolver uma unidade a menos de ${l.name}`}
                              onClick={() => {
                                const val = Math.max(0, currentQty - 1)
                                setQtyByLine((prev) => ({ ...prev, [l.inventoryId]: String(val) }))
                              }}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <input
                              type="text"
                              className="w-10 text-center bg-transparent border-0 font-bold text-xs text-foreground tabular-nums focus:ring-0 focus:outline-none"
                              value={qtyByLine[l.inventoryId] ?? "0"}
                              readOnly
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6.5 w-6.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                              disabled={!!bloqueio || l.maxReturn <= 0 || currentQty >= l.maxReturn}
                              aria-label={`Devolver mais uma unidade de ${l.name}`}
                              onClick={() => {
                                const val = Math.min(l.maxReturn, currentQty + 1)
                                setQtyByLine((prev) => ({ ...prev, [l.inventoryId]: String(val) }))
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Motivo (Opcional) */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold text-muted-foreground">Motivo da Troca/Devolução (opcional)</Label>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: produto com defeito, tamanho incorreto, insatisfação..."
                    className="h-7 text-xs border-border bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                  />
                </div>

                {/* Carrinho da Nova Compra - Apenas se modo "troca" */}
                {mode === "troca" && (
                  <div className="space-y-3 pt-3 border-t border-border/80">
                    <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                      <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                      <h3 className="font-bold text-xs text-foreground">Carrinho da Nova Compra</h3>
                    </div>

                    {/* Busca Inline */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-muted-foreground">Buscar Novo Produto</Label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          ref={trocaBipeRef}
                          disabled={enviando}
                          value={trocaSearch}
                          onChange={(e) => setTrocaSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              bipeTrocaItem()
                            }
                          }}
                          aria-label="Bipe ou busca do novo produto"
                          placeholder="Bipe o código de barras ou busque por nome, SKU, ID..."
                          className="pl-8.5 h-7.5 text-xs border-border bg-background focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0"
                        />
                      </div>

                      {/* Resultados Inline */}
                      {trocaSearchResults.length > 0 && (
                        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden divide-y divide-border/60 max-h-40 overflow-y-auto shadow-inner mt-1">
                          {trocaSearchResults.map((p) => {
                            const isService = p.category === "Servicos"
                            const out = !isService && p.stock <= 0
                            return (
                              <button
                                key={p.id}
                                type="button"
                                disabled={out}
                                onClick={() => addTrocaItem(p)}
                                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-primary/5 transition-colors disabled:opacity-40"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-foreground">{p.name}</p>
                                  <p className="text-[9px] text-muted-foreground">
                                    {p.category} · {isService ? "Serviço" : out ? "Sem estoque" : `Estoque: ${p.stock}`}
                                  </p>
                                </div>
                                <span className="shrink-0 font-bold text-primary tabular-nums">{formatBrl(p.price)}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Mini-carrinho */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold text-muted-foreground">Itens da Nova Compra</Label>
                      {trocaCart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-3 border border-dashed border-border/80 rounded-lg bg-muted/10 text-center">
                          <ShoppingCart className="w-6 h-6 text-muted-foreground/45 mb-1" />
                          <p className="text-[11px] text-muted-foreground">Busque produtos acima para adicionar ao carrinho.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {trocaCart.map((l) => (
                            <div key={l.inventoryId} className="flex items-center justify-between gap-2 py-1 px-2.5 rounded-lg border border-border bg-background shadow-sm text-xs">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-foreground truncate">{l.name}</p>
                                <p className="text-[10px] text-muted-foreground">{formatBrl(l.unitPrice)} cada</p>
                              </div>
                              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-md">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 rounded-md hover:bg-muted"
                                  onClick={() => decTrocaItem(l.inventoryId)}
                                  disabled={enviando}
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                                <span className="w-5 text-center font-bold tabular-nums text-xs text-foreground">{l.quantity}</span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 rounded-md hover:bg-muted"
                                  onClick={() => incTrocaItem(l.inventoryId)}
                                  disabled={enviando}
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                              <div className="text-right w-16 shrink-0 font-bold tabular-nums text-foreground">
                                {formatBrl(l.unitPrice * l.quantity)}
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-md"
                                onClick={() => removeTrocaItem(l.inventoryId)}
                                disabled={enviando}
                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resumo Financeiro e Ações da Devolução (se modo NÃO troca) */}
                {mode !== "troca" && (
                  <div className="rounded-lg border border-border bg-muted/15 p-2.5 flex items-center justify-between gap-3 shadow-sm">
                    <div className="min-w-0">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">Total a Devolver</span>
                      <span className="font-extrabold text-lg text-foreground tabular-nums leading-none">{formatBrl(valorDevolvido)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {lastDevolucao && lastDevolucao.credit > 0 && (
                        <Button type="button" variant="outline" size="sm" className="rounded-md h-8.5 px-3 text-xs" onClick={() => void imprimirVale()}>
                          <Printer className="w-3.5 h-3.5 mr-1.5" />
                          Imprimir Comprovante
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold h-8.5 px-4 rounded-md text-xs"
                        onClick={() => { if (!kgReturnBlocked) void handleRegistrar() }}
                        disabled={kgReturnBlocked || enviando || valorDevolvido <= 0 || (mode === "devolucao" && REEMBOLSO_DINHEIRO_BLOQUEADO)}
                      >
                        {enviando ? "Confirmando…" : "Confirmar Devolução"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Resumo Financeiro da Troca Imediata */}
                {mode === "troca" && (
                  <div className="rounded-lg border border-border bg-muted/15 p-2.5 space-y-2 shadow-sm">
                    <div className="grid grid-cols-3 gap-2 text-center bg-background p-1.5 rounded border border-border/60">
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Devolvido</p>
                        <p className="font-extrabold text-xs text-foreground mt-0.5 tabular-nums">{formatBrl(valorDevolvido)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Nova Compra</p>
                        <p className="font-extrabold text-xs text-foreground mt-0.5 tabular-nums">{formatBrl(totalNovaCompra)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                          {diferenca > 0 ? "Diferença" : diferenca < 0 ? "Crédito" : "Saldo"}
                        </p>
                        <p
                          className={`font-extrabold text-xs mt-0.5 tabular-nums ${
                            diferenca > 0
                              ? "text-amber-600 dark:text-amber-400"
                              : diferenca < 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {formatBrl(Math.abs(diferenca))}
                        </p>
                      </div>
                    </div>

                    {/* Forma de pagamento da diferença */}
                    {diferenca > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-border/60">
                        <Label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wide">Forma de pagamento da diferença</Label>
                        <div className="grid grid-cols-4 gap-1">
                          {(["dinheiro", "pix", "debito", "credito"] as const).map((m) => (
                            <Button
                              key={m}
                              type="button"
                              size="sm"
                              variant={diffPayMethod === m ? "default" : "outline"}
                              onClick={() => setDiffPayMethod(m)}
                              className="capitalize text-[10px] h-7 border-border/80 px-1"
                            >
                              {m === "debito" ? "Débito" : m === "credito" ? "Crédito" : m}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Excesso devolvido — escolher destino */}
                    {creditoRestante > 0 && (
                      <div className="space-y-0.5 pt-1.5 border-t border-border/60" data-testid="troca-sobra-vale">
                        <p className="text-[11px] font-medium text-foreground">
                          Sobra de {formatBrl(creditoRestante)} fica como vale no CPF do cliente.
                        </p>
                        <p className="text-[10px] text-muted-foreground">{REEMBOLSO_BLOQUEADO_TEXTO}</p>
                      </div>
                    )}

                    {trocaRecovery && trocaRecovery.saleId === sale.id && (
                      <div role="status" className="rounded-md border border-primary/40 bg-primary/5 p-2 text-[11px] text-foreground">
                        Devolução <span className="font-mono font-semibold">{trocaRecovery.dev.localId}</span> já gravada — vale de{" "}
                        {formatBrl(trocaRecovery.dev.creditoEmitido)} salvo. Ajuste a nova compra e conclua: nenhuma devolução nova será criada.
                      </div>
                    )}

                    {/* Ações da Troca Imediata */}
                    <div className="pt-1.5 flex gap-1.5">
                      {lastDevolucao && lastDevolucao.credit > 0 && (
                        <Button type="button" size="sm" variant="outline" className="flex-1 h-8.5 border-border/80 text-xs" onClick={() => void imprimirVale()}>
                          <Printer className="w-3.5 h-3.5 mr-1.5" />
                          Imprimir
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        className="bg-primary hover:bg-primary/95 text-primary-foreground font-bold flex-1 h-8.5 text-xs"
                        onClick={() => { if (!kgReturnBlocked) void handleFinalizarTroca() }}
                        disabled={
                          kgReturnBlocked ||
                          enviando ||
                          trocaCart.length === 0 ||
                          (!(trocaRecovery && trocaRecovery.saleId === sale.id) && valorDevolvido <= 0)
                        }
                      >
                        {enviando
                          ? "Confirmando…"
                          : trocaRecovery && trocaRecovery.saleId === sale.id
                            ? "Concluir nova venda"
                            : "Finalizar Troca Imediata"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {cupomData && (
        <CupomTroca
          open={cupomOpen}
          onClose={() => setCupomOpen(false)}
          data={cupomData}
          nomeLoja={nomeLoja}
          onImprimirVale={() => void imprimirVale()}
        />
      )}
    </div>
  )
}

// ─── Cupom Troca/Devolução ────────────────────────────────────────────────
// Reaproveita o helper de impressão térmica (`openThermalHtmlPrint`) e o ESC/POS
// do vale (`buildValeTrocaEscPos`). Não substitui o `CupomNaoFiscal` da venda — é
// um comprovante operacional dedicado ao fluxo de troca.
function CupomTroca({
  open,
  onClose,
  data,
  nomeLoja,
  onImprimirVale,
}: {
  open: boolean
  onClose: () => void
  data: {
    tipo: "devolucao" | "vale_credito" | "troca" | "somente_estoque"
    /** localId da devolução (chave de negócio impressa no vale). */
    devolucaoId: string
    /** id técnico no servidor — ausente quando a devolução ainda está na fila offline. */
    devolucaoServerId?: string
    devolucaoPendente?: boolean
    vendaOrigemId: string
    novaVendaId?: string | null
    /** Nova venda gravada só localmente, aguardando sincronização. */
    novaVendaPendente?: boolean
    clienteNome: string
    clienteCpf: string
    operador: string
    itensDevolvidos: { nome: string; quantidade: number; valorTotal: number }[]
    itensNovos: { nome: string; quantidade: number; valorTotal: number }[]
    valorDevolvido: number
    totalNovaCompra: number
    creditoGerado: number
    creditoUtilizado: number
    saldoFinal: number
    diferencaPaga: number
    diferencaForma: string | null
    motivo: string
    at: string
  }
  nomeLoja: string
  onImprimirVale: () => void
}) {
  const { toast } = useToast()
  const tipoLabel =
    data.tipo === "troca"
      ? "TROCA IMEDIATA"
      : data.tipo === "vale_credito"
        ? "VALE-TROCA"
        : data.tipo === "somente_estoque"
          ? "DEVOLUÇÃO AO ESTOQUE"
          : "DEVOLUÇÃO"
  const dataLabel = new Date(data.at).toLocaleString("pt-BR")

  const copiarResumo = useCallback(() => {
    const linhas: string[] = [
      `${nomeLoja} — ${tipoLabel}`,
      `Data: ${dataLabel}`,
      `Operador: ${data.operador}`,
      `Venda origem: ${data.vendaOrigemId}`,
      data.novaVendaId ? `Nova venda: ${data.novaVendaId}` : "",
      `Cliente: ${data.clienteNome} (${data.clienteCpf})`,
      "",
      "ITENS DEVOLVIDOS",
      ...data.itensDevolvidos.map((i) => `  ${i.quantidade}× ${i.nome} — ${formatBrl(i.valorTotal)}`),
      `  Total devolvido: ${formatBrl(data.valorDevolvido)}`,
    ]
    if (data.itensNovos.length > 0) {
      linhas.push("", "ITENS NOVOS")
      linhas.push(...data.itensNovos.map((i) => `  ${i.quantidade}× ${i.nome} — ${formatBrl(i.valorTotal)}`))
      linhas.push(`  Total nova compra: ${formatBrl(data.totalNovaCompra)}`)
    }
    linhas.push("")
    if (data.creditoGerado > 0) linhas.push(`Crédito gerado: ${formatBrl(data.creditoGerado)}`)
    if (data.creditoUtilizado > 0) linhas.push(`Crédito utilizado: ${formatBrl(data.creditoUtilizado)}`)
    if (data.diferencaPaga > 0) linhas.push(`Diferença paga: ${formatBrl(data.diferencaPaga)} (${data.diferencaForma ?? "—"})`)
    if (data.saldoFinal > 0) linhas.push(`Saldo final em haver: ${formatBrl(data.saldoFinal)}`)
    if (data.motivo) linhas.push("", `Motivo: ${data.motivo}`)
    if (data.novaVendaPendente) linhas.push("Nova venda pendente de sincronização")
    if (data.devolucaoPendente) linhas.push("Devolução pendente de sincronização")
    linhas.push("", `ID devolução: ${data.devolucaoId}${data.devolucaoServerId ? ` · servidor ${data.devolucaoServerId}` : ""}`)
    const texto = linhas.filter((l) => l !== null).join("\n")
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(texto).then(
        () => toast({ title: "Resumo copiado", description: "Cole onde precisar." }),
        () => toast({ title: "Falha ao copiar", variant: "destructive" }),
      )
    }
  }, [data, nomeLoja, tipoLabel, dataLabel, toast])

  const imprimirHtml = useCallback(() => {
    const esc = (s: string) => escapeHtml(s)
    const linhasDev = data.itensDevolvidos
      .map((i) => `<tr><td>${esc(i.nome)}</td><td style="text-align:right">${i.quantidade}</td><td style="text-align:right">${formatBrl(i.valorTotal)}</td></tr>`)
      .join("")
    const linhasNovos = data.itensNovos
      .map((i) => `<tr><td>${esc(i.nome)}</td><td style="text-align:right">${i.quantidade}</td><td style="text-align:right">${formatBrl(i.valorTotal)}</td></tr>`)
      .join("")
    openThermalHtmlPrint(
      `
      <div style="text-align:center;font-weight:700">${esc(nomeLoja)}</div>
      <div style="text-align:center;font-size:11px;margin:2px 0">${esc(tipoLabel)}</div>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p style="margin:2px 0;font-size:11px">Data: ${esc(dataLabel)}</p>
      <p style="margin:2px 0;font-size:11px">Operador: ${esc(data.operador)}</p>
      <p style="margin:2px 0;font-size:11px">Venda origem: ${esc(data.vendaOrigemId)}</p>
      ${data.novaVendaId ? `<p style="margin:2px 0;font-size:11px">Nova venda: ${esc(data.novaVendaId)}${data.novaVendaPendente ? " (pendente de sincronização)" : ""}</p>` : ""}
      ${data.devolucaoPendente ? `<p style="margin:2px 0;font-size:11px">Devolução pendente de sincronização</p>` : ""}
      <p style="margin:2px 0;font-size:11px">Cliente: ${esc(data.clienteNome)} (${esc(data.clienteCpf)})</p>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <p style="font-weight:700;margin:4px 0">Itens devolvidos</p>
      <table style="width:100%;font-size:11px;border-collapse:collapse">${linhasDev}</table>
      <p style="text-align:right;margin:4px 0">Total devolvido: <strong>${formatBrl(data.valorDevolvido)}</strong></p>
      ${
        data.itensNovos.length > 0
          ? `<div style="border-top:1px dashed #000;margin:6px 0"></div>
             <p style="font-weight:700;margin:4px 0">Itens novos</p>
             <table style="width:100%;font-size:11px;border-collapse:collapse">${linhasNovos}</table>
             <p style="text-align:right;margin:4px 0">Total nova compra: <strong>${formatBrl(data.totalNovaCompra)}</strong></p>`
          : ""
      }
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      ${data.creditoGerado > 0 ? `<p style="margin:2px 0">Crédito gerado: ${formatBrl(data.creditoGerado)}</p>` : ""}
      ${data.creditoUtilizado > 0 ? `<p style="margin:2px 0">Crédito utilizado: ${formatBrl(data.creditoUtilizado)}</p>` : ""}
      ${data.diferencaPaga > 0 ? `<p style="margin:2px 0">Diferença paga: ${formatBrl(data.diferencaPaga)} (${esc(data.diferencaForma ?? "—")})</p>` : ""}
      ${data.saldoFinal > 0 ? `<p style="margin:2px 0"><strong>Saldo em haver: ${formatBrl(data.saldoFinal)}</strong></p>` : ""}
      ${data.motivo ? `<p style="margin:6px 0 2px 0;font-size:11px">Motivo: ${esc(data.motivo)}</p>` : ""}
      <p style="margin:6px 0 0 0;font-size:10px;color:#555">ID devolução: ${esc(data.devolucaoId)}${data.devolucaoServerId ? ` · servidor ${esc(data.devolucaoServerId)}` : ""}</p>
      `,
      tipoLabel,
    )
  }, [data, nomeLoja, tipoLabel, dataLabel])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-primary" />
            Comprovante — {tipoLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm">
          <div className="space-y-1 text-center">
            <p className="font-semibold">{nomeLoja}</p>
            <p className="text-xs text-muted-foreground">{tipoLabel}</p>
            <p className="text-xs text-muted-foreground">{dataLabel}</p>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Operador</p>
              <p className="font-medium">{data.operador}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Venda origem</p>
              <p className="font-mono font-medium">{data.vendaOrigemId}</p>
            </div>
            {data.novaVendaId && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Nova venda</p>
                <p className="font-mono font-medium">
                  {data.novaVendaId}
                  {data.novaVendaPendente ? <span className="ml-1 font-sans text-xs text-muted-foreground">(pendente de sincronização)</span> : null}
                </p>
              </div>
            )}
            {data.devolucaoPendente && (
              <div className="col-span-2" role="status">
                <p className="font-medium text-foreground">Devolução pendente de sincronização — validada pelo servidor ao reconectar.</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-muted-foreground">Cliente</p>
              <p className="font-medium">
                {data.clienteNome} <span className="text-xs text-muted-foreground">({data.clienteCpf})</span>
              </p>
            </div>
          </div>

          <Separator className="my-3" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens devolvidos</p>
          <div className="mt-1 space-y-1">
            {data.itensDevolvidos.map((i, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span>{i.quantidade}× {i.nome}</span>
                <span className="font-medium">{formatBrl(i.valorTotal)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 text-xs">
              <span className="text-muted-foreground">Total devolvido</span>
              <span className="font-semibold">{formatBrl(data.valorDevolvido)}</span>
            </div>
          </div>

          {data.itensNovos.length > 0 && (
            <>
              <Separator className="my-3" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens novos</p>
              <div className="mt-1 space-y-1">
                {data.itensNovos.map((i, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span>{i.quantidade}× {i.nome}</span>
                    <span className="font-medium">{formatBrl(i.valorTotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 text-xs">
                  <span className="text-muted-foreground">Total nova compra</span>
                  <span className="font-semibold">{formatBrl(data.totalNovaCompra)}</span>
                </div>
              </div>
            </>
          )}

          <Separator className="my-3" />
          <div className="space-y-1 text-xs">
            {data.creditoGerado > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crédito gerado</span>
                <span className="font-medium">{formatBrl(data.creditoGerado)}</span>
              </div>
            )}
            {data.creditoUtilizado > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crédito utilizado</span>
                <span className="font-medium">{formatBrl(data.creditoUtilizado)}</span>
              </div>
            )}
            {data.diferencaPaga > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diferença paga ({data.diferencaForma ?? "—"})</span>
                <span className="font-medium">{formatBrl(data.diferencaPaga)}</span>
              </div>
            )}
            {data.saldoFinal > 0 && (
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-semibold">Saldo em haver</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatBrl(data.saldoFinal)}</span>
              </div>
            )}
          </div>

          {data.motivo && (
            <>
              <Separator className="my-3" />
              <p className="text-xs text-muted-foreground">Motivo: {data.motivo}</p>
            </>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground">
            ID: {data.devolucaoId}
            {data.devolucaoServerId ? ` · servidor ${data.devolucaoServerId}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <Button type="button" size="sm" onClick={imprimirHtml}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir
          </Button>
          {data.creditoGerado > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={onImprimirVale}>
              Imprimir vale 80mm
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={copiarResumo}>
            <Search className="mr-2 h-4 w-4" /> Copiar resumo
          </Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const CATEGORIA_TEXTO: Record<PendenciaDevolucao["categoria"], string> = {
  DINHEIRO_ENTREGUE: "reembolso em dinheiro já entregue",
  VALE_EMITIDO: "vale local emitido",
  INTENCAO_SEM_EFEITO: "sem efeito financeiro",
}

const ESTADO_TEXTO: Record<PendenciaDevolucao["estado"], string> = {
  AGUARDANDO_SINCRONIZACAO: "Na fila",
  AGUARDANDO_VENDA_ORIGEM: "Aguardando venda de origem",
  BLOQUEIO_PERSISTENTE: "Bloqueio persistente",
  RECUSA_DEFINITIVA: "Recusada",
  ENCAMINHADA_FINANCEIRO: "Encaminhada ao Financeiro",
}

/**
 * Pendências de devolução DESTE terminal. Ações: retomada controlada (mesmo localId) e
 * encaminhamento supervisionado ao Financeiro — registro auditável, nunca lançamento.
 */
function PainelPendenciasDevolucao({
  pendencias,
  justificativas,
  onJustificativa,
  onRetomar,
  onEncaminhar,
  encaminhando,
}: {
  pendencias: PendenciaDevolucao[]
  justificativas: Record<string, string>
  onJustificativa: (id: string, v: string) => void
  onRetomar: (id: string) => void
  onEncaminhar: (p: PendenciaDevolucao) => void
  encaminhando: string | null
}) {
  const manuais = pendencias.filter((p) => p.exigeConciliacaoManual).length
  return (
    <div role="alert" data-testid="devolucoes-pendencias" className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-xs text-foreground space-y-2 min-w-0">
      <p className="font-semibold">
        {pendencias.length === 1 ? "1 devolução deste terminal" : `${pendencias.length} devoluções deste terminal`} sem confirmação definitiva do servidor
        {manuais > 0 ? ` · ${manuais} exige(m) conciliação manual` : ""}
      </p>
      {pendencias.slice(0, 8).map((p) => {
        const podeRetomar = p.estado === "BLOQUEIO_PERSISTENTE" || p.estado === "AGUARDANDO_VENDA_ORIGEM"
        const podeEncaminhar =
          p.estado === "BLOQUEIO_PERSISTENTE" || (p.estado === "RECUSA_DEFINITIVA" && p.categoria !== "INTENCAO_SEM_EFEITO")
        return (
          <div key={p.dev.id} data-testid="pendencia-devolucao" data-estado={p.estado} className="rounded-md border border-border bg-background p-2 space-y-1 min-w-0">
            <p className="min-w-0 break-words">
              <span className="font-semibold">{ESTADO_TEXTO[p.estado]}</span> · <span className="font-mono">{p.dev.id}</span> · venda{" "}
              <span className="font-mono">{p.dev.saleId}</span> · {CATEGORIA_TEXTO[p.categoria]}
              {p.valorDeclarado > 0 ? ` (${formatBrl(p.valorDeclarado)})` : ""}
            </p>
            <p className="text-muted-foreground break-words">{p.motivo}</p>
            {p.dev.conciliacao && (
              <p className="text-muted-foreground">
                Ref. <span className="font-mono">{p.dev.conciliacao.ref}</span> · {p.dev.conciliacao.operador}
              </p>
            )}
            {p.categoria === "DINHEIRO_ENTREGUE" && p.estado !== "ENCAMINHADA_FINANCEIRO" && (
              <p className="text-destructive">Dinheiro já entregue sem lançamento: encaminhe ao Financeiro. Nenhuma saída é criada automaticamente.</p>
            )}
            {(podeRetomar || podeEncaminhar) && (
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {podeRetomar && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={encaminhando !== null}
                    onClick={() => onRetomar(p.dev.id)}
                  >
                    Tentar novamente
                  </Button>
                )}
                {podeEncaminhar && (
                  <>
                    <Input
                      aria-label={`Justificativa da pendência ${p.dev.id}`}
                      placeholder="Justificativa (o que o cliente recebeu)"
                      className="h-7 text-xs flex-1 min-w-0"
                      value={justificativas[p.dev.id] ?? ""}
                      onChange={(e) => onJustificativa(p.dev.id, e.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={encaminhando !== null}
                      onClick={() => onEncaminhar(p)}
                    >
                      {encaminhando === p.dev.id ? "Encaminhando…" : "Encaminhar ao Financeiro"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Código de barras, SKU, código interno ou ID exatos (sem diferenciar caixa). */
export function findExactTrocaItem(inventory: InventoryItem[], raw: string): InventoryItem | null {
  const q = raw.trim().toLowerCase()
  if (!q) return null
  const digits = q.replace(/\D/g, "")
  return (
    inventory.find(
      (i) =>
        (i.barcode != null && (i.barcode.trim().toLowerCase() === q || (digits.length >= 6 && i.barcode.replace(/\D/g, "") === digits))) ||
        (i.sku != null && i.sku.trim().toLowerCase() === q) ||
        (i.codigo != null && String(i.codigo).trim().toLowerCase() === q) ||
        i.id.toLowerCase() === q ||
        (i.dbId != null && i.dbId.toLowerCase() === q),
    ) ?? null
  )
}

function formatBrl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

