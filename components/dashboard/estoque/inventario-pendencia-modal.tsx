"use client"

/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 6 · painel de ação para código bipado SEM produto resolvido.
 *
 * INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001: deixou de ser só "registrar pendência" e virou
 * o painel "Produto não encontrado" com 4 ações claras — Cadastrar rápido, Salvar como pendência,
 * Vincular a produto existente, Ignorar. A quantidade observada (e o nome rápido opcional) são
 * capturados aqui e repassados a QUALQUER ação, então a contagem nunca se perde ao trocar de via.
 * O modal não persiste nada — quem cadastra/registra/vincula é o componente do Inventário.
 */

import { useEffect, useRef, useState } from "react"
import { Minus, Plus, ScanBarcode, Loader2, Package, ClipboardList, Link2, EyeOff } from "lucide-react"
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

export type PendenciaDados = { quantidade: number; nomeRapido: string }

export type InventarioPendenciaModalProps = {
  open: boolean
  codigo: string
  /** Quando o código já está pendente nesta sessão: contexto "já bipado Nx, M un.". */
  jaPendente: { quantidadeContada: number } | null
  /** Qualquer ação em andamento (cadastrar/pendência/vincular) trava o painel. */
  ocupado: boolean
  onCadastrarRapido: (dados: PendenciaDados) => void
  onSalvarPendencia: (dados: PendenciaDados) => void
  onVincularExistente: (dados: PendenciaDados) => void
  onIgnorar: () => void
}

export function InventarioPendenciaModal({
  open,
  codigo,
  jaPendente,
  ocupado,
  onCadastrarRapido,
  onSalvarPendencia,
  onVincularExistente,
  onIgnorar,
}: InventarioPendenciaModalProps) {
  const [quantidade, setQuantidade] = useState(1)
  const [nomeRapido, setNomeRapido] = useState("")
  const qtdInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuantidade(1)
      setNomeRapido("")
      requestAnimationFrame(() => qtdInputRef.current?.select())
    }
  }, [open])

  const ajustar = (delta: number) => setQuantidade((q) => Math.max(1, q + delta))
  const dados = (): PendenciaDados => ({
    quantidade: Math.max(1, Math.trunc(quantidade) || 1),
    nomeRapido: nomeRapido.trim(),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !ocupado && onIgnorar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-4 w-4 text-primary" />
            Produto não encontrado
          </DialogTitle>
          <DialogDescription>
            Este código não está no catálogo. Você pode cadastrar agora ou deixar como pendência
            para resolver depois — a quantidade contada é preservada em qualquer opção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Código bipado</Label>
            <Input value={codigo} readOnly disabled className="font-mono text-sm" />
            {jaPendente && (
              <p className="text-xs text-muted-foreground">
                Já bipado nesta sessão: <span className="font-medium tabular-nums">{jaPendente.quantidadeContada}</span> un.
                A quantidade informada agora será somada (na pendência).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pendencia-qtd">Quantidade contada</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(-1)}
                disabled={ocupado || quantidade <= 1}
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
                disabled={ocupado}
                className="text-center text-base tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(1)}
                disabled={ocupado}
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
              disabled={ocupado}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (!ocupado) onSalvarPendencia(dados())
                }
              }}
            />
          </div>
        </div>

        <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" className="gap-2" onClick={() => onCadastrarRapido(dados())} disabled={ocupado}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Cadastrar rápido
          </Button>
          <Button type="button" variant="secondary" className="gap-2" onClick={() => onSalvarPendencia(dados())} disabled={ocupado}>
            <ClipboardList className="h-4 w-4" />
            Salvar como pendência
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => onVincularExistente(dados())} disabled={ocupado}>
            <Link2 className="h-4 w-4" />
            Vincular a existente
          </Button>
          <Button type="button" variant="ghost" className="gap-2 text-muted-foreground" onClick={onIgnorar} disabled={ocupado}>
            <EyeOff className="h-4 w-4" />
            Ignorar por enquanto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
