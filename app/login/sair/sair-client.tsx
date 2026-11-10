"use client"

import { useEffect, useRef, useState } from "react"
import { signOut } from "next-auth/react"
import { verifiedSignOut, type VerifiedSignOutResult } from "@/lib/auth/verified-sign-out"
import { purgeSessionRuntimeCaches } from "@/lib/pwa/purge-session-caches"

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function SairClient() {
  const [result, setResult] = useState<VerifiedSignOutResult | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const r = await verifiedSignOut({ signOut, fetchImpl: fetch, wait })
      if (r.ok) {
        // Só depois da confirmação do servidor: dados da sessão encerrada saem do cache do SW
        // (localStorage — fila offline, carrinho, caixa — não é tocado).
        await purgeSessionRuntimeCaches(typeof caches === "undefined" ? undefined : caches)
        window.location.replace("/login")
        return
      }
      setResult(r)
    })()
  }, [])

  const failed = result && !result.ok
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center text-card-foreground">
        {!failed ? (
          <>
            <h1 className="text-lg font-semibold">Encerrando sessão…</h1>
            <p className="text-sm text-muted-foreground">Confirmando com o servidor que a sessão foi encerrada.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Não foi possível confirmar o encerramento</h1>
            <p className="text-sm text-muted-foreground">
              {result.reason === "sessao-ainda-ativa"
                ? "O servidor ainda reconhece esta sessão. Tente novamente; se persistir, feche o navegador antes de entregar o computador a outra pessoa."
                : "Sem resposta do servidor (verifique a internet). A sessão pode continuar ativa neste navegador."}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Tentar novamente
            </button>
          </>
        )}
      </div>
    </div>
  )
}
