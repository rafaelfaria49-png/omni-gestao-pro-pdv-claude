import "server-only"
import { NextResponse } from "next/server"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { mercadoLivreConfig, MELI_OAUTH_COOKIE, MELI_STATE_TTL_MS, type MercadoLivreConfig } from "./config"
import { MeliFailure, meliFailure } from "./errors"

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" }

export function meliJson(data: object, status = 200, retryAfter?: number) {
  return NextResponse.json(data, { status, headers: {
    ...privateHeaders,
    ...(retryAfter !== undefined && { "Retry-After": String(retryAfter) }),
  } })
}

export function meliError(error: unknown) {
  const failure = meliFailure(error)
  return meliJson({ code: failure.code, error: failure.message }, failure.status, failure.retryAfter)
}

export function requireMeliConfig(req: Request, storeId: string) {
  const config = mercadoLivreConfig()
  if (!config?.storeIds.has(storeId)) throw new MeliFailure("not_configured")
  // A ação do navegador deve informar a unidade em um header não simples. As mutações
  // exigem ainda a origem exata cadastrada, independente de Host/X-Forwarded-Host.
  if (req.headers.get(ASSISTEC_LOJA_HEADER)?.trim() !== storeId || req.headers.get("Origin") !== config.origin) {
    throw new MeliFailure("invalid_state")
  }
  return config
}

export function setMeliCookie(response: NextResponse, value: string, clear = false) {
  response.cookies.set(MELI_OAUTH_COOKIE, value, {
    path: "/", secure: true, httpOnly: true, sameSite: "lax", maxAge: clear ? 0 : MELI_STATE_TTL_MS / 1000,
  })
}

export function returnToMarketplace(config: MercadoLivreConfig, result: string, clear = false) {
  const url = new URL("/dashboard/marketplace", config.origin)
  url.searchParams.set("meli", result)
  url.hash = "conexoes-marketplace"
  const response = NextResponse.redirect(url, { status: 303, headers: privateHeaders })
  if (clear) setMeliCookie(response, "", true)
  return response
}
