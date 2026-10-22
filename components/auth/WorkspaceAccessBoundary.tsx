"use client"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { canAccessPage } from "@/lib/auth/page-access"
import { useEnterprisePermissions } from "@/lib/auth/use-enterprise-permissions"

export function WorkspaceAccessBoundary({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const path = usePathname()
  const p = useEnterprisePermissions()
  if (status === "unauthenticated") return <div className="p-6"><p>Sua sessão foi encerrada.</p><Link className="underline" href="/login">Entrar novamente</Link></div>
  if (status === "loading" || !p) return <p className="p-6" role="status">Verificando acesso…</p>
  if (!canAccessPage(p, path || "/dashboard")) return <div className="p-6"><p>Acesso indisponível para esta conta ou unidade.</p><Link className="underline" href="/dashboard">Voltar ao início</Link><br /><Link className="underline" href="/login">Entrar novamente</Link></div>
  return children
}
