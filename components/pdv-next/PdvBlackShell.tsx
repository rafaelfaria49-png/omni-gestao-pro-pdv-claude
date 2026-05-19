"use client"

import { useEffect, useRef, type InputHTMLAttributes, type KeyboardEvent as RKE, type ReactNode } from "react"
import {
  Barcode,
  Calculator,
  ChevronRight,
  Hash,
  PackageOpen,
  Receipt,
  User2,
  UserCog,
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
  detail?: string
  unit: string
  unitPrice: number
  qty: number
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Campo de entrada Black Edition ──────────────────────────────────
function PosField({
  label,
  hint,
  icon,
  fieldClassName,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  icon?: ReactNode
  fieldClassName?: string
  inputRef?: React.RefObject<HTMLInputElement | null>
} & { inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const { inputRef, ...inputProps } = props as typeof props & { inputRef?: React.RefObject<HTMLInputElement | null> }
  return (
    <label className={cn("flex flex-col gap-1", fieldClassName)}>
      <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-white/55">
        <span>{label}</span>
        {hint ? (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80">{hint}</span>
        ) : null}
      </span>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/45">
            {icon}
          </span>
        ) : null}
        <input
          ref={inputRef as React.Ref<HTMLInputElement>}
          className={cn(
            "tabular-pdv h-9 w-full rounded-md border border-white/15 bg-[#000000] px-3 text-sm font-medium text-white shadow-sm outline-none transition-colors placeholder:text-white/40 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/25",
            icon && "pl-8",
            className
          )}
          {...inputProps}
        />
      </div>
    </label>
  )
}

const SHORTCUTS = [
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
  flashLineId,
  selectedLineId,
  onSelect,
}: {
  rows: PdvBlackCartRow[]
  highlightLineId: string | null
  flashLineId?: string | null
  selectedLineId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-[#000000] shadow-sm">
      <div className="grid grid-cols-[56px_110px_1fr_72px_120px_88px_140px] gap-3 border-b border-white/10 bg-[#000000] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
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
            const isFlash = flashLineId != null && item.lineId === flashLineId
            const isSelected = item.lineId === selectedLineId
            return (
              <button
                type="button"
                key={item.lineId}
                onClick={() => onSelect(item.lineId)}
                className={cn(
                  "grid w-full grid-cols-[56px_110px_1fr_72px_120px_88px_140px] gap-3 border-b border-white/10 bg-[#000000] px-4 py-2.5 text-left text-sm tabular-nums text-white transition-colors",
                  isFlash && "pdv-rapido-row-flash",
                  isHighlight && "bg-emerald-500/15 animate-in fade-in duration-300",
                  isSelected && "ring-1 ring-inset ring-emerald-400/70",
                  !isHighlight && !isSelected && "hover:bg-emerald-500/10"
                )}
              >
                <div className="font-mono text-white/45">{String(idx + 1).padStart(3, "0")}</div>
                <div className="font-mono text-white">{item.code}</div>
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.description}</div>
                  {item.detail ? (
                    <div className="mt-0.5 truncate font-mono text-[10px] leading-snug text-cyan-200/80" title={item.detail}>
                      {item.detail}
                    </div>
                  ) : null}
                </div>
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
  cartRows: PdvBlackCartRow[]
  highlightLineId: string | null
  flashLineId?: string | null
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
  seller: string
  onSellerChange: (v: string) => void
  info: string
  onShortcutAction: (key: string) => void
  onFinalizeClick: () => void
  products: PdvCatalogProduct[]
  productSearchOpen: boolean
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
  advancedOpen: boolean
  onAdvancedOpenChange: (open: boolean) => void
  receivablesOpen: boolean
  onReceivablesOpenChange: (open: boolean) => void
  onOpenReceivablesModule: () => void
}

export function PdvBlackShell(props: PdvBlackShellProps) {
  const qtyEditRef = useRef<HTMLInputElement>(null)
  const now = new Date().toLocaleString("pt-BR")

  useEffect(() => {
    if (!props.qtyEditOpen) return
    const id = window.requestAnimationFrame(() => {
      qtyEditRef.current?.focus()
      qtyEditRef.current?.select?.()
    })
    return () => window.cancelAnimationFrame(id)
  }, [props.qtyEditOpen])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#000000] text-white transition-colors duration-300">
      {/* ── Header operacional ─────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#000000] px-3 py-2 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-5 w-5" />
          </div>
          <div className="hidden h-8 w-px bg-white/15 md:block" />
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className="text-[11px] uppercase tracking-wider text-white/50">Estabelecimento</span>
            <span className="truncate text-sm font-medium text-white">{props.storeName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300 md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Online
          </span>
          <span className="hidden items-center gap-1.5 text-xs text-white/50 md:inline-flex">
            <Wifi className="h-3.5 w-3.5" /> Conexão estável
          </span>
          <span className="text-xs tabular-nums text-white/45">{now}</span>
        </div>
      </header>

      {/* ── Área de entrada ────────────────────────────────────── */}
      <section className="grid grid-cols-12 gap-3 border-b border-white/10 bg-[#000000] px-3 py-3 sm:px-4">
        <PosField
          inputRef={props.bipeRef}
          fieldClassName="col-span-12 md:col-span-4"
          label="Código / Bipe"
          hint="ENTER"
          icon={<Barcode className="h-4 w-4" />}
          value={props.bipeCode}
          onChange={(e) => props.onBipeChange(e.target.value)}
          onKeyDown={props.onBipeKeyDown}
          placeholder="Bipe ou digite o código do produto"
          autoComplete="off"
        />
        <PosField
          fieldClassName="col-span-6 md:col-span-3"
          label="Cliente"
          hint="F2"
          icon={<User2 className="h-4 w-4" />}
          value={props.customerDisplay}
          onChange={(e) => props.onCustomerDisplayChange(e.target.value)}
          placeholder="Nome ou documento"
        />
        <PosField
          fieldClassName="col-span-6 md:col-span-2"
          label="Quantidade"
          hint="F4"
          icon={<Hash className="h-4 w-4" />}
          value={props.nextQtyStr}
          onChange={(e) => props.onNextQtyStrChange(e.target.value)}
          inputMode="decimal"
        />
        <PosField
          fieldClassName="col-span-12 md:col-span-3"
          label="Vendedor"
          icon={<UserCog className="h-4 w-4" />}
          value={props.seller}
          onChange={(e) => props.onSellerChange(e.target.value)}
        />
      </section>

      {/* ── Conteúdo principal ─────────────────────────────────── */}
      <main className="grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden bg-[#000000] p-2 sm:p-3">
        {/* Tabela de itens */}
        <div className="col-span-12 flex min-h-0 flex-col overflow-hidden lg:col-span-9">
          <ItemsTable
            rows={props.cartRows}
            highlightLineId={props.highlightLineId}
            flashLineId={props.flashLineId}
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
              <div>
                <div className="text-white/45">Troco</div>
                <div className="font-semibold tabular-nums text-white">R$ 0,00</div>
              </div>
              <div className="text-right">
                <div className="text-white/45">Sem desc.</div>
                <div className="font-semibold tabular-nums text-white">R$ {fmt(props.total)}</div>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => props.onShortcutAction("F1")}
              disabled={props.itemCount === 0}
              className="mt-4 w-full gap-2 bg-emerald-600 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Receipt className="h-4 w-4" />
              Finalizar (F1)
              <ChevronRight className="ml-auto h-4 w-4" />
            </Button>
          </div>

          {/* Informativo */}
          <div className="rounded-md border border-white/10 bg-[#000000] p-4 shadow-sm">
            <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">Informativo</div>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{props.info}</p>
          </div>

          {/* Info operacional */}
          <div className="rounded-md border border-white/10 bg-[#000000] p-3 text-[11px] text-white/50">
            <div className="flex justify-between">
              <span>Caixa</span>
              <span className="font-medium text-white">PDV</span>
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
              Selecione um produto para adicionar à venda.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-md border border-white/10">
            {props.products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  props.onProductSearchOpenChange(false)
                  props.onAddProductFromSearch(p)
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
            <DialogTitle className="text-white">Pesquisar Cliente (F2)</DialogTitle>
            <DialogDescription className="text-white/55">Identifique o cliente desta venda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {props.clientOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  props.onPickClient(c.label)
                  props.onClientSearchOpenChange(false)
                }}
                className="flex w-full items-center justify-between rounded-md border border-white/10 bg-[#000000] px-3 py-2 text-left text-sm hover:border-white/20 hover:bg-white/5"
              >
                <span className="font-medium text-white">{c.label}</span>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </button>
            ))}
            {props.clientOptions.length === 0 && (
              <p className="py-4 text-center text-sm text-white/40">
                Digite no campo Cliente e pressione F2
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: alterar quantidade (F4) ──────────────────── */}
      <Dialog open={props.qtyEditOpen} onOpenChange={props.onQtyEditOpenChange}>
        <DialogContent className="max-w-sm border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Alterar Quantidade (F4)</DialogTitle>
            <DialogDescription className="text-white/55">
              Defina a nova quantidade para o item selecionado.
            </DialogDescription>
          </DialogHeader>
          <input
            key={props.qtyEditDefault}
            ref={qtyEditRef}
            defaultValue={props.qtyEditDefault}
            inputMode="decimal"
            className="tabular-pdv h-11 w-full rounded-md border border-white/15 bg-[#000000] px-3 text-2xl font-semibold text-white outline-none focus:border-emerald-500/70"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => props.onQtyEditOpenChange(false)}
            >
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
            <Button
              type="button"
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              onClick={() => props.onCancelSaleOpenChange(false)}
            >
              Voltar
            </Button>
            <Button type="button" variant="destructive" onClick={props.onConfirmCancelSale}>
              Cancelar venda
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: contas a receber (F9) ────────────────────── */}
      <Dialog open={props.receivablesOpen} onOpenChange={props.onReceivablesOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Contas a Receber (F9)</DialogTitle>
            <DialogDescription className="text-white/55">
              Abra o módulo financeiro para títulos e recebimentos.
            </DialogDescription>
          </DialogHeader>
          <Button type="button" className="w-full" onClick={props.onOpenReceivablesModule}>
            Ir para Contas a Receber
          </Button>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: funções avançadas (CTRL) ─────────────────── */}
      <Dialog open={props.advancedOpen} onOpenChange={props.onAdvancedOpenChange}>
        <DialogContent className="max-w-md border-white/10 bg-[#111111] text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Funções avançadas (CTRL)</DialogTitle>
            <DialogDescription className="text-white/55">Atalhos adicionais do caixa.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {["Orçamentos", "Trocas", "Devoluções", "Sangria", "Suprimento", "Reimprimir"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => props.onAdvancedOpenChange(false)}
                className="rounded-md border border-white/10 bg-[#000000] px-3 py-3 text-sm font-medium text-white hover:bg-white/5"
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
