"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ShieldAlert, Store } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Lê `?access=denied` (proxy enterprise) e `?storeAccess=denied` (loja não permitida na sessão).
 * Oferece ação clara sem tela branca nem redirect silencioso.
 */
export function DashboardAccessAlerts() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [dismissedAccess, setDismissedAccess] = useState(false)
  const [dismissedStore, setDismissedStore] = useState(false)

  const accessDenied = searchParams.get("access") === "denied" && !dismissedAccess
  const storeDenied = searchParams.get("storeAccess") === "denied" && !dismissedStore

  const clearParams = useCallback(
    (keys: string[]) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const k of keys) next.delete(k)
      const q = next.toString()
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    if (accessDenied || storeDenied) {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [accessDenied, storeDenied])

  if (!accessDenied && !storeDenied) return null

  return (
    <div className="mb-4 space-y-3 shrink-0">
      {accessDenied && (
        <Alert variant="default" className="border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-4 w-4 text-destructive" />
          <AlertTitle className="text-foreground">Acesso não autorizado</AlertTitle>
          <AlertDescription className="text-muted-foreground mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Você não possui permissão para acessar a área solicitada.</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDismissedAccess(true)}>
                Fechar aviso
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => clearParams(["access"])}>
                Limpar URL
              </Button>
              <Button type="button" size="sm" asChild>
                <Link href="/dashboard">Painel inicial</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {storeDenied && (
        <Alert variant="default" className="border-amber-500/35 bg-amber-500/5 dark:bg-amber-950/20">
          <Store className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          <AlertTitle className="text-foreground">Unidade não disponível</AlertTitle>
          <AlertDescription className="text-muted-foreground mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              A loja selecionada não está autorizada para o seu usuário. Escolha outra unidade no seletor ou
              contate o administrador.
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDismissedStore(true)}>
                Fechar aviso
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => clearParams(["storeAccess"])}>
                Limpar URL
              </Button>
              <Button type="button" size="sm" asChild>
                <Link href="/dashboard">Painel inicial</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
