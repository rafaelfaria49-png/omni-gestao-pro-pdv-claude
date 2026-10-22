import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { canAccessStore, getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { canAccessPage, canAccessSettingsSection } from "@/lib/auth/page-access"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import DashboardClientLayout from "@/components/dashboard/DashboardClientLayout"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.mustChangePassword) redirect("/conta/seguranca")
  const h = await headers()
  const path = h.get("x-omni-pathname") || "/dashboard"
  const cookie = (await cookies()).get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value
  const storeId = cookie && canAccessStore(session, cookie) ? cookie : session.user.lojaId || session.user.allowedStoreIds?.[0]
  const p = getPermissionsFromSession(session, storeId)
  if (!canAccessPage(p, path)) redirect("/dashboard?access=denied")
  if (path === "/dashboard/configuracoes") {
    const section = new URLSearchParams(h.get("x-omni-search") || "").get("sec") || "geral"
    if (!canAccessSettingsSection(p, section)) redirect("/dashboard/configuracoes?sec=geral&access=denied")
  }
  return <DashboardClientLayout key={session.user.id}>{children}</DashboardClientLayout>
}
