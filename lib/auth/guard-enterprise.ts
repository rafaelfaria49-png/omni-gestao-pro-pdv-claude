"use server"

import type { Session } from "next-auth"
import { auth } from "@/auth"
import { getEnterprisePermissions, canAccessStore, type EnterprisePermissions } from "@/lib/auth/enterprise-permissions"

/** Sessão com utilizador garantido (após `auth()` com sucesso). */
export type AuthenticatedSession = Session & {
  user: NonNullable<Session["user"]> & { id: string; role: string }
}

export type EnterpriseGuardResult =
  | { ok: true; session: AuthenticatedSession; permissions: EnterprisePermissions }
  | { ok: false; error: string; status: number }

/**
 * Exige sessão NextAuth + permissão de módulo (server actions / rotas Node).
 */
export async function requireEnterpriseSession(): Promise<EnterpriseGuardResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, error: "Não autenticado", status: 401 }
  }
  const permissions = getEnterprisePermissions(session.user.role)
  return { ok: true, session: session as AuthenticatedSession, permissions }
}

export async function requireStoreAccess(storeId: string | null | undefined): Promise<EnterpriseGuardResult> {
  const base = await requireEnterpriseSession()
  if (!base.ok) return base
  if (!canAccessStore(base.session, storeId ?? null)) {
    return { ok: false, error: "Sem permissão para esta unidade", status: 403 }
  }
  return base
}

/** Ex.: cancelar venda, fechar período — combina loja + permissão booleana. */
export async function requireEnterpriseWith(
  storeId: string | null | undefined,
  check: (p: EnterprisePermissions) => boolean,
  forbiddenMessage: string,
): Promise<EnterpriseGuardResult> {
  const base = await requireStoreAccess(storeId)
  if (!base.ok) return base
  if (!check(base.permissions)) {
    return { ok: false, error: forbiddenMessage, status: 403 }
  }
  return base
}
