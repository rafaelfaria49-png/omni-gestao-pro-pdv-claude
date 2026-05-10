import { NextResponse } from "next/server"

/** Remove BOM comum ao colar token no painel da Vercel. */
function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "")
}

/**
 * Token do campo "Verify token" no Meta — idêntico ao configurado na Vercel.
 */
export function resolveWhatsAppWebhookVerifyToken(): string {
  const keys = ["WHATSAPP_VERIFY_TOKEN", "META_WHATSAPP_VERIFY_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const
  for (const key of keys) {
    const raw = process.env[key]
    if (raw == null || raw === "") continue
    const t = stripBom(String(raw)).trim()
    if (t.length > 0) return t
  }
  return ""
}

/**
 * Handshake GET Meta (Cloud API): hub.mode=subscribe, hub.verify_token, hub.challenge.
 * Sucesso: 200, corpo = apenas hub.challenge, text/plain.
 */
export function metaWebhookHandshakeGetResponse(url: URL): Response {
  const mode = (url.searchParams.get("hub.mode") ?? "").trim().toLowerCase()
  const token = (url.searchParams.get("hub.verify_token") ?? "").trim()
  const challenge = (url.searchParams.get("hub.challenge") ?? "").trim()

  const isHandshake = mode === "subscribe" && challenge.length > 0

  if (!isHandshake) {
    return NextResponse.json({
      ok: true,
      service: "webhooks/whatsapp",
      hint: "Meta GET: hub.mode=subscribe, hub.verify_token (igual ao WHATSAPP_VERIFY_TOKEN na Vercel), hub.challenge.",
    })
  }

  const verifyToken = resolveWhatsAppWebhookVerifyToken()
  if (!verifyToken) {
    return new NextResponse("misconfigured: WHATSAPP_VERIFY_TOKEN empty", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (token !== verifyToken) {
    return new NextResponse("verify_token mismatch", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
  })
}
