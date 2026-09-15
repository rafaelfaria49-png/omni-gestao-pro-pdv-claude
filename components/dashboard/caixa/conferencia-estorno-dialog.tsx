"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SupervisorGateDialog } from "./supervisor-gate-dialog"
import { MOTIVO_MIN_CARACTERES, motivoEstornoValido } from "@/lib/caixa/conferencia-acoes"
import { estornarVendaConferencia, type EstornoVendaResult } from "@/lib/caixa/conferencia-estorno"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

export type EstornoAlvo = {
  /** `pedidoId` — número comercial da venda. */
  numero: string
  valor: number
  cliente: string | null
  formaPagamento: string | null
}

/**
 * Estorno de venda a partir da Conferência — GOAL
 * CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 (§7 step-up · §8 motivo · §23 aviso · §24
 * idempotência).
 *
 * Fluxo em UMA porta: o motivo obrigatório é digitado DENTRO do diálogo de autorização
 * do supervisor (slot `children` do `SupervisorGateDialog`), de modo que quem digita o
 * PIN lê exatamente o que está co-assinando. Só depois do `POST /api/auth/admin`
 * responder OK é que o estorno sai para `POST /api/vendas/[id]/cancelar`.
 *
 * O PIN nunca passa por aqui nem é guardado: fica confinado ao gate compartilhado.
 * O que este componente retém é apenas o NOME do autorizador, que segue para a trilha
 * de auditoria junto com o motivo.
 *
 * A segunda etapa (`confirmarForcar`) existe porque o servidor recusa com 409 quando a
 * venda tem devoluções vinculadas: o operador precisa confirmar que quer estornar a
 * venda mesmo assim. Nunca enviamos `forcar` por conta própria.
 */
export function ConferenciaEstornoDialog({
  alvo,
  storeId,
  operador,
  contagemIniciada,
  onOpenChange,
  onEstornada,
}: {
  /** `null` mantém tudo fechado. */
  alvo: EstornoAlvo | null
  storeId: string
  operador: string
  /** O operador já digitou algum valor na contagem da gaveta (§23). */
  contagemIniciada: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado após sucesso — o chamador recarrega a Conferência e o Resumo. */
  onEstornada: (info: { numero: string; autorizadoPor: string; motivo: string }) => void
}) {
  const [motivo, setMotivo] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  /** Preenchido quando o servidor pede confirmação por haver devoluções vinculadas. */
  const [confirmarForcar, setConfirmarForcar] = useState<{ devolucoes: number; autorizadoPor: string } | null>(null)
  const emVooRef = useRef(false)

  useEffect(() => {
    if (!alvo) {
      setMotivo("")
      setErro(null)
      setEnviando(false)
      setConfirmarForcar(null)
    }
  }, [alvo])

  const motivoOk = motivoEstornoValido(motivo)

  const executar = async (autorizadoPor: string, forcar: boolean) => {
    if (!alvo) return
    setErro(null)
    setEnviando(true)
    const r: EstornoVendaResult = await estornarVendaConferencia(
      {
        pedidoId: alvo.numero,
        storeId,
        motivo: motivo.trim(),
        operador,
        autorizadoPor,
        forcar,
      },
      emVooRef,
    )
    setEnviando(false)

    if (r.status === "in_flight") return
    if (r.status === "require_confirm") {
      setConfirmarForcar({ devolucoes: r.devolucoes, autorizadoPor })
      return
    }
    if (r.status === "erro") {
      setErro(r.error)
      setConfirmarForcar(null)
      return
    }
    // "estornada" e "ja_estornada" chegam ao mesmo estado final no banco.
    setConfirmarForcar(null)
    onEstornada({ numero: alvo.numero, autorizadoPor, motivo: motivo.trim() })
    onOpenChange(false)
  }

  if (!alvo) return null

  return (
    <>
      <SupervisorGateDialog
        open={!confirmarForcar}
        onOpenChange={(open) => {
          if (!open && !confirmarForcar) onOpenChange(false)
        }}
        onAuthorized={(admin) => {
          void executar(admin?.name?.trim() || "Supervisor", false)
        }}
        title="Autorização para estornar venda"
        description={`Estornar a venda ${alvo.numero} reverte estoque, caixa e financeiro.`}
        canSubmit={motivoOk && !enviando}
        confirmLabel="Autorizar e estornar"
      >
        <div className="min-w-0 space-y-1 rounded-md bg-secondary px-3 py-2">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{alvo.numero}</span>
            <span className="shrink-0 font-display text-sm font-bold tabular-nums text-foreground">
              {fmt(alvo.valor)}
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {alvo.cliente ?? "Cliente não identificado"}
            {alvo.formaPagamento ? ` · ${alvo.formaPagamento}` : ""}
          </p>
        </div>

        {contagemIniciada && (
          <p className="flex min-w-0 items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-[11px] text-foreground">
            <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>
              Esta operação altera os valores esperados do caixa. A conferência será recalculada
              e a contagem já digitada continuará na tela para você revisar.
            </span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="estorno-motivo" className="text-sm">
            Motivo do estorno
          </Label>
          <Textarea
            id="estorno-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva por que a venda está sendo estornada"
            rows={2}
            className="resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Obrigatório, mínimo de {MOTIVO_MIN_CARACTERES} caracteres. Vai para a auditoria junto
            com o supervisor que autorizar.
          </p>
          {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
          {enviando ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
              Estornando…
            </p>
          ) : null}
        </div>
      </SupervisorGateDialog>

      {/* Segunda confirmação — exigida pelo servidor quando há devoluções vinculadas. */}
      <Dialog
        open={!!confirmarForcar}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmarForcar(null)
            onOpenChange(false)
          }
        }}
      >
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 aria-hidden className="h-4 w-4 text-destructive" />
              Venda com devoluções
            </DialogTitle>
            <DialogDescription>
              A venda {alvo.numero} já tem {confirmarForcar?.devolucoes ?? 0} devolução(ões)
              registrada(s). O estorno repõe apenas o que ainda não foi devolvido e mantém os
              documentos de devolução.
            </DialogDescription>
          </DialogHeader>
          {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmarForcar(null)
                onOpenChange(false)
              }}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={enviando}
              onClick={() => {
                const autorizadoPor = confirmarForcar?.autorizadoPor ?? "Supervisor"
                void executar(autorizadoPor, true)
              }}
            >
              {enviando ? (
                <>
                  <Loader2 aria-hidden className="mr-2 h-4 w-4 animate-spin" />
                  Estornando…
                </>
              ) : (
                "Estornar mesmo assim"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
