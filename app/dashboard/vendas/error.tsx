"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/ui/states/ErrorState"
import { humanizeUnknownError } from "@/lib/humanize-error"
import { getPdvMountSnapshot } from "@/lib/pdv-mount-diagnostics"

export default function VendasError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // P0 PDV-RAFACELL-LOAD-CRASH: anexa em qual camada do mount o PDV parou
    // (loja → settings → terminal → pending-restore → catalog → capabilities).
    // Só contagens e etapas — sem PII.
    console.error("[vendas] error boundary:", error, {
      mount: getPdvMountSnapshot(),
    })
  }, [error])

  return (
    <ErrorState
      title="Falha ao carregar o PDV"
      description={humanizeUnknownError(error)}
      action={{ label: "Tentar novamente", onClick: reset }}
    />
  )
}
