"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, UtensilsCrossed } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/states"
import { ControleConsumo } from "@/components/dashboard/vendas/controle-consumo"
import { useStoreSettings } from "@/lib/store-settings-provider"

export function MesasPageClient() {
  const router = useRouter()
  const { pdvParams, hydrated } = useStoreSettings()

  if (!hydrated) {
    return <LoadingState message="Carregando mesas…" />
  }

  if (!pdvParams.moduloControleConsumo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
          <UtensilsCrossed className="h-7 w-7" aria-hidden />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Módulo de mesas desativado</h1>
          <p className="text-sm text-muted-foreground">
            Ative em Configurações → Vendas → Mesas e consumo para usar o controle de comandas nesta unidade.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/configuracoes-v3?sec=vendas">Abrir configurações</Link>
          </Button>
          <Button type="button" asChild>
            <Link href="/dashboard/vendas">Voltar ao PDV</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push("/dashboard/vendas")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          PDV
        </Button>
        <span className="text-sm font-medium text-foreground">Mesas e consumo</span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <ControleConsumo onNavigateToPdv={() => router.push("/dashboard/vendas")} />
      </div>
    </div>
  )
}
