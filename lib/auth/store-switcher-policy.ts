/**
 * Seletor de loja ativa para usuários com escopo de loja (OMNI-STORE-SAFE-SWITCHER-001).
 *
 * Regras puras, sem React. A troca em si continua sendo `setLojaAtivaId` (lib/loja-ativa.tsx):
 * guarda de rascunho da V4, recusa de loja sem vínculo, sondagem com rollback e refresh de sessão.
 * Este módulo só decide QUEM vê o seletor, QUAIS lojas ele oferece e QUANDO a troca é segura.
 */
import type { Session } from "next-auth"
import { isPlatformSession } from "@/lib/auth/access-policy"
import { canAccessStore, enterpriseRoleFromUserRole } from "@/lib/auth/enterprise-permissions"

/** Papéis que podem alternar entre as próprias lojas. Operacionais (caixa/técnico/vendedor) não. */
const SWITCHER_ROLES = new Set(["admin", "gerente"])

/**
 * Lojas oferecidas pelo seletor: somente as que a sessão autoriza, sem duplicatas e com id.
 * Nunca deriva opção de entrada digitada — a lista vem de `useLojaAtiva().lojas`.
 */
export function switchableStores<T extends { id: string }>(session: Session | null, lojas: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const loja of lojas) {
    const id = loja?.id?.trim()
    if (!id || seen.has(id) || !canAccessStore(session, id)) continue
    seen.add(id)
    out.push(loja)
  }
  return out
}

/**
 * Mostra o seletor? Só para ADMIN/GERENTE sem autoridade de plataforma (plataforma já usa
 * "Gestão da Rede"), sem troca de senha pendente e com 2+ lojas autorizadas.
 */
export function canUseStoreSwitcher(session: Session | null, lojas: readonly { id: string }[]): boolean {
  if (!session?.user?.id || session.user.mustChangePassword) return false
  if (isPlatformSession(session)) return false
  if (!SWITCHER_ROLES.has(enterpriseRoleFromUserRole(session.user.role))) return false
  return switchableStores(session, lojas).length >= 2
}

/** Telas do PDV: trocar de loja remonta o workspace e descartaria o carrinho aberto. */
const BLOCKED_PATHS = ["/dashboard/pdv", "/dashboard/pdv-next", "/dashboard/vendas"]

export function isStoreSwitchBlockedPath(pathname: string | null | undefined): boolean {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "")
  return BLOCKED_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/** Quantas vendas locais da loja ainda não sincronizaram (lê o blob de `opsKeyForLoja`). */
export function countPendingSalesInOpsBlob(raw: string | null | undefined): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { sales?: unknown }
    if (!Array.isArray(parsed?.sales)) return 0
    return parsed.sales.filter((s) => !!s && typeof s === "object" && (s as { syncPending?: unknown }).syncPending === true).length
  } catch {
    // Blob ilegível: não dá para afirmar que está vazio — trata como pendência para pedir confirmação.
    return 1
  }
}
