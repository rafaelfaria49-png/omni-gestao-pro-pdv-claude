"use client"

import { VendasPDV } from "@/components/dashboard/vendas/vendas-pdv"
import { useStudioTheme, type StudioThemeMode } from "@/components/theme/ThemeProvider"
import { LoadingState } from "@/components/ui/states"
import {
  readOmnigestaoPdvModoPreferencia,
  writeOmnigestaoPdvModoPreferencia,
} from "@/lib/omnigestao-pdv-modo"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useState } from "react"

function studioModeToDataTheme(mode: StudioThemeMode): string {
  if (mode === "classic") return "light"
  return mode
}

export function VendasPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const modo = searchParams.get("modo")
  const isModoRapido = modo === "rapido"

  const [mounted, setMounted] = useState(false)
  const { mode } = useStudioTheme()

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", studioModeToDataTheme(mode))
  }, [mode])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (modo === "rapido") {
      writeOmnigestaoPdvModoPreferencia("rapido")
      return
    }
    if (modo === "normal") {
      writeOmnigestaoPdvModoPreferencia("normal")
      return
    }
    if (readOmnigestaoPdvModoPreferencia() === "rapido") {
      router.replace("/dashboard/vendas?modo=rapido")
    }
  }, [modo, router])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <LoadingState message="Carregando PDV…" />

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground transition-colors duration-300">
      <VendasPDV isModoRapido={isModoRapido} />
    </div>
  )
}
