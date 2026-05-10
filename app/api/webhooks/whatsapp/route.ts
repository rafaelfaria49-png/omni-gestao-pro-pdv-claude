import { createHmac, timingSafeEqual } from "crypto"
import { after } from "next/server"
import { NextResponse } from "next/server"
import { metaWebhookHandshakeGetResponse } from "@/lib/whatsapp-meta-handshake"
import { processMetaWhatsAppWebhookPayload } from "@/lib/whatsapp-meta-cloud-webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const MAX_RAW = 2_000_000

function verifyMetaSignature(rawBody: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`
  try {
    const a = Buffer.from(sigHeader, "utf8")
    const b = Buffer.from(expected, "utf8")
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  return metaWebhookHandshakeGetResponse(url)
}

export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || ""
  const sig = request.headers.get("x-hub-signature-256")

  const raw = await request.text().catch(() => "")
  if (raw.length > MAX_RAW) {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  if (secret && !verifyMetaSignature(raw, sig, secret)) {
    after(async () => {
      try {
        const { prisma } = await import("@/lib/prisma")
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
