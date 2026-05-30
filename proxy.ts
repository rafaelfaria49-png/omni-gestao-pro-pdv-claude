import { NextResponse } from "next/server"
import NextAuth from "next-auth"
import type { Session } from "next-auth"
import { authConfig } from "./auth.config"
import {
  SUBSCRIPTION_COOKIE_NAME,
  isVencimentoExpired,
  verifySubscriptionCookieValue,
} from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { ASSISTEC_ACTIVE_STORE_COOKIE } from "@/lib/store-defaults"
import { enterpriseDashboardRedirect, enterpriseStoreCookieRedirect } from "@/lib/auth/proxy-enterprise-dashboard"
import {
  buildLegacyPageRedirectUrl,
  CRITICAL_LEGACY_PAGES,
  resolveLegacyPageRedirect,
} from "@/lib/navigation/legacy-routes"

const { auth } = NextAuth(authConfig)

const SUBSCRIPTION_SECRET =
  process.env.ASSISTEC_SUBSCRIPTION_SECRET || "assistec-dev-secret-change-in-production"

const ADMIN_COOKIE = "assistec_admin_session"
const CONTADOR_COOKIE = "assistec_contador_session"

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next")) return true
  if (pathname.startsWith("/api")) return true
  if (pathname === "/favicon.ico") return true
  if (pathname.startsWith("/icon")) return true
  if (pathname === "/apple-icon.png" || pathname === "/apple-touch-icon.png") return true
  if (pathname === "/manifest.webmanifest" || pathname === "/manifest.json") return true
  if (pathname === "/sw.js") return true
  if (pathname.startsWith("/workbox-") || pathname.startsWith("/worker-")) return true
  if (/\.(png|svg|ico|webp|jpg|jpeg|gif|webmanifest)$/i.test(pathname)) return true
  // Auth routes and login page are always public
  if (pathname === "/login" || pathname.startsWith("/login/")) return true
  return false
}

function isPlanOrSupport(pathname: string): boolean {
  return (
    pathname === "/meu-plano" ||
    pathname.startsWith("/meu-plano/") ||
    pathname === "/suporte" ||
    pathname.startsWith("/suporte/")
  )
}

function isLoginAdminPath(pathname: string): boolean {
  return pathname === "/login-admin" || pathname.startsWith("/login-admin/")
}

function isLoginContadorPath(pathname: string): boolean {
  return pathname === "/login-contador" || pathname.startsWith("/login-contador/")
}

/** Portal do cliente final (login CPF / pagamentos) — sem cookie de assinatura da loja. */
function isClientePortalPath(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/")
}

export const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Protect /dashboard/* — redirect to /login if no NextAuth session
  if (pathname.startsWith("/dashboard") && !session) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (
    isClientePortalPath(pathname) ||
    isPlanOrSupport(pathname) ||
    isLoginAdminPath(pathname) ||
    isLoginContadorPath(pathname)
  ) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get(SUBSCRIPTION_COOKIE_NAME)?.value
  const verified = await verifySubscriptionCookieValue(cookie, SUBSCRIPTION_SECRET)
  const now = await getTrustedTimeMs()

  const redirectPlano = () => {
    const u = req.nextUrl.clone()
    u.pathname = "/meu-plano"
    u.search = ""
    return NextResponse.redirect(u)
  }

  if (!verified.ok) {
    if (pathname === "/") {
      const pageParam = req.nextUrl.searchParams.get("page")
      if (pageParam && CRITICAL_LEGACY_PAGES.has(pageParam)) {
        return redirectPlano()
      }
      return NextResponse.next()
    }
    return redirectPlano()
  }

  const expired = isVencimentoExpired(now, verified.vencimento)
  const inactive = verified.status !== "ativa"
  if (expired || inactive) {
    return redirectPlano()
  }

  if (pathname === "/") {
    const pageParam = req.nextUrl.searchParams.get("page")
    const target = pageParam ? resolveLegacyPageRedirect(pageParam) : null
    if (target) {
      const dest = buildLegacyPageRedirectUrl(pageParam!, req.nextUrl.searchParams)
      const u = req.nextUrl.clone()
      const destUrl = new URL(dest, req.url)
      u.pathname = destUrl.pathname
      u.search = destUrl.search
      return NextResponse.redirect(u)
    }
  }

  if (pathname.startsWith("/dashboard") && session?.user) {
    const sess = session as unknown as Session
    const denied = enterpriseDashboardRedirect(req.nextUrl.origin, pathname, sess)
    if (denied) return NextResponse.redirect(denied)
    const storeCookie = req.cookies.get(ASSISTEC_ACTIVE_STORE_COOKIE)?.value
    const storeDeny = enterpriseStoreCookieRedirect(req.nextUrl.origin, sess, storeCookie)
    if (storeDeny) return NextResponse.redirect(storeDeny)
  }

  if (pathname === "/logs-sistema" || pathname.startsWith("/logs-sistema/")) {
    const admin = String(req.cookies.get(ADMIN_COOKIE)?.value || "").trim()
    if (!admin) {
      const u = req.nextUrl.clone()
      u.pathname = "/"
      u.search = ""
      return NextResponse.redirect(u)
    }
  }

  if (pathname === "/contador" || pathname.startsWith("/contador/")) {
    const contador = req.cookies.get(CONTADOR_COOKIE)?.value
    if (contador !== "1") {
      const u = req.nextUrl.clone()
      u.pathname = "/login-contador"
      u.searchParams.set("next", pathname)
      return NextResponse.redirect(u)
    }
  }

  return NextResponse.next()
})

export { proxy as default }

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
