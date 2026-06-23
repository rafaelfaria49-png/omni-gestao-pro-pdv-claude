"use client"

/**
 * INVENTARIO_ASSISTIDO — Modal de contagem para produto JÁ CADASTRADO.
 *
 * Ao identificar um produto do catálogo, o operador informa a quantidade física encontrada (em
 * vez de só +1 por bipe) e escolhe o modo:
 *   - SUBSTITUIR: "contei X unidades no total agora" → a quantidade vira o total contado.
 *   - SOMAR:      "já contei antes e achei mais X"   → a quantidade soma ao já contado.
 *
 * Não altera estoque, não cadastra nada — só registra a contagem (a action faz a persistência via
 * `registrarContagemProduto`). O estoque atual do sistema aparece apenas como referência. Default
 * seguro: quando já há contagem nesta sessão, abre em SOMAR com 1 (um Enter "às cegas" = o antigo
 * +1); na 1ª leitura abre em SUBSTITUIR.
 */

import { useEffect, useRef, useState } from "react"
import { Minus, Plus, PackageCheck, Loader2, ArrowRightLeft } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { MODO_CONTAGEM, type ModoContagem } from "@/lib/estoque/inventario-core"

function formatDateTime(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export type InventarioContagemModalProps = {
  open: boolean
  codigo: string
  produto: { nome: string; sku: string | null; estoqueSistema: number | null } | null
  /** Quantidade já contada deste produto nesta sessão (0 = primeira leitura). */
  jaContado: number
  /** Horário da última contagem deste produto na sessão (null = primeira leitura). */
  ultimaContagemEm: string | null
  /** Σ de movimentações de estoque após a última contagem (venda −, entrada +). 0 = nenhuma. */
  movimentacaoPosContagem: number
  registrando: boolean
  onConfirmar: (dados: { quantidade: number; modo: ModoContagem }) => void
  onCancelar: () => void
}

export function InventarioContagemModal({
  open,
  codigo,
  produto,
  jaContado,
  ultimaContagemEm,
  movimentacaoPosContagem,
  registrando,
  onConfirmar,
  onCancelar,
}: InventarioContagemModalProps) {
  const [quantidade, setQuantidade] = useState(1)
  const [modo, setModo] = useState<ModoContagem>(MODO_CONTAGEM.SUBSTITUIR)
  const qtdInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      // Já contado → SOMAR 1 (additivo e previsível, igual ao antigo +1). 1ª leitura → SUBSTITUIR.
      setModo(jaContado > 0 ? MODO_CONTAGEM.SOMAR : MODO_CONTAGEM.SUBSTITUIR)
      setQuantidade(1)
      requestAnimationFrame(() => qtdInputRef.current?.select())
    }
  }, [open, jaContado])

  const ajustar = (delta: number) => setQuantidade((q) => Math.max(1, q + delta))

  const qtd = Math.max(1, Math.trunc(quantidade) || 1)
  const totalFinal = modo === MODO_CONTAGEM.SOMAR ? jaContado + qtd : qtd

  const handleConfirmar = () => {
    if (registrando) return
    onConfirmar({ quantidade: qtd, modo })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !registrando && onCancelar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-primary" />
            Informar quantidade contada
          </DialogTitle>
          <DialogDescription>
            Produto identificado no catálogo. Informe quantas unidades você encontrou fisicamente.
            Nada de estoque é alterado agora — o ajuste só acontece na conciliação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Produto identificado */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-foreground">
              {produto?.nome || "Produto"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-mono">{codigo}</span>
              {produto?.sku && <span>SKU: {produto.sku}</span>}
              <span>
                Estoque no sistema (referência):{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {produto?.estoqueSistema ?? "—"}
                </span>
              </span>
            </div>
            {jaContado > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Já contado nesta sessão:{" "}
                <span className="font-semibold tabular-nums text-foreground">{jaContado}</span> un.
                {ultimaContagemEm && <> · última contagem {formatDateTime(ultimaContagemEm)}</>}
              </p>
            )}
          </div>

          {/* Aviso: houve movimentação depois da contagem → a conciliação projeta o saldo. */}
          {movimentacaoPosContagem !== 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <ArrowRightLeft className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Este item teve movimentações depois da contagem (
                <span className="font-semibold tabular-nums">
                  {movimentacaoPosContagem > 0 ? `+${movimentacaoPosContagem}` : movimentacaoPosContagem}
                </span>{" "}
                un.). A conciliação final vai projetar o saldo automaticamente.
              </span>
            </div>
          )}

          {/* Modo: substituir × somar */}
          <div className="space-y-1.5">
            <Label>Como registrar</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModo(MODO_CONTAGEM.SUBSTITUIR)}
                disabled={registrando}
                aria-pressed={modo === MODO_CONTAGEM.SUBSTITUIR}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50",
                  modo === MODO_CONTAGEM.SUBSTITUIR
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span className="block text-sm font-medium">Substituir</span>
                <span className="block text-xs text-muted-foreground">Contei X no total</span>
              </button>
              <button
                type="button"
                onClick={() => setModo(MODO_CONTAGEM.SOMAR)}
                disabled={registrando}
                aria-pressed={modo === MODO_CONTAGEM.SOMAR}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-50",
                  modo === MODO_CONTAGEM.SOMAR
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span className="block text-sm font-medium">Somar</span>
                <span className="block text-xs text-muted-foreground">Achei mais X</span>
              </button>
            </div>
          </div>

          {/* Quantidade */}
          <div className="space-y-1.5">
            <Label htmlFor="contagem-qtd">
              {modo === MODO_CONTAGEM.SOMAR ? "Quantidade a somar" : "Quantidade no total"}
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(-1)}
                disabled={registrando || qtd <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="contagem-qtd"
                ref={qtdInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleConfirmar()
                  }
                }}
                disabled={registrando}
                className="text-center text-base tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(1)}
                disabled={registrando}
                aria-label="Aumentar quantidade"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Total contado ficará:{" "}
              <span className="font-semibold tabular-nums text-foreground">{totalFinal}</span> un.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancelar} disabled={registrando}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" onClick={handleConfirmar} disabled={registrando}>
            {registrando && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar contagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
