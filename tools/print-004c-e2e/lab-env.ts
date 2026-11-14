/**
 * OMNI-PRINT-004C lab environment: disposable PostgreSQL only (PRINT_PG_URL must point to 127.0.0.1 and a
 * print_lab_* database), synthetic stores/users/sales, fixture sessions and a real HTTP server in front of the
 * real route handlers (with transport fault injection). Never used by the application runtime.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { randomBytes } from "node:crypto"
import type { AddressInfo } from "node:net"
import { PrismaClient } from "@/generated/prisma"
import { CANDIDATE_POLICY, type DirectPrintPolicy, type DirectPrintRuntime } from "@/lib/printing/direct/activation"
import { PrintCrypto } from "@/lib/printing/direct/codec"
import { prismaDatabase, type Database } from "@/lib/printing/direct/db"
import * as direct from "@/lib/printing/direct/http"
import type { Hooks } from "@/lib/printing/direct/core"

export function assertDisposable(url: string | undefined): string {
  if (!url) throw new Error("PRINT_PG_URL required")
  const u = new URL(url)
  if (u.hostname !== "127.0.0.1" || !/^\/print_lab_[a-z0-9_]+$/.test(u.pathname)) throw new Error("Refusing non-disposable database: " + u.hostname + u.pathname)
  return url
}
export function labPrisma(url: string) {
  return new PrismaClient({ datasourceUrl: assertDisposable(url), log: [] })
}
export type EnabledRuntime = Extract<DirectPrintRuntime, { enabled: true }>
export function labRuntime(policy: Partial<DirectPrintPolicy> = {}): EnabledRuntime {
  return { enabled: true, mode: "LAB", crypto: new PrintCrypto(randomBytes(32), randomBytes(32)), policy: { ...CANDIDATE_POLICY, ...policy } }
}
/** Same keys, different (finite) policy — e.g. short leases for timeout scenarios. */
export const withPolicy = (rt: EnabledRuntime, patch: Partial<DirectPrintPolicy>): EnabledRuntime => ({ ...rt, policy: { ...rt.policy, ...patch } })

export const IDS = {
  storeA: "p004c-loja-a", storeB: "p004c-loja-b",
  platform: "p004c-u-platform", adminA: "p004c-u-admin-a", caixaA: "p004c-u-caixa-a", caixa2A: "p004c-u-caixa2-a",
  tecnicoA: "p004c-u-tecnico-a", caixaB: "p004c-u-caixa-b", inactive: "p004c-u-inativo",
  t1A: "p004c-term-a1", t2A: "p004c-term-a2", t1B: "p004c-term-b1",
}

export async function seed(prisma: PrismaClient) {
  const x = (q: string, ...v: unknown[]) => prisma.$executeRawUnsafe(q, ...v)
  await x(`INSERT INTO public.stores(id,name,cnpj,address,"moduleAccess","updatedAt") VALUES
    ($1,'Loja Sintética A — Açaí & Pão','11.111.111/0001-11','{"rua":"Rua Teste","numero":"10","cidade":"São Paulo","uf":"SP"}','{"version":1,"modules":["home","pdv","sales","cash","catalog","stock","reports","settings"]}',now()),
    ($2,'Loja Sintética B','22.222.222/0001-22',NULL,'{"version":1,"modules":["home","pdv","sales","settings"]}',now())`, IDS.storeA, IDS.storeB)
  await x(`INSERT INTO public.store_settings(id,"storeId","receiptFooter","printerConfig","updatedAt") VALUES ('p004c-ss-a',$1,'Obrigado pela preferência! Trocas em até 7 dias.','{"impressao":{"bobinaTamanho":"80mm","comprovanteModo":"completo"}}',now())`, IDS.storeA)
  const users: Array<[string, string, string, string | null, string | null, boolean]> = [
    [IDS.platform, "SUPER_ADMIN", "plat@lab.invalid", "PLATFORM", null, true],
    [IDS.adminA, "ADMIN", "admin-a@lab.invalid", "STORE", IDS.storeA, true],
    [IDS.caixaA, "CAIXA", "caixa-a@lab.invalid", "STORE", IDS.storeA, true],
    [IDS.caixa2A, "VENDEDOR", "caixa2-a@lab.invalid", "STORE", IDS.storeA, true],
    [IDS.tecnicoA, "TECNICO", "tecnico-a@lab.invalid", "STORE", IDS.storeA, true],
    [IDS.caixaB, "CAIXA", "caixa-b@lab.invalid", "STORE", IDS.storeB, true],
    [IDS.inactive, "CAIXA", "inativo@lab.invalid", "STORE", IDS.storeA, false],
  ]
  for (const [id, role, email, scope, loja, active] of users) {
    await x(`INSERT INTO public.admin_users(id,email,password,role,"accessScope","lojaId",active,"updatedAt") VALUES ($1,$2,'!lab-no-login',$3::"UserRole",$4,$5,$6,now())`, id, email, role, scope, loja, active)
    if (loja) await x(`INSERT INTO public.admin_user_stores(id,"adminUserId","storeId") VALUES ($1,$2,$3)`, "aus-" + id, id, loja)
  }
  await x(`INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES ($1,$4,'PDV1','Caixa 1',now()),($2,$4,'PDV2','Caixa 2',now()),($3,$5,'PDV1','Caixa B1',now())`,
    IDS.t1A, IDS.t2A, IDS.t1B, IDS.storeA, IDS.storeB)
}

let saleSeq = 0
/** A CONFIRMED synthetic sale (as written by the server writer). Product names carry hostile text on purpose when asked. */
export async function confirmedSale(prisma: PrismaClient, storeId: string, opts: { items?: Array<{ nome: string; q: number; p: number }>; payments?: Record<string, number>; tendered?: number; terminalId?: string; minutesAgo?: number } = {}) {
  const n = ++saleSeq, id = `p004c-venda-${storeId}-${n}-${randomBytes(3).toString("hex")}`
  const items = opts.items ?? [{ nome: "Café coado — grão especial", q: 2, p: 7.5 }, { nome: "Pão de queijo", q: 3, p: 4.9 }]
  const total = Math.round(items.reduce((s, i) => s + i.q * i.p, 0) * 100) / 100
  const payments = opts.payments ?? { dinheiro: total }
  const payload = { paymentBreakdown: payments, ...(opts.tendered ? { cashTendered: opts.tendered } : {}), sessaoId: "lab-caixa" }
  await prisma.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total,at,status,payload,"terminalId",operador,"clienteNome")
    VALUES ($1,$2,$3,$4,(now() AT TIME ZONE 'UTC')-($7::int*interval '1 minute'),'concluida',$5::jsonb,$6,'Operadora Sintética','Cliente Sintético')`,
    id, storeId, `VDA-LAB-${n.toString().padStart(5, "0")}-${id.slice(-6)}`, total, JSON.stringify(payload), opts.terminalId ?? null, opts.minutesAgo ?? 0)
  let k = 0
  for (const i of items) await prisma.$executeRawUnsafe(`INSERT INTO public.venda_itens(id,"vendaId",nome,quantidade,"precoUnitario","lineTotal") VALUES ($1,$2,$3,$4,$5,$6)`,
    `${id}-i${++k}`, id, i.nome, i.q, i.p, Math.round(i.q * i.p * 100) / 100)
  return { id, total }
}

/** Digest of every non-print table (sales, items, cash, stock, finance…): proves printing never writes commerce. */
export async function commercialDigest(prisma: PrismaClient): Promise<string> {
  const tables = await prisma.$queryRawUnsafe<Array<{ t: string }>>(`SELECT tablename t FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'print\\_%' ORDER BY 1`)
  const parts: string[] = []
  for (const { t } of tables) {
    const [r] = await prisma.$queryRawUnsafe<Array<{ h: string | null; n: bigint }>>(`SELECT md5(COALESCE(string_agg(md5(x::text),'' ORDER BY md5(x::text)),'')) h, count(*) n FROM public."${t}" x`)
    parts.push(`${t}:${r.n}:${r.h}`)
  }
  return parts.join("|")
}

export type Session = { user: { id: string; sessionVersion: number }; expires: string }
export const sessionOf = (id: string, sessionVersion = 0): Session => ({ user: { id, sessionVersion }, expires: new Date(Date.now() + 3600_000).toISOString() })

export function depsFor(db: Database, runtime: DirectPrintRuntime, session: Session | null, hooks?: Hooks): direct.DirectPrintDeps {
  return { db, runtime, getSession: async () => session as never, hooks }
}

export const ORIGIN = "http://127.0.0.1:4180"
export function browserRequest(path: string, storeId: string | null, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { origin: ORIGIN, "sec-fetch-site": "same-origin", ...(storeId ? { "x-assistec-loja-id": storeId } : {}), ...extra }
  if (body !== undefined) headers["content-type"] = "application/json"
  return new Request(ORIGIN + path, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

/** Routes /api/print/** of a real HTTP server to the real handlers. Fault switches emulate transport loss. */
export class LabServer {
  server!: Server
  url = ""
  faults = { refuseAll: false, dropResponseOnce: new Set<string>(), delayMs: 0, failOnce: new Map<string, { status: number; error: string }>() }
  requests: string[] = []
  constructor(private deps: () => direct.DirectPrintDeps) {}
  async start(port = 0) {
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>(r => this.server.listen(port, "127.0.0.1", () => r()))
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
    return this
  }
  async stop() { await new Promise<void>(r => { this.server.closeAllConnections?.(); this.server.close(() => r()) }) }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? "/").split("?")[0]
    this.requests.push(`${req.method} ${path}`)
    if (this.faults.refuseAll) { req.socket.destroy(); return }
    const fail = this.faults.failOnce.get(path)
    if (fail) { this.faults.failOnce.delete(path); res.writeHead(fail.status, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: fail.error })); return }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v)
    const request = new Request(this.url + req.url, { method: req.method, headers, body: req.method === "GET" ? undefined : Buffer.concat(chunks) })
    const d = this.deps()
    const route: Record<string, (r: Request, deps: direct.DirectPrintDeps) => Promise<Response>> = {
      "/api/print/agent/pair": direct.agentPair, "/api/print/agent/heartbeat": direct.agentHeartbeat,
      "/api/print/agent/claim": direct.agentClaim, "/api/print/agent/report": direct.agentReport,
    }
    const handler = route[path]
    const response = handler ? await handler(request, d) : new Response('{"ok":false,"error":"NOT_FOUND"}', { status: 404 })
    if (this.faults.delayMs) await new Promise(r => setTimeout(r, this.faults.delayMs))
    if (this.faults.dropResponseOnce.has(path)) { this.faults.dropResponseOnce.delete(path); req.socket.destroy(); return } // processed, answer lost
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}

export type { Database, Hooks }
export { prismaDatabase }
