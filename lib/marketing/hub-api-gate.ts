import { NextResponse } from "next/server"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForRead, storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"

/**
 * Assinatura ativa + escopo de loja (leitura: header/query/cookie/legado; escrita: só header/query).
 */
export async function requireMarketingHubApi(req: Request, mode: "read" | "write") {
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) {
    return { ok: false as const, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) }
  }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return { ok: false as const, response: NextResponse.json({ error: "Assinatura inválida" }, { status: 403 }) }
  }
  if (mode === "write") {
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
  const storeId = storeIdFromAssistecRequestForRead(req)
  if (!storeId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "storeId obrigatório" }, { status: 400 }),
    }
  }
  return { ok: true as const, storeId }
}
