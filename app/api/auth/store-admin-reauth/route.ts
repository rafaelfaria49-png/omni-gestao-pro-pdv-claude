import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * Reautenticação da ADMIN STORE para o Caixa Seguro — GOAL
 * PADARIA-STORE-ADMIN-CASH-AUTH-001.
 *
 * A administradora confirma a SENHA DE LOGIN da própria conta (`AdminUser.password`,
 * bcrypt) e recebe uma autorização de 15 min vinculada a ela, à loja, à ação
 * `caixa_seguro` e à sessão de caixa aberta. Não toca em `User`/PIN: o PIN global não é
 * credencial aqui, e nenhuma conta interna passa a depender deste fluxo.
 *
 * Ordem (fail-closed em toda divergência):
 *   1. módulo `cash` + sessão NextAuth (o `jwt` de `auth.ts` já relê ativo/sessionVersion);
 *   2. só ADMIN com `accessScope` STORE — CAIXA/OPERADOR STORE e contas legadas: 403;
 *   3. loja pedida, segredo do servidor e rate limit pelo `userId`;
 *   4. `canAccessStore` + vínculo e estado da conta relidos no banco;
 *   5. sessão de caixa ABERTA desta loja;
 *   6. bcrypt contra o hash da própria conta.
 *
 * Senha errada, conta inativa, troca de senha pendente e sessão revogada respondem o
 * MESMO `invalid_credentials`/401. Nenhuma resposta, log ou auditoria contém a senha,
 * o hash ou o token.
 */

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { canAccessStore } from "@/lib/auth/enterprise-permissions"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { extractClientIp } from "@/lib/contador/auth/legacy-session"
import { hashClientIp, resolvePinAuthorizationSecret } from "@/lib/auth/pin-authorization"
import {
  buildStoreAdminReauthClearCookieOptions,
  buildStoreAdminReauthCookieOptions,
  buildStoreAdminReauthRateLimitKey,
  CAIXA_SEGURO_ACTION,
  createStoreAdminReauthToken,
  isStoreAdminSession,
  STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
} from "@/lib/auth/store-admin-reauth"
import {
  checkContadorRateLimit,
  registerContadorAuthFailure,
  registerContadorAuthSuccess,
} from "@/lib/contador/auth/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Hash descartável, no mesmo custo das senhas de conta (12), para que conta inelegível
 * ou senha vazia gastem o mesmo tempo que uma comparação real.
 */
let dummyHashPromise: Promise<string> | null = null
function dummyAccountHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash("dummy-store-admin-reauth-fail-closed", 12)
  return dummyHashPromise
}

async function audit(
  action: string,
  input: { userId: string; storeId?: string; sessaoId?: string; ipHash: string; detail: string },
): Promise<void> {
  try {
    await prisma.logsAuditoria.create({
      data: {
        action,
        userLabel: input.userId,
        detail: input.detail,
        metadata: JSON.stringify({
          userId: input.userId,
          storeId: input.storeId ?? null,
          sessaoId: input.sessaoId ?? null,
          ipHash: input.ipHash,
        }),
        source: "api/auth/store-admin-reauth",
      },
    })
  } catch (e) {
    console.error("[auth/store-admin-reauth:audit]", e instanceof Error ? e.message : String(e))
  }
}

function log(event: string, fields: { ipHash: string; userId?: string; storeId?: string; reasonCode?: string }) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...fields }))
}

const invalidCredentials = () => NextResponse.json({ error: "invalid_credentials" }, { status: 401 })

export async function POST(request: Request) {
  const moduleDenied = await requireModuleApi(request, "cash")
  if (moduleDenied) return moduleDenied

  const ipHash = await hashClientIp(extractClientIp(await headers()))

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  // CAIXA STORE e contas internas não recebem esta autorização. Recusa antes de ler a
  // senha: não há comparação nem consumo de tentativa para quem nunca poderia passar.
  if (!isStoreAdminSession(session)) {
    log("store_admin_reauth_not_admin", { ipHash, userId, reasonCode: "not_store_admin" })
    return NextResponse.json({ error: "store_admin_required" }, { status: 403 })
  }

  const storeId = storeIdFromAssistecRequestForRead(request)
  if (!storeId) return NextResponse.json({ error: "store_required" }, { status: 400 })

  const secret = resolvePinAuthorizationSecret()
  if (!secret) {
    log("store_admin_reauth_misconfigured", { ipHash, userId, storeId, reasonCode: "missing_server_secret" })
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }

  const rateKey = buildStoreAdminReauthRateLimitKey(userId)
  const limit = checkContadorRateLimit(rateKey)
  if (limit.limited) {
    await audit("CAIXA_SEGURO_ADMIN_LOJA_BLOQUEADO", {
      userId, storeId, ipHash, detail: "Bloqueio por excesso de senhas incorretas.",
    })
    const res = NextResponse.json({ error: "rate_limited" }, { status: 429 })
    res.headers.set("Retry-After", String(limit.retryAfterSeconds))
    return res
  }
  // A tentativa conta AGORA, antes de qualquer `await`: contar só depois do bcrypt
  // deixava uma rajada paralela passar inteira pela checagem acima. Sucesso zera.
  registerContadorAuthFailure(rateKey)

  if (!canAccessStore(session, storeId)) {
    log("store_admin_reauth_store_denied", { ipHash, userId, storeId, reasonCode: "store_not_allowed" })
    return NextResponse.json({ error: "store_forbidden" }, { status: 403 })
  }

  let body: { password?: unknown; sessaoId?: unknown } = {}
  try {
    body = (await request.json()) as { password?: unknown; sessaoId?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const password = typeof body.password === "string" ? body.password : ""
  const sessaoId = typeof body.sessaoId === "string" ? body.sessaoId.trim() : ""
  if (!sessaoId || sessaoId.length > 128 || !/^[\w.:@/-]+$/.test(sessaoId)) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 })
  }

  let account: {
    password: string
    active: boolean
    mustChangePassword: boolean
    sessionVersion: number
    role: string
    accessScope: string | null
    lojaId: string | null
    adminUserStores: { storeId: string }[]
  } | null
  let sessaoAberta: { id: string } | null
  try {
    await prismaEnsureConnected()
    account = await prisma.adminUser.findUnique({
      where: { id: userId },
      select: {
        password: true, active: true, mustChangePassword: true, sessionVersion: true,
        role: true, accessScope: true, lojaId: true, adminUserStores: { select: { storeId: true } },
      },
    })
    sessaoAberta = await prisma.sessaoCaixa.findFirst({
      where: { id: sessaoId, storeId, status: "ABERTA" },
      select: { id: true },
    })
  } catch (e) {
    console.error("[auth/store-admin-reauth]", e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }

  // Estado da conta relido no banco, não no JWT: inativa, troca de senha pendente,
  // sessão revogada, papel ou escopo alterados e vínculo removido não passam.
  const memberships = account?.adminUserStores.map((s) => s.storeId) ?? []
  const vinculada = memberships.length ? memberships.includes(storeId) : account?.lojaId === storeId
  const contaValida =
    !!account &&
    account.active &&
    !account.mustChangePassword &&
    account.sessionVersion === (session.user.sessionVersion ?? 0) &&
    String(account.role).toUpperCase() === "ADMIN" &&
    account.accessScope === "STORE" &&
    vinculada

  if (!sessaoAberta) {
    return NextResponse.json({ error: "cash_session_not_open" }, { status: 409 })
  }

  const senhaConfere = await bcrypt.compare(
    password,
    contaValida && password ? account!.password : await dummyAccountHash(),
  )
  if (!contaValida || !password || !senhaConfere) {
    await audit("CAIXA_SEGURO_ADMIN_LOJA_RECUSADO", {
      userId, storeId, sessaoId, ipHash,
      detail: contaValida ? "Senha da administradora incorreta." : "Conta sem condição de aprovar.",
    })
    log("store_admin_reauth_failed", {
      ipHash, userId, storeId, reasonCode: contaValida ? "wrong_password" : "account_not_eligible",
    })
    return invalidCredentials()
  }

  registerContadorAuthSuccess(rateKey)
  const token = await createStoreAdminReauthToken(
    { userId, storeId, action: CAIXA_SEGURO_ACTION, resource: sessaoId, sessionVersion: account!.sessionVersion },
    secret,
  )
  await audit("CAIXA_SEGURO_ADMIN_LOJA_AUTORIZADO", {
    userId, storeId, sessaoId, ipHash, detail: "Caixa Seguro liberado pela senha da administradora da loja.",
  })
  log("store_admin_reauth_success", { ipHash, userId, storeId })

  const res = NextResponse.json({
    ok: true,
    admin: { id: userId, name: session.user.name ?? "" },
    expiresInSeconds: STORE_ADMIN_REAUTH_MAX_AGE_SECONDS,
  })
  res.cookies.set(buildStoreAdminReauthCookieOptions(token))
  return res
}

/** Revogação explícita ("Ocultar" o resumo) — sempre permitida, só apaga o cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(buildStoreAdminReauthClearCookieOptions())
  return res
}
