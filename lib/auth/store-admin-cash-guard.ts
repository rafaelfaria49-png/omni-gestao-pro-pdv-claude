import "server-only"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { auth } from "@/auth"
import { resolvePinAuthorizationSecret } from "@/lib/auth/pin-authorization"
import {
  CAIXA_SEGURO_ACTION,
  isStoreAdminSession,
  isStoreExperienceSession,
  STORE_ADMIN_REAUTH_COOKIE,
  verifyStoreAdminReauthToken,
} from "@/lib/auth/store-admin-reauth"

export const STORE_ADMIN_REQUIRED_MESSAGE =
  "Somente a administradora da loja pode fazer esta operação. Entre com a conta dela."
export const STORE_ADMIN_REAUTH_REQUIRED_MESSAGE =
  "Confirme a senha da administradora em Resumo do Caixa e tente de novo."

/**
 * Proteção REAL do Caixa Seguro na experiência STORE (fechamento, sangria, suprimento).
 *
 * Antes, o PIN só escondia o resumo na tela; a API fechava para qualquer sessão com
 * `pdv.fecharCaixa`. Agora, para sessão STORE, a rota exige a autorização emitida por
 * `POST /api/auth/store-admin-reauth` para ESTA loja e ESTA sessão de caixa. O cookie do
 * PIN global não é aceito aqui.
 *
 * Contas internas legadas e a plataforma passam direto (devolve `null`): o comportamento
 * delas não muda. Sem sessão NextAuth: 401 (as rotas já recusam antes, em
 * `requireModuleApi`). Chamar depois dos guards de módulo/permissão e antes de qualquer escrita.
 */
export async function storeAdminCashApprovalDenied(input: {
  storeId: string
  sessaoId: string
}): Promise<NextResponse | null> {
  const session = await auth()
  // Fail-closed por conta própria, sem depender da ordem dos guards do chamador.
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  if (!isStoreExperienceSession(session)) return null

  if (!isStoreAdminSession(session)) {
    return NextResponse.json(
      { error: STORE_ADMIN_REQUIRED_MESSAGE, code: "store_admin_required" },
      { status: 403 },
    )
  }

  const jar = await cookies()
  const verification = await verifyStoreAdminReauthToken(
    jar.get(STORE_ADMIN_REAUTH_COOKIE)?.value,
    resolvePinAuthorizationSecret(),
    {
      userId: session.user.id,
      storeId: input.storeId,
      action: CAIXA_SEGURO_ACTION,
      resource: input.sessaoId,
      sessionVersion: session.user.sessionVersion ?? 0,
    },
  )
  if (verification.ok) return null

  console.log(
    JSON.stringify({
      event: "store_admin_cash_approval_denied",
      timestamp: new Date().toISOString(),
      userId: session.user.id,
      storeId: input.storeId,
      reasonCode: verification.reason,
    }),
  )
  return NextResponse.json(
    { error: STORE_ADMIN_REAUTH_REQUIRED_MESSAGE, code: "store_admin_reauth_required" },
    { status: 403 },
  )
}
