"use client"

import { useEffect } from "react"
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react"
import type { Session } from "next-auth"

const REVALIDATE_SECONDS = 30

export function SessionProvider({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  // Credentials Server Actions update the server prop after login. NextAuth only
  // initializes its session state on mount; change identity/version atomically.
  const identity = JSON.stringify([session?.user?.id, session?.user?.sessionVersion])
  // O poll/foco nativos do NextAuth ficam desligados: neles uma falha de REDE vira sessão
  // `null` → "Sua sessão foi encerrada" e o PDV some no meio de uma venda offline
  // (PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001). A revalidação abaixo tem a mesma cadência e
  // só age com resposta real do servidor.
  return (
    <NextAuthSessionProvider key={identity} session={session} refetchInterval={0} refetchOnWindowFocus={false}>
      <SessionRevalidator />
      {children}
    </NextAuthSessionProvider>
  )
}

type SessionLike = { user?: { id?: unknown; sessionVersion?: unknown } } | null

function sessionIdentity(value: SessionLike): string {
  return JSON.stringify([value?.user?.id ?? null, value?.user?.sessionVersion ?? null])
}

/**
 * Revalida a sessão a cada 30 s, na volta da aba e na volta da rede. Rede fora/sem resposta
 * (offline, Wi-Fi sem internet, 5xx) é INCONCLUSIVO: mantém a sessão atual — nenhuma escrita
 * passa sem cookie válido no servidor (401 → a venda fica preservada como "sessão expirada").
 * Resposta real com outra identidade (logout, revogação, troca de versão) faz o NextAuth reler
 * a sessão pelo próprio canal entre abas, como antes.
 */
function SessionRevalidator() {
  const { data, status } = useSession()
  const current = sessionIdentity(data as SessionLike)
  useEffect(() => {
    if (status === "loading") return
    let cancelled = false
    const check = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return
      let fetched: SessionLike
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "include" })
        if (!res.ok) return
        fetched = (await res.json()) as SessionLike
      } catch {
        return
      }
      if (cancelled || sessionIdentity(fetched) === current) return
      try {
        const channel = new BroadcastChannel("next-auth")
        channel.postMessage({ event: "session", data: { trigger: "getSession" } })
        channel.close()
      } catch {
        /* sem BroadcastChannel: o próximo carregamento de página relê a sessão */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    const timer = window.setInterval(() => void check(), REVALIDATE_SECONDS * 1000)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", check)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", check)
    }
  }, [current, status])
  return null
}
