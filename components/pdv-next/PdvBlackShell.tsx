"use client"

import * as React from "react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKE } from "react"
import {
  Barcode,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  Receipt,
  Search,
  ShoppingCart,
  User,
  Wifi,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { PdvCatalogProduct } from "@/lib/pdv-catalog"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"

export type PdvBlackCartRow = {
  lineId: string
  /** Id real do produto (Produto.id) — usado para persistir a venda no core. */
  inventoryId?: string
  code: string
  description: string
  detail?: string
  unit: string
  unitPrice: number
  qty: number
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Barra de atalhos (F2–F12) ─────────────────────────────────────────────────
const SHORTCUTS = [
  { key: "F2", label: "Buscar/Bipar" },
  { key: "F3", label: "Busca avançada" },
  { key: "F4", label: "Alterar qtd" },
  { key: "F5", label: "Cliente" },
  { key: "F6", label: "Troca/Devolução" },
  { key: "F7", label: "NF-e", tone: "accent" as const },
  { key: "F8", label: "Desconto/Acréscimo" },
  { key: "F9", label: "CPF/CNPJ" },
  { key: "F10", label: "Cancelar", tone: "destructive" as const },
  { key: "F11", label: "Suspender" },
  { key: "F12", label: "Finalizar", tone: "accent" as const },
]

function ShortcutBar({ onAction }: { onAction: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-t border-border bg-card px-2 py-1.5">
      {SHORTCUTS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onAction(s.key)}
          className={cn(
            "group flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer",
            "border-border bg-background text-foreground/80 hover:-translate-y-px hover:border-primary/50 hover:shadow-sm",
            s.tone === "accent" && "border-primary/30",
            s.tone === "destructive" && "border-red-500/25"
          )}
        >
          <kbd
            className={cn(
              "rounded border border-b-2 px-1.5 py-0.5 text-[10px] font-bold",
              s.tone === "accent"
                ? "border-primary/50 bg-primary/15 text-primary"
                : s.tone === "destructive"
                  ? "border-red-400/50 bg-red-500/15 text-red-600 dark:text-red-300"
                  : "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            {s.key}
          </kbd>
          <span className="text-muted-foreground group-hover:text-foreground">{s.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Tabela de itens ───────────────────────────────────────────────────────────
function ItemsTable({
  rows,
  highlightLineId,
  selectedLineId,
  onSelect,
  onRemove,
}: {
  rows: PdvBlackCartRow[]
  highlightLineId: string | null
  selectedLineId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const gridCols = "grid-cols-[48px_96px_1fr_60px_108px_76px_120px_36px]"
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={cn("grid gap-3 border-b border-border/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60", gridCols)}>
        <div>Item</div>
        <div>Código</div>
        <div>Descrição</div>
        <div>Unid.</div>
        <div className="text-right">Unitário</div>
        <div className="text-right">Qtd</div>
        <div className="text-right">Total</div>
        <div />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((item, idx) => {
          const lineTotal = item.qty * item.unitPrice
          const isHighlight = item.lineId === highlightLineId
          const isSelected = item.lineId === selectedLineId
          return (
            <div
              key={item.lineId}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.lineId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelect(item.lineId)
                }
              }}
              className={cn(
                "group grid w-full gap-3 border-b border-border/60 px-4 py-2.5 text-left text-sm tabular-nums text-foreground transition-colors cursor-pointer",
                gridCols,
                isHighlight && "animate-in fade-in bg-primary/10 duration-300",
                isSelected && "ring-1 ring-inset ring-primary/60",
                !isHighlight && !isSelected && "hover:bg-muted/40"
              )}
            >
              <div className="font-mono text-muted-foreground/40">{String(idx + 1).padStart(3, "0")}</div>
              <div className="font-mono text-muted-foreground/80">{item.code}</div>
              <div className="min-w-0">
                <div className="truncate font-medium">{item.description}</div>
                {item.detail && (
                  <div className="mt-0.5 truncate font-mono text-[10px] leading-snug text-primary/70">
                    {item.detail}
                  </div>
                )}
              </div>
              <div className="text-muted-foreground/50">{item.unit}</div>
              <div className="text-right text-foreground/80">R$ {fmt(item.unitPrice)}</div>
              <div className="text-right font-medium">{fmt(item.qty)}</div>
              <div className="text-right font-semibold text-primary">R$ {fmt(lineTotal)}</div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  aria-label={`Remover ${item.description}`}
                  title="Remover item"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(item.lineId)
                  }}
                  className="grid h-6 w-6 place-items-center rounded text-muted-foreground/45 opacity-60 hover:bg-destructive/15 hover:text-destructive hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-destructive/40 group-hover:opacity-100 transition cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Estado vazio ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center bg-background">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <ShoppingCart className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground/80">Comece bipando um produto</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground/60">
          Use o leitor de código de barras, digite o código, EAN ou o nome do produto. Para
          múltiplas unidades use o prefixo{" "}
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">3x</kbd>
          {" "}ou{" "}
          <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">3*</kbd>
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {["1001", "3x arroz", "2×1886", "camiseta", "7891234560866"].map((ex) => (
          <span
            key={ex}
            className="rounded border border-border/75 bg-muted/30 px-2.5 py-1 font-mono text-xs text-muted-foreground/60"
          >
            {ex}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
export type PdvBlackShellProps = {
  // Caixa (inline no header)
  caixaAberto: boolean
  turno: number
  cupomNum: number
  operadorNome: string
  storeName: string
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
  // Carrinho
  cartRows: PdvBlackCartRow[]
  highlightLineId: string | null
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
  onRemoveLine: (lineId: string) => void
  total: number
  itemCount: number
  lastAddedItem: string | null
  // Barcode
  bipeCode: string
  onBipeChange: (v: string) => void
  bipeRef: React.RefObject<HTMLInputElement | null>
  onBipeKeyDown: (e: RKE<HTMLInputElement>) => void
  // Cliente
  customerDisplay: string
  onClientSearchOpen: () => void
  // Documento fiscal
  emitirNota: boolean
  onEmitirNotaChange: (v: boolean) => void
  // Valor recebido / troco
  valorRecebido: string
  onValorRecebidoChange: (v: string) => void
  troco: number
  // Ações
  onShortcutAction: (key: string) => void
  onFinalizeClick: () => void
  // Diálogos
  products: PdvCatalogProduct[]
  productSearchOpen: boolean
  productSearchInitial?: string
  onProductSearchOpenChange: (open: boolean) => void
  onAddProductFromSearch: (product: PdvCatalogProduct) => void
  clientSearchOpen: boolean
  onClientSearchOpenChange: (open: boolean) => void
  clientOptions: Array<{ id: string; label: string }>
  onPickClient: (label: string) => void
  qtyEditOpen: boolean
  onQtyEditOpenChange: (open: boolean) => void
  qtyEditDefault: string
  onQtyEditConfirm: (raw: string) => void
  cancelSaleOpen: boolean
  onCancelSaleOpenChange: (open: boolean) => void
  onConfirmCancelSale: () => void
}

// ── Painel de busca de produto (F3) ───────────────────────────────────────────
function ProductSearchPanel({
  open,
  products,
  initialQuery,
  onPick,
  onClose,
}: {
  open: boolean
  products: PdvCatalogProduct[]
  initialQuery: string
  onPick: (p: PdvCatalogProduct) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setActiveIdx(0)
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select?.()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, initialQuery])

  const results = useMemo(() => {
    const list = filterPdvCatalogBySearch(products, query)
    return list.slice(0, 50)
  }, [products, query])

  useEffect(() => {
    setActiveIdx((i) => Math.min(Math.max(0, i), Math.max(0, results.length - 1)))
  }, [results.length])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIdx, open])

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const picked = results[activeIdx]
      if (picked) onPick(picked)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Buscar por nome, código, EAN ou SKU"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
          style={{ paddingLeft: "2.5rem" }}
        />
      </div>

      <div
        ref={listRef}
        className="max-h-80 overflow-y-auto rounded-md border border-border"
        role="listbox"
        aria-label="Resultados da busca"
      >
        {results.map((p, idx) => {
          const isActive = idx === activeIdx
          return (
            <button
              key={p.id}
              type="button"
              data-idx={idx}
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => onPick(p)}
              className={cn(
                "grid w-full grid-cols-[112px_1fr_52px_110px] gap-2 border-b border-border/40 px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                isActive ? "bg-primary/15 text-primary" : "text-foreground/85 hover:bg-muted/40"
              )}
            >
              <span className="truncate font-mono text-[11px] text-muted-foreground/60">
                {p.barcode || p.sku || p.codigo || p.id}
              </span>
              <span className="truncate">{p.name}</span>
              <span className="text-muted-foreground/50">{p.vendaPorPeso ? "KG" : "UN"}</span>
              <span className="text-right font-semibold tabular-nums text-primary">
                {p.vendaPorPeso
                  ? `R$ ${fmt(p.precoPorKg ?? p.price)}/kg`
                  : `R$ ${fmt(p.price)}`}
              </span>
            </button>
          )
        })}
        {results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground/50">
            {query.trim()
              ? `Nenhum produto encontrado para "${query.trim()}".`
              : "Nenhum produto cadastrado."}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground/55">
        <span>
          {results.length} resultado{results.length === 1 ? "" : "s"}
          {products.length > results.length && results.length === 50 ? " (mostrando 50)" : ""}
        </span>
        <span className="space-x-2">
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">↑↓</kbd>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">Enter</kbd>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono">Esc</kbd>
        </span>
      </div>
    </div>
  )
}

// ── Shell principal ───────────────────────────────────────────────────────────
export function PdvBlackShell(props: PdvBlackShellProps) {
  const qtyEditRef = useRef<HTMLInputElement>(null)
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  )

  // Relógio ao vivo
  useEffect(() => {
    const t = setInterval(() => {
      setClock(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Foca qty input ao abrir diálogo
  useEffect(() => {
    if (!props.qtyEditOpen) return
    const id = window.requestAnimationFrame(() => {
      qtyEditRef.current?.focus()
      qtyEditRef.current?.select?.()
    })
    return () => window.cancelAnimationFrame(id)
  }, [props.qtyEditOpen])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-3 py-1.5">
        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground/90">OmniGestão Pro PDV</span>
        </div>

        {/* Status caixa */}
        {props.caixaAberto ? (
          <>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground/75" />
              Caixa aberto
            </span>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/65 hover:bg-muted/40 cursor-pointer"
            >
              <Receipt className="h-3.5 w-3.5" /> Caixa
            </button>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/65 hover:bg-muted/40 cursor-pointer"
            >
              <Clock className="h-3.5 w-3.5" /> Turno {props.turno}
            </button>
            <button
              type="button"
              onClick={props.onFecharCaixa}
              className="flex shrink-0 items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 text-[11px] text-foreground/65 hover:bg-muted/40 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" /> Fechar caixa
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={props.onAbrirCaixa}
            className="flex shrink-0 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-600/15 px-2.5 py-1 text-[11px] text-amber-500 hover:bg-amber-600/25 dark:text-amber-300 cursor-pointer"
          >
            Caixa fechado — Abrir
          </button>
        )}

        {/* Separador */}
        <div className="mx-1 hidden h-5 w-px shrink-0 bg-border lg:block" />

        {/* Operador · Loja · Cupom */}
        <div className="hidden items-center gap-4 text-[11px] md:flex">
          <span className="text-muted-foreground/60 uppercase tracking-wide">
            OPERADOR{" "}
            <span className="font-medium text-foreground/80">{props.operadorNome}</span>
          </span>
          <span className="text-muted-foreground/60 uppercase tracking-wide">
            LOJA{" "}
            <span className="font-medium text-foreground/80">{props.storeName}</span>
          </span>
          <span className="text-muted-foreground/60 uppercase tracking-wide">
            CUPOM{" "}
            <span className="font-mono font-medium text-foreground/80">
              #{String(props.cupomNum).padStart(6, "0")}
            </span>
          </span>
        </div>

        <div className="flex-1" />

        {/* Relógio + Online */}
        <div className="flex shrink-0 items-center gap-3 text-[11px]">
          <span className="hidden items-center gap-1.5 text-muted-foreground/60 md:flex">
            <Clock className="h-3.5 w-3.5" />
            {clock}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Online
          </span>
          <span className="hidden text-muted-foreground/40 md:block">
            <Wifi className="h-3.5 w-3.5" />
          </span>
        </div>
      </header>

      {/* ── Conteúdo principal ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Esquerda: barcode + tabela */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Linha do barcode */}
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <div className="relative flex-1">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                ref={props.bipeRef}
                value={props.bipeCode}
                onChange={(e) => props.onBipeChange(e.target.value)}
                onKeyDown={props.onBipeKeyDown}
                placeholder="Bipe o código de barras ou digite o produto"
                autoComplete="off"
                className="h-9 w-full rounded-md border border-border bg-background pl-10 pr-12 text-sm text-foreground outline-none placeholder:text-muted-foreground/45 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                style={{ paddingLeft: "2.5rem", paddingRight: "3rem" }}
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground/75">
                F2
              </kbd>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => props.onProductSearchOpenChange(true)}
              className="h-9 shrink-0 gap-1.5 border-border bg-background text-foreground/70 hover:border-primary/40 hover:bg-muted/45 hover:text-foreground cursor-pointer"
            >
              <Search className="h-4 w-4" />
              Buscar
              <kbd className="rounded border border-border bg-muted/40 px-1 text-[10px] font-bold">
                F3
              </kbd>
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={props.itemCount === 0}
              onClick={props.onFinalizeClick}
              className="h-9 shrink-0 gap-1.5 bg-primary font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-35 cursor-pointer"
            >
              Finalizar
              <kbd className="rounded border border-primary-foreground/35 bg-primary-foreground/20 px-1 text-[10px] font-bold">
                F12
              </kbd>
            </Button>
          </div>

          {/* Tabela ou estado vazio */}
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
            {props.cartRows.length > 0 ? (
              <ItemsTable
                rows={props.cartRows}
                highlightLineId={props.highlightLineId}
                selectedLineId={props.selectedLineId}
                onSelect={props.onSelectLine}
                onRemove={props.onRemoveLine}
              />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Direita: sidebar de pagamento */}
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card lg:flex">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

            {/* TOTAL DA VENDA */}
            <div className="border-b border-border px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Total da Venda
              </div>
              <div className="mt-0.5 text-[2.8rem] font-bold leading-none tabular-nums text-foreground">
                R$ {fmt(props.total)}
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground/50">
                <span>Subtotal · {props.itemCount} itens</span>
                <span>R$ {fmt(props.total)}</span>
              </div>
            </div>

            {/* ÚLTIMO ADICIONADO */}
            <div className="border-b border-border px-4 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Último Adicionado
              </div>
              <p className="mt-1 text-xs text-foreground/75">
                {props.lastAddedItem ?? "Nenhum produto adicionado ainda."}
              </p>
            </div>

            {/* CLIENTE */}
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Cliente
                </div>
                <button
                  type="button"
                  onClick={props.onClientSearchOpen}
                  className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-0.5 text-[11px] text-foreground/65 hover:bg-muted/40 cursor-pointer"
                >
                  <User className="h-3 w-3" /> Identificar
                  <kbd className="rounded border border-border bg-muted/40 px-1 text-[9px] font-bold text-muted-foreground/60">
                    F5
                  </kbd>
                </button>
              </div>
              <div className="mt-2.5 flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40">
                  <User className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground/80">
                    {props.customerDisplay || "Consumidor final"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/50">
                    Sem documento na nota{" "}
                    <button
                      type="button"
                      onClick={() => props.onShortcutAction("F9")}
                      className="text-primary hover:text-primary/80 hover:underline font-semibold cursor-pointer"
                    >
                      + CPF/CNPJ F9
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* DOCUMENTO FISCAL */}
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Documento Fiscal
                </div>
                <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground/60">
                  F7
                </kbd>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => props.onEmitirNotaChange(true)}
                  className={cn(
                    "flex flex-col items-start rounded-md border p-2 text-left transition-colors cursor-pointer",
                    props.emitirNota
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] font-semibold">Com NF-e</span>
                  </div>
                  <span className="mt-0.5 text-[10px] opacity-60">Cupom fiscal eletrônico</span>
                </button>
                <button
                  type="button"
                  onClick={() => props.onEmitirNotaChange(false)}
                  className={cn(
                    "flex flex-col items-start rounded-md border p-2 text-left transition-colors cursor-pointer",
                    !props.emitirNota
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px] font-semibold">Sem nota</span>
                  </div>
                  <span className="mt-0.5 text-[10px] opacity-60">Cupom simples não fiscal</span>
                </button>
              </div>
            </div>

            {/* VALOR RECEBIDO EM DINHEIRO */}
            <div className="border-b border-border px-4 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Valor Recebido em Dinheiro
              </div>
              <input
                type="text"
                value={props.valorRecebido}
                onChange={(e) => props.onValorRecebidoChange(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="mt-2 h-10 w-full rounded border border-border bg-background px-3 text-right text-lg tabular-nums text-foreground outline-none placeholder:text-muted-foreground/30 focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
              />
            </div>

            {/* Troco */}
            <div className="border-b border-border px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground/60">Troco</span>
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    props.troco > 0 ? "text-primary" : "text-muted-foreground/45"
                  )}
                >
                  R$ {fmt(props.troco)}
                </span>
              </div>
            </div>

            {/* Finalizar com NF-e */}
            <div className="p-3">
              <button
                type="button"
                onClick={props.onFinalizeClick}
                disabled={props.itemCount === 0}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-md py-3 text-sm font-semibold transition-colors cursor-pointer",
                  props.itemCount > 0
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-muted text-muted-foreground"
                )}
              >
                <Receipt className="h-4 w-4" />
                Finalizar com NF-e
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* ── Barra de atalhos ─────────────────────────────────────────────── */}
      <ShortcutBar onAction={props.onShortcutAction} />

      {/* ── Diálogos ─────────────────────────────────────────────────────── */}

      {/* Pesquisa de produto (F3) */}
      <Dialog open={props.productSearchOpen} onOpenChange={props.onProductSearchOpenChange}>
        <DialogContent className="max-w-2xl border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Busca avançada (F3)</DialogTitle>
            <DialogDescription className="text-muted-foreground/70">
              Digite nome, código, EAN ou SKU. Use ↑/↓ para navegar, Enter para adicionar.
            </DialogDescription>
          </DialogHeader>
          <ProductSearchPanel
            open={props.productSearchOpen}
            products={props.products}
            initialQuery={props.productSearchInitial ?? ""}
            onPick={(p) => props.onAddProductFromSearch(p)}
            onClose={() => props.onProductSearchOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Pesquisa de cliente (F5) */}
      <Dialog open={props.clientSearchOpen} onOpenChange={props.onClientSearchOpenChange}>
        <DialogContent className="max-w-md border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Identificar Cliente (F5)</DialogTitle>
            <DialogDescription className="text-muted-foreground/70">
              Selecione o cliente desta venda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {props.clientOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  props.onPickClient(c.label)
                  props.onClientSearchOpenChange(false)
                }}
                className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm hover:border-primary/50 hover:bg-muted/30 cursor-pointer"
              >
                <span className="font-medium text-foreground/80">{c.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </button>
            ))}
            {props.clientOptions.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground/50">
                Digite no campo acima e aguarde os resultados.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Alterar quantidade (F4) */}
      <Dialog open={props.qtyEditOpen} onOpenChange={props.onQtyEditOpenChange}>
        <DialogContent className="max-w-sm border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Alterar Quantidade (F4)</DialogTitle>
            <DialogDescription className="text-muted-foreground/70">
              Nova quantidade para o item selecionado.
            </DialogDescription>
          </DialogHeader>
          <input
            key={props.qtyEditDefault}
            ref={qtyEditRef}
            defaultValue={props.qtyEditDefault}
            inputMode="decimal"
            className="h-12 w-full rounded-md border border-border bg-background px-3 text-center text-2xl font-semibold tabular-nums text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/25"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onQtyEditOpenChange(false)}
              className="border-border bg-transparent text-foreground/70 hover:bg-muted cursor-pointer"
            >
              Voltar
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
              onClick={() => props.onQtyEditConfirm(qtyEditRef.current?.value ?? "1")}
            >
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancelar venda (F10) */}
      <Dialog open={props.cancelSaleOpen} onOpenChange={props.onCancelSaleOpenChange}>
        <DialogContent className="max-w-md border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="text-foreground">Cancelar Venda (F10)</DialogTitle>
            <DialogDescription className="text-muted-foreground/70">
              Todos os itens serão removidos. Confirme para limpar o cupom.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => props.onCancelSaleOpenChange(false)}
              className="border-border bg-transparent text-foreground/70 hover:bg-muted cursor-pointer"
            >
              Voltar
            </Button>
            <Button type="button" variant="destructive" className="cursor-pointer" onClick={props.onConfirmCancelSale}>
              Cancelar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
