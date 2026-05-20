import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { corsHeaders, withCors } from "@/lib/api-cors"
import { extractFromEvolutionLikePayload } from "@/lib/whatsapp-webhook-parse"
import { processOwnerWhatsAppAI } from "@/lib/whatsapp-webhook-ai"
import { logWebhookPayload, webhookDefaultStoreId } from "@/lib/whatsapp/whatsapp-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function verifyWebhookSecret(request: Request): boolean {
  const secret = process.env.ASSISTEC_WHATSAPP_WEBHOOK_SECRET
  if (!secret) return true
  const header =
    request.headers.get("x-webhook-token") ??
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("token")
  return header === secret
}

const MAX_DETAIL = 4000

/** Meta Cloud API — verificação do webhook (GET). */
function metaVerifyResponse(url: URL): Response | null {
  const mode = url.searchParams.get("hub.mode")
  const token = url.searchParams.get("hub.verify_token")
  const challenge = url.searchParams.get("hub.challenge")
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim()

  if (mode === "subscribe" && challenge && verifyToken && token === verifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const meta = metaVerifyResponse(url)
  if (meta) return meta

  const res = NextResponse.json({
    ok: true,
    service: "whatsapp-webhook",
    hint:
      "POST JSON — payloads são registrados em whatsapp_automation_logs (ação webhook_ingress). Cloud API: configure WHATSAPP_VERIFY_TOKEN para o handshake GET hub.*.",
    legacyAi:
      "Evolution/Baileys: defina WHATSAPP_WEBHOOK_LEGACY_AI=true para acionar o processamento anterior (processOwnerWhatsAppAI). Por padrão apenas logging.",
    meta:
      "Meta GET: envie hub.mode=subscribe, hub.verify_token e hub.challenge conforme documentação.",
    auth: "Opcional: ?token= ou x-webhook-token se ASSISTEC_WHATSAPP_WEBHOOK_SECRET estiver definido.",
  })
  return withCors(request, res)
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request)) {
    return withCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return withCors(request, NextResponse.json({ error: "Invalid JSON" }, { status: 400 }))
  }

  const storeId = webhookDefaultStoreId()
  try {
    await logWebhookPayload(storeId, body)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.logsAuditoria.create({
      data: {
        action: "whatsapp_webhook_log_fail",
        userLabel: `store:${storeId}`,
        detail: msg.slice(0, MAX_DETAIL),
        source: "webhook",
      },
    })
    return withCors(request, NextResponse.json({ ok: false, error: "log_failed", detail: msg.slice(0, 200) }, { status: 500 }))
  }

  const runLegacy = process.env.WHATSAPP_WEBHOOK_LEGACY_AI === "true"
  if (!runLegacy) {
    return withCors(request, NextResponse.json({ ok: true, logged: true }))
  }

  const extracted = extractFromEvolutionLikePayload(body)
  if (!extracted) {
    return withCors(request, NextResponse.json({ ok: true, logged: true, legacy: "ignored" }))
  }

  try {
    await processOwnerWhatsAppAI(extracted)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.logsAuditoria.create({
      data: {
        action: "whatsapp_webhook_erro",
        userLabel: `wa:${extracted.fromDigits}`,
        detail: msg.slice(0, MAX_DETAIL),
        source: "webhook",
      },
    })
    return withCors(
      request,
      NextResponse.json({ ok: false, error: "handler", detail: msg.slice(0, 200) }, { status: 500 })
    )
  }

  return withCors(request, NextResponse.json({ ok: true, logged: true, legacy: "processed" }))
}
