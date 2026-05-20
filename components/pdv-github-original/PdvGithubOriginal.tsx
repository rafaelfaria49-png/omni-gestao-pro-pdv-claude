"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { PDV_PRODUCTS_BASE, type PdvCatalogProduct } from "@/lib/pdv-catalog"
import { StudioThemeContext } from "@/components/theme/ThemeProvider"
import {
  PdvOmniClassicShell,
  type PdvOmniCartRow,
} from "./components/dashboard/vendas/pdv-omni-classic-shell"

/**
 * Context override local — força `useStudioTheme()` para "black" APENAS
 * dentro do subtree do PDV experimental. NÃO chama `applyTheme()`, então
 * o DOM global (`document.documentElement` classes / `data-studio-theme`)
 * permanece intocado.
 *
 * "black" é o tema default do export original (Claude Design premium dark).
 * Ativa o branch `isBlackEdition=true / inkUi=true` no shell, fazendo o
 * chrome usar `#000000` hardcoded (header, tabela, atalhos, campos).
 */
const BLACK_THEME_CONTEXT_VALUE = {
  mode: "black" as const,
  setMode: () => {},
  toggle: () => {},
}

// ── Mock data ─────────────────────────────────────────────────────────────────

type MockCustomer = { id: string; name: string; cpf: string; phone: string }

const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: "1", name: "João Silva", cpf: "123.456.789-00", phone: "(11) 99999-1234" },
  { id: "2", name: "Maria Santos", cpf: "987.654.321-00", phone: "(11) 98888-5678" },
  { id: "3", name: "Pedro Oliveira", cpf: "456.789.123-00", phone: "(11) 97777-9012" },
  { id: "4", name: "Ana Lima", cpf: "321.654.987-00", phone: "(21) 99888-7654" },
]

// ── Estado interno do carrinho (espelha PdvOmniCartRow + inventoryId) ─────────

type CartItem = PdvOmniCartRow & { inventoryId: string }

let _lineCounter = 1000
const newLineId = () => `line-${++_lineCounter}`

// ── Componente ────────────────────────────────────────────────────────────────

export function PdvGithubOriginal() {
  const bipeRef = useRef<HTMLInputElement>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [bipeCode, setBipeCode] = useState("")
  const [customerDisplay, setCustomerDisplay] = useState("CONSUMIDOR")
  const [nextQtyStr, setNextQtyStr] = useState("1")
  const [seller, setSeller] = useState("01 — Caixa 1")
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [highlightLineId, setHighlightLineId] = useState<string | null>(null)
  const [info, setInfo] = useState(
    "Sistema pronto. Bipe um produto ou pressione F3 para pesquisar."
  )
  const [previousSaleTotal, setPreviousSaleTotal] = useState<number | null>(null)

  // Dialog states
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [clientSearchOpen, setClientSearchOpen] = useState(false)
  const [qtyEditOpen, setQtyEditOpen] = useState(false)
  const [cancelSaleOpen, setCancelSaleOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [receivablesOpen, setReceivablesOpen] = useState(false)

  const products = PDV_PRODUCTS_BASE
  const total = cart.reduce((s, r) => s + r.unitPrice * r.qty, 0)

  const clientOptions = useMemo(
    () => [
      { id: "0", label: "CONSUMIDOR" },
      ...MOCK_CUSTOMERS.map((c) => ({ id: c.id, label: `${c.name} — CPF ${c.cpf}` })),
    ],
    []
  )

  const anyDialogOpen =
    productSearchOpen ||
    clientSearchOpen ||
    qtyEditOpen ||
    cancelSaleOpen ||
    advancedOpen ||
    receivablesOpen

  const focusBipe = useCallback(() => {
    queueMicrotask(() => bipeRef.current?.focus())
  }, [])

  const addProduct = useCallback(
    (p: PdvCatalogProduct) => {
      const qty = Math.max(0.001, parseFloat(nextQtyStr.replace(",", ".")) || 1)
      const lineId = newLineId()
      const code = (p.barcode && p.barcode.trim()) || p.id
      setCart((prev) => [
        ...prev,
        {
          lineId,
          inventoryId: p.id,
          code,
          description: p.name,
          unit: p.vendaPorPeso ? "KG" : "UN",
          unitPrice: p.price,
          qty,
        },
      ])
      setHighlightLineId(lineId)
      setSelectedLineId(lineId)
      setTimeout(() => setHighlightLineId(null), 1200)
      setInfo(`Adicionado: ${p.name}`)
      setBipeCode("")
      focusBipe()
    },
    [nextQtyStr, focusBipe]
  )

  const handleBipeKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    const code = bipeCode.trim()
    if (!code) return
    const lower = code.toLowerCase()
    const found = products.find(
      (p) =>
        p.barcode === code ||
        p.id === code ||
        p.codigoBarras === code ||
        p.sku === code ||
        p.codigo === code ||
        p.name.toLowerCase().includes(lower)
    )
    if (found) {
      addProduct(found)
    } else {
      setInfo(`Produto não encontrado: "${code}"`)
      setBipeCode("")
    }
  }

  const handleFinalizeSale = useCallback(() => {
    if (cart.length === 0) {
      setInfo("Nenhum item. Adicione produtos antes de finalizar.")
      focusBipe()
      return
    }
    const t = total
    setPreviousSaleTotal(t)
    setCart([])
    setSelectedLineId(null)
    setHighlightLineId(null)
    setBipeCode("")
    setNextQtyStr("1")
    setCustomerDisplay("CONSUMIDOR")
    setInfo(`Venda finalizada. Total: R$ ${t.toFixed(2).replace(".", ",")}`)
    focusBipe()
  }, [cart.length, total, focusBipe])

  const openShortcut = useCallback(
    (key: string) => {
      switch (key) {
        case "F1":
          handleFinalizeSale()
          break
        case "F2":
          setClientSearchOpen(true)
          break
        case "F3":
          setProductSearchOpen(true)
          break
        case "F4":
          if (!selectedLineId) {
            setInfo("Selecione um item para alterar a quantidade.")
            focusBipe()
            return
          }
          setQtyEditOpen(true)
          break
        case "F5":
          if (!selectedLineId) {
            setInfo("Selecione um item para cancelá-lo.")
            focusBipe()
            return
          }
          setCart((prev) => prev.filter((r) => r.lineId !== selectedLineId))
          setSelectedLineId(null)
          setInfo("Item cancelado.")
          focusBipe()
          break
        case "F6":
          setCancelSaleOpen(true)
          break
        case "F7":
        case "F8":
          focusBipe()
          break
        case "F9":
          setReceivablesOpen(true)
          break
        case "CTRL":
          setAdvancedOpen(true)
          break
        default:
          break
      }
    },
    [selectedLineId, focusBipe, handleFinalizeSale]
  )

  // Atalhos globais F1–F9 + CTRL (mesmo padrão do pdv-classic original)
  useEffect(() => {
    if (anyDialogOpen) return
    const fnKeys = new Set(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9"])
    let ctrlDown = false
    const down = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Control") {
        ctrlDown = true
        return
      }
      ctrlDown = false
      if (!fnKeys.has(e.key)) return
      e.preventDefault()
      openShortcut(e.key)
    }
    const up = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Control" && ctrlDown) {
        e.preventDefault()
        openShortcut("CTRL")
      }
      ctrlDown = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [openShortcut, anyDialogOpen])

  useEffect(() => {
    focusBipe()
  }, [focusBipe])

  const cartRows: PdvOmniCartRow[] = cart.map((c) => ({
    lineId: c.lineId,
    code: c.code,
    description: c.description,
    detail: c.detail,
    unit: c.unit,
    unitPrice: c.unitPrice,
    qty: c.qty,
  }))

  const qtyEditDefault = selectedLineId
    ? String(cart.find((r) => r.lineId === selectedLineId)?.qty ?? "1")
    : "1"

  return (
    <StudioThemeContext.Provider value={BLACK_THEME_CONTEXT_VALUE}>
      <div className="pdv-original-scope fixed inset-0 z-50 flex min-h-0 flex-col">
        <PdvOmniClassicShell
        storeName="Loja Demo"
        cartRows={cartRows}
        highlightLineId={highlightLineId}
        selectedLineId={selectedLineId}
        onSelectLine={setSelectedLineId}
        total={total}
        itemCount={cart.length}
        previousSaleTotal={previousSaleTotal}
        bipeCode={bipeCode}
        onBipeChange={setBipeCode}
        bipeRef={bipeRef}
        onBipeKeyDown={handleBipeKeyDown}
        customerDisplay={customerDisplay}
        onCustomerDisplayChange={setCustomerDisplay}
        nextQtyStr={nextQtyStr}
        onNextQtyStrChange={setNextQtyStr}
        seller={seller}
        onSellerChange={setSeller}
        info={info}
        onShortcutAction={openShortcut}
        onFinalizeClick={handleFinalizeSale}
        products={products}
        productSearchOpen={productSearchOpen}
        onProductSearchOpenChange={(open) => {
          setProductSearchOpen(open)
          if (!open) focusBipe()
        }}
        clientSearchOpen={clientSearchOpen}
        onClientSearchOpenChange={(open) => {
          setClientSearchOpen(open)
          if (!open) focusBipe()
        }}
        clientOptions={clientOptions}
        onPickClient={(label) => {
          setCustomerDisplay(label)
          setClientSearchOpen(false)
          focusBipe()
        }}
        qtyEditOpen={qtyEditOpen}
        onQtyEditOpenChange={(open) => {
          setQtyEditOpen(open)
          if (!open) focusBipe()
        }}
        qtyEditDefault={qtyEditDefault}
        onQtyEditConfirm={(raw) => {
          const v = parseFloat(String(raw).replace(",", "."))
          if (Number.isFinite(v) && v > 0 && selectedLineId) {
            setCart((prev) =>
              prev.map((r) => (r.lineId === selectedLineId ? { ...r, qty: v } : r))
            )
            setInfo("Quantidade atualizada.")
          }
          setQtyEditOpen(false)
          focusBipe()
        }}
        cancelSaleOpen={cancelSaleOpen}
        onCancelSaleOpenChange={(open) => {
          setCancelSaleOpen(open)
          if (!open) focusBipe()
        }}
        onConfirmCancelSale={() => {
          setCart([])
          setSelectedLineId(null)
          setHighlightLineId(null)
          setBipeCode("")
          setNextQtyStr("1")
          setCustomerDisplay("CONSUMIDOR")
          setCancelSaleOpen(false)
          setInfo("Venda cancelada. Sistema limpo.")
          focusBipe()
        }}
        advancedOpen={advancedOpen}
        onAdvancedOpenChange={(open) => {
          setAdvancedOpen(open)
          if (!open) focusBipe()
        }}
        receivablesOpen={receivablesOpen}
        onReceivablesOpenChange={(open) => {
          setReceivablesOpen(open)
          if (!open) focusBipe()
        }}
        onOpenReceivablesModule={() => {
          setReceivablesOpen(false)
          setInfo("Módulo de Contas a Receber não está integrado nesta versão experimental.")
          focusBipe()
        }}
        onAddProductFromSearch={(product) => {
          setProductSearchOpen(false)
          addProduct(product)
        }}
        />
      </div>
    </StudioThemeContext.Provider>
  )
}
