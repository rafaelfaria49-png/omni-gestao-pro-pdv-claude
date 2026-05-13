import { NextResponse } from "next/server"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

/**
 * Assinatura ativa + unidade explícita (header ou query), sem fallback de cookie/loja legada.
 */
export async function requireMarketplaceApi(req: Request) {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, response: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unidade obrigatória: envie o header x-assistec-loja-id ou query storeId / lojaId." },
        { status: 400 }
      ),
    }
  }
  return { ok: true as const, storeId }
}
