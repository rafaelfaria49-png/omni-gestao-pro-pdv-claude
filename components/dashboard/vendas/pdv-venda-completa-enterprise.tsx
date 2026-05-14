"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { configPadrao } from "@/lib/config-empresa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { useOperationsStore } from "@/lib/operations-store"
import { getOrCreatePdvOperatorId } from "@/lib/pdv-operator-id"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import {
  PDV_PRODUCTS_BASE,
  mergePdvCatalogWithInventory,
  newPdvLineId,
  type PdvCatalogProduct,
} from "@/lib/pdv-catalog"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import { appendContaReceberTituloPdvAprazo } from "@/lib/pdv-append-conta-receber"
import { appendAuditLog } from "@/lib/audit-log"
import {
  PaymentModal,
  type PaymentMethod,
  type PaymentMethodType,
} from "./payment-modal"
import { CupomNaoFiscal, type CupomData } from "./cupom-nao-fiscal"
import { PdvVisorTotal, PdvPainelLateralTerminal } from "./painel-total"
import { CaixaStatusBar } from "../caixa/caixa-status-bar"
import { enrichVendaEnterprise } from "@/app/actions/vendas-enterprise"

// ── Types ──────────────────────────────────────────────────────────────────────

type ClienteResult = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  document?: string | null
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

// ── Main Component ─────────────────────────────────────────────────────────────

export function PdvVendaCompletaEnterprise({
  onBack,
  isModoRapido = false,
}: {
  onBack: () => void
  isModoRapido?: boolean
}) {
  const { inventory, finalizeSaleTransaction, getSaldoCreditoCliente } = useOperationsStore()
  const { empresaDocumentos, lojaAtivaId } = useLojaAtiva()
  const { pdvParams } = useStoreSettings()
  const { toast } = useToast()
  const cashierId = useMemo(() => getOrCreatePdvOperatorId(), [])
  const storeId = useMemo(
    () => (lojaAtivaId || LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID,
    [lojaAtivaId]
  )

  // ── Customer ──────────────────────────────────────────────────────────────
  const [clienteQuery, setClienteQuery] = useState("")
  const [clienteResultados, setClienteResultados] = useState<ClienteResult[]>([])
  const [clienteLoading, setClienteLoading] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<ClienteResult | null>(null)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const clienteInputRef = useRef<HTMLInputElement>(null)

  // ── Products ──────────────────────────────────────────────────────────────
  const [productQuery, setProductQuery] = useState("")
  const productInputRef = useRef<HTMLInputElement>(null)

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([])
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null)

  // ── Discount ──────────────────────────────────────────────────────────────
  const [discountReais, setDiscountReais] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)

  // ── Payment / Cupom ───────────────────────────────────────────────────────
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [cupomOpen, setCupomOpen] = useState(false)
  const [cupomData, setCupomData] = useState<CupomData | null>(null)

  // ── Catalog ───────────────────────────────────────────────────────────────
  const products = useMemo(
    () => mergePdvCatalogWithInventory(PDV_PRODUCTS_BASE, inventory),
    [inventory]
  )

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim()
    if (!q) return []
    return filterPdvCatalogBySearch(products, q).slice(0, 12)
  }, [products, productQuery])

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const total = Math.max(0, subtotal - discountReais)
  const customerStoreCredit = useMemo(
    () => (selectedCliente?.document ? getSaldoCreditoCliente(selectedCliente.document) : 0),
    [selectedCliente, getSaldoCreditoCliente]
  )

  // ── Fetch clientes (real API) ─────────────────────────────────────────────
  useEffect(() => {
    const q = clienteQuery.trim()
    if (!q) {
      setClienteResultados([])
      return
    }
    const controller = new AbortController()
    setClienteLoading(true)
    fetch(`/api/clientes?q=${encodeURIComponent(q)}`, {
      headers: { [ASSISTEC_LOJA_HEADER]: storeId },
      credentials: "include",
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data: unknown) => {
        const d = data as { clientes?: ClienteResult[] }
        setClienteResultados(Array.isArray(d.clientes) ? d.clientes : [])
        setClienteLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setClienteLoading(false)
      })
    return () => controller.abort()
  }, [clienteQuery, storeId])

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const addToCart = useCallback(
    (product: PdvCatalogProduct) => {
      const isService = product.category === "Servicos"
      if (!isService && product.stock <= 0) {
        toast({
          title: "Sem estoque",
          description: `${product.name} está sem estoque.`,
          variant: "destructive",
        })
        return
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.inventoryId === product.id)
        if (existing) {
          return prev.map((l) =>
            l.inventoryId === product.id ? { ...l, qty: l.qty + 1 } : l
          )
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
    [pdvParams.garantiaPadraoDias, toast]
  )

  function updateQty(lineId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
    if (delta < 0 && expandedLineId === lineId) {
      // keep expanded if still in cart
    }
  }

  function removeFromCart(lineId: string) {
    setCart((prev) => prev.filter((l) => l.lineId !== lineId))
    if (expandedLineId === lineId) setExpandedLineId(null)
  }

  function updateLineDetail(lineId: string, patch: Partial<LineDetail>) {
    setCart((prev) =>
      prev.map((l) =>
        l.lineId === lineId ? { ...l, detail: { ...l.detail, ...patch } } : l
      )
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
    }
  ) {
    const saleLines = cart
      .filter((l) => inventory.some((i) => i.id === l.inventoryId))
      .map((l) => ({
        inventoryId: l.inventoryId,
        quantity: l.qty,
        unitPrice: l.price,
        name: l.name,
      }))

    if (saleLines.length === 0) {
      toast({
        title: "Carrinho vazio",
        description: "Adicione itens ao carrinho antes de finalizar.",
        variant: "destructive",
      })
      return
    }

    let dinheiro = 0,
      pix = 0,
      cartaoDebito = 0,
      cartaoCredito = 0,
      carne = 0,
      aPrazo = 0,
      creditoVale = 0

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
      paymentBreakdown: {
        dinheiro,
        pix,
        cartaoDebito,
        cartaoCredito,
        carne,
        aPrazo,
        creditoVale,
      },
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

    // aPrazo → Contas a Receber
    if (aPrazo > 0.02 && selectedCliente) {
      appendContaReceberTituloPdvAprazo({
        lojaId: storeId,
        saleId: result.saleId,
        clienteNome: selectedCliente.name,
        valor: aPrazo,
      })
    }

    // Audit
    appendAuditLog({
      action: "sale_finalized",
      userLabel: (empresaDocumentos.nomeFantasia || "Loja").trim(),
      detail: `Venda Enterprise ${result.saleId} | Cliente: ${selectedCliente?.name ?? "—"} | Total ${brl(total)}`,
    })

    // Enriquece payload JSONB com dados enterprise (não bloqueia)
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
      linhasDetalhe,
    }).catch(() => {})

    // Cupom
    const storeDisplayName =
      (
        empresaDocumentos.nomeFantasia ||
        configPadrao.empresa.nomeFantasia ||
        "Loja"
      ).trim() || "Loja"

    const cupom: CupomData = {
      numeroPedido: result.saleId,
      at: new Date().toISOString(),
      lojaNome: storeDisplayName,
      clienteNome: selectedCliente?.name ?? null,
      clienteCpf: selectedCliente?.document ?? null,
      operador: cashierId,
      itens: cart.map((l) => ({
        nome: l.name,
        quantidade: l.qty,
        precoUnitario: l.price,
        lineTotal: Math.round(l.price * l.qty * 100) / 100,
      })),
      pagamentos: payments.map((p) => ({
        label: paymentLabel(p.type),
        valor: p.value,
      })),
      total,
      desconto: discountReais > 0 ? discountReais : undefined,
    }

    setCupomData(cupom)
    setIsPaymentOpen(false)
    setCupomOpen(true)

    // Reset
    setCart([])
    setDiscountReais(0)
    setDiscountPercent(0)
    setSelectedCliente(null)
    setClienteQuery("")
    setExpandedLineId(null)
  }

  // Adapter para PaymentModal (espera { id, name, cpf, phone })
  const paymentModalCustomer = selectedCliente
    ? {
        id: selectedCliente.id,
        name: selectedCliente.name,
        cpf: selectedCliente.document ?? "",
        phone: selectedCliente.phone ?? "",
      }
    : null

  const canFinalize = selectedCliente !== null && cart.length > 0 && total > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Caixa status */}
      <CaixaStatusBar variant="pdv" />

      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background">
        <div className="flex items-center gap-2 px-3 py-2.5">
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
                  ? selectedCliente.name
                  : "Identifique o cliente para continuar"}
              </p>
            </div>
          </div>

          {cart.length > 0 && (
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {cart.reduce((s, l) => s + l.qty, 0)}{" "}
              {cart.reduce((s, l) => s + l.qty, 0) === 1 ? "item" : "itens"}
            </Badge>
          )}
        </div>
      </div>

      {/* Body: left scroll + right sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Left column (scrollable) ───────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* ── CLIENTE ───────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border bg-background px-3 py-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cliente <span className="text-destructive">*</span>
              </span>
            </div>

            {selectedCliente ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedCliente.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      selectedCliente.document?.trim() || null,
                      selectedCliente.phone?.trim() || null,
                    ]
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
                    setTimeout(() => clienteInputRef.current?.focus(), 50)
                  }}
                  className="ml-2 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
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
                    placeholder="Nome, CPF ou telefone…"
                    value={clienteQuery}
                    onChange={(e) => {
                      setClienteQuery(e.target.value)
                      setShowClienteDropdown(true)
                    }}
                    onFocus={() => setShowClienteDropdown(true)}
                    onBlur={() => setTimeout(() => setShowClienteDropdown(false), 180)}
                    className="h-10 border-border bg-secondary pl-9 pr-9 text-sm"
                  />
                </div>

                {showClienteDropdown && clienteQuery.trim() && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    {clienteResultados.length > 0 ? (
                      clienteResultados.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-secondary"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSelectedCliente(c)
                            setClienteQuery("")
                            setShowClienteDropdown(false)
                            setTimeout(() => productInputRef.current?.focus(), 80)
                          }}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {c.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[c.document?.trim() || null, c.phone?.trim() || null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </button>
                      ))
                    ) : !clienteLoading ? (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Nenhum cliente encontrado
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── PRODUTOS ──────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border bg-background px-3 py-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Produtos
              </span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productInputRef}
                placeholder="Nome, SKU ou código de barras…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredProducts.length === 1) {
                    e.preventDefault()
                    addToCart(filteredProducts[0]!)
                  }
                }}
                className="h-10 border-border bg-secondary pl-9 text-sm"
              />
            </div>

            {filteredProducts.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((p) => {
                  const isService = p.category === "Servicos"
                  const outOfStock = !isService && p.stock <= 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(p)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-all hover:border-primary/40 hover:bg-accent active:scale-[0.98]",
                        outOfStock && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
                        {p.name}
                      </p>
                      <div className="flex w-full items-center justify-between gap-1">
                        <span
                          className={cn(
                            "text-[10px]",
                            outOfStock
                              ? "text-amber-500"
                              : "text-muted-foreground"
                          )}
                        >
                          {isService
                            ? "Serviço"
                            : outOfStock
                              ? "Sem estoque"
                              : `${p.stock} un`}
                        </span>
                        <span className="text-xs font-bold tabular-nums text-primary">
                          {brl(p.price)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── CARRINHO ──────────────────────────────────────────────── */}
          <div className="flex-1 px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Carrinho
              </span>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => {
                    setCart([])
                    setExpandedLineId(null)
                  }}
                >
                  Limpar tudo
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <Receipt className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhum item no carrinho
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">
                  Busque um produto acima para adicionar
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((line) => {
                  const isExpanded = expandedLineId === line.lineId
                  const hasDetail =
                    line.detail &&
                    (line.detail.imei ||
                      line.detail.serial ||
                      line.detail.garantiaDias ||
                      line.detail.observacao)

                  return (
                    <div
                      key={line.lineId}
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      {/* Line header */}
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {line.name}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {brl(line.price)} × {line.qty} ={" "}
                            <span className="font-semibold text-foreground">
                              {brl(line.price * line.qty)}
                            </span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQty(line.lineId, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-secondary"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums text-foreground">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(line.lineId, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-secondary"
                          >
                            <Plus className="h-3 w-3" />
                          </button>

                          {/* Detalhar */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLineId(isExpanded ? null : line.lineId)
                            }
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                              isExpanded
                                ? "border-primary bg-primary/10 text-primary"
                                : hasDetail
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
                            )}
                            title="Detalhar item (IMEI, serial, garantia)"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {/* Remover */}
                          <button
                            type="button"
                            onClick={() => removeFromCart(line.lineId)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Expandable detail panel */}
                      {isExpanded && (
                        <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Dados do produto
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                IMEI
                              </Label>
                              <Input
                                placeholder="000000000000000"
                                value={line.detail?.imei ?? ""}
                                onChange={(e) =>
                                  updateLineDetail(line.lineId, { imei: e.target.value })
                                }
                                className="h-8 border-border bg-background text-xs"
                                maxLength={15}
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Nº de Série
                              </Label>
                              <Input
                                placeholder="SN-…"
                                value={line.detail?.serial ?? ""}
                                onChange={(e) =>
                                  updateLineDetail(line.lineId, { serial: e.target.value })
                                }
                                className="h-8 border-border bg-background text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Garantia (dias)
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                max={3650}
                                placeholder="90"
                                value={
                                  line.detail?.garantiaDias !== undefined
                                    ? String(line.detail.garantiaDias)
                                    : ""
                                }
                                onChange={(e) =>
                                  updateLineDetail(line.lineId, {
                                    garantiaDias: e.target.value
                                      ? Math.max(0, parseInt(e.target.value, 10))
                                      : undefined,
                                  })
                                }
                                className="h-8 border-border bg-background text-xs"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground">
                                Observação
                              </Label>
                              <Input
                                placeholder="Observação do item…"
                                value={line.detail?.observacao ?? ""}
                                onChange={(e) =>
                                  updateLineDetail(line.lineId, { observacao: e.target.value })
                                }
                                className="h-8 border-border bg-background text-xs"
                              />
                            </div>
                          </div>

                          {hasDetail && (
                            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                Dados registrados — serão salvos no cupom e no sistema
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────── */}
        <PdvPainelLateralTerminal className="w-64 shrink-0 xl:w-72">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {/* Total visor */}
            <PdvVisorTotal
              label="TOTAL"
              valorFormatado={brl(total)}
              glow="soft"
            />

            {/* Subtotal / desconto */}
            {subtotal !== total && subtotal > 0 && (
              <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{brl(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="tabular-nums text-amber-500">
                    -{brl(discountReais)}
                  </span>
                </div>
              </div>
            )}

            {/* Items summary */}
            {cart.length > 0 && (
              <div className="min-h-0 overflow-y-auto rounded-xl border border-border bg-card">
                <div className="divide-y divide-border">
                  {cart.map((l) => (
                    <div
                      key={l.lineId}
                      className="flex items-start justify-between gap-2 px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[11px] font-medium text-foreground">
                          {l.name}
                        </p>
                        {(l.detail?.imei || l.detail?.garantiaDias) && (
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {[
                              l.detail.imei ? `IMEI: ${l.detail.imei}` : null,
                              l.detail.garantiaDias
                                ? `${l.detail.garantiaDias}d garantia`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {l.qty}× {brl(l.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator className="shrink-0" />

            {/* Warnings */}
            {!selectedCliente && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Selecione o cliente para continuar
                </p>
              </div>
            )}

            {cart.length === 0 && (
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  Adicione produtos ao carrinho
                </p>
              </div>
            )}

            {/* Finalizar */}
            <Button
              type="button"
              className="h-12 w-full shrink-0 rounded-xl bg-emerald-600 text-base font-bold text-zinc-950 shadow-lg hover:bg-emerald-500 disabled:opacity-50"
              disabled={!canFinalize}
              onClick={() => setIsPaymentOpen(true)}
            >
              Finalizar Venda
            </Button>
          </div>
        </PdvPainelLateralTerminal>
      </div>

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
