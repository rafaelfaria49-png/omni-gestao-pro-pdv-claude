import { Suspense } from "react"
import ConfiguracoesV3Page from "@/components/configuracoes-v3/ConfiguracoesV3Page"

function ConfiguracoesFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      Carregando configurações…
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<ConfiguracoesFallback />}>
      <ConfiguracoesV3Page />
    </Suspense>
  )
}
