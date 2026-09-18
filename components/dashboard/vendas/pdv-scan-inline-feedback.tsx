"use client"

import { TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import type { PdvScanInlineFeedbackState } from "@/lib/pdv-scan-input"

/**
 * Aviso INLINE de código não cadastrado sobre o próprio campo Código/Bipe
 * (GOAL PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006; hint de Insert no GOAL 007).
 *
 * Renderizado DENTRO do wrapper `relative` do input: a mensagem sobrepõe o campo — o input
 * real continua `value=""` e focado, sem layout shift. Ícone + texto (não só cor) com tokens
 * do tema (`text-destructive`, `bg-background`): legível nos temas Padrão claro, Midnight e
 * Black Edition. `pointer-events-none` nunca rouba o clique/scan; `role="status"` +
 * `aria-live="polite"` anuncia sem mover o foco — o operador segue pronto para bipar.
 *
 * `feedback.suggestsAvulso` (GOAL 007, modo "avisar e oferecer"): acrescenta o atalho que
 * abre o Item Avulso com o código como contexto — copy apenas; nunca abre modal por si só.
 */
export function PdvScanInlineNotFound({
  feedback,
  className,
}: {
  feedback: PdvScanInlineFeedbackState
  className?: string
}) {
  if (!feedback.code) return null
  return (
    <div
      key={feedback.seq}
      role="status"
      aria-live="polite"
      data-pdv-scan-inline=""
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center gap-1.5 overflow-hidden rounded-lg bg-background px-2.5 text-[13px] font-semibold text-destructive",
        className,
      )}
    >
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">
        Produto não cadastrado · <span className="font-mono tabular-pdv">{feedback.code}</span>
        {feedback.suggestsAvulso ? (
          <>
            {" · "}
            <kbd className="rounded border border-destructive/30 bg-destructive/10 px-1 py-px font-sans text-[10px] font-bold uppercase">
              Insert
            </kbd>{" "}
            para Item Avulso
          </>
        ) : null}
      </span>
    </div>
  )
}
