/**
 * Rota de diagnóstico: envia uma mensagem de texto diretamente via
 * WhatsApp Cloud API (Graph API) e retorna o status bruto da Meta.
 *
 * POST /api/debug/whatsapp-send-test?secret=<ASSISTEC_MASTER_PASSWORD>
 * Body: { "to": "5514998568812", "body": "Mensagem de teste" }
 *
 * SEGURANÇA:
 * - Requer ?secret= igual a ASSISTEC_MASTER_PASSWORD ou ASSISTEC_DEBUG_SECRET.
 * - Nunca retorna access token completo no response.
 * - Logs não expõem token.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function checkSecret(req: Request): boolean {
  const url = new URL(req.url)
  const provided = (url.searchParams.get("secret") ?? "").trim()
  if (!provided) return false
  const master = (process.env.ASSISTEC_MASTER_PASSWORD ?? "").trim()
  const debug  = (process.env.ASSISTEC_DEBUG_SECRET ?? "").trim()
  return !!(master && provided === master) || !!(debug && provided === debug)
}

function maskToken(t: string | undefined): string {
  if (!t) return "(empty)"
  return t.length > 12 ? `${t.slice(0, 6)}...${t.slice(-4)}` : "***"
}

export async function POST(req: Request) {
  if (!checkSecret(req)) {
    return NextResponse.json({ error: "Unauthorized — inclua ?secret= na URL" }, { status: 401 })
  }

  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
  const accessToken   = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim()
  const apiVersion    = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim()

  if (!phoneNumberId) {
    return NextResponse.json({ ok: false, error: "WHATSAPP_PHONE_NUMBER_ID não configurado na Vercel" }, { status: 503 })
  }
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "WHATSAPP_ACCESS_TOKEN não configurado na Vercel" }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON inválido" }, { status: 400 })
  }

  const o = body as Record<string, unknown>
  const to   = String(o.to   ?? "").replace(/\D/g, "").trim()
  const text = String(o.body ?? "").trim()

  if (!to || to.length < 8 || to.length > 15) {
    return NextResponse.json({
      ok: false,
      error: "Campo `to` inválido. Use DDI + número com somente dígitos (8–15 chars). Ex.: 5514998568812",
    }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ ok: false, error: "Campo `body` vazio" }, { status: 400 })
  }

  const graphUrl = `https://graph.facebook.com/${apiVersion}/` + encodeURIComponent(phoneNumberId) + "/messages"
  const payload  = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  }

  const started = Date.now()
  let graphStatus = 0
  let graphBody: unknown = null
  let graphError: string | null = null

  try {
    const res = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
    graphStatus = res.status
    graphBody   = await res.json().catch(() => null)
  } catch (e) {
    graphError = e instanceof Error ? e.message : String(e)
  }

  const elapsed = Date.now() - started

  // Audit log (sem token)
  try {
    await prisma.logsAuditoria.create({
      data: {
        action: "whatsapp_debug_send_test",
        userLabel: `to:${to.slice(0, 4)}****${to.slice(-4)}`,
        detail: JSON.stringify({
          to: `${to.slice(0, 4)}****${to.slice(-4)}`,
          text: text.slice(0, 80),
          graphStatus,
          elapsed,
          error: graphError,
        }),
        source: "debug",
      },
    })
  } catch {
    /* audit log é best-effort */
  }

  const gBody = graphBody as Record<string, unknown> | null
  const wamid = (gBody?.messages as Array<{ id?: string }>)?.[0]?.id ?? null
  const metaError = (gBody?.error as { message?: string; code?: number } | undefined) ?? null

  return NextResponse.json({
    ok: graphStatus >= 200 && graphStatus < 300 && !graphError,
    sent: {
      to:      `${to.slice(0, 4)}****${to.slice(-4)}`,
      textLen: text.length,
    },
    meta: {
      status:     graphStatus,
      accepted:   graphStatus === 200 && !!wamid,
      wamid,
      error:      metaError,
      rawError:   graphError,
      elapsed_ms: elapsed,
    },
    config: {
      phoneNumberId: phoneNumberId.length > 6
        ? `${phoneNumberId.slice(0, 4)}***${phoneNumberId.slice(-3)}`
        : "***",
      accessTokenMasked: maskToken(accessToken),
      graphUrl: graphUrl.replace(accessToken, "[TOKEN]"),
      apiVersion,
    },
  })
}
