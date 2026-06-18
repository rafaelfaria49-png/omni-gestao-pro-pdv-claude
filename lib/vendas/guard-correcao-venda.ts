/**
 * Autorização unificada das rotas de correção de venda (`/api/vendas/[id]/corrigir*`).
 *
 * GOAL_SEGURANCA_CORRECAO_VENDA_MULTILOJA — fecha o P1 da auditoria operacional:
 * as rotas `corrigir*` exigiam apenas o PIN de supervisor, sem reforçar sessão,
 * acesso à loja, permissão nem assinatura (ao contrário de `cancelar`/`venda-persist`).
 *
 * NÃO cria um segundo sistema de permissão: compõe exatamente os mesmos blocos já
 * usados por `/api/vendas/[id]/cancelar`:
 *   - sessão NextAuth (`auth()`),
 *   - `requireEnterpriseWith(storeId, p => p.pdv.cancelarVenda)` →
 *     `canAccessStore` (escopo de loja) + permissão de papel,
 *   - fallback `requireOpsSubscription()` para o PDV legado (sem sessão).
 *
 * Escopo de loja do PIN (decisão do GOAL — "sessão escopa a loja, sem schema"):
 * o PIN vive em `User` (tabela `users`, sem `storeId`, `pin` globalmente único) — é um
 * supervisor GLOBAL por design. O limite de loja é garantido AQUI, pela sessão do
 * operador: quem está restrito a outra loja é bloqueado por `canAccessStore` ANTES de o
 * PIN importar. O PIN continua sendo a co-assinatura de supervisor, validada por rota.
 */
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import { requireOpsSubscription } from "@/lib/ops-api-gate"

export type CorrecaoVendaAuth =
  | { ok: true; session: Session | null }
  | { ok: false; status: number; error: string }

/**
 * Reforça autenticação + acesso à loja + permissão para corrigir a venda.
 * Retorna `session` (NextAuth) no sucesso — reaproveitada para o rótulo de operador.
 * No PDV legado (sem sessão) cai no gate de assinatura, igual ao cancelamento.
 */
export async function requireCorrecaoVendaAuth(storeId: string): Promise<CorrecaoVendaAuth> {
  const session = await auth()
  if (session?.user) {
    const guard = await requireEnterpriseWith(
      storeId,
      (p) => p.pdv.cancelarVenda,
      "Sem permissão para corrigir vendas.",
    )
    if (!guard.ok) return { ok: false, status: guard.status, error: guard.error }
    return { ok: true, session }
  }
  const sub = await requireOpsSubscription()
  if (!sub.ok) {
    const status = sub.res.status
    return { ok: false, status, error: status === 403 ? "Assinatura inválida" : "Não autorizado" }
  }
  return { ok: true, session: null }
}
