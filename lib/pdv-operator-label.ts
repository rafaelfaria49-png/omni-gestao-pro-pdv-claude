import type { Session } from "next-auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"

/**
 * Rótulo HUMANO do operador para o COMPROVANTE (client-safe).
 *
 * O PDV usa `getOrCreatePdvOperatorId()` (UUID por dispositivo) como identificador
 * técnico interno (`cashierId`) — esse valor NÃO deve ser impresso ao cliente.
 * Este helper deriva o operador a partir da sessão NextAuth, no mesmo critério da
 * persistência server-side (`getOperatorLabelFromSession`, usado em
 * `app/api/ops/venda-persist`), mantendo cupom × banco alinhados.
 *
 * Fallback honesto quando não há sessão identificável (em vez do UUID técnico):
 * "Operador não identificado". Não altera `cashierId` nem a persistência.
 */
export function pdvOperatorReceiptLabel(session: Session | null | undefined): string {
  const hasName = !!session?.user?.name?.trim()
  const hasEmail = !!session?.user?.email?.trim()
  if (!hasName && !hasEmail) return "Operador não identificado"
  return getOperatorLabelFromSession(session ?? null)
}
