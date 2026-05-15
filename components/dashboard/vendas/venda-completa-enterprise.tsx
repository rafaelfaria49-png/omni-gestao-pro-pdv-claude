"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  Loader2,
  MapPin,
  Minus,
  PackageSearch,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { configPadrao } from "@/lib/config-empresa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { useOperationsStore } from "@/lib/operations-store"
import { getOrCreatePdvOperatorId } from "@/lib/pdv-operator-id"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { newPdvLineId, type PdvCatalogProduct } from "@/lib/pdv-catalog"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { appendContaReceberTituloPdvAprazo } from "@/lib/pdv-append-conta-receber"
import { appendAuditLog } from "@/lib/audit-log"
import { useClienteSearch } from "@/lib/hooks/use-cliente-search"
import { enrichVendaEnterprise } from "@/app/actions/vendas-enterprise"
import {
  PaymentModal,
  type PaymentMethod,
  type PaymentMethodType,
} from "./payment-modal"
import { CupomNaoFiscal, type CupomData } from "./cupom-nao-fiscal"

// ── Types ──────────────────────────────────────────────────────────────────────

type ClienteResult = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  document?: string | null
}

type TipoVenda = "comum" | "garantia" | "a_prazo" | "orcamento"

const TIPOS_VENDA: { value: TipoVenda; label: string }[] = [
  { value: "comum",     label: "Venda Comum" },
  { value: "garantia",  label: "Com Garantia" },
  { value: "a_prazo",   label: "A Prazo" },
  { value: "orcamento", label: "Orçamento Conv." },
]

type EnderecoEntrega = {
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}

const EMPTY_ENDERECO: EnderecoEntrega = {
  logradouro: "", numero: "", bairro: "", cidade: "", uf: "", cep: "",
}

type LineDetail = {
  imei?: string
  serial?: string
  garantiaDias?: number
  observacao?: string
}

type CartLine = {
  lineId: string
  inventoryId: string
  name: string
  price: number
  qty: number
  detail?: LineDetail
}

type DraftData = {
  cliente: ClienteResult | null
  cart: CartLine[]
  discountReais: number
  discountPercent: number
  tipoVenda?: TipoVenda
  observacaoGeral?: string
  enderecoEntrega?: EnderecoEntrega
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DRAFT_KEY = (storeId: string) => `omnigestao:venda-completa-ent:${storeId}`

// ── Helpers ────────────────────────────────────────────────────────────────────

const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

function paymentLabel(type: PaymentMethodType): string {
  const labels: Record<PaymentMethodType, string> = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    cartao_debito: "Débito",
    cartao_credito: "Crédito",
    carne: "Carnê",
    a_prazo: "A prazo",
    credito_vale: "Crédito/Vale",
  }
  return labels[type] ?? type
}

// ── Component ──────────────────────────────────────────────────────────────────

export function VendaCompletaEnterprise({ onBack }: { onBack: () => void }) {
  const { inventory, finalizeSaleTransaction, getSaldoCreditoCliente } = useOperationsStore()
  const { empresaDocumentos, lojaAtivaId } = useLojaAtiva()
  const { pdvParams } = useStoreSettings()
  const { toast } = useToast()
  const cashierId = useMemo(() => getOrCreatePdvOperatorId(), [])

  const storeId = useMemo(
    () => (lojaAtivaId || LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID,
    [lojaAtivaId],
  )

  // ── Cliente ──────────────────────────────────────────────────────────────
  const [clienteQuery, setClienteQuery] = useState("")
  const { clientes: clienteResultados, isLoading: clienteLoading } = useClienteSearch(clienteQuery, storeId)
  const [selectedCliente, setSelectedCliente] = useState<ClienteResult | null>(null)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [showEnderecoForm, setShowEnderecoForm] = useState(false)
  const [enderecoEntrega, setEnderecoEntrega] = useState<EnderecoEntrega>(EMPTY_ENDERECO)
  const clienteInputRef = useRef<HTMLInputElement>(null)

  // ── Produtos ──────────────────────────────────────────────────────────────
  const [productQuery, setProductQuery] = useState("")
  const productInputRef = useRef<HTMLInputElement>(null)

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([])
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null)

  // ── Desconto ──────────────────────────────────────────────────────────────
  const [discountReais, setDiscountReais] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)

  // ── Pagamento / Cupom ─────────────────────────────────────────────────────
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [cupomOpen, setCupomOpen] = useState(false)
  const [cupomData, setCupomData] = useState<CupomData | null>(null)

  // ── Dados da venda ────────────────────────────────────────────────────────
  const [tipoVenda, setTipoVenda] = useState<TipoVenda>("comum")
  const [observacaoGeral, setObservacaoGeral] = useState("")
  const [helpOpen, setHelpOpen] = useState(false)

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const products = useMemo((): PdvCatalogProduct[] => {
    if (!Array.isArray(inventory) || inventory.length === 0) return []
    return inventory.map((inv) => {
      const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
      return {
        id: inv.id,
        name: inv.name,
        barcode: inv.barcode,
        dbId: inv.dbId,
        sku: inv.sku,
        codigo: inv.codigo ?? inv.sku ?? inv.id,
        codigoBarras: inv.codigoBarras ?? inv.barcode,
        price: unit,
        stock: inv.stock,
        category: inv.category ?? "Outros",
        vendaPorPeso: inv.vendaPorPeso,
        precoPorKg: inv.precoPorKg,
        atributos: inv.atributos,
      }
    })
  }, [inventory])

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim()
    if (!q) return []
    return filterPdvCatalogBySearch(products, q).slice(0, 12)
  }, [products, productQuery])

  // ── Totais ────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const total = Math.max(0, subtotal - discountReais)
  const customerStoreCredit = useMemo(
    () => (selectedCliente?.document ? getSaldoCreditoCliente(selectedCliente.document) : 0),
    [selectedCliente, getSaldoCreditoCliente],
  )
  const canFinalize = selectedCliente !== null && cart.length > 0 && total > 0

  // ── Draft restore ─────────────────────────────────────────────────────────
  const hasDraftRestored = useRef(false)
  useEffect(() => {
    if (hasDraftRestored.current) return
    if (!Array.isArray(inventory) || inventory.length === 0) return
    hasDraftRestored.current = true
    try {
      const raw = localStorage.getItem(DRAFT_KEY(storeId))
      if (!raw) return
      const draft = JSON.parse(raw) as DraftData
      const validCart = (draft.cart ?? []).filter((l) =>
        inventory.some((i) => i.id === l.inventoryId),
      )
      if (validCart.length > 0) {
        setCart(validCart)
        if ((draft.discountReais ?? 0) > 0) setDiscountReais(draft.discountReais)
        if ((draft.discountPercent ?? 0) > 0) setDiscountPercent(draft.discountPercent)
        if (draft.cliente) setSelectedCliente(draft.cliente)
        if (draft.tipoVenda) setTipoVenda(draft.tipoVenda)
        if (draft.observacaoGeral) setObservacaoGeral(draft.observacaoGeral)
        if (draft.enderecoEntrega) setEnderecoEntrega(draft.enderecoEntrega)
        toast({
          title: "Rascunho restaurado",
          description: `${validCart.length} ite${validCart.length === 1 ? "m" : "ns"} recuperado${validCart.length === 1 ? "" : "s"}.`,
        })
      }
    } catch {
      /* ignore malformed draft */
    }
  }, [inventory, storeId, toast])

  // ── Draft save ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasDraftRestored.current) return
    try {
      if (cart.length > 0 || selectedCliente) {
        const draft: DraftData = {
          cliente: selectedCliente,
          cart,
          discountReais,
          discountPercent,
          tipoVenda,
          observacaoGeral,
          enderecoEntrega,
        }
        localStorage.setItem(DRAFT_KEY(storeId), JSON.stringify(draft))
      } else {
        localStorage.removeItem(DRAFT_KEY(storeId))
      }
    } catch {
      /* ignore quota errors */
    }
  }, [selectedCliente, cart, discountReais, discountPercent, tipoVenda, observacaoGeral, enderecoEntrega, storeId])

  // ── Mount focus ───────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => clienteInputRef.current?.focus(), 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "F1":
          e.preventDefault()
          if (canFinalize && !isPaymentOpen && !cupomOpen && !helpOpen) {
            setIsPaymentOpen(true)
          }
          break
        case "F2":
          e.preventDefault()
          if (selectedCliente) {
            setSelectedCliente(null)
            setClienteQuery("")
            setEnderecoEntrega(EMPTY_ENDERECO)
            setShowEnderecoForm(false)
            setTimeout(() => clienteInputRef.current?.focus(), 50)
          } else {
            clienteInputRef.current?.focus()
          }
          break
        case "F3":
          e.preventDefault()
          productInputRef.current?.focus()
          break
        case "End":
          e.preventDefault()
          if (!isPaymentOpen && !cupomOpen) setHelpOpen((o) => !o)
          break
        case "Escape":
          if (helpOpen) {
            e.preventDefault()
            setHelpOpen(false)
          }
          break
      }
    },
    [canFinalize, selectedCliente, isPaymentOpen, cupomOpen, helpOpen],
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (product: PdvCatalogProduct) => {
      const isService = product.category === "Servicos"
      if (!isService && product.stock <= 0) {
        toast({ title: "Sem estoque", description: `${product.name} está sem estoque.`, variant: "destructive" })
        return
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.inventoryId === product.id)
        if (existing) {
          return prev.map((l) => l.inventoryId === product.id ? { ...l, qty: l.qty + 1 } : l)
        }
        const garantiaDias = pdvParams.garantiaPadraoDias ?? 0
        return [
          ...prev,
          {
            lineId: newPdvLineId(product.id),
            inventoryId: product.id,
            name: product.name,
            price: product.price,
            qty: 1,
            detail: garantiaDias > 0 ? { garantiaDias } : undefined,
          },
        ]
      })
      setProductQuery("")
    },
    [pdvParams.garantiaPadraoDias, toast],
  )

  function updateQty(lineId: string, delta: number) {
    if (delta > 0) {
      const line = cart.find((l) => l.lineId === lineId)
      if (line) {
        const invItem = inventory.find((i) => i.id === line.inventoryId)
        const isService = invItem?.category === "Servicos"
        if (!isService && invItem && line.qty >= invItem.stock) {
          toast({
            title: "Estoque máximo atingido",
            description: `${line.name}: apenas ${invItem.stock} un disponíve${invItem.stock === 1 ? "l" : "is"}.`,
            variant: "destructive",
          })
          return
        }
      }
    }
    setCart((prev) =>
      prev.map((l) => l.lineId === lineId ? { ...l, qty: l.qty + delta } : l).filter((l) => l.qty > 0),
    )
  }

  function removeFromCart(lineId: string) {
    setCart((prev) => prev.filter((l) => l.lineId !== lineId))
    if (expandedLineId === lineId) setExpandedLineId(null)
  }

  function updateLineDetail(lineId: string, patch: Partial<LineDetail>) {
    setCart((prev) =>
      prev.map((l) => l.lineId === lineId ? { ...l, detail: { ...l.detail, ...patch } } : l),
    )
  }

  // ── Finalization ──────────────────────────────────────────────────────────
  function handleConfirmPayment(
    payments: PaymentMethod[],
    meta?: {
      cashierId?: string
      discountAuthorizedByAdminId?: string
      discountReais?: number
      discountPercent?: number
    },
  ) {
    const saleLines = cart
      .filter((l) => inventory.some((i) => i.id === l.inventoryId))
      .map((l) => ({ inventoryId: l.inventoryId, quantity: l.qty, unitPrice: l.price, name: l.name }))

    if (saleLines.length === 0) {
      toast({ title: "Carrinho vazio", description: "Adicione itens antes de finalizar.", variant: "destructive" })
      return
    }

    let dinheiro = 0, pix = 0, cartaoDebito = 0, cartaoCredito = 0, carne = 0, aPrazo = 0, creditoVale = 0
    for (const p of payments) {
      if (p.type === "dinheiro") dinheiro += p.value
      else if (p.type === "pix") pix += p.value
      else if (p.type === "cartao_debito") cartaoDebito += p.value
      else if (p.type === "cartao_credito") cartaoCredito += p.value
      else if (p.type === "carne") carne += p.value
      else if (p.type === "a_prazo") aPrazo += p.value
      else if (p.type === "credito_vale") creditoVale += p.value
    }

    const result = finalizeSaleTransaction({
      lines: saleLines,
      total,
      paymentBreakdown: { dinheiro, pix, cartaoDebito, cartaoCredito, carne, aPrazo, creditoVale },
      auditMeta: {
        cashierId: meta?.cashierId ?? cashierId,
        discountAuthorizedByAdminId: meta?.discountAuthorizedByAdminId,
        discountReais: meta?.discountReais ?? discountReais,
        discountPercent: meta?.discountPercent ?? discountPercent,
      },
      customerCpf: selectedCliente?.document ?? undefined,
      customerName: selectedCliente?.name,
    })

    if (!result.ok) {
      toast({ title: "Falha transacional", description: result.reason, variant: "destructive" })
      return
    }

    if (aPrazo > 0.02 && selectedCliente) {
      appendContaReceberTituloPdvAprazo({
        lojaId: storeId,
        saleId: result.saleId,
        clienteNome: selectedCliente.name,
        valor: aPrazo,
      })
    }

    appendAuditLog({
      action: "sale_finalized",
      userLabel: (empresaDocumentos.nomeFantasia || "Loja").trim(),
      detail: `Venda Completa Enterprise ${result.saleId} | Cliente: ${selectedCliente?.name ?? "—"} | Total ${brl(total)}`,
    })

    const linhasDetalhe = cart
      .filter((l) => l.detail && Object.values(l.detail).some(Boolean))
      .map((l) => ({
        inventoryId: l.inventoryId,
        nome: l.name,
        imei: l.detail?.imei,
        serial: l.detail?.serial,
        garantiaDias: l.detail?.garantiaDias,
        observacao: l.detail?.observacao,
      }))

    void enrichVendaEnterprise({
      pedidoId: result.saleId,
      storeId,
      clienteId: selectedCliente?.id,
      clienteNome: selectedCliente?.name,
      clienteDocument: selectedCliente?.document ?? undefined,
      clienteTelefone: selectedCliente?.phone ?? undefined,
      clienteEmail: selectedCliente?.email ?? undefined,
      observacoesVenda: observacaoGeral || undefined,
      tipoVenda,
      enderecoEntrega: Object.values(enderecoEntrega).some((v) => v.trim() !== "")
        ? enderecoEntrega
        : undefined,
      linhasDetalhe,
    }).catch(() => {})

    const storeDisplayName =
      (empresaDocumentos.nomeFantasia || configPadrao.empresa.nomeFantasia || "Loja").trim() || "Loja"

    const tipoVendaLabel = TIPOS_VENDA.find((t) => t.value === tipoVenda)?.label
    const cupom: CupomData = {
      numeroPedido: result.saleId,
      at: new Date().toISOString(),
      lojaNome: storeDisplayName,
      clienteNome: selectedCliente?.name ?? null,
      clienteCpf: selectedCliente?.document ?? null,
      operador: cashierId,
      tipoVenda: tipoVenda !== "comum" ? tipoVendaLabel : undefined,
      observacaoGeral: observacaoGeral || undefined,
      itens: cart.map((l) => ({
        nome: l.name,
        quantidade: l.qty,
        precoUnitario: l.price,
        lineTotal: Math.round(l.price * l.qty * 100) / 100,
      })),
      pagamentos: payments.map((p) => ({ label: paymentLabel(p.type), valor: p.value })),
      total,
      desconto: discountReais > 0 ? discountReais : undefined,
    }

    setCupomData(cupom)
    setIsPaymentOpen(false)
    setCupomOpen(true)

    try { localStorage.removeItem(DRAFT_KEY(storeId)) } catch {}

    setCart([])
    setDiscountReais(0)
    setDiscountPercent(0)
    setSelectedCliente(null)
    setClienteQuery("")
    setExpandedLineId(null)
    setTipoVenda("comum")
    setObservacaoGeral("")
    setEnderecoEntrega(EMPTY_ENDERECO)
    setShowEnderecoForm(false)
  }

  const paymentModalCustomer = selectedCliente
    ? { id: selectedCliente.id, name: selectedCliente.name, cpf: selectedCliente.document ?? "", phone: selectedCliente.phone ?? "" }
    : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-foreground">
                Venda Completa Enterprise
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {selectedCliente
                  ? `${selectedCliente.name} · Op: ${cashierId.slice(-6)}`
                  : `Op: ${cashierId.slice(-6)} — Identifique o cliente`}
              </p>
            </div>
          </div>

          {cart.length > 0 && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {cart.reduce((s, l) => s + l.qty, 0)}{" "}
              {cart.reduce((s, l) => s + l.qty, 0) === 1 ? "item" : "itens"}
            </Badge>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setHelpOpen(true)}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title="Atalhos de teclado [END]"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Body (scrollável) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-0 divide-y divide-border">

          {/* ── SEÇÃO: CLIENTE ── */}
          <section className="bg-background px-4 py-4">
            <div className="mb-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente <span className="text-destructive">*</span>
              </span>
            </div>

            {selectedCliente ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {selectedCliente.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[selectedCliente.phone?.trim() || null, selectedCliente.email?.trim() || null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedCliente(null)
                      setClienteQuery("")
                      setEnderecoEntrega(EMPTY_ENDERECO)
                      setShowEnderecoForm(false)
                      setTimeout(() => clienteInputRef.current?.focus(), 50)
                    }}
                    className="ml-2 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Endereço de entrega */}
                <button
                  type="button"
                  onClick={() => setShowEnderecoForm((o) => !o)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/70"
                >
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Endereço de entrega
                    {Object.values(enderecoEntrega).some((v) => v.trim() !== "") && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </span>
                  {showEnderecoForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showEnderecoForm && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { key: "cep",       label: "CEP",        placeholder: "00000-000", maxLength: 9, colSpan: "" },
                        { key: "numero",    label: "Número",     placeholder: "Nº",        maxLength: undefined, colSpan: "" },
                        { key: "logradouro",label: "Logradouro", placeholder: "Rua, Av…",  maxLength: undefined, colSpan: "col-span-2 sm:col-span-3" },
                        { key: "bairro",    label: "Bairro",     placeholder: "Bairro",    maxLength: undefined, colSpan: "" },
                        { key: "cidade",    label: "Cidade",     placeholder: "Cidade",    maxLength: undefined, colSpan: "" },
                        { key: "uf",        label: "UF",         placeholder: "SP",        maxLength: 2,         colSpan: "" },
                      ] as { key: keyof EnderecoEntrega; label: string; placeholder: string; maxLength?: number; colSpan: string }[]
                    ).map(({ key, label, placeholder, maxLength, colSpan }) => (
                      <div key={key} className={cn("space-y-1", colSpan)}>
                        <Label className="text-[11px] text-muted-foreground">{label}</Label>
                        <Input
                          placeholder={placeholder}
                          value={enderecoEntrega[key]}
                          maxLength={maxLength}
                          onChange={(e) =>
                            setEnderecoEntrega((prev) => ({
                              ...prev,
                              [key]: key === "uf" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value,
                            }))
                          }
                          className="h-8 border-border bg-background text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  {clienteLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                  <Input
                    ref={clienteInputRef}
                    placeholder="Nome, CPF ou telefone… [F2]"
                    value={clienteQuery}
                    onChange={(e) => {
                      setClienteQuery(e.target.value)
                      setShowClienteDropdown(true)
                    }}
                    onFocus={() => { if (clienteQuery.trim()) setShowClienteDropdown(true) }}
                    onBlur={() => setTimeout(() => setShowClienteDropdown(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setShowClienteDropdown(false); setClienteQuery("") }
                      if (e.key === "Enter" && clienteResultados.length > 0) {
                        e.preventDefault()
                        const c = clienteResultados[0]!
                        setSelectedCliente(c)
                        setClienteQuery("")
                        setShowClienteDropdown(false)
                        setTimeout(() => productInputRef.current?.focus(), 80)
                      }
                    }}
                    className="h-10 border-border bg-secondary pl-9 pr-9 text-sm"
                  />
                </div>
                {showClienteDropdown && (clienteResultados.length > 0 || clienteLoading) && (
                  <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
                    {clienteLoading && clienteResultados.length === 0 ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Buscando…
                      </div>
                    ) : (
                      clienteResultados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0 hover:bg-secondary"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedCliente(c)
                            setClienteQuery("")
                            setShowClienteDropdown(false)
                            setTimeout(() => productInputRef.current?.focus(), 80)
                          }}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{c.phone ?? ""}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── SEÇÃO: PRODUTOS ── */}
          <section className="bg-background px-4 py-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Produtos
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productInputRef}
                placeholder="Nome, SKU ou código de barras… [F3]"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const exact = findPdvProductByScan(productQuery.trim(), products)
                    if (exact) {
                      addToCart(exact)
                    } else if (filteredProducts.length === 1) {
                      addToCart(filteredProducts[0]!)
                    }
                  }
                }}
                className="h-10 border-border bg-secondary pl-9 text-sm"
              />
            </div>

            {filteredProducts.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {filteredProducts.map((p) => {
                  const isService = p.category === "Servicos"
                  const outOfStock = !isService && p.stock <= 0
                  const lowStock = !isService && !outOfStock && p.stock > 0 && p.stock <= 5
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(p)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border bg-card px-3 py-2.5 text-left transition-all active:scale-[0.98]",
                        outOfStock
                          ? "cursor-not-allowed border-border opacity-50"
                          : lowStock
                            ? "border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/5"
                            : "border-border hover:border-primary/40 hover:bg-accent",
                      )}
                    >
                      <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                        {p.name}
                      </p>
                      <div className="flex w-full items-center justify-between gap-1">
                        <span
                          className={cn(
                            "text-[10px]",
                            outOfStock ? "text-destructive/70" : lowStock ? "font-medium text-amber-500" : "text-muted-foreground",
                          )}
                        >
                          {isService ? "Serviço" : outOfStock ? "Sem estoque" : lowStock ? `Baixo: ${p.stock} un` : `${p.stock} un`}
                        </span>
                        <span className="text-xs font-bold tabular-nums text-primary">{brl(p.price)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {products.length === 0 && !productQuery && (
              <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-6 text-center">
                <PackageSearch className="mb-1.5 h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs font-medium text-muted-foreground">Nenhum produto cadastrado</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">Cadastre itens no módulo Estoque</p>
              </div>
            )}

            {filteredProducts.length === 0 && productQuery.trim() && products.length > 0 && (
              <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-4 text-center">
                <Search className="mb-1 h-5 w-5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Nenhum resultado para &ldquo;{productQuery}&rdquo;
                </p>
              </div>
            )}
          </section>

          {/* ── SEÇÃO: CARRINHO (tabela) ── */}
          <section className="bg-background px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Carrinho
                </span>
                {cart.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {cart.length} linha{cart.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => { setCart([]); setExpandedLineId(null) }}
                >
                  Limpar tudo
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
                <Receipt className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">Nenhum item no carrinho</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">
                  Busque um produto acima para adicionar
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                        Produto
                      </th>
                      <th className="w-28 px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
                        Qtd
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                        Unit
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                        Total
                      </th>
                      <th className="w-20 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cart.map((line) => {
                      const isExpanded = expandedLineId === line.lineId
                      const hasDetail =
                        line.detail &&
                        (line.detail.imei || line.detail.serial || line.detail.garantiaDias || line.detail.observacao)

                      return (
                        <>
                          <tr key={line.lineId} className="bg-card">
                            <td className="px-3 py-2.5">
                              <p className="text-sm font-medium text-foreground">{line.name}</p>
                              {hasDetail && (
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {[
                                    line.detail?.imei ? `IMEI: ${line.detail.imei}` : null,
                                    line.detail?.garantiaDias ? `${line.detail.garantiaDias}d gar.` : null,
                                  ].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateQty(line.lineId, -1)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground transition-colors hover:bg-secondary"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-6 text-center text-sm font-bold tabular-nums text-foreground">
                                  {line.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQty(line.lineId, 1)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-foreground transition-colors hover:bg-secondary"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
                              {brl(line.price)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-sm font-semibold text-foreground">
                              {brl(line.price * line.qty)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => setExpandedLineId(isExpanded ? null : line.lineId)}
                                  className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded border transition-colors",
                                    isExpanded
                                      ? "border-primary bg-primary/10 text-primary"
                                      : hasDetail
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                        : "border-border bg-background text-muted-foreground hover:bg-secondary",
                                  )}
                                  title="Detalhar item (IMEI, serial, garantia)"
                                >
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(line.lineId)}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${line.lineId}-detail`} className="bg-muted/30">
                              <td colSpan={5} className="px-3 py-3">
                                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Dados do produto
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">IMEI</Label>
                                    <Input
                                      placeholder="000000000000000"
                                      value={line.detail?.imei ?? ""}
                                      onChange={(e) => updateLineDetail(line.lineId, { imei: e.target.value })}
                                      className="h-8 border-border bg-background text-xs"
                                      maxLength={15}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">Nº de Série</Label>
                                    <Input
                                      placeholder="SN-…"
                                      value={line.detail?.serial ?? ""}
                                      onChange={(e) => updateLineDetail(line.lineId, { serial: e.target.value })}
                                      className="h-8 border-border bg-background text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">Garantia (dias)</Label>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={3650}
                                      placeholder="90"
                                      value={line.detail?.garantiaDias !== undefined ? String(line.detail.garantiaDias) : ""}
                                      onChange={(e) =>
                                        updateLineDetail(line.lineId, {
                                          garantiaDias: e.target.value ? Math.max(0, parseInt(e.target.value, 10)) : undefined,
                                        })
                                      }
                                      className="h-8 border-border bg-background text-xs"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px] text-muted-foreground">Observação</Label>
                                    <Input
                                      placeholder="Obs. do item…"
                                      value={line.detail?.observacao ?? ""}
                                      onChange={(e) => updateLineDetail(line.lineId, { observacao: e.target.value })}
                                      className="h-8 border-border bg-background text-xs"
                                    />
                                  </div>
                                </div>
                                {hasDetail && (
                                  <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                    <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                      Dados registrados — serão salvos no cupom e no sistema
                                    </p>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── SEÇÃO: DADOS DA VENDA ── */}
          <section className="bg-background px-4 py-4">
            <div className="mb-2 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dados da Venda
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Tipo</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {TIPOS_VENDA.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTipoVenda(t.value)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-left text-xs transition-all",
                        tipoVenda === t.value
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Observação geral</Label>
                  <Input
                    placeholder="Observação para esta venda…"
                    value={observacaoGeral}
                    onChange={(e) => setObservacaoGeral(e.target.value)}
                    className="h-8 border-border bg-secondary text-xs"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <span>Operador</span>
                  <span className="font-mono font-medium text-foreground">{cashierId.slice(-8)}</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── SEÇÃO: TOTAL ── */}
          <section className="bg-background px-4 py-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{brl(subtotal)}</span>
                </div>
                {discountReais > 0 && (
                  <div className="flex items-center justify-between text-sm text-amber-500">
                    <span>Desconto</span>
                    <span className="tabular-nums">-{brl(discountReais)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2 text-lg font-bold text-foreground">
                  <span>Total</span>
                  <span className="tabular-nums">{brl(total)}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {!selectedCliente && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                    <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      [F2] Selecione o cliente para continuar
                    </p>
                  </div>
                )}
                {cart.length === 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">
                      Adicione produtos ao carrinho para finalizar.
                    </p>
                  </div>
                )}
                <Button
                  type="button"
                  className="h-12 w-full rounded-xl bg-emerald-600 text-base font-bold text-zinc-950 shadow-lg hover:bg-emerald-500 disabled:opacity-50"
                  disabled={!canFinalize}
                  onClick={() => setIsPaymentOpen(true)}
                >
                  <span>Finalizar Venda</span>
                  <kbd className="ml-2 rounded border border-zinc-950/20 bg-zinc-950/10 px-1.5 py-0.5 font-mono text-[10px] font-medium">
                    F1
                  </kbd>
                </Button>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* ── Modais ── */}

      {/* Help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card p-0">
          <DialogHeader className="border-b border-border px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <HelpCircle className="h-4 w-4 text-primary" />
              Atalhos — Venda Completa Enterprise
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-primary">Venda</p>
              <div className="space-y-2.5">
                {(
                  [
                    { key: "F1", label: "Finalizar venda" },
                    { key: "F2", label: "Buscar / limpar cliente" },
                    { key: "F3", label: "Foco no produto" },
                    { key: "↵",  label: "Bipe / único resultado" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <kbd className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Navegação</p>
              <div className="space-y-2.5">
                {(
                  [
                    { key: "END", label: "Esta ajuda" },
                    { key: "ESC", label: "Fechar modal" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border px-5 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              Operador:{" "}
              <span className="font-mono font-medium text-foreground">{cashierId}</span>
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* PaymentModal */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        cartSubtotal={subtotal}
        total={total}
        discountReais={discountReais}
        discountPercent={discountPercent}
        onDiscountReaisChange={setDiscountReais}
        onDiscountPercentChange={setDiscountPercent}
        selectedCustomer={paymentModalCustomer}
        customerStoreCredit={customerStoreCredit}
        cashierId={cashierId}
        onConfirm={handleConfirmPayment}
      />

      {/* Cupom não fiscal */}
      {cupomData && (
        <CupomNaoFiscal
          isOpen={cupomOpen}
          onClose={() => setCupomOpen(false)}
          data={cupomData}
        />
      )}
    </div>
  )
}
