import { after } from "next/server"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { metaWebhookHandshakeGetResponse } from "@/lib/whatsapp-meta-handshake"
import {
  isMetaCloudIngressBody,
  META_WEBHOOK_MAX_BODY_BYTES,
  verifyMetaXHubSignature256,
} from "@/lib/whatsapp-meta-webhook-signature"
import { processMetaWhatsAppWebhookPayload } from "@/lib/whatsapp-meta-cloud-webhook"
import { corsHeaders, withCors } from "@/lib/api-cors"
import { extractFromEvolutionLikePayload } from "@/lib/whatsapp-webhook-parse"
import { processOwnerWhatsAppAI } from "@/lib/whatsapp-webhook-ai"
import { logWebhookPayload, webhookDefaultStoreId } from "@/lib/whatsapp/whatsapp-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const mode = (url.searchParams.get("hub.mode") ?? "").trim().toLowerCase()
  const challenge = (url.searchParams.get("hub.challenge") ?? "").trim()
  if (mode === "subscribe" && challenge.length > 0) {
    return metaWebhookHandshakeGetResponse(url)
  }

  const res = NextResponse.json({
    ok: true,
    service: "whatsapp-webhook",
    hint:
      "POST JSON — payloads são registrados em whatsapp_automation_logs (ação webhook_ingress). Cloud API: configure WHATSAPP_VERIFY_TOKEN para o handshake GET hub.*.",
    legacyAi:
      "Evolution/Baileys: defina WHATSAPP_WEBHOOK_LEGACY_AI=true para acionar o processamento anterior (processOwnerWhatsAppAI). Por padrão apenas logging.",
    meta:
      "Meta GET: envie hub.mode=subscribe, hub.verify_token e hub.challenge conforme documentação.",
    metaUrl:
      "URL canônica na Meta: /api/webhooks/whatsapp (rewrite interno para esta rota se o segmento webhooks não existir no deploy).",
    auth: "Opcional: ?token= ou x-webhook-token se ASSISTEC_WHATSAPP_WEBHOOK_SECRET estiver definido.",
  })
  return withCors(request, res)
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}

async function handleMetaCloudPost(request: Request, raw: string): Promise<Response> {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || ""
  const sig = request.headers.get("x-hub-signature-256")

  if (raw.length > META_WEBHOOK_MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  if (secret && !verifyMetaXHubSignature256(raw, sig, secret)) {
    after(async () => {
      try {
        await prisma.logsAuditoria.create({
          data: {
            action: "whatsapp_meta_webhook_bad_signature",
            userLabel: "meta",
            detail: "Assinatura X-Hub-Signature-256 inválida ou ausente (processamento ignorado).",
            source: "webhook",
          },
        })
      } catch {
        /* ignore */
      }
    })
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  let parsed: unknown = null
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  after(async () => {
    try {
      if (parsed !== null) await processMetaWhatsAppWebhookPayload(parsed)
    } catch {
      /* nunca propagar — webhook já respondeu 200 */
    }
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "")

  let parsed: unknown = null
  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }

  if (isMetaCloudIngressBody(parsed)) {
    return handleMetaCloudPost(request, raw)
  }

  if (!verifyWebhookSecret(request)) {
    return withCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
  }

  const body = parsed
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
