import { after } from "next/server"
import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveWhatsAppWebhookVerifyToken } from "@/lib/whatsapp-meta-handshake"
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
 * Lê os parâmetros do handshake Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`)
 * de forma robusta: tenta `request.nextUrl.searchParams` primeiro e cai em
 * `new URL(request.url).searchParams` caso o primeiro venha vazio (alguns deploys
 * Vercel já reportaram divergência entre os dois objetos).
 */
function readMetaHandshakeParams(request: NextRequest): {
  mode: string
  token: string
  challenge: string
  hasMetaSignal: boolean
} {
  const fromNextUrl = request.nextUrl.searchParams
  let mode = (fromNextUrl.get("hub.mode") ?? "").trim().toLowerCase()
  let token = (fromNextUrl.get("hub.verify_token") ?? "").trim()
  let challenge = (fromNextUrl.get("hub.challenge") ?? "").trim()

  if (!mode && !token && !challenge) {
    try {
      const fromRawUrl = new URL(request.url).searchParams
      mode = (fromRawUrl.get("hub.mode") ?? "").trim().toLowerCase()
      token = (fromRawUrl.get("hub.verify_token") ?? "").trim()
      challenge = (fromRawUrl.get("hub.challenge") ?? "").trim()
    } catch {
      /* mantém vazios */
    }
  }

  const hasMetaSignal = mode.length > 0 || challenge.length > 0
  return { mode, token, challenge, hasMetaSignal }
}

/**
 * GET — Handshake Meta WhatsApp Cloud API.
 *
 * **PRIMEIRA lógica absoluta**: se a query trouxer `hub.mode` ou `hub.challenge`,
 * resposta vai sempre por aqui (200/403/503), nunca por JSON debug/auth/fallback.
 *
 * Sucesso: 200, body = challenge puro, `Content-Type: text/plain; charset=utf-8`.
 */
export async function GET(request: NextRequest) {
  const { mode, token, challenge, hasMetaSignal } = readMetaHandshakeParams(request)

  if (hasMetaSignal) {
    const verifyToken = resolveWhatsAppWebhookVerifyToken()

    if (!verifyToken) {
      return new Response("misconfigured: WHATSAPP_VERIFY_TOKEN empty", {
        status: 503,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      })
    }

    if (mode !== "subscribe" || !challenge) {
      return new Response("bad_request: hub.mode must be 'subscribe' with hub.challenge", {
        status: 400,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      })
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

  // Sem qualquer sinal Meta — health-check humano (curl/navegador). Não interfere no handshake.
  const info = NextResponse.json({
    ok: true,
    service: "whatsapp-webhook",
    hint: "Meta GET espera hub.mode=subscribe, hub.verify_token=<WHATSAPP_VERIFY_TOKEN>, hub.challenge=<token-da-meta>",
  })
  info.headers.set("Cache-Control", "no-store, max-age=0")
  return withCors(request, info)
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
      if (parsed !== null) {
        // Log seguro: object, field, contacts count, messages count, from mascarado
        try {
          const p = parsed as {
            object?: string
            entry?: Array<{
              changes?: Array<{
                field?: string
                value?: {
                  contacts?: unknown[]
                  messages?: Array<{ from?: string; type?: string }>
                }
              }>
            }>
          }
          const changes = p.entry?.[0]?.changes ?? []
          const firstChange = changes[0]
          const msgs = firstChange?.value?.messages ?? []
          const contacts = firstChange?.value?.contacts ?? []
          const from = typeof msgs[0]?.from === "string" ? msgs[0].from : ""
          const fromMasked = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : "****"
          console.log("[whatsapp-webhook:POST:meta]", JSON.stringify({
            object: p.object ?? "?",
            field: firstChange?.field ?? "?",
            contactsLen: contacts.length,
            messagesLen: msgs.length,
            fromMasked: msgs.length > 0 ? fromMasked : null,
            msgType: msgs[0]?.type ?? null,
          }))
        } catch {
          console.log("[whatsapp-webhook:POST:meta] log-parse-error")
        }
        await processMetaWhatsAppWebhookPayload(parsed)
      }
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TESTE MANUAL — Handshake Meta WhatsApp (GET)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pré-requisitos locais (.env.local):
 *   WHATSAPP_VERIFY_TOKEN=omnigestao_webhook_2026
 *   # (aliases também aceitos: META_WHATSAPP_VERIFY_TOKEN, WHATSAPP_WEBHOOK_VERIFY_TOKEN)
 *
 * 1) Subir o dev:
 *    npm run dev
 *
 * 2) Disparar o GET de handshake (deve retornar EXATAMENTE "CHALLENGE", text/plain):
 *    curl "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=omnigestao_webhook_2026&hub.challenge=CHALLENGE"
 *
 *    Resposta esperada (status 200):
 *      Content-Type: text/plain; charset=utf-8
 *      Cache-Control: no-store, max-age=0
 *      Body:        CHALLENGE
 *
 * 3) Token errado → 403 + "verify_token mismatch"
 *    curl -i "http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=ERRADO&hub.challenge=CHALLENGE"
 *
 * 4) Sem env de token → 503 + "misconfigured: WHATSAPP_VERIFY_TOKEN empty"
 *
 * 5) Sem qualquer hub.* (health-check humano) → 200 + JSON {ok:true, service, hint}.
 *
 * 6) Mesma rota responde via alias histórico:
 *    curl "http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=omnigestao_webhook_2026&hub.challenge=CHALLENGE"
 * ─────────────────────────────────────────────────────────────────────────────
 */

