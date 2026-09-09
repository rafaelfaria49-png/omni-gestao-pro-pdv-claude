/**
 * Guard do bypass de autenticação LOCAL/DEV (LOCALHOST-DEV-AUTH-BYPASS-002).
 *
 * FAIL-CLOSED: TODAS as condições devem ser verdadeiras para liberar o bypass.
 * Qualquer falha → autenticação normal por senha. Nunca substitui ou enfraquece
 * a autenticação de produção (a Vercel roda com NODE_ENV=production e sem a flag,
 * então o bypass é estruturalmente impossível lá).
 *
 * Condições (todas obrigatórias):
 *  A. NODE_ENV !== "production"
 *  B. LOCAL_DEV_AUTH_BYPASS === "true"
 *  C. request atendida em loopback (Host do request: localhost / 127.0.0.1 / ::1)
 *  D. DATABASE_URL e DIRECT_URL apontam para o banco local omnigestao_visual_dev em host loopback
 *  E. nenhuma URL aponta para host remoto (ex.: neon.tech) ou banco com nome de produção
 *
 * Módulo puro (sem imports de servidor) — usável no authorize do NextAuth,
 * em Server Actions e na página de login.
 */

const LOCAL_DB_NAME = "omnigestao_visual_dev"
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"])
const PROD_DB_NAME_PATTERN = /prod/i

export interface LocalDevAuthBypassContext {
  /** Header `Host` do request real, lido servidor-side (ex.: "localhost:3001"). */
  hostHeader?: string | null
}

export interface LocalDevAuthBypassEvaluation {
  allowed: boolean
  checks: {
    nodeEnvNotProduction: boolean
    flagEnabled: boolean
    loopbackRequest: boolean
    localDatabase: boolean
    noRemoteDatabase: boolean
  }
}

interface DatabaseTarget {
  hostname: string
  database: string
}

function parseDatabaseTarget(url: string | undefined | null): DatabaseTarget | null {
  const raw = url?.trim()
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""))
    if (!database) return null
    return { hostname: parsed.hostname.toLowerCase(), database }
  } catch {
    return null
  }
}

/** Aceita "localhost", "127.0.0.1", "::1" e variantes com porta/colchetes. */
function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  return LOOPBACK_HOSTNAMES.has(h) || h.endsWith(".localhost")
}

/** Extrai o hostname de um header Host ("localhost:3001", "[::1]:3001"). */
function hostnameFromHostHeader(hostHeader: string): string {
  const first = hostHeader.trim().split(",")[0] ?? ""
  if (first.startsWith("[")) {
    const end = first.indexOf("]")
    return end === -1 ? first.slice(1) : first.slice(1, end)
  }
  return first.split(":")[0] ?? ""
}

function isLocalVisualDevTarget(target: DatabaseTarget | null): boolean {
  return !!target && isLoopbackHostname(target.hostname) && target.database === LOCAL_DB_NAME
}

function isRemoteOrProdTarget(target: DatabaseTarget | null): boolean {
  if (!target) return true
  if (!isLoopbackHostname(target.hostname)) return true
  if (target.hostname.endsWith("neon.tech")) return true
  if (PROD_DB_NAME_PATTERN.test(target.database)) return true
  return false
}

export function evaluateLocalDevAuthBypass(ctx: LocalDevAuthBypassContext = {}): LocalDevAuthBypassEvaluation {
  // A. nunca em produção
  const nodeEnvNotProduction = process.env.NODE_ENV !== "production"
  // B. flag explícita de ambiente local
  const flagEnabled = process.env.LOCAL_DEV_AUTH_BYPASS === "true"

  // C. o request real foi atendido em loopback
  const hostHeader = (ctx.hostHeader ?? "").trim()
  const loopbackRequest =
    hostHeader.length > 0 && isLoopbackHostname(hostnameFromHostHeader(hostHeader))

  // D. banco conectado é inequivocamente o ambiente local de testes
  const databaseTarget = parseDatabaseTarget(process.env.DATABASE_URL)
  const directTarget = parseDatabaseTarget(process.env.DIRECT_URL)
  const localDatabase = isLocalVisualDevTarget(databaseTarget) && isLocalVisualDevTarget(directTarget)

  // E. segunda camada: qualquer indício de alvo remoto/prod bloqueia
  const noRemoteDatabase = !isRemoteOrProdTarget(databaseTarget) && !isRemoteOrProdTarget(directTarget)

  const allowed =
    nodeEnvNotProduction && flagEnabled && loopbackRequest && localDatabase && noRemoteDatabase

  return {
    allowed,
    checks: { nodeEnvNotProduction, flagEnabled, loopbackRequest, localDatabase, noRemoteDatabase },
  }
}
