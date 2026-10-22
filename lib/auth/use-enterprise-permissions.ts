"use client"

import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { getPermissionsFromSession, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { useLojaAtiva } from "@/lib/loja-ativa"

/** `null` = sessão PIN / não autenticado enterprise — a interface deve manter as superfícies operacionais fechadas. */
export function useEnterprisePermissions(): EnterprisePermissions | null {
  const { data: session, status } = useSession()
  const { lojaAtivaId } = useLojaAtiva()
  return useMemo(() => {
    // update() mantém a sessão anterior enquanto relê o servidor. Não desmontar
    // formulários autorizados durante esse intervalo; o resultado revogado fecha.
    if (status === "unauthenticated" || !session?.user?.role) return null
    return getPermissionsFromSession(session, lojaAtivaId)
  }, [status, session, lojaAtivaId])
}
