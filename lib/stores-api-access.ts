import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { isElevatedRole } from "@/lib/auth/admin-users-policy"
import {
  LEGACY_PRIMARY_STORE_ID,
  PROTECTED_STORE_IDS,
  evaluateStoreProtection,
  isWhitelistedProtectedStore,
} from "@/lib/store-defaults"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { prisma } from "@/lib/prisma"

// Reexporta a lógica de proteção (definida em store-defaults — módulo sem deps de
// servidor, testável isoladamente) para que rotas API possam importar tudo daqui. Ver
// docs/modules/reports/INVENTARIO_LOJAS_2026-05-30.md.
export { PROTECTED_STORE_IDS, isWhitelistedProtectedStore, evaluateStoreProtection }
export type { StoreProtectionInput, StoreProtectionResult } from "@/lib/store-defaults"

export async function requireStoresSession(): Promise<
  | { ok: true; session: Session }
  | { ok: false; res: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Não autorizado. Faça login." }, { status: 401 }),
    }
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
    return NextResponse.json(
      { ok: false, error: "Sem permissão para esta unidade." },
      { status: 403 },
    )
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

export type StoreOperationalLinkCounts = {
  clientes: number
  os: number
  produtos: number
  tecnicos: number
  hasLinks: boolean
}

/** Contagens usadas para bloquear exclusão de unidade com dados operacionais (evita cascade). */
export async function countStoreOperationalLinks(storeId: string): Promise<StoreOperationalLinkCounts> {
  const id = storeId.trim()
  const [clientes, os, produtos, tecnicos] = await Promise.all([
    prisma.cliente.count({ where: { storeId: id } }),
    prisma.ordemServico.count({ where: { storeId: id } }),
    prisma.produto.count({ where: { storeId: id } }),
    prisma.tecnico.count({ where: { storeId: id } }),
  ])
  const hasLinks = clientes > 0 || os > 0 || produtos > 0 || tecnicos > 0
  return { clientes, os, produtos, tecnicos, hasLinks }
}

/**
 * Guard de request para exclusão/limpeza de loja. Resolve loja principal e loja ativa,
 * aplica {@link evaluateStoreProtection} e retorna o `NextResponse` de bloqueio (ou null
 * se a operação é permitida). Deve ser chamado ANTES de qualquer DELETE/limpeza.
 */
export async function assertStoreDeletable(req: Request, storeId: string): Promise<NextResponse | null> {
  const primaryStoreId = await resolvePrimaryStoreId()
  const activeStoreId = storeIdFromAssistecRequestForRead(req)
  const result = evaluateStoreProtection({ storeId, primaryStoreId, activeStoreId })
  if (result.blocked) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return null
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
