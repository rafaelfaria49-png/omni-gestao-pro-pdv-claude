"use client"

import { VendasPDV } from "@/components/dashboard/vendas/vendas-pdv"
import { TerminalSelector } from "@/components/dashboard/vendas/terminal-selector"
import { useStudioTheme, type StudioThemeMode } from "@/components/theme/ThemeProvider"
import { LoadingState } from "@/components/ui/states"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2, Lock, RefreshCw, UtensilsCrossed } from "lucide-react"
import {
  readOmnigestaoPdvModoPreferencia,
  writeOmnigestaoPdvModoPreferencia,
} from "@/lib/omnigestao-pdv-modo"
import { experimentalPdvEnabled } from "@/lib/feature-flags"
import { readPdvMainLayout, writePdvMainLayout } from "@/lib/pdv-layout-storage"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import Link from "next/link"
import { useTerminalAtivo, useTerminalHeartbeat } from "@/lib/pdv-terminal"
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
  const [isNextLayout, setIsNextLayout] = useState(false)
  const [terminalBypass, setTerminalBypass] = useState(false)
  const { mode } = useStudioTheme()
  const { lojaAtivaId } = useLojaAtiva()
  const { pdvParams, hydrated: settingsHydrated } = useStoreSettings()
  const { terminal, select, clear } = useTerminalAtivo(lojaAtivaId)
  const lock = useTerminalHeartbeat({
    storeId: lojaAtivaId,
    terminalId: terminal?.id ?? null,
    enabled: mounted && !isNextLayout && !!lojaAtivaId && !!terminal && !terminalBypass,
  })

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", studioModeToDataTheme(mode))
  }, [mode])

  useEffect(() => {
    if (typeof window === "undefined" || !lojaAtivaId?.trim()) return
    const storeId = lojaAtivaId.trim()

    try {
      const layout = readPdvMainLayout(storeId)
      if (layout === "next") {
        if (experimentalPdvEnabled) {
          setIsNextLayout(true)
          router.replace("/dashboard/pdv-next")
          return
        }
        writePdvMainLayout(storeId, "classic")
      }
    } catch {
      /* ignore */
    }

    if (modo === "rapido") {
      writeOmnigestaoPdvModoPreferencia("rapido", storeId)
      return
    }
    if (modo === "normal") {
      writeOmnigestaoPdvModoPreferencia("normal", storeId)
      return
    }
    if (readOmnigestaoPdvModoPreferencia(storeId) === "rapido") {
      router.replace("/dashboard/vendas?modo=rapido")
    }
  }, [lojaAtivaId, modo, router])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <LoadingState message="Carregando PDV…" />
  if (isNextLayout) return <LoadingState message="Redirecionando para o PDV Next…" />
  // Aguarda a loja ativa resolver antes de decidir pelo gate de terminal.
  if (!lojaAtivaId) return <LoadingState message="Carregando PDV…" />

  // Gate de terminal: solicita seleção antes de abrir o PDV/caixa. Fallback (skip)
  // garante que a operação não fica bloqueada se os terminais não carregarem.
  if (!terminal && !terminalBypass) {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto bg-background px-4 py-8 text-foreground">
        <TerminalSelector
          storeId={lojaAtivaId}
          onSelected={(t) => select(t)}
          onSkip={() => setTerminalBypass(true)}
        />
      </div>
    )
  }

  // Lock perdido: outro dispositivo assumiu este terminal (ou foi liberado). Bloqueia
  // abertura/fechamento/venda até reassumir ou escolher outro terminal.
  if (terminal && !terminalBypass && lock.status === "lost") {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center overflow-y-auto bg-background px-4 py-8 text-foreground">
        <TerminalLostPanel
          code={terminal.code}
          occupiedOperador={lock.occupiedBy?.operador ?? null}
          onReassumir={() => lock.reacquire(false)}
          onReselecionar={() => clear()}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground transition-colors duration-300 basis-0">
      {terminal && !terminalBypass && lock.degraded && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Controle de terminal indisponível — operando sem trava de uso simultâneo.
        </div>
      )}
      {settingsHydrated && pdvParams.moduloControleConsumo ? (
        <div className="flex shrink-0 items-center justify-end border-b border-border bg-background px-3 py-1.5">
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link href="/dashboard/vendas/mesas">
              <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
              Mesas
            </Link>
          </Button>
        </div>
      ) : null}
      <VendasPDV isModoRapido={isModoRapido} />
    </div>
  )
}

function TerminalLostPanel({
  code,
  occupiedOperador,
  onReassumir,
  onReselecionar,
}: {
  code: string
  occupiedOperador: string | null
  onReassumir: () => Promise<boolean>
  onReselecionar: () => void
}) {
  const [tentando, setTentando] = useState(false)
  return (
    <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
        <Lock className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-lg font-bold text-foreground">Controle do {code} perdido</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {occupiedOperador
          ? `Este terminal foi assumido por ${occupiedOperador} em outro dispositivo.`
          : "Este terminal foi assumido em outro dispositivo ou liberado."}{" "}
        As operações ficam bloqueadas aqui até você reassumir ou escolher outro terminal.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Button
          disabled={tentando}
          onClick={() => {
            setTentando(true)
            void onReassumir().finally(() => setTentando(false))
          }}
        >
          {tentando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Tentar reassumir
        </Button>
        <Button variant="outline" onClick={onReselecionar}>
          Selecionar outro terminal
        </Button>
      </div>
    </div>
  )
}
