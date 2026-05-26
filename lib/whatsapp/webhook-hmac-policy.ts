import { verifyMetaXHubSignature256 } from "@/lib/whatsapp-meta-webhook-signature"

export function resolveWhatsAppAppSecret(): string {
  return (
    process.env.WHATSAPP_APP_SECRET?.trim() ??
    process.env.META_APP_SECRET?.trim() ??
    ""
  )
}

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  )
}

export type MetaWebhookSignatureResult =
  | { ok: true; verified: boolean; devBypass: boolean }
  | { ok: false; status: number; message: string }

/**
 * Política HMAC para POST Meta Cloud.
 * - Produção: WHATSAPP_APP_SECRET obrigatório; assinatura inválida → não processar.
 * - Dev: secret vazio permite bypass documentado (verified=false).
 * GET handshake Meta não usa esta função.
 */
export function evaluateMetaWebhookSignature(
  rawBody: string,
  sigHeader: string | null
): MetaWebhookSignatureResult {
  const appSecret = resolveWhatsAppAppSecret()

  if (!appSecret) {
    if (isProductionRuntime()) {
      return {
        ok: false,
        status: 503,
        message:
          "misconfigured: WHATSAPP_APP_SECRET obrigatório em produção. Configure o App Secret do Meta Business Manager.",
      }
    }
    console.warn(
      "[whatsapp-webhook] DEV: WHATSAPP_APP_SECRET vazio — assinatura não verificada (permitido apenas em desenvolvimento)"
    )
    return { ok: true, verified: false, devBypass: true }
  }

  const verified = verifyMetaXHubSignature256(rawBody, sigHeader, appSecret)
  if (!verified) {
    return { ok: true, verified: false, devBypass: false }
  }

  return { ok: true, verified: true, devBypass: false }
}
