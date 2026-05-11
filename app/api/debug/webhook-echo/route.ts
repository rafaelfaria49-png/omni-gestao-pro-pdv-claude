/**
 * GET/POST /api/debug/webhook-echo
 *
 * Rota de diagnóstico MÍNIMA — zero dependências externas (sem Prisma, sem auth, sem lib).
 * Propósito: confirmar que o Vercel recebe requisições externas na URL pública.
 *
 * USO:
 *   1. Aponte temporariamente o webhook Meta para esta URL:
 *      https://omni-gestao-pro.vercel.app/api/debug/webhook-echo
 *   2. A rota responde ao GET de verificação Meta (hub.mode, hub.verify_token, hub.challenge)
 *      usando o mesmo WHATSAPP_VERIFY_TOKEN da rota de produção.
 *   3. Envie uma mensagem real e confira se "[webhook-echo:POST]" aparece nos logs Vercel.
 *   4. Se aparecer → Vercel está recebendo, o problema é na rota de produção.
 *   5. Se NÃO aparecer → requisição está sendo bloqueada antes do runtime
 *      (Vercel Deployment Protection, WAF, IP block, etc.).
 *
 * SEGURANÇA: Apenas os headers seguros são logados. Nenhum dado é persistido.
 */

import { NextResponse } from "next/server"

export const runtime  = "nodejs"
export const dynamic  = "force-dynamic"
export const revalidate = 0

const SAFE_LOG_HEADERS = [
  "content-type",
  "content-length",
  "user-agent",
  "x-hub-signature-256",
  "x-forwarded-for",
  "x-real-ip",
  "x-forwarded-proto",
  "x-vercel-id",
  "x-vercel-proxied-for",
  "cf-ray",
  "cf-connecting-ip",
  "host",
  "origin",
]

function safeHeaderDump(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of SAFE_LOG_HEADERS) {
    const v = headers.get(h)
    if (v) {
      out[h] = h === "x-hub-signature-256" ? `${v.slice(0, 10)}…(masked)` : v
    }
  }
  return out
}

// ─── GET — Meta handshake (hub.mode + hub.verify_token + hub.challenge) ─────

export async function GET(request: Request) {
  const ts = new Date().toISOString()
  const url = new URL(request.url)

  const mode      = (url.searchParams.get("hub.mode")         ?? "").trim().toLowerCase()
  const token     = (url.searchParams.get("hub.verify_token") ?? "").trim()
  const challenge = (url.searchParams.get("hub.challenge")    ?? "").trim()

  const isHandshake = mode === "subscribe" && challenge.length > 0

  console.info("[webhook-echo:GET]", JSON.stringify({
    ts,
    url:          request.url,
    isHandshake,
    mode:         mode || null,
    hasToken:     token.length > 0,
    hasChallenge: challenge.length > 0,
    headers:      safeHeaderDump(request.headers),
  }))

  if (!isHandshake) {
    return NextResponse.json({
      ok:      true,
      service: "webhook-echo",
      ts,
      hint:    "Esta rota aceita GET de verificação Meta (hub.mode=subscribe) e POST de eventos. Usar temporariamente para diagnóstico.",
    })
  }

  // Respond to Meta verification using the same verify token as the production route
  const verifyToken = (
    process.env.WHATSAPP_VERIFY_TOKEN ??
    process.env.META_WHATSAPP_VERIFY_TOKEN ??
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ??
    ""
  ).replace(/^﻿/, "").trim()

  if (!verifyToken) {
    console.error("[webhook-echo:GET:NO_TOKEN] WHATSAPP_VERIFY_TOKEN não configurado")
    return new Response("misconfigured: WHATSAPP_VERIFY_TOKEN empty", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  if (token !== verifyToken) {
    console.warn("[webhook-echo:GET:TOKEN_MISMATCH]", JSON.stringify({
      receivedLen:  token.length,
      expectedLen:  verifyToken.length,
      receivedHead: token.slice(0, 4) || "(empty)",
      expectedHead: verifyToken.slice(0, 4) || "(empty)",
    }))
    return new Response("verify_token mismatch", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    })
  }

  console.info("[webhook-echo:GET:HANDSHAKE_OK]", JSON.stringify({ challengeLen: challenge.length }))
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

// ─── POST — echo do payload Meta ─────────────────────────────────────────────

export async function POST(request: Request) {
  const hitTs = Date.now()
  const ts    = new Date(hitTs).toISOString()

  // ⚡ Log ABSOLUTO — se este log NÃO aparecer nos logs Vercel após enviar mensagem real,
  // a requisição está sendo bloqueada ANTES do runtime Next.js.
  // Suspeitos: Vercel Deployment Protection, Vercel WAF, regra de IP, redirect 30x.
  console.info("[webhook-echo:POST:HIT]", JSON.stringify({
    ts,
    url:     request.url,
    runtime: "nodejs",
    headers: safeHeaderDump(request.headers),
  }))

  const raw = await request.text().catch(() => "")

  let parsed: unknown = null
  try { parsed = raw.length > 0 ? JSON.parse(raw) : null } catch { /* keep null */ }

  const p = parsed as {
    object?: string
    entry?: Array<{
      changes?: Array<{
        field?: string
        value?: {
          messages?: Array<{ from?: string; type?: string; id?: string }>
          statuses?: unknown[]
        }
      }>
    }>
  } | null

  const firstChange  = p?.entry?.[0]?.changes?.[0]
  const msgs         = firstChange?.value?.messages ?? []
  const from         = typeof msgs[0]?.from === "string" ? msgs[0].from : ""
  const fromMasked   = from.length > 6 ? `${from.slice(0, 4)}****${from.slice(-4)}` : (from ? "****" : null)

  console.info("[webhook-echo:POST:BODY]", JSON.stringify({
    bodyLen:      raw.length,
    object:       p?.object ?? null,
    entryLen:     p?.entry?.length ?? 0,
    field:        firstChange?.field ?? null,
    messagesLen:  msgs.length,
    statusesLen:  (firstChange?.value?.statuses ?? []).length,
    fromMasked,
    msgType:      msgs[0]?.type ?? null,
    wamid:        msgs[0]?.id?.slice(0, 30) ?? null,
  }))

  const elapsed = Date.now() - hitTs
  console.info("[webhook-echo:POST:RESPOND]", JSON.stringify({ status: 200, elapsed_ms: elapsed }))

  // Meta requires HTTP 200 response — return immediately
  return NextResponse.json({ ok: true }, { status: 200 })
}
