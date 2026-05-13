import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { requireOpsSubscription } from "@/lib/ops-api-gate"
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise"
import type { EnterprisePermissions } from "@/lib/auth/enterprise-permissions"
import { requireAdmin } from "@/lib/require-admin"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"

function deny(msg: string, status: number, withOk = false) {
  return withOk
    ? NextResponse.json({ ok: false, error: msg }, { status })
    : NextResponse.json({ error: msg, ok: false }, { status })
}

/**
 * Com sessão NextAuth: `requireEnterpriseWith` (loja + permissão).
 * Sem sessão: `requireOpsSubscription()` (assinatura / fluxo legado).
 */
export async function apiGuardEnterpriseOrOps(
  storeId: string,
  check: (p: EnterprisePermissions) => boolean,
  forbiddenMessage: string,
  opts?: { errorBody?: "okFalse" },
): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(storeId, check, forbiddenMessage)
    if (!g.ok) return deny(g.error, g.status, opts?.errorBody === "okFalse")
    return null
  }
  const sub = await requireOpsSubscription()
  if (!sub.ok) return sub.res
  return null
}

/** Sem NextAuth: cookie admin legado (`require-admin`). */
export async function apiGuardEnterpriseOrAdmin(
  storeId: string,
  check: (p: EnterprisePermissions) => boolean,
  forbiddenMessage: string,
): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(storeId, check, forbiddenMessage)
    if (!g.ok) return deny(g.error, g.status, true)
    return null
  }
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res
  return null
}

export async function apiGuardFinanceiroViewOrOps(
  storeId: string,
  opts?: { skipOpsInDev?: boolean },
): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(
      storeId,
      (p) => p.financeiro.view,
      "Sem permissão para visualizar o financeiro.",
    )
    if (!g.ok) return deny(g.error, g.status, true)
    return null
  }
  const sub = await requireOpsSubscription()
  if (!sub.ok && !(opts?.skipOpsInDev && process.env.NODE_ENV === "development")) return sub.res
  return null
}

/** Rotas `contas-*` que no legado exigem assinatura ativa + admin cookie. */
export async function apiGuardFinanceiroEditEnterpriseOrLegacy(
  storeId: string,
): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(
      storeId,
      (p) => p.financeiro.edit,
      "Sem permissão para alterar dados financeiros.",
    )
    if (!g.ok) return deny(g.error, g.status, true)
    return null
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) return deny("Não autorizado", 401, true)
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return deny("Assinatura inválida", 403, true)
  }
  return null
}

/** API `/api/ops/ordens` — leitura com hub Operações ou assinatura cookie (MemoryRouter / legado). */
export async function apiGuardOperacoesHubOrLegacy(storeId: string): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(
      storeId,
      (p) => p.hubs.operacoes,
      "Sem permissão para o módulo de operações.",
    )
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })
    return null
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 403 })
  }
  return null
}

/** PUT bulk ordens — no legado: assinatura + admin. */
export async function apiGuardOperacoesEditEnterpriseOrLegacySubAdmin(
  storeId: string,
): Promise<NextResponse | null> {
  const session = await auth()
  if (session?.user?.id) {
    const g = await requireEnterpriseWith(
      storeId,
      (p) => p.operacoes.editarOs,
      "Sem permissão para editar ordens de serviço.",
    )
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })
    return null
  }
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub.ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento) || sub.status !== "ativa") {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 403 })
  }
  const adminGate = await requireAdmin()
  if (!adminGate.ok) return adminGate.res
  return null
}
