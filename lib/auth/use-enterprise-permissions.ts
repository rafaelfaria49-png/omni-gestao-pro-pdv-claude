"use client"

import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { getEnterprisePermissions, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

/** `null` = sessão PIN / não autenticado enterprise — UI mantém comportamento legado (mostrar tudo onde aplicável). */
export function useEnterprisePermissions(): EnterprisePermissions | null {
  const { data: session, status } = useSession()
  return useMemo(() => {
    if (status !== "authenticated" || !session?.user?.role) return null
    return getEnterprisePermissions(session.user.role)
  }, [status, session?.user?.role])
}
