"use client"
import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import type { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
export type Disponibilidade = Awaited<ReturnType<typeof lerDisponibilidade>>
export function refreshPessoas() { window.dispatchEvent(new Event("pessoas:refresh")) }
export function useDisponibilidade() {
  const { data: session, status } = useSession()
  const { lojaAtivaId } = useLojaAtiva()
  const key = JSON.stringify([status, session?.user?.id, session?.user?.role, lojaAtivaId])
  const [state, setState] = useState<{ key: string; data?: Disponibilidade; error?: string; generation: number }>()
  const [generation, setGeneration] = useState(0)
  const refresh = useCallback(() => { setGeneration(n => n + 1) }, [])
  useEffect(() => {
    const visible = () => refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener("pageshow", refresh)
    window.addEventListener("pessoas:refresh", refresh)
    window.addEventListener("offline", refresh)
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh)
      window.removeEventListener("pessoas:refresh", refresh); window.removeEventListener("offline", refresh)
      window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", visible)
    }
  }, [refresh])
  useEffect(() => {
    const controller = new AbortController()
    if (status !== "authenticated" || !lojaAtivaId || document.visibilityState === "hidden") return () => controller.abort()
    void (async () => {
      try {
        const response = await fetch("/api/pessoas/disponibilidade", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        const body = await response.json()
        if (!controller.signal.aborted) setState(response.ok
          ? { key, generation, data: body }
          : { key, generation, error: body.code ?? "FALHA_INTERNA" })
      } catch { if (!controller.signal.aborted) setState({ key, generation, error: "REDE" }) }
    })()
    return () => controller.abort()
  }, [key, generation, status, lojaAtivaId])
  const current = state?.key === key && state.generation === generation ? state : undefined
  return { data: current?.data, retainedData: state?.key === key ? state.data : undefined, error: current?.error, refresh, contextKey: key,
    loading: !current, disponivel: current?.data?.disponivel === true }
}
