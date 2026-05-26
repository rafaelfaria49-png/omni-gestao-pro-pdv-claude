import type { Session } from "next-auth"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"

export function canAccessConfigAudit(session: Session | null): boolean {
  if (!session?.user?.id) return false
  const p = getPermissionsFromSession(session)
  return p.admin.configuracoes === true || p.admin.masterConsole === true
}
