/**
 * Diagnóstico de variáveis de ambiente WhatsApp.
 * Nunca retorna tokens ou secrets completos.
 *
 * GET /api/debug/whatsapp-env-check?secret=<ASSISTEC_MASTER_PASSWORD>
 */
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function mask(value: string | undefined, keepFirst = 4, keepLast = 4): string {
  if (!value) return "(vazio)"
  const v = value.trim()
  if (v.length <= keepFirst + keepLast) return "***"
  return `${v.slice(0, keepFirst)}${"*".repeat(Math.max(4, v.length - keepFirst - keepLast))}${v.slice(-keepLast)}`
}

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const provided = (url.searchParams.get("secret") ?? "").trim()
  if (!provided) return false
  const master = (process.env.ASSISTEC_MASTER_PASSWORD ?? "").trim()
  const debug  = (process.env.ASSISTEC_DEBUG_SECRET ?? "").trim()
  return !!(master && provided === master) || !!(debug && provided === debug)
}

export async function GET(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const accessToken      = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId    = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const appSecret        = process.env.WHATSAPP_APP_SECRET?.trim()
  const verifyToken      = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
    ?? process.env.META_WHATSAPP_VERIFY_TOKEN?.trim()
    ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
  const webhookStoreId   = process.env.WHATSAPP_WEBHOOK_STORE_ID?.trim()
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim()
  const apiVersion       = process.env.WHATSAPP_API_VERSION?.trim() ?? "v21.0 (default)"

  return NextResponse.json({
    ok: true,
    whatsapp: {
      hasAccessToken:       !!accessToken,
      accessTokenMasked:    mask(accessToken, 6, 6),
      hasPhoneNumberId:     !!phoneNumberId,
      phoneNumberIdMasked:  mask(phoneNumberId, 4, 3),
      hasAppSecret:         !!appSecret,
      hasVerifyToken:       !!verifyToken,
      verifyTokenMasked:    mask(verifyToken, 4, 4),
      hasBusinessAccountId: !!businessAccountId,
      businessAccountIdMasked: mask(businessAccountId, 4, 3),
      webhookStoreId:       webhookStoreId ?? "(não configurado — usa loja-1)",
      apiVersion,
    },
    graphApi: {
      baseUrl: `https://graph.facebook.com/${apiVersion.replace(/^v/, "v")}/`,
      messagesEndpoint: `/{phoneNumberId}/messages`,
    },
    ready: !!(accessToken && phoneNumberId),
  })
}
