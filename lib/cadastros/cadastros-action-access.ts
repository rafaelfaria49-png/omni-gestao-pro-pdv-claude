"use server"

import type { Session } from "next-auth"
import {
  canAuthorizeCadastrosStore,
  cadastrosStoreScope,
  hasCadastrosHub,
  isCadastrosAdminPrincipal,
} from "@/lib/cadastros/cadastros-api-access"

export type CadastrosActionProfile = "hub" | "shared" | "admin"

export const CADASTROS_ACTION_UNAUTHENTICATED = "Não autenticado"
export const CADASTROS_ACTION_NO_STORE = "Loja não selecionada"
export const CADASTROS_ACTION_STORE_FORBIDDEN = "Sem permissão para esta unidade"
export const CADASTROS_ACTION_HUB_FORBIDDEN = "Sem permissão para Cadastros."
export const CADASTROS_ACTION_ADMIN_FORBIDDEN =
  "Apenas administradores (ADMIN ou SUPER_ADMIN) podem executar esta ação."

async function loadCadastrosSession(): Promise<Session> {
  const { getSessionEntitlement } = await import("@/lib/auth/session-entitlement")
  const entitlement = await getSessionEntitlement()
  if (!entitlement.ok) throw new Error(CADASTROS_ACTION_UNAUTHENTICATED)
  const { auth } = await import("@/auth")
  const session = await auth()
  if (!session?.user?.id) throw new Error(CADASTROS_ACTION_UNAUTHENTICATED)
  return session
}

/**
 * Autoriza Server Actions de Cadastros com a mesma policy engine do REST (CAD-R2-002).
 * Não usa `canAccessStore` global. Role/membership vêm só da sessão.
 */
export async function requireCadastrosActionAccess(
  storeId: string,
  profile: CadastrosActionProfile = "hub",
): Promise<{ storeId: string; session: Session }> {
  const sid = (storeId ?? "").trim()
  if (!sid) throw new Error(CADASTROS_ACTION_NO_STORE)
  const session = await loadCadastrosSession()
  if (profile === "admin" && !isCadastrosAdminPrincipal(session)) {
    throw new Error(CADASTROS_ACTION_ADMIN_FORBIDDEN)
  }
  if (!canAuthorizeCadastrosStore(session, sid)) {
    throw new Error(CADASTROS_ACTION_STORE_FORBIDDEN)
  }
  if (profile === "hub" && !hasCadastrosHub(session)) {
    throw new Error(CADASTROS_ACTION_HUB_FORBIDDEN)
  }
  return { storeId: sid, session }
}

/** Actions sem storeId no contrato (auditoria / lista de lojas). */
export async function requireCadastrosActionSession(
  profile: CadastrosActionProfile = "hub",
): Promise<{ session: Session; storeScope: "all" | string[] }> {
  const session = await loadCadastrosSession()
  if (profile === "admin" && !isCadastrosAdminPrincipal(session)) {
    throw new Error(CADASTROS_ACTION_ADMIN_FORBIDDEN)
  }
  if (profile === "hub" && !hasCadastrosHub(session)) {
    throw new Error(CADASTROS_ACTION_HUB_FORBIDDEN)
  }
  const storeScope = cadastrosStoreScope(session)
  if (profile !== "admin" && storeScope !== "all" && storeScope.length === 0) {
    throw new Error(CADASTROS_ACTION_STORE_FORBIDDEN)
  }
  return { session, storeScope }
}

/** Cadastros HUB: sessão + loja autorizada + hubs.cadastros. */
export async function requireCadastrosStoreAccess(storeId: string): Promise<string> {
  const gate = await requireCadastrosActionAccess(storeId, "hub")
  return gate.storeId
}
