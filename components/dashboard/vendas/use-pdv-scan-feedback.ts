"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  createPdvScanInlineNotFoundFeedback,
  type PdvScanInlineFeedbackState,
  type PdvScanNotifyOptions,
} from "@/lib/pdv-scan-input"

export type { PdvScanInlineFeedbackState }

/**
 * Aviso transitório INLINE de código não encontrado, compartilhado pelos PDVs
 * (GOAL PDV-SCAN-INLINE-FEEDBACK-AUTOFOCUS-006).
 *
 * O aviso aparece NO PRÓPRIO campo Código/Bipe (overlay do componente
 * `PdvScanInlineNotFound`) enquanto o input real permanece `value=""` e focado; depois de
 * `PDV_SCAN_NOT_FOUND_FEEDBACK_MS` ele some sozinho. Um novo bipe — ou `dismiss()` num novo
 * Enter, Esc, digitação ou Item Avulso — encerra o anterior na hora: nenhum scan espera o
 * timeout. Um único timer por superfície; ao desmontar o PDV, aviso e timer somem juntos.
 *
 * O toast inferior foi REMOVIDO neste GOAL: o inline é o feedback principal e dois alertas
 * fortes simultâneos competem com o próximo bipe. A linha de status do shell segue como
 * registro passivo.
 */
export function usePdvScanNotFoundFeedback() {
  const [inline, setInline] = useState<PdvScanInlineFeedbackState>({ code: null, seq: 0 })
  const viewRef = useRef(setInline)

  const feedback = useMemo(
    () => createPdvScanInlineNotFoundFeedback((state) => viewRef.current(state)),
    [],
  )

  useEffect(() => () => feedback.dismiss(), [feedback])

  return useMemo(
    () => ({
      notify: (code: string, opts?: PdvScanNotifyOptions) => feedback.notify(code, opts),
      dismiss: feedback.dismiss,
      inline,
    }),
    [feedback, inline],
  )
}
