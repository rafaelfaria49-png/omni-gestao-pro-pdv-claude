import type { Session } from "next-auth"
import type { DirectPrintRuntime } from "./activation"
import { DirectPrintAdmin } from "./admin"
import { principalFromSession, type Principal } from "./authority"
import { DirectPrintCore, type Hooks } from "./core"
import { check, ledgerFailure, PrintError, type Database } from "./db"
import { deviceHashOf, text } from "./codec"

/**
 * HTTP surface of the 004C candidate. Route files stay thin and inject real dependencies;
 * tests and the Playwright fixture inject a disposable database and a fixture session instead.
 */
export type DirectPrintDeps = { runtime: DirectPrintRuntime; db: Database; getSession: () => Promise<Session | null>; hooks?: Hooks }

const HEADERS = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Type": "application/json; charset=utf-8" }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS })
const MAX_BODY = 16 * 1024

function failure(error: unknown): Response {
  const e = ledgerFailure(error)
  if (e.status >= 500 && !(error instanceof PrintError)) console.error("[print-direct]", e.code, error instanceof Error ? error.message.slice(0, 300) : "")
  return json({ ok: false, error: e.code }, e.status)
}
async function body(req: Request): Promise<unknown> {
  const raw = await req.text()
  check(raw.length <= MAX_BODY, "BODY_TOO_LARGE", 413)
  try { return raw ? JSON.parse(raw) : {} } catch { throw new PrintError("INVALID_JSON", 400) }
}
/** Same-origin browser mutation: Origin must equal the request origin; JSON only (no form CSRF). */
function sameOrigin(req: Request, mutation: boolean) {
  const origin = req.headers.get("origin"), site = req.headers.get("sec-fetch-site")
  const self = new URL(req.url).origin
  if (mutation) {
    check(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json", "CONTENT_TYPE_REQUIRED", 415)
    check(origin === self, "ORIGIN_REJECTED", 403)
  } else check(origin === null || origin === self, "ORIGIN_REJECTED", 403)
  check(site === null || site === "same-origin" || (!mutation && site === "none"), "CROSS_SITE_REJECTED", 403)
}
/** Explicit store context (header). Query/body can never override it; conflicting values are rejected. */
function storeOf(req: Request): string {
  const header = req.headers.get("x-assistec-loja-id")
  const query = new URL(req.url).searchParams.getAll("storeId")
  check(header, "EXPLICIT_STORE_REQUIRED", 400)
  check(query.every(q => q === header), "STORE_CONTEXT_CONFLICT", 400)
  return text(header, 160)
}

/** Optional browser identity (x-omni-device-id) → hash; only compared against a binding restricted to one browser. */
function deviceOf(req: Request): string | null {
  const id = req.headers.get("x-omni-device-id")
  return id ? deviceHashOf(text(id, 100)) : null
}

async function browser<T>(req: Request, deps: DirectPrintDeps, mutation: boolean, run: (ctx: { auth: Principal; storeId: string; deviceHash: string | null; core: DirectPrintCore; admin: DirectPrintAdmin }) => Promise<T>) {
  try {
    if (!deps.runtime.enabled) return json({ ok: false, error: "DIRECT_PRINT_DISABLED", reason: deps.runtime.reason }, 404)
    sameOrigin(req, mutation)
    const storeId = storeOf(req)
    const auth = principalFromSession(await deps.getSession())
    check(auth, "UNAUTHENTICATED", 401)
    const core = new DirectPrintCore(deps.db, deps.runtime.crypto, deps.runtime.policy, deps.hooks)
    const admin = new DirectPrintAdmin(deps.db, deps.runtime.policy)
    return json({ ok: true, ...(await run({ auth, storeId, deviceHash: deviceOf(req), core, admin }) as object) })
  } catch (error) { return failure(error) }
}

async function agent<T>(req: Request, deps: DirectPrintDeps, run: (ctx: { installationId: string; core: DirectPrintCore; admin: DirectPrintAdmin }) => Promise<T>, authenticated = true) {
  try {
    if (!deps.runtime.enabled) return json({ ok: false, error: "DIRECT_PRINT_DISABLED" }, 404)
    // The agent is not a browser: a request carrying Origin/cookies is refused (no ambient credentials).
    check(!req.headers.get("origin") && !req.headers.get("cookie"), "AGENT_ORIGIN_REJECTED", 403)
    check(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json", "CONTENT_TYPE_REQUIRED", 415)
    const core = new DirectPrintCore(deps.db, deps.runtime.crypto, deps.runtime.policy, deps.hooks)
    const admin = new DirectPrintAdmin(deps.db, deps.runtime.policy)
    const installationId = authenticated ? (await admin.authenticateAgent(req.headers.get("authorization"))).installationId : ""
    return json({ ok: true, ...(await run({ installationId, core, admin }) as object) })
  } catch (error) { return failure(error) }
}

// ── Browser (PDV / settings) ──
export const createJob = (req: Request, deps: DirectPrintDeps) => browser(req, deps, true, async ({ auth, storeId, deviceHash, core }) => {
  const input = await body(req)
  const prepared = await core.prepare(auth, storeId, input, deviceHash)
  return { job: await core.create(auth, prepared.key, prepared.command) }
})
export const latestJob = (req: Request, deps: DirectPrintDeps) => browser(req, deps, false, async ({ auth, storeId, core }) =>
  ({ job: await core.latestForSale(auth, storeId, text(new URL(req.url).searchParams.get("saleId"), 160)) }))
export const getJob = (req: Request, deps: DirectPrintDeps, jobId: string) => browser(req, deps, false, async ({ auth, storeId, core }) =>
  ({ job: await core.get(auth, storeId, jobId) }))
export const retryJob = (req: Request, deps: DirectPrintDeps, jobId: string) => browser(req, deps, true, async ({ auth, storeId, deviceHash, core }) =>
  ({ job: await core.retry(auth, storeId, jobId, deviceHash) }))
export const browserFallback = (req: Request, deps: DirectPrintDeps) => browser(req, deps, true, async ({ auth, storeId, core }) =>
  ({ fallback: await core.browserFallback(auth, storeId, await body(req)) }))
export const quoteReprint = (req: Request, deps: DirectPrintDeps) => browser(req, deps, true, async ({ auth, storeId, core }) => {
  const input = await body(req) as Record<string, unknown>
  return { quote: await core.quoteReprint(auth, storeId, text(input?.saleId, 160)) }
})
export const terminalStatus = (req: Request, deps: DirectPrintDeps) => browser(req, deps, false, async ({ auth, storeId, admin }) =>
  ({ status: await admin.terminalStatus(auth, storeId, new URL(req.url).searchParams.get("terminalId")) }))
export const adminList = (req: Request, deps: DirectPrintDeps) => browser(req, deps, false, async ({ auth, storeId, admin }) => admin.listInstallations(auth, storeId))
export const adminAction = (req: Request, deps: DirectPrintDeps) => browser(req, deps, true, async ({ auth, storeId, deviceHash, admin }) => {
  const input = await body(req) as Record<string, unknown>
  check(input && typeof input === "object", "INVALID_INPUT", 400)
  const { action, ...rest } = input
  if (action === "createInstallation") return admin.createInstallation(auth, storeId, rest.label)
  if (action === "revokeInstallation") return admin.revokeInstallation(auth, storeId, rest.installationId)
  if (action === "bindTerminal") return admin.bindTerminal(auth, storeId, rest, deviceHash)
  if (action === "revokeBinding") return admin.revokeTerminalBinding(auth, storeId, rest.terminalId)
  throw new PrintError("UNKNOWN_ACTION", 400)
})

// ── Local agent (installation credential) ──
export const agentPair = (req: Request, deps: DirectPrintDeps) => agent(req, deps, async ({ admin }) => admin.pair(await body(req)), false)
export const agentHeartbeat = (req: Request, deps: DirectPrintDeps) => agent(req, deps, async ({ installationId, admin }) => admin.heartbeat(installationId, await body(req)))
export const agentClaim = (req: Request, deps: DirectPrintDeps) => agent(req, deps, async ({ installationId, admin, core }) => {
  await admin.touch(installationId)
  const input = await body(req) as Record<string, unknown>
  return core.claim(installationId, input?.instanceId)
})
export const agentReport = (req: Request, deps: DirectPrintDeps) => agent(req, deps, async ({ installationId, core }) => core.report(installationId, await body(req)))
