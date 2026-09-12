"use client"

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { RotateCcw } from "lucide-react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { operatorDisplayName } from "@/lib/pdv-operator-label"
import { usePdvOperadorNome } from "@/lib/pdv-operador-nome"
import { useConfigEmpresa } from "@/lib/config-empresa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { computePdvCartTotals } from "@/lib/pdv-cart-totals"
import { parsePdvScanPrefix } from "@/lib/pdv-scan-prefix"
import {
  readPdvBlackTurno,
  writePdvBlackTurno,
  readPdvBlackCupom,
  writePdvBlackCupom,
} from "@/lib/pdv-black-storage"
import { readSelectedTerminal } from "@/lib/pdv-terminal"
import {
  useHeldSales,
  saveHeldSale,
  removeHeldSale,
  newHoldId,
  nextHoldLabel,
  type HeldSale,
} from "@/lib/pdv-hold"
import { useOperationsStore } from "@/lib/operations-store"
import { useCaixa } from "@/components/dashboard/caixa/caixa-provider"
import { AberturaCaixaModal } from "@/components/dashboard/caixa/abertura-caixa-modal"
import { FechamentoCaixaModal } from "@/components/dashboard/caixa/fechamento-caixa-modal"
import { CaixaStatusBar } from "@/components/dashboard/caixa/caixa-status-bar"
import { SupervisorGateDialog } from "@/components/dashboard/caixa/supervisor-gate-dialog"
import {
  mergePdvCatalogWithInventory,
  newPdvLineId,
  type PdvCatalogProduct,
} from "@/lib/pdv-catalog"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { lookupPdvScanRemote } from "@/lib/pdv-scan-lookup"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import { useClienteSearch } from "@/lib/hooks/use-cliente-search"
import { PaymentModal, type PaymentMethod } from "@/components/dashboard/vendas/payment-modal"
import { PdvClientePicker, type PdvClienteResult } from "@/components/dashboard/vendas/pdv-cliente-picker"
import { VendaEsperaModal } from "@/components/dashboard/vendas/venda-espera-modal"
import { TrocasDevolucao } from "@/components/dashboard/vendas/trocas-devolucao"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { reducePaymentsToBreakdown } from "@/lib/pdv-payments"
import {
  PENDING_SALE_DESCRIPTION,
  PENDING_SALE_TITLE,
} from "@/lib/pdv-finalize-integrity"
import { PdvBlackShell, type PdvBlackCartRow } from "./PdvBlackShell"

const brlBlack = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

export function PdvBlackEdition() {
  const router = useRouter()
  const { lojaAtivaId, lojaAtivaRaw } = useLojaAtiva()
  const { config } = useConfigEmpresa()
  const { pdvParams } = useStoreSettings()
  const {
    inventory,
    setInventory,
    finalizeSaleTransaction,
    getSaldoCreditoCliente,
    sincronizarCreditoLocal,
  } = useOperationsStore()
  const { caixa, abrirCaixa, fecharCaixa } = useCaixa()
  const { toast } = useToast()

  // ── Terminal e escopo de storage ───────────────────────────────────────────
  const terminalId = useMemo(
    () => readSelectedTerminal(lojaAtivaId)?.id ?? "default",
    [lojaAtivaId]
  )

  // ── Caixa ──────────────────────────────────────────────────────────────────
  const [turno, setTurno] = useState<number>(1)
  const [cupomNum, setCupomNum] = useState<number>(1000)
  const [showAbertura, setShowAbertura] = useState(false)
  const [showFechamento, setShowFechamento] = useState(false)
  const [fecharGateOpen, setFecharGateOpen] = useState(false)

  useEffect(() => {
    setTurno(readPdvBlackTurno(lojaAtivaId, terminalId))
    setCupomNum(readPdvBlackCupom(lojaAtivaId, terminalId))
  }, [lojaAtivaId, terminalId])

  const handleAbrirCaixa = useCallback(() => {
    setShowAbertura(true)
  }, [])

  const handleFecharCaixa = useCallback(() => {
    setFecharGateOpen(true)
  }, [])

  // Incrementa turno quando o caixa é aberto
  const prevCaixaOpen = useRef(caixa.isOpen)
  useEffect(() => {
    if (!prevCaixaOpen.current && caixa.isOpen) {
      const next = turno + 1
      setTurno(next)
      writePdvBlackTurno(lojaAtivaId, terminalId, next)
    }
    prevCaixaOpen.current = caixa.isOpen
  }, [caixa.isOpen, turno, lojaAtivaId, terminalId])

  // ── Nome da loja e operador ────────────────────────────────────────────────
  const storeName = useMemo(() => {
    const nome = (lojaAtivaRaw?.nomeFantasia || "").trim()
    if (nome) return nome
    return config?.empresa.nomeFantasia || config?.empresa.razaoSocial || "OmniGestão PDV"
  }, [lojaAtivaRaw, config])

  const { data: session } = useSession()
  const operadorNomeAbertura = usePdvOperadorNome((lojaAtivaId ?? "").trim())
  const operadorNome = operatorDisplayName({ aberturaNome: operadorNomeAbertura, session })

  // ── Carrinho ───────────────────────────────────────────────────────────────
  const [cartRows, setCartRows] = useState<PdvBlackCartRow[]>([])
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null)
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null)

  // ── Descontos (percentual e valor em reais) ──────────────────────────────────
  const [discountReais, setDiscountReais] = useState<number>(0)
  const [discountPercent, setDiscountPercent] = useState<number>(0)

  // ── Barcode ────────────────────────────────────────────────────────────────
  const [bipeCode, setBipeCode] = useState("")
  const bipeRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { bipeRef.current?.focus() }, [])

  // ── Cliente ────────────────────────────────────────────────────────────────
  const [customerDisplay, setCustomerDisplay] = useState("Consumidor final")
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; cpf: string; phone: string } | null>(null)
  const [aPrazoClientePickerOpen, setAPrazoClientePickerOpen] = useState(false)
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [customerCreditFetched, setCustomerCreditFetched] = useState<number | null>(null)

  const { clientes: clientResults } = useClienteSearch(
    clientSearchOpen ? customerDisplay.replace("Consumidor final", "") : "",
    lojaAtivaId
  )
  const clientOptions = useMemo(
    () =>
      clientResults.map((c) => ({
        id: c.id,
        label: [c.name, c.phone].filter(Boolean).join(" — "),
      })),
    [clientResults]
  )

  // Busca de crédito/vale do cliente (remoto com fallback local)
  useEffect(() => {
    setCustomerCreditFetched(null)
    const docNorm = (selectedCustomer?.cpf ?? "").replace(/\D/g, "")
    const cId = selectedCustomer?.id
    if (!docNorm && !cId) return
    const params = new URLSearchParams({ lojaId: lojaAtivaId ?? "" })
    if (docNorm) params.set("doc", docNorm)
    else if (cId) params.set("clienteId", cId)
    fetch(`/api/ops/credito-cliente?${params.toString()}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { creditos?: Record<string, { nome: string; saldo: number }> } | null) => {
        const saldo = j?.creditos ? Object.values(j.creditos).reduce((s, v) => s + v.saldo, 0) : 0
        setCustomerCreditFetched(saldo)
      })
      .catch(() => setCustomerCreditFetched(null))
  }, [selectedCustomer?.cpf, selectedCustomer?.id, lojaAtivaId])

  const customerStoreCredit = useMemo(() => {
    if (!selectedCustomer) return 0
    if (customerCreditFetched != null) return customerCreditFetched
    return getSaldoCreditoCliente(selectedCustomer.cpf)
  }, [selectedCustomer, customerCreditFetched, getSaldoCreditoCliente])

  // ── Catálogo ───────────────────────────────────────────────────────────────
  const products = useMemo(
    () => mergePdvCatalogWithInventory([], inventory),
    [inventory]
  )

  // ── Totais canônicos (subtotal, desconto combinado, imposto estimado, total) ─
  const subtotal = useMemo(
    () => cartRows.reduce((acc, r) => acc + r.qty * r.unitPrice, 0),
    [cartRows]
  )
  const pctRaw = Math.min(100, Math.max(0, discountPercent || 0))
  const discountTotal = Math.min(
    +(subtotal * (pctRaw / 100)).toFixed(2) + Math.max(0, discountReais || 0),
    subtotal
  )
  const { impostoEstimado, total } = useMemo(
    () => computePdvCartTotals(subtotal, discountTotal, pdvParams),
    [subtotal, discountTotal, pdvParams.incluirImpostoEstimadoNoPdv, pdvParams.aliquotaImpostoEstimadoPdv]
  )
  const itemCount = cartRows.length

  // ── Valor recebido e troco (derivados do modal de pagamento) ───────────────
  const [lastCashTendered, setLastCashTendered] = useState<number | null>(null)
  const [lastTroco, setLastTroco] = useState<number>(0)

  // ── Diálogos ──────────────────────────────────────────────────────────────
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [productSearchInitial, setProductSearchInitial] = useState("")
  const [qtyEditOpen, setQtyEditOpen] = useState(false)
  const [cancelSaleOpen, setCancelSaleOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [trocasOpen, setTrocasOpen] = useState(false)
  const [vendaEsperaOpen, setVendaEsperaOpen] = useState(false)

  // ── Vendas em espera (pdvType: "black", isoladas por storeId + terminalId) ──
  const heldSales = useHeldSales(lojaAtivaId ?? "", terminalId, "black")

  const handleHoldSale = useCallback(() => {
    if (cartRows.length === 0) return
    const label = nextHoldLabel(heldSales)
    const sale: HeldSale = {
      id: newHoldId(),
      label,
      savedAt: new Date().toISOString(),
      items: cartRows.map((r) => ({
        lineId: r.lineId,
        inventoryId: r.inventoryId || r.lineId,
        name: r.description,
        price: r.unitPrice,
        quantity: r.qty,
        itemType: "produto",
      })),
      customer: selectedCustomer
        ? {
            id: selectedCustomer.id,
            name: selectedCustomer.name,
            cpf: selectedCustomer.cpf,
            phone: selectedCustomer.phone,
          }
        : null,
      discountReais,
      discountPercent,
      pdvType: "black",
    }
    saveHeldSale(lojaAtivaId ?? "", terminalId, sale)
    setCartRows([])
    setSelectedLineId(null)
    setLastAddedItem(null)
    setDiscountReais(0)
    setDiscountPercent(0)
    setLastCashTendered(null)
    setLastTroco(0)
    setVendaEsperaOpen(false)
    toast({ title: "Venda em espera", description: `"${label}" salva em espera.` })
  }, [
    cartRows,
    selectedCustomer,
    discountReais,
    discountPercent,
    lojaAtivaId,
    terminalId,
    heldSales,
    toast,
  ])

  const handleResumeSale = useCallback(
    (sale: HeldSale) => {
      setCartRows(
        sale.items.map((it) => ({
          lineId: it.lineId || newPdvLineId(it.inventoryId),
          inventoryId: it.inventoryId,
          code: it.inventoryId,
          description: it.name,
          unit: "UN",
          unitPrice: it.price,
          qty: it.quantity,
        }))
      )
      if (sale.customer) {
        setSelectedCustomer({
          id: sale.customer.id,
          name: sale.customer.name,
          cpf: sale.customer.cpf || "",
          phone: sale.customer.phone || "",
        })
        setSelectedClienteId(sale.customer.id)
        setCustomerDisplay(sale.customer.name)
      } else {
        setSelectedCustomer(null)
        setSelectedClienteId(null)
        setCustomerDisplay("Consumidor final")
      }
      setDiscountReais(sale.discountReais ?? 0)
      setDiscountPercent(sale.discountPercent ?? 0)
      removeHeldSale(lojaAtivaId ?? "", terminalId, sale.id)
      setVendaEsperaOpen(false)
      toast({ title: "Venda retomada", description: `"${sale.label}" carregada no caixa.` })
    },
    [lojaAtivaId, terminalId, toast]
  )

  const handleDiscardHeldSale = useCallback(
    (id: string) => {
      removeHeldSale(lojaAtivaId ?? "", terminalId, id)
    },
    [lojaAtivaId, terminalId]
  )

  const selectedLineQty = useMemo(
    () => cartRows.find((r) => r.lineId === selectedLineId)?.qty ?? 1,
    [cartRows, selectedLineId]
  )

  const focusBipe = useCallback(() => {
    queueMicrotask(() => bipeRef.current?.focus())
  }, [])

  // ── Adicionar produto ──────────────────────────────────────────────────────
  const addProduct = useCallback(
    (product: PdvCatalogProduct, qty?: number) => {
      const effectiveQty = qty ?? 1
      const code = String(product.barcode || product.codigo || product.sku || product.id)
      const unit = product.vendaPorPeso ? "KG" : "UN"
      const price = product.vendaPorPeso
        ? (product.precoPorKg ?? product.price)
        : product.price

      const newRow: PdvBlackCartRow = {
        lineId: newPdvLineId(product.id),
        inventoryId: product.id,
        code,
        description: product.name,
        unit,
        unitPrice: price,
        qty: effectiveQty,
      }

      setCartRows((prev) => [...prev, newRow])
      setHighlightLineId(newRow.lineId)
      setSelectedLineId(newRow.lineId)
      setLastAddedItem(product.name)
      setTimeout(() => setHighlightLineId(null), 1200)
      setBipeCode("")
      bipeRef.current?.focus()
    },
    []
  )

  // ── Bipe: Enter (prefixo canônico parsePdvScanPrefix) ───────────────────────
  const handleBipeKeyDown = useCallback(
    async (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return
      e.preventDefault()
      const raw = bipeCode.trim()
      if (!raw) return

      const { qty, query } = parsePdvScanPrefix(raw)

      const found = findPdvProductByScan(query, products)
      if (found) {
        addProduct(found, qty)
        return
      }

      // Fallback fuzzy: nome/categoria/SKU/EAN
      const matches = filterPdvCatalogBySearch(products, query)
      if (matches.length === 1) {
        addProduct(matches[0]!, qty)
        return
      }
      if (matches.length > 1) {
        setProductSearchInitial(query)
        setProductSearchOpen(true)
        setBipeCode("")
        return
      }

      // Miss local → busca autoritativa no catálogo da loja
      const remote = await lookupPdvScanRemote({ code: query, storeId: (lojaAtivaId ?? "").trim(), setInventory })
      if (remote.kind === "single") {
        addProduct(remote.product, qty)
        setBipeCode("")
        return
      }
      if (remote.kind === "multiple") {
        setProductSearchInitial(query)
        setProductSearchOpen(true)
        setBipeCode("")
        return
      }
      toast({ title: "Produto não encontrado", description: `Produto não encontrado nesta loja para o código: ${query}` })
      bipeRef.current?.select()
    },
    [bipeCode, products, addProduct, lojaAtivaId, setInventory, toast]
  )

  // ── Remover linha ─────────────────────────────────────────────────────────
  const removeLine = useCallback((lineId: string) => {
    setCartRows((prev) => {
      const idx = prev.findIndex((r) => r.lineId === lineId)
      const next = prev.filter((r) => r.lineId !== lineId)
      setSelectedLineId((cur) => (cur === lineId ? next[Math.max(0, idx - 1)]?.lineId ?? null : cur))
      if (next.length === 0) setLastAddedItem(null)
      return next
    })
  }, [])

  const removeSelectedLine = useCallback(() => {
    if (!selectedLineId) return
    removeLine(selectedLineId)
  }, [selectedLineId, removeLine])

  // ── Atalhos de teclado (F2–F12) ───────────────────────────────────────────
  const handleShortcutAction = useCallback(
    (key: string) => {
      switch (key) {
        case "F2":
          focusBipe()
          break
        case "F3":
          setProductSearchOpen(true)
          break
        case "F4":
          if (selectedLineId) setQtyEditOpen(true)
          break
        case "F5":
          setClientSearchOpen(true)
          break
        case "F6":
          setTrocasOpen(true)
          break
        case "F7":
          toast({
            title: "Fiscal em breve",
            description: "Emissão fiscal não disponível neste PDV experimental.",
          })
          break
        case "F8":
          // Desconto abre modal de pagamento onde residem os controles oficiais
          if (cartRows.length > 0) setPaymentOpen(true)
          break
        case "F9":
          setClientSearchOpen(true)
          break
        case "F10":
          if (cartRows.length > 0) setCancelSaleOpen(true)
          break
        case "F11":
          setVendaEsperaOpen(true)
          break
        case "F12":
          if (cartRows.length > 0) setPaymentOpen(true)
          break
      }
    },
    [cartRows.length, selectedLineId, focusBipe, toast]
  )

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === "INPUT" || tag === "TEXTAREA"

      const fKeys = new Set(["F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"])
      if (fKeys.has(e.key)) {
        e.preventDefault()
        handleShortcutAction(e.key)
        return
      }
      if (isTyping) return

      if ((e.key === "Delete" || e.key === "Backspace") && selectedLineId) {
        e.preventDefault()
        removeSelectedLine()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleShortcutAction, selectedLineId, removeSelectedLine])

  // ── Confirmar pagamento ────────────────────────────────────────────────────
  const handlePaymentConfirm = useCallback(async (
    payments: PaymentMethod[],
    meta?: {
      pixQrKind?: string
      cashTendered?: number
      creditDoc?: string
      creditNome?: string
      creditSaldo?: number
      discountAuthorizedByAdminId?: string
      discountReais?: number
      discountPercent?: number
      cashierId?: string
    }
  ) => {
    if (!caixa.isOpen) {
      toast({ variant: "destructive", title: "Caixa fechado", description: "Abra o caixa antes de finalizar a venda." })
      return
    }

    const isLinhaResolvivel = (r: PdvBlackCartRow) =>
      !!r.inventoryId && inventory.some((i) => i.id === r.inventoryId)
    const linhasNaoResolvidas = cartRows.filter((r) => !isLinhaResolvivel(r))
    if (linhasNaoResolvidas.length > 0) {
      const nomes = linhasNaoResolvidas.map((r) => r.description).join(", ")
      toast({
        variant: "destructive",
        title: "Item não pode ser vendido",
        description: `Sem cadastro no estoque desta loja: ${nomes}. Remova o item da lista e tente novamente.`,
      })
      return
    }

    const saleLines = cartRows.map((r) => ({
      inventoryId: r.inventoryId as string,
      quantity: r.qty,
      unitPrice: r.unitPrice,
      name: r.description,
    }))

    // Cálculo canônico de troco em dinheiro (mesmo do Classic para pagamentos simples ou mistos)
    let dinheiroPago = 0
    for (const p of payments) {
      if (p.type === "dinheiro") dinheiroPago += p.value
    }
    let trocoCalculado = 0
    if (meta?.cashTendered != null && dinheiroPago > 0.005) {
      const cashTenderedNum = Number(meta.cashTendered)
      if (Number.isFinite(cashTenderedNum) && cashTenderedNum >= dinheiroPago) {
        trocoCalculado = Math.max(0, Math.round((cashTenderedNum - dinheiroPago) * 100) / 100)
      }
    }

    // Suporte a Vale/Crédito seguindo o contrato canônico do Classic
    const usouValeLoc = !!meta?.creditDoc && payments.some((p) => p.type === "credito_vale")
    const cpfDaVenda =
      usouValeLoc && meta?.creditDoc ? meta.creditDoc : selectedCustomer?.cpf
    const nomeDaVenda =
      usouValeLoc && meta?.creditDoc
        ? meta.creditNome || selectedCustomer?.name
        : selectedCustomer?.name
    if (usouValeLoc && meta?.creditDoc) {
      sincronizarCreditoLocal(meta.creditDoc, meta.creditNome ?? "", meta.creditSaldo ?? 0)
    }

    const aPrazoPayment = payments.find((p) => p.type === "a_prazo")
    const result = await finalizeSaleTransaction({
      lines: saleLines,
      total,
      paymentBreakdown: reducePaymentsToBreakdown(payments),
      customerCpf: cpfDaVenda,
      customerName: nomeDaVenda,
      clienteId: usouValeLoc ? undefined : (selectedCustomer?.id ?? selectedClienteId ?? undefined),
      auditMeta: {
        cashierId: meta?.cashierId ?? operadorNome,
        discountAuthorizedByAdminId: meta?.discountAuthorizedByAdminId,
        discountReais: meta?.discountReais ?? discountReais,
        discountPercent: meta?.discountPercent ?? discountPercent,
      },
      aPrazoConfig: aPrazoPayment?.aPrazoConfig,
      pixQrKind: meta?.pixQrKind,
      cashTendered: meta?.cashTendered,
    })

    if (!result.ok) {
      toast({ variant: "destructive", title: "Falha ao registrar venda", description: result.reason })
      return
    }

    if (result.pending) {
      setPaymentOpen(false)
      toast({ title: PENDING_SALE_TITLE, description: PENDING_SALE_DESCRIPTION, duration: 6000 })
      focusBipe()
      return
    }

    // Venda confirmada
    setLastCashTendered(meta?.cashTendered ?? null)
    setLastTroco(trocoCalculado)
    const nextCupom = cupomNum + 1
    setCupomNum(nextCupom)
    writePdvBlackCupom(lojaAtivaId, terminalId, nextCupom)
    setCartRows([])
    setSelectedLineId(null)
    setHighlightLineId(null)
    setCustomerDisplay("Consumidor final")
    setSelectedClienteId(null)
    setSelectedCustomer(null)
    setDiscountReais(0)
    setDiscountPercent(0)
    setBipeCode("")
    setLastAddedItem(null)
    setPaymentOpen(false)
    focusBipe()
    toast({ title: "Venda registrada", description: `Cupom ${nextCupom} — ${brlBlack(total)}` })
  }, [
    caixa.isOpen,
    cartRows,
    inventory,
    total,
    selectedCustomer,
    selectedClienteId,
    finalizeSaleTransaction,
    operadorNome,
    discountReais,
    discountPercent,
    cupomNum,
    lojaAtivaId,
    terminalId,
    sincronizarCreditoLocal,
    focusBipe,
    toast,
  ])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#000000]">
      <CaixaStatusBar variant="pdv" />
      <PdvBlackShell
        // Caixa
        caixaAberto={caixa.isOpen}
        turno={turno}
        cupomNum={cupomNum}
        operadorNome={operadorNome}
        storeName={storeName}
        onAbrirCaixa={handleAbrirCaixa}
        onFecharCaixa={handleFecharCaixa}
        // Carrinho
        cartRows={cartRows}
        highlightLineId={highlightLineId}
        selectedLineId={selectedLineId}
        onSelectLine={setSelectedLineId}
        onRemoveLine={removeLine}
        subtotal={subtotal}
        discountTotal={discountTotal}
        impostoEstimado={impostoEstimado}
        total={total}
        itemCount={itemCount}
        lastAddedItem={lastAddedItem}
        // Barcode
        bipeCode={bipeCode}
        onBipeChange={setBipeCode}
        bipeRef={bipeRef}
        onBipeKeyDown={handleBipeKeyDown}
        // Cliente
        customerDisplay={customerDisplay}
        onClientSearchOpen={() => setClientSearchOpen(true)}
        // Troco / Valor recebido (leitura do último pagamento confirmado)
        cashTendered={lastCashTendered}
        troco={lastTroco}
        // Ações
        onShortcutAction={handleShortcutAction}
        onFinalizeClick={() => { if (cartRows.length > 0) setPaymentOpen(true) }}
        // Diálogos
        products={products}
        productSearchOpen={productSearchOpen}
        productSearchInitial={productSearchInitial}
        onProductSearchOpenChange={(open) => {
          setProductSearchOpen(open)
          if (!open) {
            setProductSearchInitial("")
            focusBipe()
          }
        }}
        onAddProductFromSearch={(product) => {
          addProduct(product)
          setProductSearchOpen(false)
          setProductSearchInitial("")
        }}
        clientSearchOpen={clientSearchOpen}
        onClientSearchOpenChange={(open) => {
          setClientSearchOpen(open)
          if (!open) focusBipe()
        }}
        clientOptions={clientOptions}
        onPickClient={(label) => {
          const opt = clientOptions.find((o) => o.label === label)
          const full = opt ? clientResults.find((c) => c.id === opt.id) : undefined
          setSelectedClienteId(opt?.id ?? null)
          setCustomerDisplay(label.split(" — ")[0] || label)
          setSelectedCustomer(
            full
              ? { id: full.id, name: full.name, cpf: (full.document ?? "").trim(), phone: (full.phone ?? "").trim() }
              : null,
          )
          setClientSearchOpen(false)
          focusBipe()
        }}
        qtyEditOpen={qtyEditOpen}
        onQtyEditOpenChange={(open) => {
          setQtyEditOpen(open)
          if (!open) focusBipe()
        }}
        qtyEditDefault={String(selectedLineQty)}
        onQtyEditConfirm={(raw) => {
          const qty = Math.max(0.001, parseFloat(raw.replace(",", ".")) || 1)
          setCartRows((prev) =>
            prev.map((r) => r.lineId === selectedLineId ? { ...r, qty } : r)
          )
          setQtyEditOpen(false)
          focusBipe()
        }}
        cancelSaleOpen={cancelSaleOpen}
        onCancelSaleOpenChange={setCancelSaleOpen}
        onConfirmCancelSale={() => {
          setCartRows([])
          setSelectedLineId(null)
          setLastAddedItem(null)
          setDiscountReais(0)
          setDiscountPercent(0)
          setLastCashTendered(null)
          setLastTroco(0)
          setBipeCode("")
          setCancelSaleOpen(false)
          focusBipe()
        }}
      />

      {/* Modais do caixa */}
      <AberturaCaixaModal isOpen={showAbertura} onClose={() => setShowAbertura(false)} />
      <SupervisorGateDialog
        open={fecharGateOpen}
        onOpenChange={setFecharGateOpen}
        onAuthorized={() => setShowFechamento(true)}
        title="Fechar caixa"
        description="Fechar o caixa exige a senha de um supervisor/gerente."
      />
      <FechamentoCaixaModal isOpen={showFechamento} onClose={() => setShowFechamento(false)} />

      {/* Seletor de cliente para venda à prazo */}
      <PdvClientePicker
        open={aPrazoClientePickerOpen}
        storeId={lojaAtivaId ?? ""}
        onClose={() => setAPrazoClientePickerOpen(false)}
        onSelect={(c: PdvClienteResult) => {
          setSelectedCustomer({
            id: c.id,
            name: c.name,
            cpf: (c.document ?? "").trim(),
            phone: (c.phone ?? "").trim(),
          })
          setSelectedClienteId(c.id)
          setCustomerDisplay(c.name)
          setAPrazoClientePickerOpen(false)
        }}
      />

      {/* Modal de pagamento com descontos e crédito do cliente integrados */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        cartSubtotal={subtotal}
        impostoEstimado={impostoEstimado}
        total={total}
        discountReais={discountReais}
        discountPercent={discountPercent}
        onDiscountReaisChange={setDiscountReais}
        onDiscountPercentChange={setDiscountPercent}
        selectedCustomer={selectedCustomer}
        customerStoreCredit={customerStoreCredit}
        onCustomerCpfUpdate={(id, cpf) =>
          setSelectedCustomer((prev) => (prev && prev.id === id ? { ...prev, cpf } : prev))
        }
        onRequireCustomer={() => setAPrazoClientePickerOpen(true)}
        cashierId={operadorNome}
        onConfirm={handlePaymentConfirm}
      />

      {/* F6 — Troca / Devolução */}
      <Dialog open={trocasOpen} onOpenChange={setTrocasOpen}>
        <DialogContent className="max-h-[min(90vh,680px)] w-[min(100vw-2rem,82rem)] sm:max-w-[82rem] border-border bg-card p-0 flex flex-col overflow-hidden">
          <DialogHeader className="border-b border-border px-4 py-3 sm:px-6">
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              Troca / Devolução
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
            <Suspense fallback={<div className="py-8 text-center text-muted-foreground">Carregando…</div>}>
              <TrocasDevolucao />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      {/* F11 — Vendas em Espera */}
      <VendaEsperaModal
        open={vendaEsperaOpen}
        onOpenChange={setVendaEsperaOpen}
        heldSales={heldSales}
        cartEmpty={cartRows.length === 0}
        onHold={handleHoldSale}
        onResume={handleResumeSale}
        onDiscard={handleDiscardHeldSale}
      />
    </div>
  )
}
