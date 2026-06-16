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

/**
 * Fonte ÚNICA do nome do operador para EXIBIÇÃO (PDV, caixa, comprovantes).
 *
 * Nunca retorna um id técnico (UUID de dispositivo / `cashierId`). Prioridade:
 *   1. nome informado na ABERTURA do caixa (`aberturaNome`) — fonte oficial;
 *   2. nome do usuário autenticado (sessão NextAuth);
 *   3. prefixo do e-mail autenticado;
 *   4. "Operador não identificado" (jamais um id).
 *
 * Os identificadores internos (`cashierId`, `userId`, `sessionId`) continuam
 * existindo para auditoria — este helper troca apenas a APRESENTAÇÃO.
 */
export function operatorDisplayName(opts: {
  aberturaNome?: string | null
  session?: Session | null
}): string {
  const abertura = opts.aberturaNome?.trim()
  if (abertura) return abertura
  return pdvOperatorReceiptLabel(opts.session ?? null)
}

/**
 * Detecta um IDENTIFICADOR TÉCNICO de operador (`cashierId`) que jamais deve ir
 * para a tela/cupom. Cobre os dois formatos gerados por `getOrCreatePdvOperatorId`:
 *   - `crypto.randomUUID()` → `8-4-4-4-12` hexadecimal;
 *   - fallback `${Date.now()}-${hex}` (timestamp + sufixo hex, sem espaços).
 * Nomes humanos ("Rafael", "Admin Rafael", "Caixa 1") nunca casam.
 */
export function looksLikeOperatorId(value: string | null | undefined): boolean {
  const v = (value ?? "").trim()
  if (!v) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return true
  if (/^\d{10,}-[0-9a-f]{4,}$/i.test(v)) return true
  return false
}

/**
 * Sanitiza um rótulo de operador JÁ EXISTENTE (coluna `Venda.operador`,
 * `SaleRecord.cashierId`): devolve o texto quando é legível, ou "" quando é um id
 * técnico (UUID / timestamp-hash) que nunca deve aparecer.
 *
 * É um FILTRO puro: nunca inventa nem substitui por outro nome — apenas remove o
 * identificador técnico. Rede de segurança para dados antigos persistidos antes da
 * fonte única de nome (`operatorDisplayName`).
 */
export function sanitizeOperatorLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim()
  if (!v || looksLikeOperatorId(v)) return ""
  return v
}
