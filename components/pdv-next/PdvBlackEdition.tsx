"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useConfigEmpresa } from "@/lib/config-empresa"
import { useOperationsStore } from "@/lib/operations-store"
import { useCaixa } from "@/components/dashboard/caixa/caixa-provider"
import { CaixaStatusBar } from "@/components/dashboard/caixa/caixa-status-bar"
import {
  PDV_PRODUCTS_BASE,
  mergePdvCatalogWithInventory,
  newPdvLineId,
  type PdvCatalogProduct,
} from "@/lib/pdv-catalog"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { getOrCreatePdvOperatorId } from "@/lib/pdv-operator-id"
import { useClienteSearch } from "@/lib/hooks/use-cliente-search"
import { PaymentModal } from "@/components/dashboard/vendas/payment-modal"
import { PdvBlackShell, type PdvBlackCartRow } from "./PdvBlackShell"

let _cupomCounter = 1

export function PdvBlackEdition() {
  const { lojaAtivaId, lojaAtivaRaw, opsStorageKey } = useLojaAtiva()
  const { config } = useConfigEmpresa()
  const { inventory } = useOperationsStore()
  const { caixa, sessaoId } = useCaixa()

  // ── Estado do carrinho ─────────────────────────────────────────
  const [cartRows, setCartRows] = useState<PdvBlackCartRow[]>([])
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null)
  const [previousSaleTotal, setPreviousSaleTotal] = useState<number | null>(null)
  const [cupomNumber] = useState(() => _cupomCounter++)

  // ── Campos de entrada ──────────────────────────────────────────
  const [bipeCode, setBipeCode] = useState("")
  const [nextQtyStr, setNextQtyStr] = useState("1")
  const [customerDisplay, setCustomerDisplay] = useState("")

  // ── Operador ──────────────────────────────────────────────────
  const [operatorId, setOperatorId] = useState("—")
  useEffect(() => {
    setOperatorId(getOrCreatePdvOperatorId())
  }, [])

  // ── Ref para o campo de bipe ───────────────────────────────────
  const bipeRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    bipeRef.current?.focus()
  }, [])

  // ── Catálogo de produtos ───────────────────────────────────────
  const products = useMemo(
    () => mergePdvCatalogWithInventory(PDV_PRODUCTS_BASE, inventory),
    [inventory]
  )

  // ── Nome da loja ──────────────────────────────────────────────
  const storeName = useMemo(() => {
    const nome = (lojaAtivaRaw?.nomeFantasia || "").trim()
    if (nome) return nome
    return config?.empresa.nomeFantasia || config?.empresa.razaoSocial || "OmniGestão PDV"
  }, [lojaAtivaRaw, config])

  // ── Total do carrinho ──────────────────────────────────────────
  const total = useMemo(
    () => cartRows.reduce((acc, r) => acc + r.qty * r.unitPrice, 0),
    [cartRows]
  )
  const itemCount = cartRows.length

  // ── Adicionar produto ──────────────────────────────────────────
  const addProduct = useCallback(
    (product: PdvCatalogProduct, qty?: number) => {
      const parsedQty = Math.max(0.001, parseFloat(nextQtyStr) || 1)
      const effectiveQty = qty ?? parsedQty
      const code = String(product.barcode || product.codigo || product.sku || product.id)
      const unit = product.vendaPorPeso ? "KG" : "UN"
      const price = product.vendaPorPeso
        ? (product.precoPorKg ?? product.price)
        : product.price

      const newRow: PdvBlackCartRow = {
        lineId: newPdvLineId(product.id),
        code,
        description: product.name,
        unit,
        unitPrice: price,
        qty: effectiveQty,
      }

      setCartRows((prev) => [...prev, newRow])
      setHighlightLineId(newRow.lineId)
      setSelectedLineId(newRow.lineId)
      setTimeout(() => setHighlightLineId(null), 1200)
      setBipeCode("")
      setNextQtyStr("1")
      bipeRef.current?.focus()
    },
    [nextQtyStr]
  )

  // ── Bipe: tecla Enter ──────────────────────────────────────────
  const handleBipeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return
      e.preventDefault()
      const raw = bipeCode.trim()
      if (!raw) return
      const found = findPdvProductByScan(raw, products)
      if (found) {
        addProduct(found)
      } else {
        // código não encontrado — mantém campo com o código para edição
        bipeRef.current?.select()
      }
    },
    [bipeCode, products, addProduct]
  )

  // ── Escuta evento do modal de produto ─────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const product = (e as CustomEvent<PdvCatalogProduct>).detail
      if (product) addProduct(product)
    }
    window.addEventListener("pdv-black:add-product", handler)
    return () => window.removeEventListener("pdv-black:add-product", handler)
  }, [addProduct])

  // ── Remover linha selecionada ──────────────────────────────────
  const removeSelectedLine = useCallback(() => {
    if (!selectedLineId) return
    setCartRows((prev) => {
      const idx = prev.findIndex((r) => r.lineId === selectedLineId)
      const next = prev.filter((r) => r.lineId !== selectedLineId)
      setSelectedLineId(next[Math.max(0, idx - 1)]?.lineId ?? null)
      return next
    })
  }, [selectedLineId])

  // ── Modais ────────────────────────────────────────────────────
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [clientSearchQuery, setClientSearchQuery] = useState("")
  const [qtyEditOpen, setQtyEditOpen] = useState(false)
  const [cancelSaleOpen, setCancelSaleOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const { clientes: clientResults, isLoading: clientSearchLoading } = useClienteSearch(
    clientSearchQuery,
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

  const selectedLineQty = useMemo(
    () => cartRows.find((r) => r.lineId === selectedLineId)?.qty ?? 1,
    [cartRows, selectedLineId]
  )

  // ── Atalhos de teclado F1–F9 (global) ─────────────────────────
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      switch (e.key) {
        case "F1":
          e.preventDefault()
          if (cartRows.length > 0) setPaymentOpen(true)
          break
        case "F2":
          e.preventDefault()
          setClientSearchOpen(true)
          break
        case "F3":
          e.preventDefault()
          setProductSearchOpen(true)
          break
        case "F4":
          e.preventDefault()
          if (selectedLineId) setQtyEditOpen(true)
          break
        case "F5":
          e.preventDefault()
          removeSelectedLine()
          break
        case "F6":
          e.preventDefault()
          if (cartRows.length > 0) setCancelSaleOpen(true)
          break
        case "F7":
        case "F8":
          e.preventDefault()
          bipeRef.current?.focus()
          break
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [cartRows, selectedLineId, removeSelectedLine])

  const handleShortcutAction = useCallback(
    (key: string) => {
      switch (key) {
        case "F1":
          if (cartRows.length > 0) setPaymentOpen(true)
          break
        case "F2":
          setClientSearchOpen(true)
          break
        case "F3":
          setProductSearchOpen(true)
          break
        case "F4":
          if (selectedLineId) setQtyEditOpen(true)
          break
        case "F5":
          removeSelectedLine()
          break
        case "F6":
          if (cartRows.length > 0) setCancelSaleOpen(true)
          break
        case "F7":
        case "F8":
          bipeRef.current?.focus()
          break
      }
    },
    [cartRows, selectedLineId, removeSelectedLine]
  )

  // ── Confirmar pagamento (mock — não persiste) ──────────────────
  const handlePaymentConfirm = useCallback(() => {
    setPreviousSaleTotal(total)
    setCartRows([])
    setSelectedLineId(null)
    setHighlightLineId(null)
    setCustomerDisplay("")
    setBipeCode("")
    setNextQtyStr("1")
    setPaymentOpen(false)
    bipeRef.current?.focus()
  }, [total])

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#000000]">
      {/* Barra de status do caixa (componente existente) */}
      <CaixaStatusBar variant="pdv" />

      <PdvBlackShell
        storeName={storeName}
        operatorId={operatorId}
        caixaAberto={caixa.isOpen}
        cupomNumber={cupomNumber}
        cartRows={cartRows}
        highlightLineId={highlightLineId}
        selectedLineId={selectedLineId}
        onSelectLine={setSelectedLineId}
        total={total}
        itemCount={itemCount}
        previousSaleTotal={previousSaleTotal}
        bipeCode={bipeCode}
        onBipeChange={setBipeCode}
        bipeRef={bipeRef}
        onBipeKeyDown={handleBipeKeyDown}
        customerDisplay={customerDisplay}
        onCustomerDisplayChange={setCustomerDisplay}
        nextQtyStr={nextQtyStr}
        onNextQtyStrChange={setNextQtyStr}
        onShortcutAction={handleShortcutAction}
        onFinalizeClick={() => { if (cartRows.length > 0) setPaymentOpen(true) }}
        products={products}
        productSearchOpen={productSearchOpen}
        onProductSearchOpenChange={setProductSearchOpen}
        clientSearchOpen={clientSearchOpen}
        onClientSearchOpenChange={setClientSearchOpen}
        clientOptions={clientOptions}
        onPickClient={(label) => setCustomerDisplay(label)}
        clientSearchQuery={clientSearchQuery}
        onClientSearchQueryChange={setClientSearchQuery}
        clientSearchLoading={clientSearchLoading}
        qtyEditOpen={qtyEditOpen}
        onQtyEditOpenChange={setQtyEditOpen}
        qtyEditDefault={String(selectedLineQty)}
        onQtyEditConfirm={(raw) => {
          const qty = Math.max(0.001, parseFloat(raw) || 1)
          setCartRows((prev) =>
            prev.map((r) => r.lineId === selectedLineId ? { ...r, qty } : r)
          )
          setQtyEditOpen(false)
          bipeRef.current?.focus()
        }}
        cancelSaleOpen={cancelSaleOpen}
        onCancelSaleOpenChange={setCancelSaleOpen}
        onConfirmCancelSale={() => {
          setCartRows([])
          setSelectedLineId(null)
          setCancelSaleOpen(false)
          bipeRef.current?.focus()
        }}
      />

      {/* Modal de pagamento (componente existente, sem persistência ainda) */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        cartSubtotal={total}
        total={total}
        discountReais={0}
        discountPercent={0}
        onDiscountReaisChange={() => {}}
        onDiscountPercentChange={() => {}}
        cashierId={operatorId}
        onConfirm={handlePaymentConfirm}
      />
    </div>
  )
}
