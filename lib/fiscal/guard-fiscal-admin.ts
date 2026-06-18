/**
 * Autorização das rotas de identidade fiscal (`/api/fiscal/*`) — GOAL_002.
 *
 * "Apenas ADMIN" (constraint do GOAL): exige o papel canônico `admin`
 * (SUPER_ADMIN/ADMIN) — mais estrito que `admin.configuracoes` (que também
 * liberaria gerente). NÃO cria um segundo sistema de permissão: compõe os mesmos
 * blocos já existentes (sessão NextAuth + `canAccessStore` para o escopo de loja +
 * `enterpriseRoleFromUserRole` para o papel). Multi-loja obrigatório: a loja vem do
 * header `x-assistec-loja-id` (resolvido pela rota) e é checada por `canAccessStore`.
 */
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { canAccessStore, enterpriseRoleFromUserRole } from "@/lib/auth/enterprise-permissions"

export type FiscalAdminAuth =
  | { ok: true; session: Session; storeId: string }
  | { ok: false; status: number; error: string }

export async function requireFiscalAdmin(
  storeId: string | null | undefined,
): Promise<FiscalAdminAuth> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Não autenticado" }
  }
  const sid = String(storeId ?? "").trim()
  if (!sid) {
    return { ok: false, status: 400, error: "Unidade (loja) não informada" }
  }
  if (!canAccessStore(session, sid)) {
    return { ok: false, status: 403, error: "Sem permissão para esta unidade" }
  }
  if (enterpriseRoleFromUserRole(session.user.role) !== "admin") {
    return { ok: false, status: 403, error: "Apenas administradores podem gerir a identidade fiscal." }
  }
  return { ok: true, session, storeId: sid }
}
