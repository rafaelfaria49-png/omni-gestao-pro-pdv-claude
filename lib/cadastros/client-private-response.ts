import { NextResponse } from "next/server"

/** PII must never enter shared HTTP/browser caches, including error responses. */
export function clientPrivateJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set("Cache-Control", "private, no-store, max-age=0")
  headers.set("Pragma", "no-cache")
  headers.set("Vary", "Cookie, Authorization, x-assistec-loja-id")
  headers.set("Referrer-Policy", "no-referrer")
  return NextResponse.json(data, { ...init, headers })
}
