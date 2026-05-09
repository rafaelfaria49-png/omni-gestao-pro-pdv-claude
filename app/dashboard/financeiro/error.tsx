"use client"

import { useEffect } from "react"
import { ErrorState } from "@/components/ui/states/ErrorState"
import { humanizeUnknownError } from "@/lib/humanize-error"

export default function FinanceiroError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[financeiro] error boundary:", error)
  }, [error])

  return (
    <ErrorState
      title="Falha ao carregar o Financeiro"
      description={humanizeUnknownError(error)}
      action={{ label: "Tentar novamente", onClick: reset }}
    />
  )
}
