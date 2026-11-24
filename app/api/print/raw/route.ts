import { requireModuleApi } from "@/lib/auth/module-access"
import { NextResponse } from "next/server"
import { isIP, Socket } from "net"

/**
 * Envia bytes ESC/POS por TCP para impressora raw (JetDirect / porta 9100).
 *
 * Destino fixado pelo servidor em THERMAL_PRINT_HOST / THERMAL_PRINT_PORT.
 *
 * Se THERMAL_PRINT_HTTP_URL estiver definido (ex.: bridge HTTP), usa POST em vez de TCP.
 *
 * Restrito à plataforma. USB usa Omni Print; nunca presume localhost na Vercel.
 */
function sendTcp(host: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = new Socket()
    const t = setTimeout(() => {
      s.destroy()
      reject(new Error("Timeout ao enviar para impressora"))
    }, 12_000)
    s.once("error", (e) => {
      clearTimeout(t)
      reject(e)
    })
    s.connect(port, host, () => {
      s.write(data, (err) => {
        if (err) {
          clearTimeout(t)
          s.destroy()
          reject(err)
          return
        }
        s.end()
      })
    })
    s.once("close", () => {
      clearTimeout(t)
      resolve()
    })
  })
}

function sanitizePrintHost(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const h = raw.trim().toLowerCase()
  if (!h || h.length > 253) return null
  return isIP(h) || /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h) ? h : null
}

function printPort(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null
}

function cloudLoopback(host: string): boolean {
  const cloud = process.env.VERCEL === "1" || ["preview", "production"].includes(process.env.VERCEL_ENV ?? "")
  if (!cloud) return false
  let bare = host.replace(/^\[|\]$/g, "")
  try { bare = new URL(`http://${bare.includes(":") ? `[${bare}]` : bare}`).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "") }
  catch { return true }
  return bare === "localhost" || bare.endsWith(".localhost") || bare === "::1" || bare === "::" || bare === "0.0.0.0" ||
    /^127\./.test(bare) || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(bare)
}

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "platform")
  if (moduleDenied) return moduleDenied

  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ ok: false, error: "Content-Type application/json obrigatório" }, { status: 415 })
  }
  const origin = req.headers.get("origin"), site = req.headers.get("sec-fetch-site")
  if ((origin && origin !== new URL(req.url).origin) || (site && site !== "same-origin" && site !== "none")) {
    return NextResponse.json({ ok: false, error: "Origem não autorizada" }, { status: 403 })
  }

  let body: { data?: unknown; host?: unknown; port?: unknown }
  try {
    body = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_BODY")
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }
  if (!body.data || typeof body.data !== "string") {
    return NextResponse.json({ ok: false, error: "Campo data (base64) obrigatório" }, { status: 400 })
  }

  if (body.data.length > 4 * Math.ceil(65_536 / 3)) {
    return NextResponse.json({ ok: false, error: "Comprovante acima do limite de bytes" }, { status: 413 })
  }
  const buf = Buffer.from(body.data, "base64")
  if (!buf.length || buf.toString("base64") !== body.data) {
    return NextResponse.json({ ok: false, error: "Base64 inválido" }, { status: 400 })
  }
  if (buf.length > 65_536) return NextResponse.json({ ok: false, error: "Comprovante acima do limite de bytes" }, { status: 413 })

  const httpBridge = process.env.THERMAL_PRINT_HTTP_URL?.trim()
  const host = sanitizePrintHost(process.env.THERMAL_PRINT_HOST)
  const port = printPort(process.env.THERMAL_PRINT_PORT?.trim() || 9100)
  let bridge: URL | null = null
  if (httpBridge) {
    try { bridge = new URL(httpBridge) } catch { /* invalid server configuration stays closed */ }
    if (!bridge || !["https:", "http:"].includes(bridge.protocol) || bridge.username || bridge.password || cloudLoopback(bridge.hostname)) {
      return NextResponse.json({ ok: false, error: "Bridge de impressão inválida no servidor" }, { status: 503 })
    }
  } else if (!host || !port || cloudLoopback(host)) {
    return NextResponse.json({ ok: false, error: "Impressora de rede não configurada no servidor. Para USB, configure o agente Omni Print." }, { status: 503 })
  }
  // The browser cannot turn this platform-only endpoint into an arbitrary TCP/HTTP relay.
  const expectedHost = host ?? bridge?.hostname
  const expectedPort = host ? port : Number(bridge?.port || (bridge?.protocol === "https:" ? 443 : 80))
  if ((body.host !== undefined && sanitizePrintHost(body.host) !== expectedHost) ||
      (body.port !== undefined && printPort(body.port) !== expectedPort)) {
    return NextResponse.json({ ok: false, error: "Destino de impressão não autorizado" }, { status: 403 })
  }

  try {
    if (bridge) {
      const r = await fetch(bridge.href, {
        method: "POST",
        body: buf,
        headers: { "Content-Type": "application/octet-stream" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12_000),
      })
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: "A bridge não confirmou o envio. Confira a fila antes de solicitar outra via." },
          { status: 502 }
        )
      }
      return NextResponse.json({ ok: true })
    }

    await sendTcp(host!, port!, buf)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false, error: "O transporte não confirmou o envio. Confira a fila antes de solicitar outra via." }, { status: 502 })
  }
}
