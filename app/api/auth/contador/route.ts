import { createHash, timingSafeEqual } from "node:crypto"
import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import {
  CONTADOR_COOKIE,
  buildContadorLogoutCookieOptions,
  buildContadorSessionCookieOptions,
  createContadorSessionToken,
  extractClientIp,
  hashIp,
  logContadorAuthEvent,
  resolveLegacyPortalEnabled,
  verifyContadorSessionToken,
} from "@/lib/contador/auth/legacy-session"
import {
  checkContadorRateLimit,
  registerContadorAuthFailure,
  registerContadorAuthSuccess,
} from "@/lib/contador/auth/rate-limit"

const AUTH_PATH = "/api/auth/contador"

/** `null` quando `CONTADOR_PIN` ou `CONTADOR_SESSION_SECRET` não estão configurados — fail-closed, sem PIN default. */
function resolveConfig(): { pin: string; secret: string } | null {
  const pin = process.env.CONTADOR_PIN?.trim()
  const secret = process.env.CONTADOR_SESSION_SECRET?.trim()
  if (!pin || !secret) return null
  return { pin, secret }
}

/** SHA-256 dos dois lados antes de `timingSafeEqual` — evita comparação direta de string secreta e garante buffers do mesmo tamanho. */
function pinMatches(received: string, expected: string): boolean {
  const receivedHash = createHash("sha256").update(received, "utf8").digest()
  const expectedHash = createHash("sha256").update(expected, "utf8").digest()
  return timingSafeEqual(receivedHash, expectedHash)
}

async function currentIpHash(): Promise<string> {
  const h = await headers()
  return hashIp(extractClientIp(h))
}

export async function GET() {
  const portalEnabled = resolveLegacyPortalEnabled()
  if (!portalEnabled) {
    return NextResponse.json({ authenticated: false, portalEnabled: false })
  }
  const config = resolveConfig()
  if (!config) {
    return NextResponse.json({ authenticated: false, portalEnabled: true })
  }
  const jar = await cookies()
  const result = await verifyContadorSessionToken(jar.get(CONTADOR_COOKIE)?.value, config.secret)
  return NextResponse.json({ authenticated: result.ok, portalEnabled: true })
}

export async function POST(request: Request) {
  const ipHash = await currentIpHash()
  logContadorAuthEvent("contador_auth_attempt", { ipHash, path: AUTH_PATH })

  if (!resolveLegacyPortalEnabled()) {
    logContadorAuthEvent("contador_auth_disabled", { ipHash, path: AUTH_PATH, reasonCode: "portal_off" })
    return NextResponse.json({ error: "portal_disabled" }, { status: 503 })
  }

  const config = resolveConfig()
  if (!config) {
    logContadorAuthEvent("contador_auth_disabled", { ipHash, path: AUTH_PATH, reasonCode: "misconfigured" })
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }

  const limit = checkContadorRateLimit(ipHash)
  if (limit.limited) {
    logContadorAuthEvent("contador_auth_rate_limited", { ipHash, path: AUTH_PATH })
    const res = NextResponse.json({ error: "rate_limited" }, { status: 429 })
    res.headers.set("Retry-After", String(limit.retryAfterSeconds))
    return res
  }

  let body: { pin?: unknown } = {}
  try {
    body = (await request.json()) as { pin?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const received = typeof body.pin === "string" ? body.pin : ""
  const valid = received.length > 0 && pinMatches(received, config.pin)

  if (!valid) {
    registerContadorAuthFailure(ipHash)
    logContadorAuthEvent("contador_auth_failed", { ipHash, path: AUTH_PATH })
    return NextResponse.json({ error: "invalid_pin" }, { status: 401 })
  }

  registerContadorAuthSuccess(ipHash)
  logContadorAuthEvent("contador_auth_success", { ipHash, path: AUTH_PATH })

  const token = await createContadorSessionToken(config.secret)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(buildContadorSessionCookieOptions(token))
  return res
}

export async function DELETE() {
  const ipHash = await currentIpHash()
  logContadorAuthEvent("contador_auth_logout", { ipHash, path: AUTH_PATH })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(buildContadorLogoutCookieOptions())
  return res
}
