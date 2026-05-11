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
export const runtime    = "nodejs"
export const dynamic    = "force-dynamic"
export const revalidate = 0
// 30s: resposta é imediata; after() tem seu próprio budget — valor garante que a
// Vercel não cancela a invocação antes do after() persistir no banco.
export const maxDuration = 30

// ─── GET — handshake Meta ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const getTs = Date.now()

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

  console.info("[whatsapp-webhook:GET:HIT]", JSON.stringify({
    ts:           new Date(getTs).toISOString(),
    url:          request.url,
    hasSignal,
    mode:         mode || null,
    hasToken:     token.length > 0,
    tokenLen:     token.length,
    hasChallenge: challenge.length > 0,
    userAgent:    (request.headers.get("user-agent") ?? "").slice(0, 80) || null,
    ip:           request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null,
  }))

  if (!hasSignal) {
    return NextResponse.json({
      ok:      true,
      service: "webhooks/whatsapp",
      ts:      new Date().toISOString(),
      hint:    "Meta espera hub.mode=subscribe, hub.verify_token, hub.challenge",
    })
  }

  const verifyToken = resolveWhatsAppWebhookVerifyToken()
  if (!verifyToken) {
    console.error("[whatsapp-webhook:GET:NO_VERIFY_TOKEN] WHATSAPP_VERIFY_TOKEN vazio — verificar env Vercel")
    return new Response("misconfigured: WHATSAPP_VERIFY_TOKEN empty", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (mode !== "subscribe" || !challenge) {
    console.warn("[whatsapp-webhook:GET:BAD_REQUEST] mode=%s hasChallenge=%s", mode, !!challenge)
    return new Response("bad_request", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (token !== verifyToken) {
    console.warn("[whatsapp-webhook:GET:TOKEN_MISMATCH]", JSON.stringify({
      receivedLen:  token.length,
      expectedLen:  verifyToken.length,
      receivedHead: token.slice(0, 4) || "(empty)",
      expectedHead: verifyToken.slice(0, 4) || "(empty)",
      hint: "Verificar WHATSAPP_VERIFY_TOKEN na Vercel — deve ser idêntico ao campo 'Verify token' no painel Meta",
    }))
    return new Response("verify_token mismatch", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  const elapsed = Date.now() - getTs
  console.info("[whatsapp-webhook:GET:HANDSHAKE_OK]", JSON.stringify({
    elapsed_ms:    elapsed,
    challengeLen:  challenge.length,
  }))
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

// Safe headers to log (never includes auth/cookie/secret values)
const SAFE_HEADERS_TO_LOG = [
  "content-type",
  "content-length",
  "user-agent",
  "x-hub-signature-256",
  "x-forwarded-for",
  "x-real-ip",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-vercel-id",
  "x-vercel-proxied-for",
  "x-vercel-deployment-url",
  "cf-ray",
  "cf-connecting-ip",
  "origin",
  "host",
  "accept",
]

export async function POST(request: Request) {
  const hitTs = Date.now()

  // ⚡ Log absoluto — PRIMEIRA instrução executada, antes de qualquer validação
  // Se este log NÃO aparece nos logs Vercel, a requisição nunca chegou ao runtime.
  // Causas possíveis: Vercel Deployment Protection, WAF/Firewall na edge, redirect 30x.
  const safeHeaders: Record<string, string> = {}
  for (const h of SAFE_HEADERS_TO_LOG) {
    const v = request.headers.get(h)
    if (v) {
      // Mask x-hub-signature-256 value (keep prefix only)
      safeHeaders[h] = h === "x-hub-signature-256" ? `sha256=${v.slice(7, 15)}…(masked)` : v
    }
  }

  console.info("[whatsapp-webhook:POST:HIT]", JSON.stringify({
    ts:          new Date(hitTs).toISOString(),
    method:      "POST",
    url:         request.url,
    path:        "/api/webhooks/whatsapp",
    runtime:     "nodejs",
    headers:     safeHeaders,
  }))

  const raw = await request.text().catch(() => "")

  let parsed: unknown = null
  try { parsed = raw.length > 0 ? JSON.parse(raw) : null } catch { parsed = null }

  // ── Log estrutural antecipado (antes da assinatura) ──────────────────────────
  {
    const p = parsed as {
      object?: string
      entry?: Array<{
        id?: string
        changes?: Array<{
          field?: string
          value?: {
            contacts?: unknown[]
            messages?: Array<{ from?: string; type?: string; id?: string }>
            statuses?: unknown[]
          }
        }>
      }>
    } | null

    const firstChange   = p?.entry?.[0]?.changes?.[0]
    const msgs          = firstChange?.value?.messages ?? []
    const statuses      = firstChange?.value?.statuses ?? []
    const from          = typeof msgs[0]?.from === "string" ? msgs[0].from : ""
    const fromMasked    = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : (from ? "****" : null)

    console.info("[whatsapp-webhook:POST:STRUCTURE]", JSON.stringify({
      bodyLen:      raw.length,
      isMetaShape:  isMetaCloudIngressBody(parsed),
      object:       p?.object ?? null,
      entryLen:     p?.entry?.length ?? 0,
      changesLen:   (p?.entry?.[0]?.changes?.length ?? 0),
      field:        firstChange?.field ?? null,
      messagesLen:  msgs.length,
      statusesLen:  statuses.length,
      fromMasked,
      msgType:      msgs[0]?.type ?? null,
      wamid:        msgs[0]?.id ?? null,
    }))
  }

  const isMetaBody = isMetaCloudIngressBody(parsed)
  if (!isMetaBody) {
    console.info("[whatsapp-webhook:POST:NOT_META_BODY] ignorando payload não-Meta, retornando 200")
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Body size guard ──────────────────────────────────────────────────────────
  if (raw.length > META_WEBHOOK_MAX_BODY_BYTES) {
    console.warn("[whatsapp-webhook:POST:BODY_TOO_LARGE] bodyLen=%d limit=%d", raw.length, META_WEBHOOK_MAX_BODY_BYTES)
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── Verificação de assinatura ────────────────────────────────────────────────
  const appSecret = (
    process.env.WHATSAPP_APP_SECRET?.trim() ??
    process.env.META_APP_SECRET?.trim() ??
    ""
  )
  const sigHeader = request.headers.get("x-hub-signature-256")

  let sigPassed = true // sem segredo configurado = bypass
  if (appSecret) {
    sigPassed = verifyMetaXHubSignature256(raw, sigHeader, appSecret)
    console.info("[whatsapp-webhook:POST:SIG_CHECK] ok=%s hasSig=%s", sigPassed, !!sigHeader)

    if (!sigPassed) {
      // ⚠ Log explícito de falha de assinatura — visível nos logs Vercel
      console.warn("[whatsapp-webhook:SIGNATURE_FAIL]", JSON.stringify({
        hasSig:        !!sigHeader,
        sigPrefix:     sigHeader?.slice(0, 25) ?? null,
        hasAppSecret:  true,
        hint:          "Verificar WHATSAPP_APP_SECRET na Vercel vs App Secret no Meta Business Manager",
      }))
      after(async () => {
        try {
          await prisma.logsAuditoria.create({
            data: {
              action:    "whatsapp_meta_webhook_bad_signature",
              userLabel: "meta",
              detail:    "X-Hub-Signature-256 inválida — payload NÃO salvo. Verificar WHATSAPP_APP_SECRET.",
              source:    "webhook",
            },
          })
        } catch { /* best-effort */ }
      })
      // ← Retorna 200 para Meta não reenviar; NÃO processa/salva
      return NextResponse.json({ ok: true }, { status: 200 })
    }
  } else {
    console.warn("[whatsapp-webhook:POST:NO_APP_SECRET] WHATSAPP_APP_SECRET vazio — assinatura NÃO verificada, processando assim mesmo")
  }

  // ── Processar payload em background ──────────────────────────────────────────
  after(async () => {
    try {
      if (parsed === null) return

      const p = parsed as {
        object?: string
        entry?: Array<{
          id?: string
          changes?: Array<{
            field?: string
            value?: {
              contacts?: unknown[]
              messages?: Array<{ from?: string; type?: string; id?: string }>
              statuses?: unknown[]
            }
          }>
        }>
      }
      const firstChange = p.entry?.[0]?.changes?.[0]
      const msgs        = firstChange?.value?.messages ?? []
      const statuses    = firstChange?.value?.statuses ?? []
      const contacts    = firstChange?.value?.contacts ?? []
      const from        = typeof msgs[0]?.from === "string" ? msgs[0].from : ""
      const fromMasked  = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : "****"

      console.info("[whatsapp-webhook:POST:PROCESS]", JSON.stringify({
        object:       p.object ?? "?",
        wabaId:       p.entry?.[0]?.id ?? "?",
        entryLen:     p.entry?.length ?? 0,
        changesLen:   p.entry?.[0]?.changes?.length ?? 0,
        field:        firstChange?.field ?? "?",
        messagesLen:  msgs.length,
        statusesLen:  statuses.length,
        contactsLen:  contacts.length,
        fromMasked:   msgs.length > 0 ? fromMasked : null,
        msgType:      msgs[0]?.type ?? null,
        wamid:        msgs[0]?.id ?? null,
        sigPassed,
      }))

      const processStart = Date.now()
      await processMetaWhatsAppWebhookPayload(parsed)
      console.info("[whatsapp-webhook:POST:DONE]", JSON.stringify({
        elapsed_ms: Date.now() - processStart,
      }))
    } catch (e) {
      console.error("[whatsapp-webhook:POST:ERROR]", JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? (e.stack ?? "").split("\n").slice(0, 4).join(" | ") : null,
      }))
    }
  })

  const responseTs = Date.now()
  console.info("[whatsapp-webhook:POST:RESPOND]", JSON.stringify({
    status:     200,
    elapsed_ms: responseTs - hitTs,
  }))
  return NextResponse.json({ ok: true }, { status: 200 })
}
