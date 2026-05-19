"use client"

import { useEffect, useRef, useState, type KeyboardEvent as RKE } from "react"
import {
  Barcode,
  Calculator,
  ChevronRight,
  Clock,
  Hash,
  PackageOpen,
  Receipt,
  ShieldCheck,
  User2,
  Wifi,
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

export type PdvBlackCartRow = {
  lineId: string
  code: string
  description: string
  unit: string
  unitPrice: number
  qty: number
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SHORTCUTS = [
  { key: "F1", label: "Finalizar Venda", tone: "accent" as const },
  { key: "F2", label: "Cliente" },
  { key: "F3", label: "Produto" },
  { key: "F4", label: "Alt. Qtd" },
  { key: "F5", label: "Remover" },
  { key: "F6", label: "Cancelar Venda", tone: "destructive" as const },
  { key: "F7", label: "Foco Bipe" },
  { key: "F9", label: "Contas a Receber" },
]

function useRealTimeClock() {
  const [now, setNow] = useState(() => new Date().toLocaleString("pt-BR"))
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleString("pt-BR")), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function ShortcutBar({ onAction }: { onAction: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-white/10 bg-[#000000] px-3 py-2">
      {SHORTCUTS.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onAction(s.key)}
          className={cn(
            "group flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all",
            "border-white/10 bg-[#000000] text-white/90 hover:-translate-y-px hover:border-emerald-500/50 hover:shadow-md active:translate-y-0",
            s.tone === "accent" && "border-emerald-500/40",
            s.tone === "destructive" && "border-red-500/40"
          )}
        >
          <kbd
            className={cn(
              "rounded border border-b-2 px-1.5 py-0.5 text-[10px] font-bold",
              s.tone === "accent"
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                : s.tone === "destructive"
                  ? "border-red-400/50 bg-red-500/15 text-red-300"
                  : "border-white/20 bg-black text-white/80"
            )}
          >
            {s.key}
          </kbd>
          <span className="text-white/60 group-hover:text-white">{s.label}</span>
        </button>
      ))}
    </div>
  )
}

function ItemsTable({
  rows,
  highlightLineId,
  selectedLineId,
  onSelect,
}: {
  rows: PdvBlackCartRow[]
  highlightLineId: string | null
  selectedLineId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-[#000000] shadow-sm">
      <div className="grid grid-cols-[56px_110px_1fr_64px_128px_88px_128px] gap-3 border-b border-white/10 bg-[#000000] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
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
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 py-16 text-white/50">
            <PackageOpen className="h-10 w-10 opacity-40" strokeWidth={1.5} />
            <p className="text-sm font-medium text-white/80">Nenhum item bipado</p>
            <p className="max-w-sm px-4 text-center text-xs text-white/55">
              Bipe no campo acima ou pressione{" "}
              <kbd className="rounded border border-white/20 bg-black px-1 text-[10px] font-bold text-white/80">
                F3
              </kbd>{" "}
              para pesquisar
            </p>
          </div>
        ) : (
          rows.map((item, idx) => {
            const lineTotal = item.qty * item.unitPrice
            const isHighlight = item.lineId === highlightLineId
            const isSelected = item.lineId === selectedLineId
            return (
              <button
                type="button"
                key={item.lineId}
                onClick={() => onSelect(item.lineId)}
                className={cn(
                  "grid w-full grid-cols-[56px_110px_1fr_64px_128px_88px_128px] gap-3 border-b border-white/10 bg-[#000000] px-4 py-2.5 text-left text-sm tabular-nums text-white transition-colors",
                  isHighlight && "bg-emerald-500/15 animate-in fade-in duration-300",
                  isSelected && "ring-1 ring-inset ring-emerald-400/70",
                  !isHighlight && !isSelected && "hover:bg-emerald-500/10"
                )}
              >
                <div className="font-mono text-white/45">{String(idx + 1).padStart(3, "0")}</div>
                <div className="font-mono">{item.code}</div>
                <div className="min-w-0 truncate font-medium">{item.description}</div>
                <div className="text-white/45">{item.unit}</div>
                <div className="text-right">R$ {fmt(item.unitPrice)}</div>
                <div className="text-right font-medium">{fmt(item.qty)}</div>
                <div className="text-right font-semibold text-emerald-300">R$ {fmt(lineTotal)}</div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

export type PdvBlackShellProps = {
  storeName: string
  operatorId: string
  caixaAberto: boolean
  cupomNumber: number
  cartRows: PdvBlackCartRow[]
  highlightLineId: string | null
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
  total: number
  itemCount: number
  previousSaleTotal: number | null
  bipeCode: string
  onBipeChange: (v: string) => void
  bipeRef: React.RefObject<HTMLInputElement | null>
  onBipeKeyDown: (e: RKE<HTMLInputElement>) => void
  customerDisplay: string
  onCustomerDisplayChange: (v: string) => void
  nextQtyStr: string
  onNextQtyStrChange: (v: string) => void
  onShortcutAction: (key: string) => void
  onFinalizeClick: () => void
  products: PdvCatalogProduct[]
  productSearchOpen: boolean
  onProductSearchOpenChange: (open: boolean) => void
  clientSearchOpen: boolean
  onClientSearchOpenChange: (open: boolean) => void
  clientOptions: Array<{ id: string; label: string }>
  onPickClient: (label: string) => void
  clientSearchQuery: string
  onClientSearchQueryChange: (v: string) => void
  clientSearchLoading: boolean
  qtyEditOpen: boolean
  onQtyEditOpenChange: (open: boolean) => void
  qtyEditDefault: string
  onQtyEditConfirm: (raw: string) => void
  cancelSaleOpen: boolean
  onCancelSaleOpenChange: (open: boolean) => void
  onConfirmCancelSale: () => void
}

export function PdvBlackShell(props: PdvBlackShellProps) {
  const clock = useRealTimeClock()
  const qtyEditRef = useRef<HTMLInputElement>(null)
  const clientSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (props.qtyEditOpen) {
      requestAnimationFrame(() => {
        qtyEditRef.current?.focus()
        qtyEditRef.current?.select()
      })
    }
  }, [props.qtyEditOpen])

  useEffect(() => {
    if (props.clientSearchOpen) {
      window.setTimeout(() => clientSearchRef.current?.focus(), 60)
    }
  }, [props.clientSearchOpen])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#000000] text-white transition-colors duration-300">
      {/* ── Header operacional ─────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#000000] px-3 py-2 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-5 w-5" />
          </div>
          <div className="hidden h-7 w-px bg-white/15 md:block" />
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className="text-[10px] uppercase tracking-wider text-white/45">Loja</span>
            <span className="truncate text-sm font-semibold">{props.storeName}</span>
          </div>
          <div className="hidden h-7 w-px bg-white/15 sm:block" />
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              props.caixaAberto
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-red-500/15 text-red-300"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                props.caixaAberto ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              )}
            />
            {props.caixaAberto ? "Caixa Aberto" : "Caixa Fechado"}
          </span>
          <div className="hidden h-7 w-px bg-white/15 sm:block" />
          <div className="hidden items-center gap-1.5 text-xs text-white/50 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-mono">{props.operatorId.slice(0, 8)}</span>
          </div>
          <div className="hidden h-7 w-px bg-white/15 md:block" />
          <div className="hidden items-center gap-1 text-[11px] text-white/45 md:flex">
            <Receipt className="h-3.5 w-3.5" />
            <span className="font-mono">Cupom #{String(props.cupomNumber).padStart(6, "0")}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
            <Wifi className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Online</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-white/45">
            <Clock className="h-3.5 w-3.5" />
            {clock}
          </span>
        </div>
      </header>

      {/* ── Área de entrada ────────────────────────────────────── */}
      <section className="grid grid-cols-12 gap-3 border-b border-white/10 bg-[#000000] px-3 py-3 sm:px-4">
        {/* Bipe */}
        <label className="col-span-12 flex flex-col gap-1 md:col-span-5">
          <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-white/55">
            <span>Código / Bipe</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">ENTER</span>
          </span>
          <div className="relative">
            <Barcode className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              ref={props.bipeRef}
              value={props.bipeCode}
              onChange={(e) => props.onBipeChange(e.target.value)}
              onKeyDown={props.onBipeKeyDown}
              placeholder="Bipe ou código do produto"
              autoComplete="off"
              className="h-9 w-full rounded-md border border-white/15 bg-[#000000] pl-8 pr-3 text-sm font-medium text-white shadow-sm outline-none placeholder:text-white/40 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>
        </label>
        {/* Cliente */}
        <label className="col-span-6 flex flex-col gap-1 md:col-span-4">
          <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-white/55">
            <span>Cliente</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">F2</span>
          </span>
          <div className="relative">
            <User2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              value={props.customerDisplay}
              onChange={(e) => props.onCustomerDisplayChange(e.target.value)}
              placeholder="Nome ou documento"
              className="h-9 w-full rounded-md border border-white/15 bg-[#000000] pl-8 pr-3 text-sm font-medium text-white shadow-sm outline-none placeholder:text-white/40 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>
        </label>
        {/* Qtd */}
        <label className="col-span-6 flex flex-col gap-1 md:col-span-3">
          <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-white/55">
            <span>Quantidade</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">F4</span>
          </span>
          <div className="relative">
            <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              value={props.nextQtyStr}
              onChange={(e) => props.onNextQtyStrChange(e.target.value)}
              inputMode="decimal"
              className="h-9 w-full rounded-md border border-white/15 bg-[#000000] pl-8 pr-3 text-sm font-medium text-white shadow-sm outline-none placeholder:text-white/40 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/25"
            />
          </div>
        </label>
      </section>

      {/* ── Conteúdo principal ─────────────────────────────────── */}
      <main className="grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden bg-[#000000] p-2 sm:p-3">
        {/* Tabela de itens */}
        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden lg:col-span-9">
          <ItemsTable
            rows={props.cartRows}
            highlightLineId={props.highlightLineId}
            selectedLineId={props.selectedLineId}
            onSelect={props.onSelectLine}
          />
        </div>

        {/* Painel lateral */}
        <aside className="col-span-12 flex min-h-0 flex-col gap-3 overflow-y-auto lg:col-span-3">
          {/* Total */}
          <div className="rounded-md border border-white/10 bg-[#000000] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">
                Total da Venda
              </span>
              <Calculator className="h-4 w-4 text-white/45" />
            </div>
            <div className="mt-2 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-none tracking-tight tabular-nums text-emerald-400">
              R$ {fmt(props.total)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs">
              <div>
                <div className="text-white/45">Nº de itens</div>
                <div className="font-semibold tabular-nums text-white">{props.itemCount}</div>
              </div>
              <div className="text-right">
                <div className="text-white/45">Venda anterior</div>
                <div className="font-semibold tabular-nums text-white">
                  {props.previousSaleTotal != null ? `R$ ${fmt(props.previousSaleTotal)}` : "—"}
                </div>
              </div>
            </div>
            <Button
              type="button"
              onClick={props.onFinalizeClick}
              disabled={props.itemCount === 0}
              className="mt-4 w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Receipt className="h-4 w-4" />
              Finalizar (F1)
              <ChevronRight className="ml-auto h-4 w-4" />
            </Button>
          </div>

          {/* Cliente selecionado */}
          {props.customerDisplay ? (
            <div className="rounded-md border border-white/10 bg-[#000000] p-3 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/45">Cliente</div>
              <div className="mt-1 truncate font-medium text-white/90">{props.customerDisplay}</div>
            </div>
          ) : null}

          {/* Info operacional */}
          <div className="rounded-md border border-white/10 bg-[#000000] p-3 text-[11px] text-white/50">
            <div className="flex justify-between">
              <span>Documento fiscal</span>
              <span className="font-medium text-white/30">NF-e — mock</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Atalhos</span>
              <span className="font-medium text-white">F1–F9</span>
            </div>
          </div>
        </aside>
      </main>

      {/* ── Barra de atalhos ───────────────────────────────────── */}
      <ShortcutBar onAction={props.onShortcutAction} />

      {/* ── Diálogo: pesquisa de produto (F3) ─────────────────── */}
      <Dialog open={props.productSearchOpen} onOpenChange={props.onProductSearchOpenChange}>
        <DialogContent className="max-w-lg border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Pesquisar Produto (F3)</DialogTitle>
            <DialogDescription className="text-white/55">
              Selecione um produto para adicionar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border border-white/10">
            {props.products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  props.onProductSearchOpenChange(false)
                  // handled via onAddProductFromSearch callback in the controller
                  // We fire a custom event that the controller listens to
                  const event = new CustomEvent("pdv-black:add-product", { detail: p })
                  window.dispatchEvent(event)
                }}
                className="grid w-full grid-cols-[100px_1fr_56px_100px] gap-2 border-b border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                <span className="font-mono text-white/50">{p.barcode || p.id}</span>
                <span className="truncate text-white">{p.name}</span>
                <span className="text-white/40">{p.vendaPorPeso ? "KG" : "UN"}</span>
                <span className="text-right font-semibold tabular-nums text-emerald-300">
                  {p.vendaPorPeso
                    ? `R$ ${fmt(p.precoPorKg ?? p.price)}/kg`
                    : `R$ ${fmt(p.price)}`}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: pesquisa de cliente (F2) ─────────────────── */}
      <Dialog open={props.clientSearchOpen} onOpenChange={props.onClientSearchOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Cliente (F2)</DialogTitle>
            <DialogDescription className="text-white/55">Identifique o cliente da venda.</DialogDescription>
          </DialogHeader>
          <input
            ref={clientSearchRef}
            value={props.clientSearchQuery}
            onChange={(e) => props.onClientSearchQueryChange(e.target.value)}
            placeholder="Nome, telefone ou documento..."
            className="h-9 w-full rounded-md border border-white/15 bg-[#000000] px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-emerald-500/70"
          />
          {props.clientSearchLoading && (
            <p className="text-center text-xs text-white/40">Buscando…</p>
          )}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {props.clientOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  props.onPickClient(c.label)
                  props.onClientSearchOpenChange(false)
                }}
                className="flex w-full items-center justify-between rounded-md border border-white/10 bg-[#000000] px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                <span className="font-medium text-white">{c.label}</span>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: alterar quantidade (F4) ──────────────────── */}
      <Dialog open={props.qtyEditOpen} onOpenChange={props.onQtyEditOpenChange}>
        <DialogContent className="max-w-sm border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Alterar Quantidade (F4)</DialogTitle>
            <DialogDescription className="text-white/55">Nova quantidade para o item selecionado.</DialogDescription>
          </DialogHeader>
          <input
            key={props.qtyEditDefault}
            ref={qtyEditRef}
            defaultValue={props.qtyEditDefault}
            inputMode="decimal"
            className="h-11 w-full rounded-md border border-white/15 bg-[#000000] px-3 text-2xl font-semibold text-white outline-none focus:border-emerald-500/70"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => props.onQtyEditOpenChange(false)}>
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

      {/* ── Diálogo: cancelar venda (F6) ──────────────────────── */}
      <Dialog open={props.cancelSaleOpen} onOpenChange={props.onCancelSaleOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Cancelar Venda (F6)</DialogTitle>
            <DialogDescription className="text-white/55">
              Todos os itens serão removidos. Confirme para limpar o cupom.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => props.onCancelSaleOpenChange(false)}>
              Voltar
            </Button>
            <Button type="button" variant="destructive" onClick={props.onConfirmCancelSale}>
              Cancelar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
