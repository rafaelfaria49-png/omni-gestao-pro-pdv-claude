import { NextResponse, type NextRequest } from "next/server"

/**
 * Rota isolada de verificação Meta WhatsApp Cloud API (handshake GET).
 *
 * Existe **apenas para validar** que a query do Meta está chegando no servidor
 * em produção (Vercel) e que o env `WHATSAPP_VERIFY_TOKEN` está presente — sem
 * passar por qualquer middleware/handler legado de webhook (`/api/whatsapp/webhook`).
 *
 *  - Sem POST
 *  - Sem ingress Evolution
 *  - Sem CORS, sem auth secret, sem logs de auditoria
 *  - Sem fallback JSON quando o handshake é válido
 *
 * Uso (Meta Business → WhatsApp → Configuration → Webhook):
 *   Callback URL: https://omni-gestao-pro.vercel.app/api/meta-whatsapp-verify
 *   Verify token: <mesmo valor de WHATSAPP_VERIFY_TOKEN na Vercel>
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "")
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const mode = (sp.get("hub.mode") ?? "").trim().toLowerCase()
  const token = (sp.get("hub.verify_token") ?? "").trim()
  const challenge = (sp.get("hub.challenge") ?? "").trim()

  const verifyTokenRaw = process.env.WHATSAPP_VERIFY_TOKEN ?? ""
  const verifyToken = stripBom(String(verifyTokenRaw)).trim()

  if (!mode && !token && !challenge) {
    return NextResponse.json(
      {
        ok: false,
        reason: "missing_params",
        received: Object.fromEntries(sp.entries()),
        expected: ["hub.mode=subscribe", "hub.verify_token=<token>", "hub.challenge=<value>"],
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }

  if (!verifyToken) {
    return new Response("missing WHATSAPP_VERIFY_TOKEN", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    })
  }

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json(
      {
        ok: false,
        reason: "bad_params",
        received: { mode, hasChallenge: challenge.length > 0, hasToken: token.length > 0 },
        expected: ["hub.mode=subscribe", "hub.challenge=<value>"],
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }

  if (token !== verifyToken) {
    return new Response("verify_token mismatch", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    })
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  })
}
