"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  Barcode,
  Calculator,
  ChevronRight,
  Hash,
  Loader2,
  PackageOpen,
  Receipt,
  Search,
  User2,
  UserCog,
  Wifi,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useStudioTheme } from "@/components/theme/ThemeProvider"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import { cn } from "@/lib/utils"
import type { PdvCatalogProduct } from "@/lib/pdv-catalog"

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type PdvOmniCartRow = {
  lineId: string
  code: string
  description: string
  /** Subtítulo (ex.: checklist de entrada da O.S. no serviço). */
  detail?: string
  unit: string
  unitPrice: number
  qty: number
}

const PosField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string
    hint?: string
    icon?: ReactNode
    fieldClassName?: string
    /** Black Edition: preto absoluto nos campos; Classic: tokens Lovable. */
    tone?: "black" | "classic"
  }
>(({ label, hint, icon, className, fieldClassName, tone = "classic", ...props }, ref) => {
  const isBlack = tone === "black"
  return (
    <label className={cn("flex flex-col gap-1", fieldClassName)}>
      <span
        className={cn(
          "flex items-center justify-between text-[11px] font-medium uppercase tracking-wider",
          isBlack ? "text-white/55" : "text-pos-label"
        )}
      >
        <span>{label}</span>
        {hint ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
              isBlack ? "bg-white/10 text-white/80" : "bg-secondary text-secondary-foreground"
            )}
          >
            {hint}
          </span>
        ) : null}
      </span>
      <div className="relative">
        {icon ? (
          <span
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2",
              isBlack ? "text-white/45" : "text-pos-label"
            )}
          >
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            "tabular-pdv h-9 w-full rounded-md border px-3 text-sm font-medium shadow-pos outline-none transition-colors",
            isBlack
              ? "border-white/15 bg-[#000000] text-white placeholder:text-white/40 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/25"
              : "border-[hsl(var(--pos-input-border))] bg-[hsl(var(--pos-input))] text-foreground placeholder:text-pos-label/60 focus:border-[hsl(var(--pos-input-focus))] focus:ring-2 focus:ring-[hsl(var(--pos-input-focus)/0.18)]",
            icon && "pl-8",
            className
          )}
          {...props}
        />
      </div>
    </label>
  )
})
PosField.displayName = "PosField"

const shortcuts = [
  { key: "F1", label: "Finalizar Venda", tone: "accent" as const },
  { key: "F2", label: "Cliente" },
  { key: "F3", label: "Produto" },
  { key: "F4", label: "Alt. Qtd" },
  { key: "F5", label: "Cancelar Item" },
  { key: "F6", label: "Cancelar Venda", tone: "destructive" as const },
  { key: "F7", label: "Voltar ao Bipe" },
  { key: "F8", label: "Voltar ao Bipe" },
  { key: "F9", label: "Contas a Receber" },
  { key: "CTRL", label: "Funções Avançadas" },
]

function ShortcutBar({ onAction, isBlack }: { onAction: (key: string) => void; isBlack: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 border-t px-3 py-2",
        isBlack ? "border-white/10 bg-[#000000]" : "pos-divider bg-pos-header"
      )}
    >
      {shortcuts.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onAction(s.key)}
          className={cn(
            "group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-pos transition-all",
            isBlack
              ? "border-white/10 bg-[#000000] text-white/90 hover:-translate-y-px hover:border-emerald-500/50 hover:shadow-md active:translate-y-0"
              : "border-[hsl(var(--pos-divider))] bg-pos-panel text-foreground hover:-translate-y-px hover:border-[hsl(var(--pos-input-focus)/0.4)] hover:shadow-pos-md active:translate-y-0",
            !isBlack && s.tone === "accent" && "border-emerald-500/30 dark:border-emerald-400/30",
            !isBlack && s.tone === "destructive" && "border-destructive/30",
            isBlack && s.tone === "accent" && "border-emerald-500/40",
            isBlack && s.tone === "destructive" && "border-red-500/40"
          )}
        >
          <kbd
            className={cn(
              "rounded border border-b-2 px-1.5 py-0.5 text-[10px] font-bold tabular-pdv",
              isBlack
                ? s.tone === "accent"
                  ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                  : s.tone === "destructive"
                    ? "border-red-400/50 bg-red-500/15 text-red-300"
                    : "border-white/20 bg-black text-white/80"
                : s.tone === "accent"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : s.tone === "destructive"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-[hsl(var(--pos-input-border))] bg-secondary text-pos-label"
            )}
          >
            {s.key}
          </kbd>
          <span className={cn("group-hover:opacity-100", isBlack ? "text-white/60 group-hover:text-white" : "text-pos-label group-hover:text-foreground")}>
            {s.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function ItemsTable({
  rows,
  highlightLineId,
  flashLineId,
  selectedLineId,
  onSelect,
  isBlack,
}: {
  rows: PdvOmniCartRow[]
  highlightLineId: string | null
  flashLineId?: string | null
  selectedLineId: string | null
  onSelect: (id: string) => void
  isBlack: boolean
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-x-auto rounded-md border shadow-pos",
        isBlack ? "border-white/10 bg-[#000000]" : "pos-divider bg-pos-panel"
      )}
    >
      <div className="min-w-[820px] flex flex-col flex-1 min-h-0">
        <div
          className={cn(
            "grid grid-cols-[48px_130px_1fr_64px_110px_80px_130px] gap-2 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider",
            isBlack ? "border-white/10 bg-[#000000] text-white/55" : "pos-divider bg-pos-header text-pos-label"
          )}
        >
          <div>Item</div>
          <div>Código</div>
          <div>Descrição</div>
          <div>Unid.</div>
          <div className="text-right">Unitário</div>
          <div className="text-right">Qtd</div>
          <div className="text-right">Total</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-2 py-10",
                isBlack ? "text-white/50" : "text-pos-label"
              )}
            >
              <PackageOpen className="h-10 w-10 opacity-40" strokeWidth={1.5} />
              <p className={cn("text-sm font-medium", isBlack && "text-white/80")}>Nenhum item bipado</p>
              <p className={cn("max-w-sm px-4 text-center text-xs", isBlack && "text-white/55")}>
                Bipe no campo acima ou pressione{" "}
                <kbd
                  className={cn(
                    "rounded border px-1 text-[10px] font-bold",
                    isBlack ? "border-white/20 bg-black text-white/80" : "border-[hsl(var(--pos-input-border))] bg-secondary"
                  )}
                >
                  F3
                </kbd>{" "}
                para pesquisar
              </p>
            </div>
          ) : (
            rows.map((item, idx) => {
              const lineTotal = item.qty * item.unitPrice
              const isHighlight = item.lineId === highlightLineId
              const isFlash = flashLineId != null && item.lineId === flashLineId
              const isSelected = item.lineId === selectedLineId
              return (
                <button
                  type="button"
                  key={item.lineId}
                  onClick={() => onSelect(item.lineId)}
                  className={cn(
                    "grid w-full grid-cols-[48px_130px_1fr_64px_110px_80px_130px] gap-2 border-b px-4 py-2.5 text-left text-sm tabular-pdv transition-colors",
                    isFlash && "pdv-rapido-row-flash",
                    isBlack
                      ? cn(
                          "border-white/10 bg-[#000000] text-white",
                          isHighlight && "bg-emerald-500/15 animate-in fade-in duration-300",
                          isSelected && "ring-1 ring-inset ring-emerald-400/70",
                          "hover:bg-emerald-500/10"
                        )
                      : cn(
                          "border-[hsl(var(--pos-divider))] text-foreground",
                          idx % 2 === 0 ? "bg-pos-row" : "bg-pos-row-alt",
                          isHighlight && "bg-pos-row-highlight animate-in fade-in duration-300",
                          isSelected && "ring-1 ring-inset ring-[hsl(var(--pos-input-focus))]",
                          "hover:bg-pos-row-highlight/60"
                        )
                  )}
                >
                  <div className={cn("font-mono", isBlack ? "text-white/45" : "text-pos-label")}>{String(idx + 1).padStart(3, "0")}</div>
                  <div className={cn("font-mono truncate min-w-0", isBlack ? "text-white" : "text-foreground")} title={item.code}>{item.code}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium" title={item.description}>{item.description}</div>
                    {item.detail ? (
                      <div
                        className={cn(
                          "mt-0.5 truncate font-mono text-[10px] leading-snug",
                          isBlack ? "text-cyan-200/80" : "text-slate-600"
                        )}
                        title={item.detail}
                      >
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                  <div className={isBlack ? "text-white/45" : "text-pos-label"}>{item.unit}</div>
                  <div className="text-right">R$ {fmt(item.unitPrice)}</div>
                  <div className="text-right font-medium">{fmt(item.qty)}</div>
                  <div className="text-right font-semibold">R$ {fmt(lineTotal)}</div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export type PdvOmniClassicShellProps = {
  storeName: string
  cartRows: PdvOmniCartRow[]
  highlightLineId: string | null
  /** Flash curto ao adicionar item (modo rápido). */
  flashLineId?: string | null
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
  total: number
  itemCount: number
  previousSaleTotal: number | null
  bipeCode: string
  onBipeChange: (v: string) => void
  bipeRef: React.RefObject<HTMLInputElement | null>
  onBipeKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  /** Sugestões para autocomplete do campo BIPE (max 8). */
  bipeSuggestions?: PdvCatalogProduct[]
  onBipeSuggestionSelect?: (product: PdvCatalogProduct) => void
  customerDisplay: string
  onCustomerDisplayChange: (v: string) => void
  nextQtyStr: string
  onNextQtyStrChange: (v: string) => void
  seller: string
  onSellerChange: (v: string) => void
  info: string
  onShortcutAction: (key: string) => void
  onFinalizeClick: () => void
  products: PdvCatalogProduct[]
  productSearchOpen: boolean
  onProductSearchOpenChange: (open: boolean) => void
  clientSearchOpen: boolean
  onClientSearchOpenChange: (open: boolean) => void
  clientOptions: Array<{ id: string; label: string }>
  onPickClient: (label: string) => void
  /** Live search query for the F2 client picker (controlled from parent). */
  clientSearchQuery?: string
  onClientSearchQueryChange?: (v: string) => void
  clientSearchLoading?: boolean
  qtyEditOpen: boolean
  onQtyEditOpenChange: (open: boolean) => void
  qtyEditDefault: string
  onQtyEditConfirm: (raw: string) => void
  cancelSaleOpen: boolean
  onCancelSaleOpenChange: (open: boolean) => void
  onConfirmCancelSale: () => void
  advancedOpen: boolean
  onAdvancedOpenChange: (open: boolean) => void
  receivablesOpen: boolean
  onReceivablesOpenChange: (open: boolean) => void
  onOpenReceivablesModule: () => void
  onAddProductFromSearch: (product: PdvCatalogProduct) => void
  /** PDV rápido: menos cromo (atalhos visíveis, painel lateral, infos decorativas). */
  isModoRapido?: boolean
}

export function PdvOmniClassicShell(props: PdvOmniClassicShellProps) {
  const isModoRapido = props.isModoRapido === true
  const qtyEditRef = useRef<HTMLInputElement>(null)
  const clientSearchInputRef = useRef<HTMLInputElement>(null)

  // Explicit focus when F2 dialog opens (autoFocus unreliable inside Radix Dialog)
  useEffect(() => {
    if (props.clientSearchOpen) {
      window.setTimeout(() => clientSearchInputRef.current?.focus(), 60)
    }
  }, [props.clientSearchOpen])
  const now = new Date().toLocaleString("pt-BR")
  const { mode: studioMode } = useStudioTheme()
  /** Apenas Black Edition: fundo #000 fixo no shell. */
  const isBlackEdition = studioMode === "black"
  /** Midnight e Black Edition compartilham chrome de alto contraste (tabela, atalhos, campos). */
  const inkUi = studioMode === "black" || studioMode === "midnight"
  const fieldTone = inkUi ? ("black" as const) : ("classic" as const)

  // Índice da sugestão ativa via teclado (-1 = nenhuma)
  const [bipeActiveIdx, setBipeActiveIdx] = useState(-1)
  const activeItemRef = useRef<HTMLButtonElement>(null)

  // Reseta seleção quando o texto muda
  useEffect(() => {
    setBipeActiveIdx(-1)
  }, [props.bipeCode])

  // Scroll automático para manter item ativo visível
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [bipeActiveIdx])

  const handleBipeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const suggestions = props.bipeSuggestions ?? []
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setBipeActiveIdx((prev) => Math.min(prev + 1, suggestions.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setBipeActiveIdx((prev) => Math.max(prev - 1, -1))
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        props.onBipeChange("")
        setBipeActiveIdx(-1)
        return
      }
      if (e.key === "Enter" && bipeActiveIdx >= 0 && suggestions[bipeActiveIdx]) {
        e.preventDefault()
        props.onBipeSuggestionSelect?.(suggestions[bipeActiveIdx])
        setBipeActiveIdx(-1)
        return
      }
      props.onBipeKeyDown(e)
    },
    [bipeActiveIdx, props]
  )

  useEffect(() => {
    if (!props.qtyEditOpen) return
    const id = window.requestAnimationFrame(() => {
      qtyEditRef.current?.focus()
      qtyEditRef.current?.select?.()
    })
    return () => window.cancelAnimationFrame(id)
  }, [props.qtyEditOpen])

  const [productDialogQuery, setProductDialogQuery] = useState("")
  useEffect(() => {
    if (props.productSearchOpen) setProductDialogQuery("")
  }, [props.productSearchOpen])

  const productsForDialog = useMemo(
    () => filterPdvCatalogBySearch(props.products, productDialogQuery),
    [props.products, productDialogQuery]
  )

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col transition-colors duration-300",
        isBlackEdition ? "bg-[#000000] text-white" : "bg-background text-foreground"
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 shadow-pos sm:px-4",
          isBlackEdition ? "border-white/10 bg-[#000000]" : "border-border bg-background"
        )}
      >
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-5 w-5" />
          </div>
          <div className={cn("hidden h-8 w-px md:block", isBlackEdition ? "bg-white/15" : "bg-border")} />
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className={cn("text-[11px] uppercase tracking-wider", isBlackEdition ? "text-white/50" : "text-muted-foreground")}>
              Estabelecimento
            </span>
            <span className={cn("truncate text-sm font-medium", isBlackEdition ? "text-white" : "text-foreground")}>{props.storeName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isModoRapido ? (
            <>
              <span
                className={cn(
                  "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium md:inline-flex",
                  isBlackEdition ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                )}
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Online
              </span>
              <span className={cn("hidden items-center gap-1.5 text-xs md:inline-flex", isBlackEdition ? "text-white/50" : "text-muted-foreground")}>
                <Wifi className="h-3.5 w-3.5" /> Conexão estável
              </span>
            </>
          ) : null}
          <span className={cn("text-xs tabular-pdv", isBlackEdition ? "text-white/45" : "text-muted-foreground")}>{now}</span>
        </div>
      </header>

      <section
        className={cn(
          "grid grid-cols-12 gap-3 border-b px-3 py-3 sm:px-4",
          isModoRapido && "py-2",
          isBlackEdition ? "border-white/10 bg-[#000000]" : "border-border bg-card"
        )}
      >
        {/* BIPE com dropdown de autocomplete */}
        <div className={cn("relative col-span-12", isModoRapido ? "md:col-span-5" : "md:col-span-4")}>
          <PosField
            ref={props.bipeRef}
            tone={fieldTone}
            label="Código / Bipe"
            hint="ENTER"
            icon={<Barcode className="h-4 w-4" />}
            value={props.bipeCode}
            onChange={(e) => props.onBipeChange(e.target.value)}
            onKeyDown={handleBipeKeyDown}
            placeholder="Bipe ou digite o código do produto"
            autoComplete="off"
          />
          {props.bipeCode.trim().length >= 1 ? (
            <div
              className={cn(
                "absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-xl",
                inkUi ? "border-white/10 bg-[#111111]" : "border-border bg-card"
              )}
            >
              {props.bipeSuggestions && props.bipeSuggestions.length > 0 ? (
                <ul className="max-h-60 overflow-y-auto">
                  {props.bipeSuggestions.map((product, idx) => {
                    const isActive = idx === bipeActiveIdx
                    return (
                    <li key={`${product.id}-${product.dbId ?? ""}`}>
                      <button
                        ref={isActive ? activeItemRef : undefined}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 border-t px-3 py-2.5 text-left text-sm transition-colors first:border-0",
                          inkUi
                            ? "border-white/5 text-white hover:bg-white/[0.08]"
                            : "border-border text-foreground hover:bg-muted",
                          isActive && (inkUi ? "bg-white/[0.12]" : "bg-accent text-accent-foreground")
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          props.onBipeSuggestionSelect?.(product)
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{product.name}</div>
                          <div className={cn("text-xs", inkUi ? "text-white/40" : "text-muted-foreground")}>
                            {[
                              product.sku ? `SKU ${product.sku}` : null,
                              product.barcode ? `EAN ${product.barcode}` : null,
                              `Estoque: ${product.stock}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-semibold tabular-pdv",
                            inkUi ? "text-emerald-400" : "text-emerald-700 dark:text-emerald-400"
                          )}
                        >
                          R$ {fmt(product.price)}
                        </span>
                      </button>
                    </li>
                  )
                  })}
                </ul>
              ) : (
                <div className={cn("px-4 py-3 text-sm", inkUi ? "text-white/40" : "text-muted-foreground")}>
                  Nenhum produto encontrado para{" "}
                  <span className={cn("font-medium", inkUi ? "text-white/70" : "text-foreground")}>
                    &quot;{props.bipeCode.trim()}&quot;
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
        <PosField
          tone={fieldTone}
          fieldClassName={cn("col-span-6", isModoRapido ? "md:col-span-4" : "md:col-span-3")}
          label="Cliente"
          hint="F2"
          icon={<User2 className="h-4 w-4" />}
          value={props.customerDisplay}
          onChange={(e) => props.onCustomerDisplayChange(e.target.value)}
        />
        <PosField
          tone={fieldTone}
          fieldClassName={cn("col-span-6", isModoRapido ? "md:col-span-3" : "md:col-span-2")}
          label="Quantidade"
          hint="F4"
          icon={<Hash className="h-4 w-4" />}
          value={props.nextQtyStr}
          onChange={(e) => props.onNextQtyStrChange(e.target.value)}
          inputMode="decimal"
        />
        {!isModoRapido ? (
          <PosField
            tone={fieldTone}
            fieldClassName="col-span-12 md:col-span-3"
            label="Vendedor"
            icon={<UserCog className="h-4 w-4" />}
            value={props.seller}
            onChange={(e) => props.onSellerChange(e.target.value)}
          />
        ) : null}
      </section>

      <main
        className={cn(
          "min-h-0 flex-1 overflow-hidden p-2 sm:p-3",
          isModoRapido ? "flex min-h-0 flex-col" : "grid grid-cols-12 gap-3",
          isModoRapido && "p-2",
          isBlackEdition ? "bg-[#000000]" : "bg-background"
        )}
      >
        {isModoRapido ? (
          <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <ItemsTable
                rows={props.cartRows}
                highlightLineId={props.highlightLineId}
                flashLineId={props.flashLineId}
                selectedLineId={props.selectedLineId}
                onSelect={props.onSelectLine}
                isBlack={inkUi}
              />
            </div>
            <aside
              className={cn(
                "flex w-[min(280px,34vw)] min-w-[232px] max-w-[300px] shrink-0 flex-col justify-between gap-3 self-stretch border-l px-3 py-3 sm:px-4",
                isBlackEdition ? "border-white/10 bg-[#000000]" : "border-border bg-card"
              )}
            >
              <div className={cn(
                "min-w-0 rounded-2xl border p-4 bg-muted/30 border-border shadow-sm space-y-4",
                isBlackEdition && "border-white/10 bg-white/5"
              )}>
                <div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
                      isBlackEdition && "text-white/50"
                    )}
                  >
                    Total
                  </span>
                  <div
                    className={cn(
                      "text-2xl font-extrabold sm:text-3xl mt-1 tabular-nums text-primary",
                      isBlackEdition && "text-emerald-400"
                    )}
                  >
                    R$ {fmt(props.total)}
                  </div>
                </div>
                
                <div className={cn("border-t pt-3 space-y-2 text-xs", isBlackEdition ? "border-white/10" : "border-border")}>
                  <div className="flex justify-between items-center">
                    <span className={cn("text-muted-foreground", isBlackEdition && "text-white/55")}>Nº de itens</span>
                    <span className={cn("font-semibold tabular-nums text-foreground", isBlackEdition && "text-white")}>
                      {props.itemCount} {props.itemCount === 1 ? "item" : "itens"}
                    </span>
                  </div>
                  {props.previousSaleTotal != null && (
                    <div className="flex justify-between items-center">
                      <span className={cn("text-muted-foreground", isBlackEdition && "text-white/55")}>Venda anterior</span>
                      <span className={cn("font-semibold tabular-nums text-foreground", isBlackEdition && "text-white")}>
                        R$ {fmt(props.previousSaleTotal)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <Button
                type="button"
                onClick={() => props.onShortcutAction("F1")}
                className="h-11 w-full shrink-0 gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
              >
                <Receipt className="h-4 w-4" />
                Finalizar (F1)
                <ChevronRight className="h-4 w-4" />
              </Button>
            </aside>
          </div>
        ) : (
          <>
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden",
            "col-span-12 lg:col-span-9"
          )}
        >
          <ItemsTable
            rows={props.cartRows}
            highlightLineId={props.highlightLineId}
            flashLineId={props.flashLineId}
            selectedLineId={props.selectedLineId}
            onSelect={props.onSelectLine}
            isBlack={inkUi}
          />
        </div>
          <aside className="col-span-12 flex h-full min-h-0 flex-col gap-3 overflow-y-auto lg:col-span-3">
            <div
              className={cn(
                "rounded-md border p-4 shadow-pos",
                isBlackEdition ? "border-white/10 bg-[#000000]" : "border-border bg-card"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px] font-medium uppercase tracking-wider", isBlackEdition ? "text-white/50" : "text-muted-foreground")}>
                  Total da Venda
                </span>
                <Calculator className={cn("h-4 w-4", isBlackEdition ? "text-white/45" : "text-muted-foreground")} />
              </div>
              <div
                className={cn(
                  "mt-2 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-none tracking-tight tabular-pdv",
                  isBlackEdition ? "text-emerald-400" : "text-pos-total"
                )}
              >
                R$ {fmt(props.total)}
              </div>
              <div className={cn("mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs", isBlackEdition ? "border-white/10" : "border-border")}>
                <div>
                  <div className={isBlackEdition ? "text-white/45" : "text-muted-foreground"}>Nº de itens</div>
                  <div className={cn("font-semibold tabular-pdv", isBlackEdition ? "text-white" : "text-foreground")}>{props.itemCount}</div>
                </div>
                <div className="text-right">
                  <div className={isBlackEdition ? "text-white/45" : "text-muted-foreground"}>Venda anterior</div>
                  <div className={cn("font-semibold tabular-pdv", isBlackEdition ? "text-white" : "text-foreground")}>
                    {props.previousSaleTotal != null ? `R$ ${fmt(props.previousSaleTotal)}` : "—"}
                  </div>
                </div>
                <div>
                  <div className={isBlackEdition ? "text-white/45" : "text-muted-foreground"}>Troco</div>
                  <div className={cn("font-semibold tabular-pdv", isBlackEdition ? "text-white" : "text-foreground")}>R$ 0,00</div>
                </div>
                <div className="text-right">
                  <div className={isBlackEdition ? "text-white/45" : "text-muted-foreground"}>Sem desc.</div>
                  <div className={cn("font-semibold tabular-pdv", isBlackEdition ? "text-white" : "text-foreground")}>R$ {fmt(props.total)}</div>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => props.onShortcutAction("F1")}
                className="mt-4 w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
              >
                <Receipt className="h-4 w-4" />
                Finalizar (F1)
                <ChevronRight className="ml-auto h-4 w-4" />
              </Button>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 rounded-md border p-4 shadow-pos",
                isBlackEdition ? "border-white/10 bg-[#000000]" : "border-border bg-card"
              )}
            >
              <div className={cn("text-[11px] font-medium uppercase tracking-wider", isBlackEdition ? "text-white/50" : "text-muted-foreground")}>Informativo</div>
              <p className={cn("mt-2 text-sm leading-relaxed", isBlackEdition ? "text-white/85" : "text-foreground")}>{props.info}</p>
            </div>
            <div
              className={cn(
                "rounded-md border p-3 text-[11px]",
                isBlackEdition ? "border-white/10 bg-[#000000] text-white/50" : "border-border bg-muted/50 text-muted-foreground"
              )}
            >
              <div className="flex justify-between">
                <span>Caixa</span>
                <span className={cn("font-medium", isBlackEdition ? "text-white" : "text-foreground")}>PDV</span>
              </div>
              <div className="flex justify-between">
                <span>Atalhos</span>
                <span className={cn("font-medium", isBlackEdition ? "text-white" : "text-foreground")}>F1–F9</span>
              </div>
            </div>
          </aside>
          </>
        )}
      </main>

      {!isModoRapido ? <ShortcutBar onAction={props.onShortcutAction} isBlack={inkUi} /> : null}

      <Dialog open={props.productSearchOpen} onOpenChange={props.onProductSearchOpenChange}>
        <DialogContent className="max-w-lg border-border bg-card">
          <DialogHeader>
            <DialogTitle>Pesquisar Produto (F3)</DialogTitle>
            <DialogDescription>
              Filtrar por nome, categoria, SKU, código ou EAN. Lista vazia mostra todo o catálogo.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={productDialogQuery}
            onChange={(e) => setProductDialogQuery(e.target.value)}
            placeholder="Digite para filtrar…"
            className="h-10"
            autoComplete="off"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {productsForDialog.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <PackageOpen className="h-9 w-9 opacity-40" strokeWidth={1.5} />
                <p className="font-medium text-foreground">Nenhum produto encontrado</p>
                <p className="text-xs">Ajuste o termo ou limpe o filtro para ver o catálogo completo.</p>
              </div>
            ) : (
              productsForDialog.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    props.onProductSearchOpenChange(false)
                    props.onAddProductFromSearch(p)
                  }}
                  className="grid w-full grid-cols-[100px_1fr_70px_100px] gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
                >
                  <span className="font-mono text-muted-foreground">{p.barcode || p.sku || p.id}</span>
                  <span className="truncate text-foreground">{p.name}</span>
                  <span className="text-muted-foreground">{p.vendaPorPeso ? "KG" : "UN"}</span>
                  <span className="text-right font-semibold tabular-pdv text-foreground">
                    {p.vendaPorPeso ? `R$ ${fmt(p.precoPorKg ?? p.price)}/kg` : `R$ ${fmt(p.price)}`}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.clientSearchOpen} onOpenChange={props.onClientSearchOpenChange}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Pesquisar Cliente (F2)</DialogTitle>
            <DialogDescription>Identifique o cliente desta venda.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            {props.clientSearchLoading ? (
              <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              ref={clientSearchInputRef}
              value={props.clientSearchQuery ?? ""}
              onChange={(e) => props.onClientSearchQueryChange?.(e.target.value)}
              placeholder="Nome, CPF/CNPJ ou telefone…"
              className="h-9 rounded-xl border-border bg-background pl-9 text-sm"
            />
          </div>
          {/* Always show CONSUMIDOR as "no client" option */}
          <button
            type="button"
            onClick={() => {
              props.onPickClient("CONSUMIDOR")
              props.onClientSearchOpenChange(false)
            }}
            className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/40"
          >
            <span className="font-medium text-foreground">CONSUMIDOR (sem identificação)</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {!(props.clientSearchQuery ?? "").trim() ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Digite para buscar um cliente.
              </p>
            ) : props.clientSearchLoading ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            ) : props.clientOptions.filter((c) => c.id !== "0").length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                Nenhum resultado para &ldquo;{props.clientSearchQuery}&rdquo;.
              </p>
            ) : (
              props.clientOptions
                .filter((c) => c.id !== "0")
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      props.onPickClient(c.label)
                      props.onClientSearchOpenChange(false)
                    }}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary/40"
                  >
                    <span className="font-medium text-foreground">{c.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.qtyEditOpen} onOpenChange={props.onQtyEditOpenChange}>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle>Alterar Quantidade (F4)</DialogTitle>
            <DialogDescription>Defina a nova quantidade para o item selecionado.</DialogDescription>
          </DialogHeader>
          <input
            key={props.qtyEditDefault}
            ref={qtyEditRef}
            defaultValue={props.qtyEditDefault}
            inputMode="decimal"
            className="tabular-pdv h-11 w-full rounded-md border border-[hsl(var(--pos-input-border))] bg-[hsl(var(--pos-input))] px-3 text-2xl font-semibold outline-none focus:border-[hsl(var(--pos-input-focus))]"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => props.onQtyEditOpenChange(false)}>
              Voltar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => props.onQtyEditConfirm(qtyEditRef.current?.value ?? "1")}
            >
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.cancelSaleOpen} onOpenChange={props.onCancelSaleOpenChange}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Cancelar Venda (F6)</DialogTitle>
            <DialogDescription>Todos os itens serão removidos. Confirme para limpar o cupom.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => props.onCancelSaleOpenChange(false)}>
              Voltar
            </Button>
            <Button type="button" variant="destructive" onClick={props.onConfirmCancelSale}>
              Cancelar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.receivablesOpen} onOpenChange={props.onReceivablesOpenChange}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Contas a Receber (F9)</DialogTitle>
            <DialogDescription>Abra o módulo financeiro para títulos e recebimentos.</DialogDescription>
          </DialogHeader>
          <Button type="button" className="w-full" onClick={props.onOpenReceivablesModule}>
            Ir para Contas a Receber
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={props.advancedOpen} onOpenChange={props.onAdvancedOpenChange}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Funções avançadas (CTRL)</DialogTitle>
            <DialogDescription>Atalhos adicionais do caixa.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {["Orçamentos", "Trocas", "Devoluções", "Sangria", "Suprimento", "Reimprimir"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => props.onAdvancedOpenChange(false)}
                className="rounded-md border border-border bg-background px-3 py-3 text-sm font-medium text-foreground hover:bg-muted/60"
              >
                {opt}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
