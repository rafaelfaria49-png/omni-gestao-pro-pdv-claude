"use client"

import { VendasPDV } from "@/components/dashboard/vendas/vendas-pdv"
import { useStudioTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"
import {
  readOmnigestaoPdvModoPreferencia,
  writeOmnigestaoPdvModoPreferencia,
} from "@/lib/omnigestao-pdv-modo"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

/** PDV dedicado: layout Classic vs Services e Classic vs Supermercado vêm de Configurações + `StoreSettings`. */
export default function DashboardVendasPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const modo = searchParams.get("modo")
  const isModoRapido = modo === "rapido"

  const [mounted, setMounted] = useState(false)
  const { mode } = useStudioTheme()
  const classic = mode === "classic"

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

  if (!mounted) return null

  return (
    <div
      className={cn(
        "flex min-h-[min(100dvh,100vh)] min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden transition-colors duration-300",
        classic ? "bg-slate-50" : "bg-[#000000]"
      )}
    >
      <VendasPDV isModoRapido={isModoRapido} />
    </div>
  )
}
