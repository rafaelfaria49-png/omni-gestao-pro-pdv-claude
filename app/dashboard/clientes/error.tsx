"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/ui/states/ErrorState"
import { humanizeUnknownError } from "@/lib/humanize-error"

export default function ClientesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[clientes] error boundary:", error)
  }, [error])

  return (
    <ErrorState
      title="Falha ao carregar Clientes"
      description={humanizeUnknownError(error)}
      action={{ label: "Tentar novamente", onClick: reset }}
    />
  )
}
