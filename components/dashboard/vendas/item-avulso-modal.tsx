"use client"

/**
 * Modal "Item Avulso" — Venda Avulsa do balcão via tecla INSERT.
 *
 * Permite ao operador adicionar ao carrinho um item **não cadastrado** no
 * estoque, informando descrição, valor de venda, quantidade e — opcionalmente —
 * o custo unitário. O item adicionado **não baixa estoque** (Goal: PDV avulso)
 * e é marcado em `Venda.payload.lines[].isAvulso = true` para relatórios.
 *
 * Decisões:
 * - Custo é **opcional** e fica visualmente discreto para não tornar a venda
 *   mais lenta no balcão. Quando vazio/0 a venda persiste `custoUnitario: null`
 *   — relatórios devem tratar "custo desconhecido", não 100% de lucro.
 * - Quantidade é tratada como inteiro (≥1) porque `ItemVenda.quantidade` no
 *   schema atual é `Int`. Venda por peso de item avulso fica fora de escopo.
 * - Enter no último campo confirma; Esc fecha (padrão do Dialog do shadcn).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { PlusCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface ItemAvulsoPayload {
  /** Descrição livre — vira `ItemVenda.nome` e aparece no cupom/histórico. */
  description: string
  /** Valor de venda unitário (R$). */
  unitPrice: number
  /** Quantidade (inteiro ≥1). */
  quantity: number
  /** Custo unitário opcional (R$). `null` quando o operador não informou. */
  custoUnitario: number | null
  /** Código de barras / SKU opcional informado no balcão. `null` quando vazio. */
  codigo: string | null
}

interface ItemAvulsoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (payload: ItemAvulsoPayload) => void
  /**
   * Checagem opcional: se o código informado já existe no catálogo, devolve o produto.
   * Quando fornecida, o modal só ALERTA (não bloqueia) — a decisão é do operador.
   */
  checkCodigoExistente?: (codigo: string) => { nome: string } | null
}

function parseDecimal(raw: string): number {
  const v = Number(String(raw || "").replace(",", "."))
  return Number.isFinite(v) && v >= 0 ? v : 0
}

function parseQuantity(raw: string): number {
  const v = Math.round(Number(String(raw || "").replace(",", ".")))
  return Number.isFinite(v) && v >= 1 ? v : 0
}

export function ItemAvulsoModal({ open, onOpenChange, onConfirm, checkCodigoExistente }: ItemAvulsoModalProps) {
  const [description, setDescription] = useState("")
  const [unitPriceInput, setUnitPriceInput] = useState("")
  const [quantityInput, setQuantityInput] = useState("1")
  const [custoInput, setCustoInput] = useState("")
  const [codigoInput, setCodigoInput] = useState("")
  const descriptionRef = useRef<HTMLInputElement | null>(null)

  // Reset + foco no campo de descrição a cada abertura.
  useEffect(() => {
    if (!open) return
    setDescription("")
    setUnitPriceInput("")
    setQuantityInput("1")
    setCustoInput("")
    setCodigoInput("")
    // requestAnimationFrame garante que o Dialog terminou o mount antes do focus.
    const t = window.requestAnimationFrame(() => descriptionRef.current?.focus())
    return () => window.cancelAnimationFrame(t)
  }, [open])

  const trimmedDescription = description.trim()
  const unitPrice = parseDecimal(unitPriceInput)
  const quantity = parseQuantity(quantityInput)
  const custoTouched = custoInput.trim().length > 0
  const custoUnitario = custoTouched ? parseDecimal(custoInput) : null
  const codigo = codigoInput.trim().replace(/\s+/g, " ") || null

  // Alerta (não bloqueia): código informado já existe em produto cadastrado?
  const produtoExistente = useMemo(() => {
    if (!codigo || !checkCodigoExistente) return null
    try {
      return checkCodigoExistente(codigo)
    } catch {
      return null
    }
  }, [codigo, checkCodigoExistente])

  const canConfirm =
    trimmedDescription.length > 0 &&
    unitPrice > 0 &&
    quantity >= 1 &&
    (custoUnitario === null || custoUnitario >= 0)

  const lineTotal = unitPrice * quantity
  const margemTotal =
    custoUnitario !== null && custoUnitario > 0 ? Math.max(0, lineTotal - custoUnitario * quantity) : null

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({
      description: trimmedDescription,
      unitPrice,
      quantity,
      custoUnitario,
      codigo,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PlusCircle className="h-5 w-5 text-primary" />
            Item Avulso
          </DialogTitle>
          <DialogDescription>
            Venda balcão de um item <span className="font-medium">não cadastrado</span>. Não baixa estoque.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="item-avulso-desc">Descrição</Label>
            <Input
              id="item-avulso-desc"
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Suporte de TV universal"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="item-avulso-preco">Valor de venda (R$)</Label>
              <Input
                id="item-avulso-preco"
                inputMode="decimal"
                value={unitPriceInput}
                onChange={(e) => setUnitPriceInput(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-avulso-qtd">Quantidade</Label>
              <Input
                id="item-avulso-qtd"
                inputMode="numeric"
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-avulso-codigo" className="text-muted-foreground">
              Código de barras / SKU — opcional
            </Label>
            <Input
              id="item-avulso-codigo"
              value={codigoInput}
              onChange={(e) => setCodigoInput(e.target.value)}
              placeholder="Bipe ou digite o código (EAN, SKU ou código interno)"
              autoComplete="off"
            />
            {produtoExistente ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Este código já existe em <span className="font-medium">{produtoExistente.nome}</span>. Você
                  pode usar o produto existente — ou seguir como avulso e revisar depois.
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Fica salvo na fila “Produtos a cadastrar” para cadastro posterior. Não cria produto agora.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="item-avulso-custo" className="text-muted-foreground">
              Custo unitário (R$) — opcional
            </Label>
            <Input
              id="item-avulso-custo"
              inputMode="decimal"
              value={custoInput}
              onChange={(e) => setCustoInput(e.target.value)}
              placeholder="0,00"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) {
                  e.preventDefault()
                  handleConfirm()
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {custoTouched
                ? "Custo registrado na venda para cálculo correto de margem."
                : "Sem custo informado → relatórios tratam como custo desconhecido (não 100% lucro)."}
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total da linha</span>
              <span className="font-semibold text-foreground">
                {lineTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
            {margemTotal !== null ? (
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Margem estimada</span>
                <span className="text-foreground/80">
                  {margemTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Adicionar ao carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
