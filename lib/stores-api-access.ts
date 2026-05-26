import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { isElevatedRole } from "@/lib/auth/admin-users-policy"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { prisma } from "@/lib/prisma"

export async function requireStoresSession(): Promise<
  | { ok: true; session: Session }
  | { ok: false; res: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { ok: true, session }
}

export function filterStoresForSession<T extends { id: string }>(session: Session, stores: T[]): T[] {
  if (session.user.storeAccess !== "restricted") return stores
  const allowed = new Set(session.user.allowedStoreIds ?? [])
  if (allowed.size === 0) return []
  return stores.filter((s) => allowed.has(s.id))
}

export function denyIfNoStoreAccess(session: Session, storeId: string): NextResponse | null {
  if (!canAccessStore(session, storeId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  return null
}

export function isElevatedAdminRole(role: string | undefined | null): boolean {
  return isElevatedRole(String(role ?? ""))
}

export async function resolvePrimaryStoreId(): Promise<string> {
  const first = await prisma.store.findFirst({ orderBy: { id: "asc" }, select: { id: true } })
  return first?.id ?? LEGACY_PRIMARY_STORE_ID
}

export async function isProtectedPrimaryStore(storeId: string): Promise<boolean> {
  const trimmed = storeId.trim()
  if (!trimmed) return false
  if (trimmed === LEGACY_PRIMARY_STORE_ID) return true
  const primaryId = await resolvePrimaryStoreId()
  return trimmed === primaryId
}

export type StoreDeleteConfirmBody = {
  confirm?: boolean
  storeId?: string
}

export function parseStoreDeleteConfirm(body: StoreDeleteConfirmBody, pathStoreId: string): NextResponse | null {
  if (body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirmação obrigatória. Envie { confirm: true, storeId: \"...\" }." },
      { status: 400 },
    )
  }
  const confirmedId = String(body.storeId ?? "").trim()
  if (!confirmedId || confirmedId !== pathStoreId.trim()) {
    return NextResponse.json(
      { ok: false, error: "storeId da confirmação não confere com a unidade solicitada." },
      { status: 400 },
    )
  }
  return null
}
