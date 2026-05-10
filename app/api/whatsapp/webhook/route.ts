import { after } from "next/server"
import { NextResponse, type NextRequest } from "next/server"
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

/**
 * TEMP: `true` = todo GET retorna só o probe (prova se query chega na Vercel). Desligar após diagnóstico.
 * Ou defina env WHATSAPP_META_GET_FORCE_PROBE=0 em produção sem novo deploy (se preferir).
 */
const FORCE_META_GET_URL_PROBE =
  process.env.WHATSAPP_META_GET_FORCE_PROBE !== "0" && process.env.WHATSAPP_META_GET_FORCE_PROBE !== "false"

export async function GET(request: NextRequest) {
  if (FORCE_META_GET_URL_PROBE) {
    const probe = NextResponse.json({
      phase: "meta_get_forced_probe",
      rawUrl: request.url,
      nextUrl: request.nextUrl.href,
      entries: Object.fromEntries(request.nextUrl.searchParams.entries()),
    })
    probe.headers.set("Cache-Control", "private, no-store, max-age=0")
    return withCors(request, probe)
  }

  return whatsAppWebhookGetAfterProbe(request)
}

/** Handshake Meta + diagnóstico (ativo quando `WHATSAPP_META_GET_FORCE_PROBE` é `0` ou `false`). */
async function whatsAppWebhookGetAfterProbe(request: NextRequest) {
  // Usar nextUrl.searchParams (não só `new URL(request.url)`): em produção/Vercel a query
  // às vezes não entra no handshake Meta e cai no JSON de diagnóstico.
  const sp = request.nextUrl.searchParams
  const mode = (sp.get("hub.mode") ?? "").trim().toLowerCase()
  const challenge = (sp.get("hub.challenge") ?? "").trim()
  const verifyToken = (sp.get("hub.verify_token") ?? "").trim()
  const entries = Object.fromEntries(sp.entries())

  let urlFromRequest: URL | null = null
  try {
    urlFromRequest = new URL(request.url)
  } catch {
    urlFromRequest = null
  }
  const entriesFromRequestUrl = urlFromRequest
    ? Object.fromEntries(urlFromRequest.searchParams.entries())
    : {}

  const subscribeOk = mode === "subscribe"
  const challengeOk = challenge.length > 0
  const handshakeWouldRun = subscribeOk && challengeOk

  if (!handshakeWouldRun) {
    console.warn(
      "[whatsapp-webhook:GET:meta-handshake-miss]",
      JSON.stringify({
        requestUrl: request.url,
        nextUrlHref: request.nextUrl.href,
        nextUrlEntries: entries,
        requestUrlEntries: entriesFromRequestUrl,
        mode,
        challengeLength: challenge.length,
        subscribeOk,
        challengeOk,
      })
    )
  }

  if (handshakeWouldRun) {
    return metaWebhookHandshakeGetResponse(request.nextUrl)
  }

  // TEMP: diagnóstico produção — remover após confirmar query na Vercel (substitui JSON genérico).
  const diag = NextResponse.json({
    phase: "meta_get_diagnostic",
    mode,
    challenge,
    verifyToken,
    entries,
    subscribeOk,
    challengeOk,
    requestUrl: request.url,
    nextUrlHref: request.nextUrl.href,
    entriesFromRequestUrl,
  })
  diag.headers.set("Cache-Control", "private, no-store, max-age=0")
  return withCors(request, diag)
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
