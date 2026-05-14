"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Barcode,
  Banknote,
  CreditCard,
  CircleDot,
  Clock,
  QrCode,
  User,
  Wrench,
  Plus,
  Minus,
  Settings2,
  X,
  RefreshCw,
  Layers,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  Keyboard,
  Search,
  Star,
  Loader2,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { playPdvRapidoItemBeepIfEnabled } from "@/lib/pdv-rapido-feedback"
import { useOperationsStore } from "@/lib/operations-store"
import { getOrCreatePdvOperatorId } from "@/lib/pdv-operator-id"
import { PDV_PRODUCTS_BASE, mergePdvCatalogWithInventory, type PdvCatalogProduct } from "@/lib/pdv-catalog"
import { findPdvProductByScan } from "@/lib/pdv-scan-product"
import { filterPdvCatalogBySearch } from "@/lib/pdv-product-search"
import { CaixaStatusBar } from "../caixa/caixa-status-bar"
import { useToast } from "@/hooks/use-toast"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"

// ─── Catalog slices (defaults) ───────────────────────────────────────────────

const ALL_SERVICES = PDV_PRODUCTS_BASE.filter((p) => p.category === "Servicos")

const TOP_PRODUCT_CATEGORIES = ["Peliculas", "Cabos", "Capinhas", "Carregadores", "Fones"]
const ALL_TOP_PRODUCTS: PdvCatalogProduct[] = []
for (const cat of TOP_PRODUCT_CATEGORIES) {
  const items = PDV_PRODUCTS_BASE.filter((p) => p.category === cat).slice(0, 2)
  ALL_TOP_PRODUCTS.push(...items)
  if (ALL_TOP_PRODUCTS.length >= 8) break
}

// ─── Atalhos types + helpers ──────────────────────────────────────────────────

const SHORTCUTS_STORAGE_KEY = (storeId: string) => `omnigestao:pdv-shortcuts:${storeId}`

type AtalhoSaved = {
  id: string
  nome: string
  preco: number
  inventoryId?: string
  categoria?: string
  ativo?: boolean
  favorito?: boolean
  cor?: string
  posicao?: number
}

type AtalhoEntry = {
  id: string
  nome: string
  preco: number
  categoria: string
  ativo: boolean
  favorito: boolean
  stockAtual: number
  barcode?: string
  sku?: string
}

const MAX_SVC = 8
const MAX_PRD = 8

function toAtalhoEntry(a: AtalhoSaved, catalog: PdvCatalogProduct[]): AtalhoEntry {
  const live = catalog.find((p) => p.id === a.id)
  const isService = (a.categoria ?? live?.category ?? "") === "Servicos"
  return {
    id: a.id,
    nome: live?.name ?? a.nome,
    preco: live?.price ?? a.preco,
    categoria: a.categoria ?? live?.category ?? "Outros",
    ativo: a.ativo !== false,
    favorito: a.favorito ?? false,
    stockAtual: live?.stock ?? (isService ? 999 : 0),
    barcode: live?.barcode ?? live?.codigoBarras,
    sku: live?.sku ?? live?.codigo,
  }
}

function fromAtalhoEntry(e: AtalhoEntry): AtalhoSaved {
  return { id: e.id, nome: e.nome, preco: e.preco, categoria: e.categoria, inventoryId: e.id, ativo: e.ativo, favorito: e.favorito }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CartLine = { lineId: string; inventoryId: string; title: string; price: number; qty: number }

type PayMethod = "dinheiro" | "pix" | "credito" | "debito" | "a_prazo" | "multiplo"

const PAY_METHODS: {
  id: PayMethod
  label: string
  shortLabel: string
  Icon: React.ElementType
  color: string
  hotkey?: string
}[] = [
  {
    id: "dinheiro",
    label: "Dinheiro",
    shortLabel: "Dinheiro",
    Icon: Banknote,
    // emerald-600 base — no hover dark, go brighter; glow controlado
    color: "bg-emerald-600 hover:bg-emerald-500 shadow-[0_4px_12px_-2px_rgba(5,150,105,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(5,150,105,0.62)]",
    hotkey: "F1",
  },
  {
    id: "pix",
    label: "PIX",
    shortLabel: "PIX",
    Icon: QrCode,
    // teal — sem token equivalente; mesma estrutura de glow
    color: "bg-teal-600 hover:bg-teal-500 shadow-[0_4px_12px_-2px_rgba(13,148,136,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(13,148,136,0.62)]",
  },
  {
    id: "credito",
    label: "Cartão Crédito",
    shortLabel: "Crédito",
    Icon: CreditCard,
    // blue-600 → token bg-info seria oklch(0.72 0.15 235) mas variação de tema; usar escala fixa para contraste garantido
    color: "bg-blue-600 hover:bg-blue-500 shadow-[0_4px_12px_-2px_rgba(37,99,235,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(37,99,235,0.62)]",
  },
  {
    id: "debito",
    label: "Cartão Débito",
    shortLabel: "Débito",
    Icon: CreditCard,
    // indigo — sem token equivalente
    color: "bg-indigo-600 hover:bg-indigo-500 shadow-[0_4px_12px_-2px_rgba(79,70,229,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(79,70,229,0.62)]",
  },
  {
    id: "a_prazo",
    label: "A Prazo (Fiado)",
    shortLabel: "A Prazo",
    Icon: CalendarClock,
    // amber-600 → token bg-warning varia entre temas; usar escala fixa
    color: "bg-amber-600 hover:bg-amber-500 shadow-[0_4px_12px_-2px_rgba(217,119,6,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(217,119,6,0.62)]",
  },
  {
    id: "multiplo",
    label: "Pgto. Múltiplo",
    shortLabel: "Múltiplo",
    Icon: Layers,
    // violet-600 → token bg-purple disponível mas lightness varia; escala fixa garante white-text contrast
    color: "bg-violet-600 hover:bg-violet-500 shadow-[0_4px_12px_-2px_rgba(124,58,237,0.45)] hover:shadow-[0_4px_18px_-2px_rgba(124,58,237,0.62)]",
    hotkey: "F12",
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function parseBrl(s: string): number {
  const v = Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""))
  return Number.isFinite(v) && v >= 0 ? v : 0
}

function newLineId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

// ─── QuickCard ────────────────────────────────────────────────────────────────

function QuickCard({
  item,
  onAdd,
  isPickHighlight,
}: {
  item: PdvCatalogProduct
  onAdd: (item: PdvCatalogProduct) => void
  isPickHighlight?: boolean
}) {
  const isService = item.category === "Servicos"
  const outOfStock = !isService && item.stock <= 0

  return (
    <Card
      className={cn(
        "group cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:bg-accent hover:shadow-md active:scale-[0.98]",
        isPickHighlight && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        outOfStock && "opacity-60"
      )}
      onClick={() => onAdd(item)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.category}</p>
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold tabular-nums"
        >
          {brl(item.price)}
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={cn(
          "text-[10px]",
          outOfStock ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        )}>
          {isService ? "Serviço" : outOfStock ? "Sem estoque" : `${item.stock} em estoque`}
        </span>
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/10 text-primary opacity-0 transition group-hover:opacity-100">
          <Plus className="h-3.5 w-3.5" />
        </span>
      </div>
    </Card>
  )
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({
  open,
  total,
  customerName,
  defaultMethod = "dinheiro",
  onConfirm,
  onClose,
}: {
  open: boolean
  total: number
  customerName: string
  defaultMethod?: PayMethod
  onConfirm: (
    method: PayMethod,
    notes: string,
    payments: { dinheiro: number; pix: number; cartaoDebito: number; cartaoCredito: number; aPrazo: number }
  ) => void
  onClose: () => void
}) {
  const [method, setMethod] = useState<PayMethod>(defaultMethod)

  // Sync default method whenever the modal opens with a different key
  useEffect(() => {
    if (open) setMethod(defaultMethod)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultMethod])
  const [amountPaid, setAmountPaid] = useState("")
  const [multiplo1, setMultiplo1] = useState<PayMethod>("dinheiro")
  const [multiplo1Value, setMultiplo1Value] = useState("")
  const [multiplo2, setMultiplo2] = useState<PayMethod>("pix")
  const [notes, setNotes] = useState("")

  const paid = parseBrl(amountPaid)
  const troco = Math.max(0, paid - total)
  const m1val = parseBrl(multiplo1Value)
  const m2val = Math.max(0, total - m1val)

  const missingCustomer = method === "a_prazo" && !customerName.trim()
  const multiplo1Error = method === "multiplo" && m1val > total
  const canConfirm =
    !missingCustomer &&
    !multiplo1Error &&
    (method === "pix" ||
      method === "credito" ||
      method === "debito" ||
      method === "a_prazo" ||
      (method === "dinheiro" && paid >= total) ||
      (method === "multiplo" && m1val > 0 && m1val < total))

  function handleConfirm() {
    if (!canConfirm) return
    const notesLines: string[] = []
    if (notes) notesLines.push(notes)
    const payments = { dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, aPrazo: 0 }
    if (method === "multiplo") {
      const m1 = PAY_METHODS.find((p) => p.id === multiplo1)!
      const m2 = PAY_METHODS.find((p) => p.id === multiplo2)!
      notesLines.push(
        `Múltiplo: ${m1.label} ${brl(m1val)} + ${m2.label} ${brl(m2val)}`,
      )
      const add = (m: PayMethod, v: number) => {
        if (m === "dinheiro") payments.dinheiro += v
        else if (m === "pix") payments.pix += v
        else if (m === "debito") payments.cartaoDebito += v
        else if (m === "credito") payments.cartaoCredito += v
        else if (m === "a_prazo") payments.aPrazo += v
      }
      add(multiplo1, m1val)
      add(multiplo2, m2val)
    }
    if (method === "dinheiro") {
      notesLines.push(`Troco: ${brl(troco)}`)
      payments.dinheiro = total
    } else if (method === "pix") payments.pix = total
    else if (method === "debito") payments.cartaoDebito = total
    else if (method === "credito") payments.cartaoCredito = total
    else if (method === "a_prazo") payments.aPrazo = total
    onConfirm(method, notesLines.join(" | "), payments)
    setAmountPaid("")
    setNotes("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl border-border bg-card p-0 shadow-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center justify-between text-lg font-bold text-foreground">
            <span>Finalizar Venda</span>
            <span className="text-2xl font-black tabular-nums text-emerald-500">{brl(total)}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {/* Method grid */}
          <div>
            <Label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Forma de Pagamento
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all",
                    method === m.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <m.Icon className="h-4 w-4" />
                  {m.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Method-specific inputs */}
          {method === "dinheiro" && (
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-sm text-muted-foreground">Valor recebido</Label>
                <Input
                  autoFocus
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="R$ 0,00"
                  className="h-12 rounded-xl text-right text-lg font-bold tabular-nums"
                  inputMode="decimal"
                />
              </div>
              {paid > 0 && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3",
                    troco > 0
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : paid < total
                        ? "border-destructive/30 bg-destructive/10"
                        : "border-border bg-muted/40",
                  )}
                >
                  <span className="text-sm font-semibold text-muted-foreground">
                    {troco > 0 ? "Troco" : paid < total ? "Faltam" : "Valor exato"}
                  </span>
                  <span
                    className={cn(
                      "text-xl font-black tabular-nums",
                      troco > 0
                        ? "text-emerald-500"
                        : paid < total
                          ? "text-destructive"
                          : "text-foreground",
                    )}
                  >
                    {troco > 0 ? brl(troco) : paid < total ? brl(total - paid) : "✓"}
                  </span>
                </div>
              )}
            </div>
          )}

          {(method === "pix" || method === "credito" || method === "debito") && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-4">
              <span className="text-sm text-muted-foreground">Total a cobrar</span>
              <span className="text-2xl font-black tabular-nums text-foreground">{brl(total)}</span>
            </div>
          )}

          {method === "a_prazo" && (
            <div className="space-y-3">
              {missingCustomer && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Informe o nome do cliente no painel antes de usar esta forma.
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="font-semibold text-foreground">
                    {customerName.trim() || <span className="italic text-muted-foreground">Não informado</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total fiado</p>
                  <p className="text-xl font-black tabular-nums text-amber-500">{brl(total)}</p>
                </div>
              </div>
            </div>
          )}

          {method === "multiplo" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Método 1</Label>
                  <select
                    value={multiplo1}
                    onChange={(e) => setMultiplo1(e.target.value as PayMethod)}
                    className="h-9 w-full rounded-xl border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {PAY_METHODS.filter((m) => m.id !== "multiplo" && m.id !== "a_prazo").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={multiplo1Value}
                    onChange={(e) => setMultiplo1Value(e.target.value)}
                    placeholder="R$ 0,00"
                    className="h-9 rounded-xl text-right text-sm tabular-nums"
                    inputMode="decimal"
                  />
                  {multiplo1Error && (
                    <p className="text-xs text-destructive">Valor maior que o total</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Método 2</Label>
                  <select
                    value={multiplo2}
                    onChange={(e) => setMultiplo2(e.target.value as PayMethod)}
                    className="h-9 w-full rounded-xl border border-border bg-background px-2 text-sm text-foreground"
                  >
                    {PAY_METHODS.filter((m) => m.id !== "multiplo" && m.id !== "a_prazo").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex h-9 items-center justify-end rounded-xl border border-border bg-muted/50 px-3 text-sm font-bold tabular-nums text-foreground">
                    {brl(m2val >= 0 ? m2val : 0)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: cliente solicitou nota, desconto autorizado…"
              className="h-16 resize-none rounded-xl text-sm"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!canConfirm}
            className="rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={handleConfirm}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Confirmar Venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── HelpOverlay ─────────────────────────────────────────────────────────────

const HELP_SHORTCUTS: { key: string; label: string; status: "ok" | "partial" | "soon" }[] = [
  { key: "F1",  label: "Finalizar venda",        status: "ok" },
  { key: "F2",  label: "Foco no campo cliente",  status: "ok" },
  { key: "F3",  label: "Foco na busca / bipe",   status: "ok" },
  { key: "F4",  label: "Alterar quantidade",     status: "soon" },
  { key: "F5",  label: "Remover último item",    status: "ok" },
  { key: "F6",  label: "Cancelar venda",         status: "ok" },
  { key: "F7",  label: "Desconto / Acréscimo",   status: "partial" },
  { key: "F8",  label: "Troca / Devolução",      status: "ok" },
  { key: "F9",  label: "Contas a Receber",       status: "soon" },
  { key: "F10", label: "Menu de Caixa",          status: "soon" },
  { key: "F11", label: "Tela cheia / Modo foco", status: "ok" },
  { key: "F12", label: "Pagamento avançado",     status: "ok" },
  { key: "END", label: "Esta ajuda",             status: "ok" },
  { key: "DEL", label: "Remover último item",    status: "ok" },
  { key: "ESC", label: "Fechar modal / painel",  status: "ok" },
]

function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-card p-0 shadow-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Keyboard className="h-4 w-4 text-primary" />
            Atalhos de Teclado — PDV Assistência
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh]">
          <div className="divide-y divide-border px-2 py-1">
            {HELP_SHORTCUTS.map(({ key, label, status }) => (
              <div key={key} className="flex items-center gap-3 px-4 py-2.5">
                <kbd className="w-12 shrink-0 rounded-lg border border-border bg-muted px-2 py-1 text-center text-xs font-bold text-foreground">
                  {key}
                </kbd>
                <span className="flex-1 text-sm text-foreground">{label}</span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  status === "ok"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : status === "partial"
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground",
                )}>
                  {status === "ok" ? "Ativo" : status === "partial" ? "Parcial" : "Em breve"}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter className="border-t border-border px-6 py-3">
          <p className="flex-1 text-xs text-muted-foreground">
            Pressione{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-bold">END</kbd>{" "}
            a qualquer momento para abrir esta ajuda.
          </p>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TrocasModal ──────────────────────────────────────────────────────────────

function TrocasModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [itemDesc, setItemDesc] = useState("")
  const [motivo, setMotivo] = useState("")
  const [done, setDone] = useState(false)

  function handleConfirm() {
    if (!itemDesc.trim()) return
    setDone(true)
    setTimeout(() => {
      setDone(false)
      setItemDesc("")
      setMotivo("")
      onClose()
    }, 1500)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <RotateCcw className="h-5 w-5 text-blue-500" />
            Trocas e Devoluções
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="font-semibold text-foreground">Troca registrada com sucesso!</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1 block text-sm">Item devolvido / trocado</Label>
              <Input
                autoFocus
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Ex: Película Samsung A54"
                className="rounded-xl"
              />
            </div>
            <div>
              <Label className="mb-1 block text-sm">Motivo</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Produto com defeito, tamanho errado…"
                className="h-20 resize-none rounded-xl text-sm"
              />
            </div>
          </div>
        )}

        {!done && (
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!itemDesc.trim()}
              className="rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleConfirm}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Registrar Troca
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── EditarAtalhosModal ───────────────────────────────────────────────────────

function EditarAtalhosModal({
  open,
  catalog = PDV_PRODUCTS_BASE,
  catalogForAdd = [],
  savedAtalhos,
  onSave,
  onClose,
}: {
  open: boolean
  /** Catálogo completo (inclui base mock) — usado apenas para resolver atalhos já salvos. */
  catalog?: PdvCatalogProduct[]
  /** Apenas itens reais do estoque — exibidos na aba "Adicionar do Catálogo". */
  catalogForAdd?: PdvCatalogProduct[]
  savedAtalhos: AtalhoSaved[]
  onSave: (atalhos: AtalhoSaved[]) => void
  onClose: () => void
}) {
  const [entries, setEntries] = useState<AtalhoEntry[]>([])
  const [modalTab, setModalTab] = useState<"atalhos" | "adicionar">("atalhos")
  const [catSearch, setCatSearch] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEntries(savedAtalhos.map((a) => toAtalhoEntry(a, catalog)))
    setModalTab("atalhos")
    setCatSearch("")
    setIsSaving(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const svcEntries = useMemo(
    () => entries.map((e, i) => ({ ...e, _idx: i })).filter((e) => e.categoria === "Servicos"),
    [entries],
  )
  const prdEntries = useMemo(
    () => entries.map((e, i) => ({ ...e, _idx: i })).filter((e) => e.categoria !== "Servicos"),
    [entries],
  )
  const svcActive = svcEntries.filter((e) => e.ativo).length
  const prdActive = prdEntries.filter((e) => e.ativo).length
  const addedIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries])

  const catSearchLow = catSearch.toLowerCase().trim()
  const catalogFiltered = useMemo(
    () =>
      catSearchLow
        ? catalogForAdd.filter(
            (p) =>
              p.name.toLowerCase().includes(catSearchLow) ||
              p.category.toLowerCase().includes(catSearchLow) ||
              (p.sku ?? "").toLowerCase().includes(catSearchLow) ||
              (p.barcode ?? "").includes(catSearchLow),
          )
        : catalogForAdd,
    [catalogForAdd, catSearchLow],
  )

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const moveWithinGroup = (idx: number, dir: -1 | 1) => {
    const isService = entries[idx].categoria === "Servicos"
    const step = dir < 0 ? -1 : 1
    let target = -1
    for (let i = idx + step; i >= 0 && i < entries.length; i += step) {
      if ((entries[i].categoria === "Servicos") === isService) { target = i; break }
    }
    if (target === -1) return
    setEntries((prev) => {
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const toggleAtivo = (idx: number) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ativo: !e.ativo } : e)))

  const toggleFavorito = (idx: number) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, favorito: !e.favorito } : e)))

  const removeEntry = (idx: number) =>
    setEntries((prev) => prev.filter((_, i) => i !== idx))

  const addFromCatalog = (p: PdvCatalogProduct) => {
    if (addedIds.has(p.id)) return
    const isService = p.category === "Servicos"
    if (isService && svcEntries.length >= MAX_SVC) return
    if (!isService && prdEntries.length >= MAX_PRD) return
    setEntries((prev) => [
      ...prev,
      { id: p.id, nome: p.name, preco: p.price, categoria: p.category, ativo: true, favorito: false, stockAtual: p.stock, barcode: p.barcode, sku: p.sku ?? p.codigo },
    ])
  }

  const handleSave = () => {
    setIsSaving(true)
    onSave(entries.map(fromAtalhoEntry))
    onClose()
  }

  // ── Row ────────────────────────────────────────────────────────────────────
  const renderRow = (e: AtalhoEntry & { _idx: number }, isFirstInGroup: boolean, isLastInGroup: boolean) => {
    const isService = e.categoria === "Servicos"
    const outOfStock = !isService && e.stockAtual <= 0

    return (
      <div
        key={e.id}
        className={cn(
          "flex items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-all",
          e.ativo ? "border-border bg-background" : "border-border/50 bg-muted/30 opacity-60",
        )}
      >
        {/* Reorder */}
        <div className="flex shrink-0 flex-col">
          <button type="button" disabled={isFirstInGroup} onClick={() => moveWithinGroup(e._idx, -1)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-20">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button type="button" disabled={isLastInGroup} onClick={() => moveWithinGroup(e._idx, 1)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-20">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{e.nome}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{e.categoria}</span>
            {e.sku && <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{e.sku}</span>}
            {outOfStock && (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                sem estoque
              </Badge>
            )}
          </div>
        </div>

        {/* Price */}
        <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">{brl(e.preco)}</span>

        {/* Favorito */}
        <button type="button" onClick={() => toggleFavorito(e._idx)} title={e.favorito ? "Remover dos favoritos" : "Favorito"}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg transition",
            e.favorito ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500")}>
          <Star className={cn("h-3.5 w-3.5", e.favorito && "fill-current")} />
        </button>

        {/* Ativo toggle */}
        <button type="button" onClick={() => toggleAtivo(e._idx)} title={e.ativo ? "Desativar" : "Ativar"}
          className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", e.ativo ? "bg-primary" : "bg-muted")}>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            e.ativo ? "translate-x-4" : "translate-x-0.5")} />
        </button>

        {/* Remove */}
        <button type="button" onClick={() => removeEntry(e._idx)}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0">
        {/* Header — fixo */}
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings2 className="h-5 w-5 text-primary" />
            Gerenciar Atalhos Rápidos
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure até {MAX_SVC} serviços e {MAX_PRD} produtos. Reordene, ative/desative e marque favoritos.
          </p>
        </DialogHeader>

        {/* Tab nav — fixo */}
        <div className="flex shrink-0 gap-5 border-b border-border px-6 pt-3">
          {([
            { id: "atalhos" as const, label: `Atalhos (${entries.length})` },
            { id: "adicionar" as const, label: "Adicionar do Catálogo" },
          ] as const).map((t) => (
            <button key={t.id} type="button" onClick={() => setModalTab(t.id)}
              className={cn("pb-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px",
                modalTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Área de conteúdo — scrollável, ocupa espaço restante */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {modalTab === "atalhos" ? (
            /* ── Tab: Atalhos ── */
            <div className="space-y-4 px-6 py-4">
              {/* Serviços */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Serviços</p>
                  <Badge variant={svcActive >= MAX_SVC ? "destructive" : "secondary"} className="text-xs">
                    {svcActive}/{MAX_SVC} ativos
                  </Badge>
                </div>
                {svcEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum serviço. Adicione na aba &ldquo;Adicionar do Catálogo&rdquo;.</p>
                ) : (
                  <div className="space-y-1.5">
                    {svcEntries.map((e, gi) =>
                      renderRow(e, gi === 0, gi === svcEntries.length - 1)
                    )}
                  </div>
                )}
              </div>

              <Separator className="bg-border" />

              {/* Produtos */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produtos</p>
                  <Badge variant={prdActive >= MAX_PRD ? "destructive" : "secondary"} className="text-xs">
                    {prdActive}/{MAX_PRD} ativos
                  </Badge>
                </div>
                {prdEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum produto. Adicione na aba &ldquo;Adicionar do Catálogo&rdquo;.</p>
                ) : (
                  <div className="space-y-1.5">
                    {prdEntries.map((e, gi) =>
                      renderRow(e, gi === 0, gi === prdEntries.length - 1)
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Tab: Adicionar ── */
            <div className="flex flex-col">
              {/* Busca — sticky */}
              <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                    placeholder="Buscar por nome, categoria, SKU ou código de barras…"
                    className="h-9 w-full rounded-xl border-border bg-background pl-9 text-sm"
                  />
                </div>
              </div>

              {/* Lista de itens reais */}
              <div className="space-y-1 px-6 py-3">
                {catalogForAdd.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <AlertTriangle className="h-6 w-6 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Nenhum produto real encontrado nesta loja.
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Cadastre itens em Estoque para adicioná-los como atalhos.
                    </p>
                  </div>
                ) : catalogFiltered.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nenhum resultado para &ldquo;{catSearch}&rdquo;.
                  </p>
                ) : (
                  catalogFiltered.map((p) => {
                    const isAdded = addedIds.has(p.id)
                    const isService = p.category === "Servicos"
                    const outOfStock = !isService && p.stock <= 0
                    const atLimit = isService ? svcEntries.length >= MAX_SVC : prdEntries.length >= MAX_PRD
                    const disabled = isAdded || atLimit

                    return (
                      <div key={p.id}
                        className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all",
                          isAdded ? "border-border/50 bg-muted/20 opacity-60" : "border-border bg-background hover:border-primary/30 hover:bg-muted/40")}>
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate font-medium", isAdded ? "text-muted-foreground" : "text-foreground")}>{p.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">{p.category}</span>
                            {p.sku && <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{p.sku}</span>}
                            {outOfStock && (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1 py-px text-[9px] font-semibold text-amber-600">
                                sem estoque
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{brl(p.price)}</span>
                        {!isService && p.stock < 999 && (
                          <span className={cn("shrink-0 text-[10px] tabular-nums", outOfStock ? "text-amber-500" : "text-muted-foreground")}>
                            {p.stock}⬟
                          </span>
                        )}
                        <button type="button" disabled={disabled} onClick={() => addFromCatalog(p)}
                          className={cn("flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold transition",
                            isAdded ? "cursor-default text-muted-foreground"
                              : atLimit ? "cursor-not-allowed text-muted-foreground opacity-40"
                                : "bg-primary/10 text-primary hover:bg-primary/20")}>
                          {isAdded ? <><Check className="h-3 w-3" /> Adicionado</> : <><Plus className="h-3 w-3" /> Adicionar</>}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — fixo */}
        <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>Cancelar</Button>
          <Button disabled={isSaving} className="rounded-xl" onClick={handleSave}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Salvar Atalhos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PdvAssistenciaEnterprise({ isModoRapido = false }: { isModoRapido?: boolean } = {}) {
  const { inventory, finalizeSaleTransaction } = useOperationsStore()
  const { pdvParams, blob, save: saveStoreSettings, hydrated: settingsHydrated } = useStoreSettings()
  const { lojaAtivaId } = useLojaAtiva()
  const shortcutsKey = useMemo(
    () => SHORTCUTS_STORAGE_KEY((lojaAtivaId || LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID),
    [lojaAtivaId]
  )
  const cashierId = useMemo(() => getOrCreatePdvOperatorId(), [])
  const mergedCatalog = useMemo(() => mergePdvCatalogWithInventory(PDV_PRODUCTS_BASE, inventory), [inventory])

  // Apenas itens reais do estoque (sem os mocks de PDV_PRODUCTS_BASE) — passados ao modal de atalhos
  const realCatalog = useMemo((): PdvCatalogProduct[] => {
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const customerInputRef = useRef<HTMLInputElement | null>(null)
  const discountInputRef = useRef<HTMLInputElement | null>(null)
  const { toast } = useToast()

  // ── Time ────────────────────────────────────────────────────────────────────
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!isModoRapido) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 200)
    return () => window.clearTimeout(t)
  }, [isModoRapido])

  // ── Search + catalog tab ─────────────────────────────────────────────────────
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"servicos" | "produtos" | "favoritos">("servicos")

  // ── Cart ─────────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([])
  const [rapidoFlashLineId, setRapidoFlashLineId] = useState<string | null>(null)
  const [rapidoPickIdx, setRapidoPickIdx] = useState(0)
  const [discount, setDiscount] = useState(0)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  // ── Customer (required for "A Prazo") ────────────────────────────────────────
  const [customerName, setCustomerName] = useState("")

  // ── Modals ───────────────────────────────────────────────────────────────────
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentInitMethod, setPaymentInitMethod] = useState<PayMethod>("dinheiro")
  const [trocasOpen, setTrocasOpen] = useState(false)
  const [editAtalhosOpen, setEditAtalhosOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // ── Custom atalhos ────────────────────────────────────────────────────────────
  const [localAtalhos, setLocalAtalhos] = useState<AtalhoSaved[]>(() => [
    ...ALL_SERVICES.slice(0, 8).map((p) => ({ id: p.id, nome: p.name, preco: p.price, categoria: p.category, ativo: true, favorito: false })),
    ...ALL_TOP_PRODUCTS.slice(0, 8).map((p) => ({ id: p.id, nome: p.name, preco: p.price, categoria: p.category, ativo: true, favorito: false })),
  ])

  const quickServices = useMemo(() => {
    const active = localAtalhos.filter((a) => a.categoria === "Servicos" && a.ativo !== false)
    return active.map((a) => mergedCatalog.find((p) => p.id === a.id)).filter((p): p is PdvCatalogProduct => p !== undefined)
  }, [localAtalhos, mergedCatalog])

  const quickProducts = useMemo(() => {
    const active = localAtalhos.filter((a) => a.categoria !== "Servicos" && a.categoria !== undefined && a.ativo !== false)
    return active.map((a) => mergedCatalog.find((p) => p.id === a.id)).filter((p): p is PdvCatalogProduct => p !== undefined)
  }, [localAtalhos, mergedCatalog])

  const quickFavorites = useMemo(() => {
    const active = localAtalhos.filter((a) => a.favorito && a.ativo !== false)
    return active.map((a) => mergedCatalog.find((p) => p.id === a.id)).filter((p): p is PdvCatalogProduct => p !== undefined)
  }, [localAtalhos, mergedCatalog])

  // ── Hydratação dos atalhos: localStorage (fast-path) → banco (fallback) ──────
  const [hydratedFromDb, setHydratedFromDb] = useState(false)
  useEffect(() => {
    if (hydratedFromDb) return

    // Fast-path: localStorage por loja (disponível antes da resposta do servidor)
    try {
      const raw = localStorage.getItem(shortcutsKey)
      if (raw) {
        const parsed = JSON.parse(raw) as AtalhoSaved[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLocalAtalhos(parsed)
          setHydratedFromDb(true)
          return
        }
      }
    } catch { /* ignore */ }

    // Server fallback: aguarda hidratação do banco
    if (!settingsHydrated) return
    const saved = pdvParams.atalhosRapidos ?? []
    if (saved.length > 0) {
      setLocalAtalhos(saved)
    } else {
      setLocalAtalhos([
        ...ALL_SERVICES.slice(0, 8).map((p) => ({ id: p.id, nome: p.name, preco: p.price, categoria: p.category, ativo: true, favorito: false })),
        ...ALL_TOP_PRODUCTS.slice(0, 8).map((p) => ({ id: p.id, nome: p.name, preco: p.price, categoria: p.category, ativo: true, favorito: false })),
      ])
    }
    setHydratedFromDb(true)
  }, [shortcutsKey, settingsHydrated, hydratedFromDb, pdvParams.atalhosRapidos])

  // ── Computed totals ────────────────────────────────────────────────────────────
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart])
  const desconto = useMemo(() => Math.min(Math.max(0, discount), subtotal), [discount, subtotal])
  const total = useMemo(() => Math.max(0, subtotal - desconto), [subtotal, desconto])

  // ── Full-catalog search ────────────────────────────────────────────────────────
  const fullSearch = useMemo(() => {
    const raw = search.trim()
    if (!raw) return []
    const exact = findPdvProductByScan(raw, mergedCatalog)
    if (exact) return [exact]
    return filterPdvCatalogBySearch(mergedCatalog, raw).slice(0, 12)
  }, [search, mergedCatalog])

  useEffect(() => {
    setRapidoPickIdx(0)
  }, [search, fullSearch.length])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────────
  const openPaymentModal = (method: PayMethod) => {
    if (cart.length === 0) return
    setPaymentInitMethod(method)
    setPaymentOpen(true)
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.altKey) return

      const active = document.activeElement
      const inInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable)

      const anyModalOpen = paymentOpen || clearConfirmOpen || trocasOpen || editAtalhosOpen || helpOpen

      // END — toggle help overlay (always works)
      if (e.key === "End") {
        e.preventDefault()
        setHelpOpen((o) => !o)
        return
      }

      // DEL — remove last cart item (not in input, not in modal)
      if (e.key === "Delete" && !inInput && !anyModalOpen) {
        if (cart.length > 0) {
          e.preventDefault()
          setCart((prev) => prev.slice(0, -1))
          queueMicrotask(() => inputRef.current?.focus())
        }
        return
      }

      const F_KEYS = ["F1","F2","F3","F4","F5","F6","F7","F8","F9","F10","F11","F12"]
      if (!F_KEYS.includes(e.key)) return
      e.preventDefault()

      // F2 / F3 focus inputs even when a non-blocking modal is open; rest require no modal
      if (anyModalOpen && e.key !== "F2" && e.key !== "F3") return

      switch (e.key) {
        case "F1":  openPaymentModal("dinheiro"); break
        case "F2":  customerInputRef.current?.focus(); break
        case "F3":  inputRef.current?.focus(); break
        case "F4":
          toast({ title: "F4 — Alterar quantidade", description: "Disponível em breve." })
          break
        case "F5":
          if (!inInput && cart.length > 0) {
            setCart((prev) => prev.slice(0, -1))
            queueMicrotask(() => inputRef.current?.focus())
          }
          break
        case "F6":
          if (cart.length > 0) setClearConfirmOpen(true)
          break
        case "F7":
          if (!isModoRapido) {
            discountInputRef.current?.focus()
          } else {
            toast({ title: "F7 — Desconto/Acréscimo", description: "Disponível no modo padrão." })
          }
          break
        case "F8": setTrocasOpen(true); break
        case "F9":
          toast({ title: "F9 — Contas a Receber", description: "Disponível em breve." })
          break
        case "F10":
          toast({ title: "F10 — Menu de Caixa", description: "Disponível em breve." })
          break
        case "F11":
          if (!document.fullscreenElement) {
            void document.documentElement.requestFullscreen().catch(() => {})
          } else {
            void document.exitFullscreen().catch(() => {})
          }
          break
        case "F12": openPaymentModal("multiplo"); break
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as EventListenerOptions)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, isModoRapido, paymentOpen, clearConfirmOpen, trocasOpen, editAtalhosOpen, helpOpen])

  // ── Cart actions ────────────────────────────────────────────────────────────────
  const addItem = (item: PdvCatalogProduct) => {
    let flashId: string | null = null
    setCart((prev) => {
      const hit = prev.find((l) => l.inventoryId === item.id && Math.abs(l.price - item.price) < 0.001)
      if (hit) {
        flashId = hit.lineId
        return prev.map((l) => (l.lineId === hit.lineId ? { ...l, qty: l.qty + 1 } : l))
      }
      const nid = newLineId()
      flashId = nid
      return [...prev, { lineId: nid, inventoryId: item.id, title: item.name, price: item.price, qty: 1 }]
    })
    if (isModoRapido && flashId) {
      setRapidoFlashLineId(flashId)
      window.setTimeout(() => setRapidoFlashLineId((h) => (h === flashId ? null : h)), 150)
      setSearch("")
      playPdvRapidoItemBeepIfEnabled()
    }
    queueMicrotask(() => {
      inputRef.current?.focus()
      if (isModoRapido) {
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    })
  }

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.lineId === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    )
  }

  const removeLine = (id: string) => setCart((prev) => prev.filter((l) => l.lineId !== id))

  // ── Payment confirm ────────────────────────────────────────────────────────────
  const handlePaymentConfirm = (
    method: PayMethod,
    notes: string,
    payments: { dinheiro: number; pix: number; cartaoDebito: number; cartaoCredito: number; aPrazo: number }
  ) => {
    if (cart.length === 0) return
    // `operations-store` exige CPF para à prazo. Mantemos a UI atual e bloqueamos esta forma aqui.
    if (method === "a_prazo" || payments.aPrazo > 0.009) {
      toast({
        title: "Venda à prazo",
        description: "Para vender à prazo é necessário cliente com CPF/CNPJ (use o PDV Clássico).",
        variant: "destructive",
      })
      return
    }

    const result = finalizeSaleTransaction({
      lines: cart.map((l) => ({
        inventoryId: l.inventoryId,
        quantity: l.qty,
        name: l.title,
        unitPrice: l.price,
      })),
      total,
      paymentBreakdown: {
        dinheiro: payments.dinheiro,
        pix: payments.pix,
        cartaoDebito: payments.cartaoDebito,
        cartaoCredito: payments.cartaoCredito,
        carne: 0,
        aPrazo: 0,
        creditoVale: 0,
      },
      customerName: customerName.trim() || undefined,
      openCaixaIfClosed: false,
      auditMeta: { cashierId },
    })

    if (!result.ok) {
      toast({ title: "Falha ao finalizar", description: result.reason, variant: "destructive" })
      return
    }

    // Venda real concluída (estoque + ledger + persistência + eventos via operations-store).
    setCart([])
    setDiscount(0)
    setCustomerName("")
    setRapidoFlashLineId(null)
    setRapidoPickIdx(0)
    setPaymentOpen(false)
    if (notes.trim()) {
      toast({ title: "Venda finalizada", description: notes.trim() })
    } else {
      toast({ title: "Venda finalizada", description: result.saleId })
    }
    queueMicrotask(() => {
      inputRef.current?.focus()
      if (isModoRapido) {
        window.requestAnimationFrame(() => inputRef.current?.focus())
      }
    })
  }

  useEffect(() => {
    if (!isModoRapido) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (paymentOpen || clearConfirmOpen || trocasOpen || editAtalhosOpen || helpOpen) return
      if (cart.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      setCart((prev) => prev.slice(0, -1))
      queueMicrotask(() => {
        inputRef.current?.focus()
        window.requestAnimationFrame(() => inputRef.current?.focus())
      })
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [isModoRapido, paymentOpen, clearConfirmOpen, trocasOpen, editAtalhosOpen, helpOpen, cart.length])

  // ─── Render ─────────────────────────────────────────────────────────────────

  const modoRapido = isModoRapido === true

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      {!modoRapido ? (
        <>
          <div className="pointer-events-none absolute -left-[10%] -top-[10%] h-[35%] w-[35%] rounded-full bg-primary/8 blur-[120px]" />
          <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] h-[30%] w-[30%] rounded-full bg-primary/5 blur-[100px]" />
        </>
      ) : null}

      {/* ── Header: fluxo normal (evita recorte com position absolute + padding no body) ── */}
      <header
        className={cn(
          "relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/80 px-3 py-2 backdrop-blur-xl sm:px-4",
          modoRapido ? "min-h-11" : "min-h-14"
        )}
      >
        {/* Left: brand */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Wrench className="h-4 w-4" />
          </span>
          {!modoRapido ? (
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold tracking-tight text-foreground">OmniGestão PDV</p>
              <p className="text-[10px] text-muted-foreground">Assistência Técnica</p>
          </div>
          ) : null}
        </div>

        {/* Center: control buttons */}
        <div className="flex flex-1 items-center justify-center gap-2">
          {!modoRapido ? (
            <button
              type="button"
              onClick={() => setTrocasOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Trocas
            </button>
          ) : null}
          </div>

        {/* Right: operator + clock */}
        <div className="flex shrink-0 items-center gap-2">
          {!modoRapido ? (
            <div className="hidden items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 sm:flex">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Op: <span className="font-semibold text-foreground">Operador</span>
            </span>
          </div>
          ) : null}
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 sm:px-3">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {now.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: modoRapido ? undefined : "2-digit",
              })}
            </span>
          </div>
        </div>
      </header>

      {/* ── Body: ocupa exatamente o espaço abaixo do header, sem scroll na página ── */}
      <div className="relative z-0 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border bg-card/90 backdrop-blur-sm">
          <CaixaStatusBar variant="pdv" />
        </div>

        <div className="flex min-h-0 w-full min-w-0 flex-1 items-stretch overflow-hidden">
        {/* ── Center: search + catalog ── */}
        <main className="flex min-h-0 min-w-0 max-h-full flex-1 flex-col overflow-hidden border-r border-border bg-background/60 backdrop-blur-sm">

          {/* Search */}
          <div className="shrink-0 p-4">
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (!modoRapido || !search.trim()) return
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setRapidoPickIdx((i) => Math.min(i + 1, Math.max(0, fullSearch.length - 1)))
                    return
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setRapidoPickIdx((i) => Math.max(0, i - 1))
                    return
                  }
                  if (e.key === "Enter" && fullSearch.length > 0) {
                    e.preventDefault()
                    const pick = fullSearch[rapidoPickIdx] ?? fullSearch[0]
                    if (pick) addItem(pick)
                  }
                }}
                placeholder="Bipe o produto ou busque por nome / código (F1)"
                className="h-14 rounded-2xl border-border bg-card pl-12 text-base font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                !modoRapido ? (
                  <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    F2
                  </kbd>
                ) : null
              )}
            </div>
            {!modoRapido ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Keyboard className="h-3 w-3" />
                  Atalhos:
                </span>
                {[
                  { key: "F1",  label: "Finalizar" },
                  { key: "F3",  label: "Busca" },
                  { key: "F2",  label: "Cliente" },
                  { key: "F6",  label: "Cancelar" },
                  { key: "F8",  label: "Trocas" },
                  { key: "F11", label: "Tela cheia" },
                  { key: "F12", label: "Pgto. múltiplo" },
                ].map(({ key, label }) => (
                  <span key={key} className="flex items-center gap-1">
                    <kbd className="rounded border border-border bg-muted px-1 py-px font-bold">{key}</kbd>
                    {label}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground hover:text-foreground"
                  title="Ver todos os atalhos"
                >
                  <Keyboard className="h-3 w-3" />
                  END Ajuda
                </button>
              </div>
            ) : null}
          </div>

          {/* Grid — scroll só na área da grade */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
            {search.trim() ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <p className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {fullSearch.length} resultado{fullSearch.length !== 1 ? "s" : ""} para &ldquo;{search}&rdquo;
                </p>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="grid gap-3 pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {fullSearch.map((p, idx) => (
                      <QuickCard
                        key={p.id}
                        item={p}
                        onAdd={addItem}
                        isPickHighlight={modoRapido && idx === rapidoPickIdx}
                      />
                    ))}
                    {fullSearch.length === 0 && (
                      <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "servicos" | "produtos" | "favoritos")}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
            >
                {/* Tab header + Editar Atalhos */}
                <div className="flex shrink-0 items-center gap-2">
                  <TabsList className={cn("flex-1 grid rounded-2xl border border-border bg-muted/60 p-1", quickFavorites.length > 0 ? "grid-cols-3" : "grid-cols-2")}>
                    <TabsTrigger
                      value="servicos"
                      className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      Serviços ({quickServices.length})
                    </TabsTrigger>
                    <TabsTrigger
                      value="produtos"
                      className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    >
                      Produtos ({quickProducts.length})
                    </TabsTrigger>
                    {quickFavorites.length > 0 && (
                      <TabsTrigger
                        value="favoritos"
                        className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                      >
                        <Star className="mr-1 h-3 w-3 fill-current text-amber-500" />
                        Favoritos ({quickFavorites.length})
                      </TabsTrigger>
                    )}
                  </TabsList>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 shrink-0 rounded-xl border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditAtalhosOpen(true)}
                    title="Editar Atalhos"
                  >
                    <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                    Editar Atalhos
                  </Button>
                </div>

              <TabsContent
                value="servicos"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
              >
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="grid gap-3 pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {quickServices.length > 0 ? (
                        quickServices.map((p) => <QuickCard key={p.id} item={p} onAdd={addItem} />)
                      ) : (
                        <div className="col-span-full flex flex-col items-center gap-3 py-12 text-center">
                          <p className="text-sm text-muted-foreground">Nenhum atalho de serviço configurado.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-xl"
                            onClick={() => setEditAtalhosOpen(true)}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Editar Atalhos
                          </Button>
                        </div>
                      )}
                    </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent
                value="produtos"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
              >
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="grid gap-3 pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {quickProducts.length > 0 ? (
                        quickProducts.map((p) => <QuickCard key={p.id} item={p} onAdd={addItem} />)
                      ) : (
                        <div className="col-span-full flex flex-col items-center gap-3 py-12 text-center">
                          <p className="text-sm text-muted-foreground">Nenhum atalho de produto configurado.</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-xl"
                            onClick={() => setEditAtalhosOpen(true)}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Editar Atalhos
                          </Button>
                        </div>
                      )}
                    </div>
                </ScrollArea>
              </TabsContent>

              {quickFavorites.length > 0 && (
                <TabsContent
                  value="favoritos"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden outline-none data-[state=inactive]:hidden"
                >
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="grid gap-3 pr-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {quickFavorites.map((p) => <QuickCard key={p.id} item={p} onAdd={addItem} />)}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
            )}
          </div>
        </main>

        {/* ── Right: customer + cart + payment ── */}
        <aside
          className={cn(
            "flex min-h-0 min-w-0 max-h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card self-stretch",
            modoRapido
              ? "w-[min(100%,400px)] min-w-[260px] max-w-[420px]"
              : "w-[420px] min-w-[360px] max-w-[480px]"
          )}
        >

          {/* Customer input */}
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={customerInputRef}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Cliente — A Prazo/Fiado  [F3]"
                className="h-9 rounded-xl border-border bg-background pl-9 pr-14 text-sm"
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                F3
              </kbd>
            </div>
          </div>

          {/* Cart header */}
          <div className="shrink-0 border-b border-border px-4 py-2.5">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">
                Carrinho
                {cart.length > 0 && (
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {cart.length}
                  </span>
                )}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (cart.length > 0) setClearConfirmOpen(true)
                }}
                disabled={cart.length === 0}
              >
                Limpar
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[9px] font-bold">
                  F9
                </kbd>
              </Button>
            </div>
          </div>

          {/* Cart lines — scroll só aqui; não estoura a viewport */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {cart.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="space-y-2">
                  <p className="text-base font-semibold text-foreground">Carrinho vazio</p>
                  <p className="text-sm text-muted-foreground">
                    Selecione serviços ou produtos pela grade ou pela busca.
                  </p>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full max-h-full">
                  <div className="divide-y divide-border px-3 py-1">
                  {cart.map((l) => (
                    <div
                      key={l.lineId}
                      className={cn(
                        "flex items-center gap-2 py-2.5",
                        modoRapido && rapidoFlashLineId === l.lineId && "pdv-rapido-row-flash rounded-lg"
                      )}
                    >
                      {/* Title — limited width so controls always show */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{l.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{brl(l.price)} × {l.qty}</p>
                        </div>

                      {/* Qty controls — shrink-0 keeps them always visible */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => changeQty(l.lineId, -1)}
                          className="grid h-6 w-6 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold tabular-nums text-foreground">
                          {l.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeQty(l.lineId, 1)}
                          className="grid h-6 w-6 place-items-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line total */}
                      <p className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-foreground">
                        {brl(l.price * l.qty)}
                      </p>

                      {/* Delete — always visible (X) */}
                      <button
                        type="button"
                        onClick={() => removeLine(l.lineId)}
                        aria-label={`Remover ${l.title}`}
                        title="Remover item"
                        className="shrink-0 grid h-7 w-7 place-items-center rounded-xl border border-border bg-background text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>

          {/* Totals + payment */}
          <div className="shrink-0 space-y-3 border-t border-border bg-card p-4">
            {/* Subtotal & discount */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold tabular-nums text-foreground">{brl(subtotal)}</span>
              </div>
              {!modoRapido ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Desconto (R$)</span>
                  <Input
                    ref={discountInputRef}
                    value={discount ? String(discount) : ""}
                    onChange={(e) => {
                      const v = Number(String(e.target.value || "").replace(",", "."))
                      setDiscount(Number.isFinite(v) ? v : 0)
                    }}
                    placeholder="0,00"
                    className="h-7 w-24 rounded-xl border-border bg-background text-right text-sm tabular-nums"
                    inputMode="decimal"
                  />
                </div>
              ) : null}
              <Separator className="bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-muted-foreground">TOTAL A PAGAR</span>
                <span className="text-3xl font-black tabular-nums tracking-tight text-emerald-500">
                  {brl(total)}
                </span>
              </div>
            </div>

            {/* Payment buttons — 3×2 grid */}
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map((m) => (
              <Button
                  key={m.id}
                type="button"
                  disabled={cart.length === 0}
                  onClick={() => {
                    setPaymentInitMethod(m.id)
                    setPaymentOpen(true)
                  }}
                className={cn(
                    "relative rounded-2xl text-xs font-bold text-white",
                    "transition-all duration-150 ease-out",
                    "active:scale-[0.95] active:brightness-90",
                    "disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                    modoRapido ? "h-11" : "h-12",
                    m.color,
                  )}
                >
                  <span className="flex flex-col items-center gap-0.5 leading-tight">
                    <span className="flex items-center gap-1">
                      <m.Icon className="h-4 w-4 shrink-0" />
                      <span className="tracking-wide">{m.shortLabel}</span>
                    </span>
                    {m.hotkey && (
                      <span className="rounded border border-white/25 bg-black/25 px-1 py-px text-[9px] font-bold leading-none tracking-widest">
                        {m.hotkey}
                      </span>
                    )}
                  </span>
              </Button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      </div>

      {/* ── Modals ── */}
      <PaymentModal
        open={paymentOpen}
        total={total}
        customerName={customerName}
        defaultMethod={paymentInitMethod}
        onConfirm={handlePaymentConfirm}
        onClose={() => setPaymentOpen(false)}
      />

      {/* Clear-cart confirmation */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Cancelar venda atual?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Todos os {cart.length} item{cart.length !== 1 ? "ns" : ""} do carrinho serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Manter Venda</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCart([])
                setDiscount(0)
                setClearConfirmOpen(false)
              }}
            >
              Cancelar Venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <TrocasModal open={trocasOpen} onClose={() => setTrocasOpen(false)} />

      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />

      <EditarAtalhosModal
        open={editAtalhosOpen}
        catalog={mergedCatalog}
        catalogForAdd={realCatalog}
        savedAtalhos={localAtalhos}
        onSave={(atalhos) => {
          setLocalAtalhos(atalhos)
          try { localStorage.setItem(shortcutsKey, JSON.stringify(atalhos)) } catch { /* ignore */ }
          void saveStoreSettings({
            printerConfig: {
              ...blob,
              pdvParams: { ...blob.pdvParams, atalhosRapidos: atalhos },
            },
          }).catch(() => {
            toast({
              title: "Atalhos salvos localmente",
              description: "Não foi possível sincronizar com o servidor.",
              variant: "destructive",
            })
          })
        }}
        onClose={() => setEditAtalhosOpen(false)}
      />
    </div>
  )
}
