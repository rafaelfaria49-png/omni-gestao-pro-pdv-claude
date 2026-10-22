import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { canAccessStore, canUseModule } from "./enterprise-permissions"
import { isPlatformSession, type AccessModule } from "./access-policy"
import { activeStoreIdFromCookieHeader, storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { prisma } from "@/lib/prisma"

export type ApiAccess = AccessModule | "platform" | "sharedCatalog" | "sharedPayment" | "authenticated" | "billing"

export async function requirePlatformAction() {
  const session = await auth()
  if (!isPlatformSession(session) || session?.user.mustChangePassword) throw new Error("Autoridade da plataforma obrigatória.")
  return session!
}

export async function requireModuleAction(storeId: string, module: AccessModule | "sharedCatalog") {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Não autenticado")
  if (!canAccessStore(session, storeId)) throw new Error("Sem permissão para esta unidade")
  const allowed = module === "sharedCatalog"
    ? (["catalog", "pdv", "service"] as const).some((m) => canUseModule(session, m, storeId))
    : canUseModule(session, module, storeId)
  if (!allowed) {
    throw new Error("Sem permissão para este módulo ou unidade.")
  }
  return session
}

/** Chamado no próprio Route Handler, antes de qualquer I/O ou efeito colateral. */
export async function requireModuleApi(req: Request, access: ApiAccess): Promise<NextResponse | null> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 })
  if (session.user.mustChangePassword) return NextResponse.json({ ok: false, error: "Altere sua senha antes de continuar." }, { status: 403 })
  const denied = () => NextResponse.json({ ok: false, error: "Sem permissão para este módulo ou unidade." }, { status: 403 })
  if (access === "platform") return isPlatformSession(session) ? null : denied()
  if (access === "billing") {
    if (isPlatformSession(session)) return null
    const billing = await prisma.adminUser.findUnique({ where: { id: session.user.id }, select: { stripeCustomerId: true, stripeSubscriptionId: true } })
    return billing?.stripeCustomerId && billing.stripeSubscriptionId ? null : denied()
  }
  let body: Record<string, unknown> = {}
  if (!["GET", "HEAD"].includes(req.method) && req.headers.get("content-type")?.includes("application/json")) {
    try { body = await req.clone().json() } catch { /* o handler valida formato */ }
  }
  const url = new URL(req.url)
  const pathStore = url.pathname.match(/^\/api\/stores\/([^/]+)(?:\/|$)/)?.[1]
  const candidates = [storeIdFromAssistecRequestForRead(req), activeStoreIdFromCookieHeader(req.headers.get("cookie")), url.searchParams.get("storeId"), url.searchParams.get("lojaId"), body?.storeId, body?.lojaId,
    pathStore && !["import-catalog", "numeracao-venda"].includes(pathStore) ? decodeURIComponent(pathStore) : null]
    .filter((v): v is string => typeof v === "string" && !!v.trim())
  // Todos os identificadores explícitos devem ser autorizados; nenhum payload troca a loja validada.
  if (candidates.some((sid) => !canAccessStore(session, sid))) return denied()
  const storeId = candidates[0] || session.user.lojaId || session.user.allowedStoreIds?.[0]
  if (isPlatformSession(session)) return null
  if (!canAccessStore(session, storeId)) return denied()
  if (access === "authenticated") return null
  const allStores = [...new Set([storeId!, ...candidates])]
  if (access === "sharedCatalog") return allStores.every((sid) => ["catalog", "pdv", "service"].some((m) => canUseModule(session, m as AccessModule, sid))) ? null : denied()
  if (access === "sharedPayment") return allStores.every((sid) => ["pdv", "cash", "service", "finance"].some((m) => canUseModule(session, m as AccessModule, sid))) ? null : denied()
  return allStores.every((sid) => canUseModule(session, access, sid)) ? null : denied()
}
