"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Barcode,
  Banknote,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Trash2,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { CaixaStatusBar } from "../caixa/caixa-status-bar"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { opsLojaIdFromStorageKey } from "@/lib/ops-loja-id"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { useOperationsStore, type InventoryItem } from "@/lib/operations-store"
import { PaymentModal, type PaymentMethodType } from "./payment-modal"
import { newPdvLineId, type PdvCatalogProduct } from "@/lib/pdv-catalog"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { AttrProductDialog, WeightProductDialog } from "./pdv-product-dialogs"
import { PdvPainelLateralTerminal, PdvVisorTotal } from "./painel-total"
import { PdvTabelaItemLinha, PdvTabelaItens } from "./tabela-itens"
import { getOrCreatePdvOperatorId } from "@/lib/pdv-operator-id"
import { playPdvRapidoItemBeepIfEnabled } from "@/lib/pdv-rapido-feedback"

import type { VendasPDVProps } from "./pdv-classic"

/** Atalho de quantidade: `3*78912345` → quantidade 3 e código à direita do asterisco. */
function parseStarQtyAndRest(raw: string): { codePart: string; qty: number } | null {
  const t = raw.trim()
  const i = t.indexOf("*")
  if (i <= 0) return null
  const left = t.slice(0, i).trim().replace(",", ".")
  const right = t.slice(i + 1).trim()
  if (!right) return null
  const q = parseFloat(left)
  if (!Number.isFinite(q) || q <= 0) return null
  return { codePart: right, qty: q }
}

function normalizeQtyForProduct(p: PdvCatalogProduct, q: number | undefined): number {
  const base = q != null && Number.isFinite(q) && q > 0 ? q : 1
  if (p.vendaPorPeso) return base
  return Math.max(1, Math.floor(base))
}

function inventoryItemToPdvProduct(inv: InventoryItem): PdvCatalogProduct {
  const unit = inv.vendaPorPeso ? (inv.precoPorKg ?? inv.price) : inv.price
  const cat = (inv.category && inv.category.trim()) || "Produtos"
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
    category: cat,
    vendaPorPeso: inv.vendaPorPeso,
    precoPorKg: inv.precoPorKg,
    atributos: inv.atributos,
  }
}

type Product = PdvCatalogProduct

type CartItem = {
  lineId: string
  inventoryId: string
  name: string
  price: number
  quantity: number
  vendaPorPeso?: boolean
  atributosLabel?: string
}

export function PdvSupermercado({
  linkedOsId = null,
  onSaleCompleted,
  voiceCartSeed = null,
  onVoiceCartSeedConsumed,
  voiceOpenCaixaSignal = 0,
  onVoiceOpenCaixaConsumed,
  isModoRapido = false,
}: VendasPDVProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { lojaAtivaId, opsStorageKey } = useLojaAtiva()
  const { pdvParams } = useStoreSettings()
  const { inventory, finalizeSaleTransaction, getSaldoCreditoCliente } = useOperationsStore()

  const lojaKey = lojaAtivaId ?? opsLojaIdFromStorageKey(opsStorageKey)
  const cashierId = useMemo(() => getOrCreatePdvOperatorId(), [])

  const productInputRef = useRef<HTMLInputElement | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const pendingSearchQtyRef = useRef(1)
  const activeSuggestionIndexRef = useRef(-1)

  const [searchTerm, setSearchTerm] = useState("")
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [rapidoFlashLineId, setRapidoFlashLineId] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  const [discountReais, setDiscountReais] = useState<number>(0)
  const [discountPercent, setDiscountPercent] = useState<number>(0)
  const [instantPayIntent, setInstantPayIntent] = useState<PaymentMethodType | null>(null)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [adminSessionOk, setAdminSessionOk] = useState(false)
  const [supervisorDialogOpen, setSupervisorDialogOpen] = useState(false)
  const [supervisorPin, setSupervisorPin] = useState("")
  const [supervisorBusy, setSupervisorBusy] = useState(false)
  const [supervisorErr, setSupervisorErr] = useState<string | null>(null)
  const [supervisorAction, setSupervisorAction] = useState<"clear_cart" | "remove_line" | null>(null)
  const [pendingRemoveLineId, setPendingRemoveLineId] = useState<string | null>(null)

  const [weightDialogOpen, setWeightDialogOpen] = useState(false)
  const [weightProduct, setWeightProduct] = useState<Product | null>(null)
  const [weightKgInput, setWeightKgInput] = useState("")
  const [attrDialogOpen, setAttrDialogOpen] = useState(false)
  const [attrProduct, setAttrProduct] = useState<Product | null>(null)
  const [attrSelections, setAttrSelections] = useState<Record<string, string>>({})

  const hardFocusSearch = useCallback(() => {
    // Hard-focus: o caixa não deve precisar tocar no mouse.
    requestAnimationFrame(() => {
      productInputRef.current?.focus()
      try {
        const el = productInputRef.current
        if (!el) return
        const len = el.value.length
        el.setSelectionRange(len, len)
      } catch {
        /* ignore */
      }
    })
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => hardFocusSearch(), 100)
    return () => window.clearTimeout(t)
  }, [hardFocusSearch])

  useEffect(() => {
    if (!isModoRapido) return
    const t = window.setTimeout(() => hardFocusSearch(), 220)
    return () => window.clearTimeout(t)
  }, [isModoRapido, hardFocusSearch])

  useEffect(() => {
    if (!isModoRapido) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (isPaymentModalOpen || supervisorDialogOpen || weightDialogOpen || attrDialogOpen) return
      if (cart.length === 0) return
      e.preventDefault()
      setCart((prev) => prev.slice(0, -1))
      queueMicrotask(hardFocusSearch)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [isModoRapido, isPaymentModalOpen, supervisorDialogOpen, weightDialogOpen, attrDialogOpen, cart.length, hardFocusSearch])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch("/api/auth/admin", { method: "GET", credentials: "include", cache: "no-store" })
        const j = (await r.json().catch(() => null)) as { authenticated?: boolean }
        if (!r.ok || !j) return
        if (!cancelled) setAdminSessionOk(j?.authenticated === true)
      } catch {
        // falha transiente: manter estado anterior para evitar “fim de sessão” falso
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" })
  }, [cart.length])

  const products = useMemo(
    () => (Array.isArray(inventory) ? inventory.map(inventoryItemToPdvProduct) : []),
    [inventory]
  )

  /** Atalhos configurados só aparecem se existirem no estoque real (mesmo id). */
  const quickItems = useMemo(() => {
    const byId = new Map(inventory.map((i) => [i.id, i]))
    const out: PdvCatalogProduct[] = []
    for (const a of pdvParams.atalhosRapidos || []) {
      const inv = byId.get(a.id)
      if (!inv) continue
      out.push(inventoryItemToPdvProduct(inv))
    }
    // Fallback temporário: se ainda não houver favoritos/atalhos configurados,
    // usamos os 10 primeiros produtos reais do estoque para não poluir a tela.
    // (Estrutura pronta para plugar configuração de favoritos futuramente.)
    if (out.length === 0) return products.slice(0, 10)
    return out.slice(0, 10)
  }, [inventory, pdvParams.atalhosRapidos])

  const searchTrim = searchTerm.trim()

  const filterCatalogByTerm = useCallback(
    (raw: string) => {
      const term = raw.trim().toLowerCase()
      if (!term) return []
      return products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(term) ||
            p.category.toLowerCase().includes(term) ||
            (p.barcode?.toLowerCase().includes(term) ?? false) ||
            (p.codigoBarras?.toLowerCase().includes(term) ?? false) ||
            (p.sku?.toLowerCase().includes(term) ?? false) ||
            (p.codigo?.toLowerCase().includes(term) ?? false) ||
            p.id.toLowerCase().includes(term) ||
            (p.dbId?.toLowerCase().includes(term) ?? false)
        )
        .slice(0, 30)
    },
    [products]
  )

  const filteredProducts = useMemo(() => {
    // Sem busca: mostrar somente atalhos (2 fileiras).
    if (!searchTrim) return quickItems
    // Com busca: resultados reais do estoque, limitados.
    return filterCatalogByTerm(searchTrim)
  }, [filterCatalogByTerm, quickItems, searchTrim])

  /** Lista única para bipe / `findPdvProductByScan` (atalhos primeiro, depois demais itens do estoque). */
  const catalogForScan = useMemo(() => {
    const seen = new Set<string>()
    const out: PdvCatalogProduct[] = []
    for (const p of quickItems) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    for (const p of products) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push(p)
    }
    return out
  }, [quickItems, products])

  useEffect(() => {
    activeSuggestionIndexRef.current = -1
    setActiveSuggestionIndex(-1)
  }, [searchTrim])

  useEffect(() => {
    if (activeSuggestionIndex < 0) return
    const el = document.querySelector(`[data-pdv-suggestion-index="${activeSuggestionIndex}"]`)
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activeSuggestionIndex, filteredProducts])

  const pushCartLine = useCallback(
    (params: { inventoryId: string; name: string; price: number; quantity: number; vendaPorPeso?: boolean; atributosLabel?: string }) => {
      const lineId = newPdvLineId(params.inventoryId)
      setCart((prev) => [
        ...prev,
        {
          lineId,
          inventoryId: params.inventoryId,
          name: params.name,
          price: params.price,
          quantity: params.quantity,
          vendaPorPeso: params.vendaPorPeso,
          atributosLabel: params.atributosLabel,
        },
      ])
      if (isModoRapido) {
        setRapidoFlashLineId(lineId)
        window.setTimeout(() => setRapidoFlashLineId((h) => (h === lineId ? null : h)), 150)
        setSearchTerm("")
        playPdvRapidoItemBeepIfEnabled()
      }
      queueMicrotask(() => {
        hardFocusSearch()
        if (isModoRapido) {
          window.requestAnimationFrame(() => hardFocusSearch())
        }
      })
    },
    [hardFocusSearch, isModoRapido]
  )

  const addToCart = useCallback(
    (product: Product, qtyOverride?: number) => {
      const nq = normalizeQtyForProduct(product, qtyOverride)
      if (product.stock <= 0) {
        toast({ title: "Sem estoque", description: `${product.name} está sem saldo no estoque.` })
        return
      }
      if (!product.vendaPorPeso && product.stock < nq) {
        toast({ title: "Estoque insuficiente", description: `Disponível: ${product.stock} · solicitado: ${nq}.` })
        return
      }
      if (product.atributos && product.atributos.length > 0) {
        pendingSearchQtyRef.current = nq
        setAttrProduct(product)
        const init: Record<string, string> = {}
        for (const a of product.atributos) init[a.id] = a.opcoes[0] ?? ""
        setAttrSelections(init)
        setAttrDialogOpen(true)
        return
      }
      if (product.vendaPorPeso) {
        pendingSearchQtyRef.current = nq
        setAttrSelections({})
        setWeightProduct(product)
        setWeightKgInput(String(nq))
        setWeightDialogOpen(true)
        return
      }
      pushCartLine({ inventoryId: product.id, name: product.name, price: product.price, quantity: nq })
      setSelectedProduct(product)
    },
    [pushCartLine, toast]
  )

  const removeFromCart = useCallback((lineId: string) => setCart((prev) => prev.filter((i) => i.lineId !== lineId)), [])

  const updateQuantity = useCallback((lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.lineId !== lineId) return item
          const step = item.vendaPorPeso ? 0.05 : 1
          const next = item.quantity + delta * step
          return next > 0 ? { ...item, quantity: next } : item
        })
        .filter((x) => x.quantity > 0)
    )
  }, [])

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const pctRaw = Number(discountPercent) || 0
  const discountTotal = useMemo(() => {
    const pctPart = +(subtotal * (pctRaw / 100)).toFixed(2)
    const reaisPart = Math.max(0, Number(discountReais) || 0)
    return Math.min(pctPart + reaisPart, subtotal)
  }, [discountReais, pctRaw, subtotal])
  const total = useMemo(() => Math.max(0, subtotal - discountTotal), [discountTotal, subtotal])

  const openPaymentModal = useCallback(
    (intent: PaymentMethodType | null) => {
      if (cart.length === 0) {
        toast({ title: "Carrinho vazio", description: "Adicione itens para finalizar." })
        hardFocusSearch()
        return
      }
      setInstantPayIntent(intent)
      setIsPaymentModalOpen(true)
    },
    [cart.length, hardFocusSearch, toast]
  )

  const confirmAttrDialog = useCallback(() => {
    if (!attrProduct) return
    const parts = attrProduct.atributos?.map((a) => attrSelections[a.id]).filter(Boolean) ?? []
    const label = parts.length ? `${attrProduct.name} (${parts.join(" · ")})` : attrProduct.name
    const lineQty = pendingSearchQtyRef.current
    setAttrDialogOpen(false)
    if (attrProduct.vendaPorPeso) {
      setWeightProduct(attrProduct)
      setWeightKgInput(String(lineQty))
      setWeightDialogOpen(true)
      return
    }
    pushCartLine({
      inventoryId: attrProduct.id,
      name: label,
      price: attrProduct.price,
      quantity: lineQty,
      atributosLabel: parts.join(" · "),
    })
    setSelectedProduct(attrProduct)
    setAttrProduct(null)
    queueMicrotask(hardFocusSearch)
  }, [attrProduct, attrSelections, hardFocusSearch, pushCartLine])

  const confirmWeightDialog = useCallback(() => {
    if (!weightProduct) return
    const kg = parseFloat(weightKgInput.replace(",", "."))
    if (!Number.isFinite(kg) || kg <= 0) {
      toast({ title: "Peso inválido", description: "Informe o peso em kg.", variant: "destructive" })
      return
    }
    const inv = inventory.find((i) => i.id === weightProduct.id)
    if (inv && kg > inv.stock + 0.0001) {
      toast({ title: "Estoque", description: "Peso maior que o disponível.", variant: "destructive" })
      return
    }
    const pKg = weightProduct.precoPorKg ?? weightProduct.price
    const parts = weightProduct.atributos?.length ? weightProduct.atributos.map((a) => attrSelections[a.id]).filter(Boolean) : []
    const baseName = parts.length ? `${weightProduct.name} (${parts.join(" · ")})` : weightProduct.name
    pushCartLine({
      inventoryId: weightProduct.id,
      name: `${baseName} — ${kg.toFixed(3)} kg`,
      price: pKg,
      quantity: kg,
      vendaPorPeso: true,
      atributosLabel: parts.length ? parts.join(" · ") : undefined,
    })
    setSelectedProduct(weightProduct)
    setWeightDialogOpen(false)
    setWeightProduct(null)
    setAttrProduct(null)
    queueMicrotask(hardFocusSearch)
  }, [attrSelections, hardFocusSearch, inventory, pushCartLine, toast, weightKgInput, weightProduct])

  // Voz: item no carrinho
  useEffect(() => {
    if (!voiceCartSeed?.key) return
    const label = (voiceCartSeed.itemName || "").trim()
    if (!label) {
      onVoiceCartSeedConsumed?.()
      return
    }
    const id = `voice-${voiceCartSeed.key}`
    const unit = voiceCartSeed.price ?? 0
    setCart((prev) => [
      ...prev,
      { lineId: newPdvLineId(id), inventoryId: id, name: label, price: Math.max(0, unit), quantity: 1 },
    ])
    toast({ title: "Voz: item no carrinho", description: label })
    onVoiceCartSeedConsumed?.()
    queueMicrotask(hardFocusSearch)
  }, [hardFocusSearch, onVoiceCartSeedConsumed, toast, voiceCartSeed])

  const findProductByEan = useCallback(
    (raw: string): Product | null => findPdvProductByScan(raw, catalogForScan),
    [catalogForScan]
  )

  const submitSearch = useCallback(
    (keyboardPickIndex?: number) => {
      if (
        keyboardPickIndex != null &&
        keyboardPickIndex >= 0 &&
        keyboardPickIndex < filteredProducts.length
      ) {
        addToCart(filteredProducts[keyboardPickIndex] as Product)
        setSearchTerm("")
        activeSuggestionIndexRef.current = -1
        setActiveSuggestionIndex(-1)
        queueMicrotask(hardFocusSearch)
        return
      }

      const rawFull = searchTerm.trim()
      if (!rawFull) return

      const star = parseStarQtyAndRest(rawFull)
      const lookupTerm = star?.codePart ?? rawFull
      const multQty = star?.qty

      const eanHit = findProductByEan(lookupTerm)
      if (eanHit) {
        addToCart(eanHit, multQty)
        setSearchTerm("")
        activeSuggestionIndexRef.current = -1
        setActiveSuggestionIndex(-1)
        queueMicrotask(hardFocusSearch)
        return
      }

      const candidates = filterCatalogByTerm(lookupTerm)
      if (candidates.length === 1) {
        addToCart(candidates[0] as Product, multQty)
        setSearchTerm("")
        activeSuggestionIndexRef.current = -1
        setActiveSuggestionIndex(-1)
        queueMicrotask(hardFocusSearch)
        return
      }
      const exact = candidates.find((p) => p.name.toLowerCase() === lookupTerm.toLowerCase())
      if (exact) {
        addToCart(exact as Product, multQty)
        setSearchTerm("")
        activeSuggestionIndexRef.current = -1
        setActiveSuggestionIndex(-1)
        queueMicrotask(hardFocusSearch)
        return
      }

      toast({
        title: "Selecione o item",
        description: "Vários resultados. Use as setas ↑↓ e Enter para escolher sem o mouse.",
      })
      hardFocusSearch()
    },
    [addToCart, filterCatalogByTerm, filteredProducts, findProductByEan, hardFocusSearch, searchTerm, toast]
  )

  // Atalhos de teclado (evitar conflitos com o navegador)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (e.key !== "F2" && e.key !== "F3" && e.key !== "F4") return
      // Quando modal aberto, não interceptar (deixa o modal controlar o teclado)
      if (isPaymentModalOpen) return

      e.preventDefault()
      e.stopPropagation()
      if (e.key === "F2") openPaymentModal("dinheiro")
      else if (e.key === "F3") openPaymentModal("pix")
      else openPaymentModal("cartao_debito")
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any)
  }, [isPaymentModalOpen, openPaymentModal])

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b border-border">
        <CaixaStatusBar
          variant="pdv"
          openAberturaSignal={voiceOpenCaixaSignal}
          onOpenAberturaSignalConsumed={onVoiceOpenCaixaConsumed}
        />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row",
          isModoRapido && "min-h-0"
        )}
      >
        {/* ESQUERDA: Catálogo + Busca gigante */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
          <div className={cn("shrink-0 bg-background/50 backdrop-blur-xl border-b border-border/50 px-4", isModoRapido ? "py-4" : "py-5")}>
            <div className="flex flex-col gap-3">
              {!isModoRapido ? (
                <div className="flex items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm">
                    <Barcode className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-none">Busca / Código de barras</div>
                    <div className="text-xs leading-tight text-foreground/70 dark:text-white/55">
                      Enter adiciona; quantidade×código com *; ↑↓ destaca sugestão.
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="relative group">
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-primary/20 to-transparent opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
                <Search className="pointer-events-none absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 text-foreground/40 transition-colors duration-300 group-focus-within:text-primary" />
                <Input
                  ref={productInputRef}
                  autoFocus
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    const len = filteredProducts.length
                    if (e.key === "ArrowDown" && len > 0) {
                      e.preventDefault()
                      setActiveSuggestionIndex((prev) => {
                        const next = prev < 0 ? 0 : Math.min(len - 1, prev + 1)
                        activeSuggestionIndexRef.current = next
                        return next
                      })
                      return
                    }
                    if (e.key === "ArrowUp" && len > 0) {
                      e.preventDefault()
                      setActiveSuggestionIndex((prev) => {
                        const next = prev <= 0 ? -1 : prev - 1
                        activeSuggestionIndexRef.current = next
                        return next
                      })
                      return
                    }
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const idx = activeSuggestionIndexRef.current
                      if (idx >= 0 && idx < len) {
                        submitSearch(idx)
                      } else {
                        submitSearch()
                      }
                    }
                  }}
                  placeholder="Digite produto, categoria ou escaneie o código…"
                  className="relative h-20 rounded-[2rem] border-2 border-border/50 bg-card/80 pl-16 pr-6 text-2xl font-black tracking-tight shadow-sm backdrop-blur-md transition-all duration-300 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:shadow-lg focus-visible:shadow-primary/10 placeholder:text-foreground/30"
                />
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
                  <p className="text-base font-semibold text-foreground">
                    {products.length === 0
                      ? "Nenhum produto cadastrado no estoque desta unidade."
                      : searchTrim
                        ? "Nenhum produto encontrado para esta busca."
                        : "Configure os atalhos do PDV para exibir produtos rápidos aqui."}
                  </p>
                </div>
              ) : (
                filteredProducts.map((p, idx) => (
                  <button
                    key={`${p.id}-${p.category}-${idx}`}
                    type="button"
                    data-pdv-suggestion-index={idx}
                    className={cn(
                      "group relative flex flex-col rounded-[2rem] border border-border/60 bg-card/60 p-5 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 active:scale-[0.98]",
                      selectedProduct?.id === p.id ? "ring-2 ring-primary/50" : "",
                      activeSuggestionIndex === idx ? "ring-4 ring-primary/40 ring-offset-2 ring-offset-background" : "shadow-sm"
                    )}
                    onClick={() => addToCart(p as Product)}
                  >
                    {/* Fundo sutil com a cor do tema */}
                    <div className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-0 transition-opacity duration-300 group-hover:opacity-20 z-0" style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.5) 0%, transparent 100%)" }} />
                    
                    {/* Glow externo no hover */}
                    <div className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-0 transition-opacity duration-300 group-hover:opacity-100 z-0" style={{ boxShadow: "0 0 30px 2px hsl(var(--primary) / 0.25)" }} />

                    <div className="relative z-10 flex flex-1 flex-col justify-between w-full h-full">
                      <div className="line-clamp-2 min-h-[3rem] text-[15px] font-extrabold leading-tight text-foreground">
                        {p.name}
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2 border-t border-border/40 pt-3">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 line-clamp-1 flex-1">
                          {p.category}
                        </div>
                        <div className="text-lg font-black tabular-nums tracking-tight text-primary">
                          R$ {Number(p.price || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <div ref={listEndRef} />
          </ScrollArea>
        </div>

        {/* DIREITA: Carrinho mais largo + pagamentos gigantes */}
        <PdvPainelLateralTerminal
          className={cn(
            "lg:w-[560px] lg:min-w-[560px] border-l border-border/50 bg-card/30 backdrop-blur-2xl shadow-2xl",
            isModoRapido && "lg:w-[min(100%,440px)] lg:min-w-[320px] lg:max-w-[440px]"
          )}
        >
          <div className="shrink-0 border-b border-border/50 bg-background/40 px-5 py-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <div className="text-xl font-black tracking-tight">Carrinho</div>
              </div>
              <Button
                variant="outline"
                className="h-9 rounded-xl border-border/50 bg-card/50 font-bold backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                onClick={() => {
                  if (cart.length === 0) return
                  if (isModoRapido) {
                    setCart([])
                    setDiscountPercent(0)
                    setDiscountReais(0)
                    toast({ title: "Carrinho limpo" })
                    queueMicrotask(hardFocusSearch)
                    return
                  }
                  if (adminSessionOk) {
                    setCart([])
                    setDiscountPercent(0)
                    setDiscountReais(0)
                    toast({ title: "Carrinho limpo" })
                    productInputRef.current?.focus()
                    return
                  }
                  setSupervisorAction("clear_cart")
                  setPendingRemoveLineId(null)
                  setSupervisorErr(null)
                  setSupervisorPin("")
                  setSupervisorDialogOpen(true)
                }}
                disabled={cart.length === 0}
              >
                Limpar
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-sm space-y-2">
                  <div className="text-lg font-bold">Carrinho vazio</div>
                  <div className="text-sm text-foreground/70 dark:text-white/55">
                    Use a busca acima (ou o leitor) para adicionar itens rapidamente.
                  </div>
                </div>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <PdvTabelaItens className="p-2">
                  {cart.map((item) => (
                    <PdvTabelaItemLinha
                      key={item.lineId}
                      className={cn(
                        "rounded-lg transition-colors hover:bg-foreground/5 dark:hover:bg-white/5",
                        isModoRapido && rapidoFlashLineId === item.lineId && "pdv-rapido-row-flash"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-extrabold">{item.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-foreground/65 dark:text-white/50">
                          <span className="tabular-nums">R$ {item.price.toFixed(2)}</span>
                          {item.vendaPorPeso ? <span>por kg</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => updateQuantity(item.lineId, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <div className="w-16 text-center text-base font-black tabular-nums">
                          {item.vendaPorPeso ? item.quantity.toFixed(3) : item.quantity.toFixed(0)}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => updateQuantity(item.lineId, +1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="w-28 text-right text-base font-black tabular-nums">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-foreground/55 hover:text-destructive dark:text-white/50"
                        onClick={() => {
                          // PDV Rápido: remoção direta (sem PIN) para alta rotatividade.
                          if (isModoRapido) {
                            removeFromCart(item.lineId)
                            queueMicrotask(hardFocusSearch)
                            return
                          }
                          if (adminSessionOk) {
                            removeFromCart(item.lineId)
                            return
                          }
                          setSupervisorAction("remove_line")
                          setPendingRemoveLineId(item.lineId)
                          setSupervisorErr(null)
                          setSupervisorPin("")
                          setSupervisorDialogOpen(true)
                        }}
                        title="Remover item"
                      >
                        {isModoRapido ? <X className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                      </Button>
                    </PdvTabelaItemLinha>
                  ))}
                </PdvTabelaItens>
              </ScrollArea>
            )}
          </div>

          <div className="shrink-0 border-t border-border/50 bg-background/60 p-5 backdrop-blur-xl">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-bold text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">R$ {subtotal.toFixed(2)}</span>
              </div>
              {discountTotal > 0 ? (
                <div className="flex items-center justify-between text-sm font-bold text-destructive">
                  <span>Desconto</span>
                  <span className="tabular-nums">− R$ {discountTotal.toFixed(2)}</span>
                </div>
              ) : null}
              
              {/* Premium Visor */}
              <div className="relative overflow-hidden rounded-[2rem] border border-border/50 bg-gradient-to-b from-black/80 to-black/95 p-6 shadow-inner dark:from-black/60 dark:to-black/80">
                <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-[50px] pointer-events-none" />
                <div className="relative z-10 flex flex-col">
                  <span className="text-xs font-black uppercase tracking-widest text-white/50 mb-1">Total a pagar</span>
                  <span className="text-4xl sm:text-5xl font-black tabular-nums tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    R$ {total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Botoes SaaS Premium */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Button
                type="button"
                className="group relative h-16 rounded-[1.5rem] border border-border/30 bg-card/80 text-foreground shadow-sm backdrop-blur-md transition-all hover:-translate-y-1 hover:border-foreground/20 hover:shadow-md hover:bg-foreground/5"
                onClick={() => openPaymentModal("dinheiro")}
              >
                <div className="flex flex-col items-center gap-1">
                  <Banknote className="h-5 w-5 text-emerald-500 transition-transform group-hover:scale-110" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Dinheiro <span className="opacity-50 ml-0.5">[F2]</span></span>
                </div>
              </Button>
              <Button
                type="button"
                className="group relative h-16 rounded-[1.5rem] border border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400 shadow-sm backdrop-blur-md transition-all hover:-translate-y-1 hover:border-teal-500/50 hover:bg-teal-500/20 hover:shadow-[0_0_20px_rgba(20,184,166,0.3)]"
                onClick={() => openPaymentModal("pix")}
              >
                <div className="flex flex-col items-center gap-1">
                  <QrCode className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">PIX <span className="opacity-50 ml-0.5">[F3]</span></span>
                </div>
              </Button>
              <Button
                type="button"
                className="group relative h-16 rounded-[1.5rem] border border-primary/30 bg-primary/10 text-primary shadow-sm backdrop-blur-md transition-all hover:-translate-y-1 hover:border-primary/50 hover:bg-primary/20 hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                onClick={() => openPaymentModal("cartao_debito")}
                title="Cartão (débito)"
              >
                <div className="flex flex-col items-center gap-1">
                  <CreditCard className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Cartão <span className="opacity-50 ml-0.5">[F4]</span></span>
                </div>
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-3 h-14 w-full rounded-[1.5rem] border border-border/50 bg-background/50 text-sm font-bold uppercase tracking-widest text-foreground/70 backdrop-blur-sm transition-colors hover:bg-foreground/5 hover:text-foreground"
              onClick={() => openPaymentModal(null)}
              disabled={cart.length === 0}
            >
              <Zap className="mr-2 h-5 w-5" /> Finalizar (outros)
            </Button>
          </div>
        </PdvPainelLateralTerminal>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false)
          setInstantPayIntent(null)
          queueMicrotask(hardFocusSearch)
        }}
        cartSubtotal={subtotal}
        total={total}
        discountReais={discountReais}
        discountPercent={discountPercent}
        onDiscountReaisChange={setDiscountReais}
        onDiscountPercentChange={setDiscountPercent}
        custoPeca={total * 0.35}
        selectedCustomer={null}
        customerStoreCredit={getSaldoCreditoCliente("")}
        instantPayIntent={instantPayIntent}
        onInstantPayIntentConsumed={() => setInstantPayIntent(null)}
        onCustomerCpfUpdate={() => {}}
        cashierId={cashierId}
        onConfirm={(payments, meta) => {
          const saleLines = cart
            .filter((item) => inventory.some((i) => i.id === item.inventoryId))
            .map((item) => ({
              inventoryId: item.inventoryId,
              quantity: item.quantity,
              unitPrice: item.price,
              name: item.name,
            }))

          let dinheiro = 0
          let pix = 0
          let cartaoDebito = 0
          let cartaoCredito = 0
          let carne = 0
          let aPrazo = 0
          let creditoVale = 0
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
            linkedOsId,
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
          })

          if (!result.ok) {
            toast({ title: "Falha transacional", description: result.reason })
            return
          }

          setCart([])
          setDiscountReais(0)
          setDiscountPercent(0)
          setSelectedProduct(null)
          setRapidoFlashLineId(null)
          setSearchTerm("")
          setIsPaymentModalOpen(false)
          setInstantPayIntent(null)
          onSaleCompleted?.()
          toast({
            title: "Venda finalizada",
            description: `${payments.length} forma(s) de pagamento confirmada(s).`,
          })
          queueMicrotask(() => {
            hardFocusSearch()
            if (isModoRapido) {
              window.requestAnimationFrame(() => hardFocusSearch())
            }
          })
        }}
      />

      <AttrProductDialog
        open={attrDialogOpen}
        onOpenChange={(open) => {
          setAttrDialogOpen(open)
          if (!open) setAttrProduct(null)
        }}
        product={attrProduct}
        attrSelections={attrSelections}
        onAttrSelectionsChange={setAttrSelections}
        onConfirm={confirmAttrDialog}
      />

      <WeightProductDialog
        open={weightDialogOpen}
        onOpenChange={(open) => {
          setWeightDialogOpen(open)
          if (!open) setWeightProduct(null)
        }}
        product={weightProduct}
        weightKgInput={weightKgInput}
        onWeightKgInputChange={setWeightKgInput}
        onConfirm={confirmWeightDialog}
        onReadScale={() => {}}
        scaleBusy={false}
      />

      <Dialog
        open={supervisorDialogOpen}
        onOpenChange={(open) => {
          setSupervisorDialogOpen(open)
          if (!open) {
            setSupervisorPin("")
            setSupervisorErr(null)
            setSupervisorBusy(false)
            setSupervisorAction(null)
            setPendingRemoveLineId(null)
          }
        }}
      >
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Senha do Supervisor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {supervisorAction === "remove_line"
                ? "Excluir item exige autorização de administrador."
                : "Cancelar/limpar venda exige autorização de administrador."}
            </p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Senha</Label>
              <Input
                type="password"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder="PIN"
                autoComplete="off"
                className="h-11"
              />
            </div>
            {supervisorErr ? <p className="text-xs text-destructive">{supervisorErr}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setSupervisorDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 bg-emerald-600 font-bold text-zinc-950 hover:bg-emerald-500 disabled:opacity-50"
                disabled={supervisorBusy || supervisorPin.trim().length === 0}
                onClick={async () => {
                  setSupervisorErr(null)
                  setSupervisorBusy(true)
                  try {
                    const r = await fetch("/api/auth/admin", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pin: supervisorPin.trim() }),
                    })
                    if (!r.ok) {
                      setSupervisorErr("Senha inválida.")
                      setAdminSessionOk(false)
                      return
                    }
                    setAdminSessionOk(true)
                    if (supervisorAction === "remove_line" && pendingRemoveLineId) {
                      removeFromCart(pendingRemoveLineId)
                      toast({ title: "Item removido", description: "Autorizado pelo supervisor." })
                    } else {
                      setCart([])
                      setDiscountPercent(0)
                      setDiscountReais(0)
                      toast({ title: "Carrinho limpo", description: "Autorizado pelo supervisor." })
                    }
                    setSupervisorDialogOpen(false)
                    queueMicrotask(hardFocusSearch)
                  } catch {
                    setSupervisorErr("Falha ao validar senha.")
                    setAdminSessionOk(false)
                  } finally {
                    setSupervisorBusy(false)
                  }
                }}
              >
                Autorizar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

