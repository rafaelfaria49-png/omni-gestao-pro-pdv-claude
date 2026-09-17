"use client"

import { useEffect, useMemo } from "react"
import { useToast } from "@/hooks/use-toast"
import { createPdvScanNotFoundFeedback, PDV_SCAN_NOT_FOUND_FEEDBACK_MS } from "@/lib/pdv-scan-input"

/**
 * Aviso transitório de código não encontrado, compartilhado pelos PDVs.
 *
 * Reusa o toast do projeto (Radix: anunciado em região live, não rouba foco) com duração curta.
 * Um novo aviso — ou `dismiss()` num novo bipe, Esc ou Item Avulso — encerra o anterior na hora.
 * Ao desmontar o PDV, o aviso some junto.
 */
export function usePdvScanNotFoundFeedback() {
  const { toast } = useToast()
  const feedback = useMemo(
    () =>
      createPdvScanNotFoundFeedback((code) =>
        toast({
          title: "Produto não encontrado",
          description: `Produto não encontrado nesta loja para o código: ${code}`,
          duration: PDV_SCAN_NOT_FOUND_FEEDBACK_MS,
        }),
      ),
    [toast],
  )
  useEffect(() => () => feedback.dismiss(), [feedback])
  return feedback
}
