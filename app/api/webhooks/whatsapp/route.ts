/**
 * Rota standalone /api/webhooks/whatsapp — URL registrada no Meta Business Manager.
 *
 * ⚠ NÃO é um re-export. Tem suas próprias declarações de `runtime`, `dynamic` e
 * `revalidate` para garantir que o Next.js as reconheça corretamente (re-exports
 * desses campos geram warning e são ignorados no Next.js 15/16).
 *
 * Toda a lógica de negócio é delegada aos helpers compartilhados — esta rota é apenas
 * o ponto de entrada para a Meta.
 */

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

// ─── Declarações INLINE obrigatórias (não podem vir de re-export) ─────────────
export const runtime  = "nodejs"
export const dynamic  = "force-dynamic"
export const revalidate = 0

// ─── GET — handshake Meta ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  let mode      = (sp.get("hub.mode")         ?? "").trim().toLowerCase()
  let token     = (sp.get("hub.verify_token") ?? "").trim()
  let challenge = (sp.get("hub.challenge")    ?? "").trim()

  // Fallback: nextUrl às vezes fica vazio em edge, tentar URL raw
  if (!mode && !token && !challenge) {
    try {
      const raw = new URL(request.url).searchParams
      mode      = (raw.get("hub.mode")         ?? "").trim().toLowerCase()
      token     = (raw.get("hub.verify_token") ?? "").trim()
      challenge = (raw.get("hub.challenge")    ?? "").trim()
    } catch { /* mantém vazios */ }
  }

  const hasSignal = mode.length > 0 || challenge.length > 0

  // Absolute log — aparece no Vercel Functions log
  console.log("[wh/whatsapp:GET]", JSON.stringify({
    path: "/api/webhooks/whatsapp",
    hasSignal,
    mode: mode || null,
    hasToken: token.length > 0,
    hasChallenge: challenge.length > 0,
  }))

  if (!hasSignal) {
    return NextResponse.json({
      ok: true,
      service: "webhooks/whatsapp",
      hint: "Meta espera hub.mode=subscribe, hub.verify_token, hub.challenge",
    })
  }

  const verifyToken = resolveWhatsAppWebhookVerifyToken()
  if (!verifyToken) {
    console.error("[wh/whatsapp:GET] WHATSAPP_VERIFY_TOKEN vazio — verificar env Vercel")
    return new Response("misconfigured: WHATSAPP_VERIFY_TOKEN empty", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (mode !== "subscribe" || !challenge) {
    console.warn("[wh/whatsapp:GET] bad_request: mode=%s challenge=%s", mode, !!challenge)
    return new Response("bad_request", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (token !== verifyToken) {
    console.warn("[wh/whatsapp:GET] verify_token mismatch — token recebido não bate com env")
    return new Response("verify_token mismatch", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  console.log("[wh/whatsapp:GET] handshake OK — respondendo challenge")
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
  })
}

// ─── OPTIONS ─────────────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Hub-Signature-256",
    },
  })
}

// ─── POST — recebimento de mensagens Meta ─────────────────────────────────────

export async function POST(request: Request) {
  // ⚡ Log absoluto — primeira linha executada, antes de QUALQUER processamento
  console.log("[wh/whatsapp:POST] received", JSON.stringify({
    ts: new Date().toISOString(),
    contentType: request.headers.get("content-type") ?? null,
    contentLength: request.headers.get("content-length") ?? null,
    hasSig: !!request.headers.get("x-hub-signature-256"),
    sigPrefix: request.headers.get("x-hub-signature-256")?.slice(0, 20) ?? null,
    userAgent: request.headers.get("user-agent")?.slice(0, 40) ?? null,
  }))

  const raw = await request.text().catch(() => "")

  let parsed: unknown = null
  try { parsed = raw.length > 0 ? JSON.parse(raw) : null } catch { parsed = null }

  const isMetaBody = isMetaCloudIngressBody(parsed)
  console.log("[wh/whatsapp:POST] isMetaCloudIngressBody=%s bodyLen=%d", isMetaBody, raw.length)

  if (!isMetaBody) {
    // Payload não é da Meta Cloud API — ignorar silenciosamente com 200
    console.log("[wh/whatsapp:POST] not a Meta Cloud body, returning 200 no-op")
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Verificação de assinatura ────────────────────────────────────────────────
  const appSecret = (
    process.env.WHATSAPP_APP_SECRET?.trim() ??
    process.env.META_APP_SECRET?.trim() ??
    ""
  )
  const sigHeader = request.headers.get("x-hub-signature-256")

  if (appSecret) {
    const sigOk = verifyMetaXHubSignature256(raw, sigHeader, appSecret)
    console.log("[wh/whatsapp:POST] signature check: ok=%s hasSig=%s", sigOk, !!sigHeader)

    if (!sigOk) {
      console.warn("[wh/whatsapp:POST] SIGNATURE MISMATCH — payload descartado. " +
        "Verificar WHATSAPP_APP_SECRET na Vercel vs App Secret no Meta Business Manager.")
      after(async () => {
        try {
          await prisma.logsAuditoria.create({
            data: {
              action:    "whatsapp_meta_webhook_bad_signature",
              userLabel: "meta",
              detail:    "X-Hub-Signature-256 inválida — payload descartado (WHATSAPP_APP_SECRET pode estar incorreto).",
              source:    "webhook",
            },
          })
        } catch { /* best-effort */ }
      })
      // Retornar 200 para a Meta (não tentar reenviar)
      return NextResponse.json({ ok: true }, { status: 200 })
    }
  } else {
    console.warn("[wh/whatsapp:POST] WHATSAPP_APP_SECRET não configurado — assinatura NÃO verificada")
  }

  // ── Processar payload em background ──────────────────────────────────────────
  after(async () => {
    try {
      if (parsed === null) return

      // Log estruturado do payload Meta
      const p = parsed as {
        object?: string
        entry?: Array<{
          id?: string
          changes?: Array<{
            field?: string
            value?: {
              contacts?: unknown[]
              messages?: Array<{ from?: string; type?: string; id?: string }>
            }
          }>
        }>
      }
      const firstChange = p.entry?.[0]?.changes?.[0]
      const msgs     = firstChange?.value?.messages ?? []
      const contacts = firstChange?.value?.contacts ?? []
      const from     = typeof msgs[0]?.from === "string" ? msgs[0].from : ""
      const fromMasked = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : "****"

      console.log("[wh/whatsapp:POST:payload]", JSON.stringify({
        object:      p.object ?? "?",
        wabaId:      p.entry?.[0]?.id ?? "?",
        field:       firstChange?.field ?? "?",
        contactsLen: contacts.length,
        messagesLen: msgs.length,
        fromMasked:  msgs.length > 0 ? fromMasked : null,
        msgType:     msgs[0]?.type ?? null,
        wamid:       msgs[0]?.id ?? null,
      }))

      await processMetaWhatsAppWebhookPayload(parsed)
      console.log("[wh/whatsapp:POST:payload] processMetaWhatsAppWebhookPayload completed")
    } catch (e) {
      console.error("[wh/whatsapp:POST:payload] error:", e instanceof Error ? e.message : String(e))
    }
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
