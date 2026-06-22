"use client"

/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 6. Modal de captura para código bipado SEM produto resolvido.
 *
 * Velocidade primeiro: quantidade observada (default 1) é o único campo obrigatório; nome
 * rápido é opcional e NUNCA bloqueia o "Registrar e continuar". Não altera estoque, não cria
 * produto — só registra a pendência (fila de reconciliação) via `registrarPendenciaInventario`.
 */

import { useEffect, useRef, useState } from "react"
import { Minus, Plus, ScanBarcode, Loader2 } from "lucide-react"
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

export type InventarioPendenciaModalProps = {
  open: boolean
  codigo: string
  /** Quando o código já está pendente nesta sessão: contexto "já bipado Nx, M un.". */
  jaPendente: { quantidadeContada: number } | null
  registrando: boolean
  onConfirmar: (dados: { quantidade: number; nomeRapido: string }) => void
  onCancelar: () => void
}

export function InventarioPendenciaModal({
  open,
  codigo,
  jaPendente,
  registrando,
  onConfirmar,
  onCancelar,
}: InventarioPendenciaModalProps) {
  const [quantidade, setQuantidade] = useState(1)
  const [nomeRapido, setNomeRapido] = useState("")
  const qtdInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuantidade(1)
      setNomeRapido("")
      // Seleciona o número p/ o operador já digitar a quantidade observada, se for o caso.
      requestAnimationFrame(() => qtdInputRef.current?.select())
    }
  }, [open])

  const ajustar = (delta: number) => setQuantidade((q) => Math.max(1, q + delta))

  const handleConfirmar = () => {
    if (registrando) return
    onConfirmar({ quantidade: Math.max(1, Math.trunc(quantidade) || 1), nomeRapido: nomeRapido.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !registrando && onCancelar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-4 w-4 text-primary" />
            Produto não cadastrado
          </DialogTitle>
          <DialogDescription>
            Este código não foi encontrado no catálogo. Informe a quantidade observada e separe
            uma unidade física para identificar depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Código bipado</Label>
            <Input value={codigo} readOnly disabled className="font-mono text-sm" />
            {jaPendente && (
              <p className="text-xs text-muted-foreground">
                Já bipado nesta sessão: <span className="font-medium tabular-nums">{jaPendente.quantidadeContada}</span> un.
                A quantidade informada agora será somada.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pendencia-qtd">Quantidade observada</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(-1)}
                disabled={registrando || quantidade <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="pendencia-qtd"
                ref={qtdInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pendencia-nome">
              Nome rápido <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="pendencia-nome"
              placeholder="Ex.: Capinha rosa A15"
              value={nomeRapido}
              onChange={(e) => setNomeRapido(e.target.value)}
              disabled={registrando}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleConfirmar()
                }
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancelar} disabled={registrando}>
            Cancelar
          </Button>
          <Button type="button" className="gap-2" onClick={handleConfirmar} disabled={registrando}>
            {registrando && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar e continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
