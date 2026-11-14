/**
 * P1-1: two REAL agent OS processes holding the same installation credential, lost claim responses, a SIGKILL of one
 * process mid-run and its restart on the same journal, and a third process refused on a journal already in use.
 * Every byte stream that reached the (simulated) spooler is recorded by the agent process before submit returns.
 * Disposable PostgreSQL only.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { fork, type ChildProcess } from "node:child_process"
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import * as direct from "@/lib/printing/direct/http"
import { browserRequest, confirmedSale, depsFor, IDS, LabServer, labPrisma, labRuntime, prismaDatabase, seed, sessionOf } from "./lab-env"

const URL_ = process.env.PRINT_PG_URL
type Json = Record<string, any>
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

describe.skipIf(!URL_)("P1-1 dois processos de agente com a mesma credencial", { timeout: 180_000 }, () => {
  const prisma = labPrisma(URL_ ?? "postgresql://x@127.0.0.1/print_lab_unused")
  const db = prismaDatabase(prisma as never)
  // Short send lease so killed in-flight attempts resolve inside the test; admission limit raised for the burst.
  // A lost claim response holds the serialized destination until the dispatch lease lapses (20 s by default): short
  // leases keep that stall well inside the kill window below, as the send lease already is.
  const runtime = labRuntime({ dispatchLeaseMs: 5000, sendLeaseMs: 5000, maxRequestsPerMinute: 1000 })
  const dir = mkdtempSync(path.join(os.tmpdir(), "p004c-two-agents-"))
  const paper = (n: string) => path.join(dir, n + ".paper.jsonl")
  const journal = (n: string) => path.join(dir, n + ".journal.jsonl")
  let server: LabServer, token = ""
  const hosts: ChildProcess[] = []

  function host(name: string) {
    const child = fork(path.resolve(__dirname, "agent-host.mjs"), [server.url, journal(name), paper(name)], { execPath: process.execPath, execArgv: [], env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv })
    hosts.push(child)
    const pending = new Map<number, (m: Json) => void>()
    let id = 0
    const ready = new Promise<void>(resolve => child.on("message", (m: Json) => { if (m.ready) resolve(); else pending.get(m.id)?.(m) }))
    const ctl = (cmd: string, extra: Json = {}) => new Promise<Json>(resolve => { const i = ++id; pending.set(i, resolve); child.send({ id: i, cmd, ...extra }) })
    return { child, ready, start: () => ctl("start", { token }), stop: () => ctl("stop"), fault: (f: string) => ctl("fault", { fault: f }) }
  }
  const papers = () => ["A", "B", "C"].flatMap(n => existsSync(paper(n)) ? readFileSync(paper(n), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [])

  beforeAll(async () => {
    await seed(prisma)
    server = await new LabServer(() => depsFor(db, runtime, null)).start()
    const adminDeps = depsFor(db, runtime, sessionOf(IDS.adminA))
    const adm = async (body: Json) => (await (await direct.adminAction(browserRequest("/api/print/direct/admin", IDS.storeA, body), adminDeps)).json()) as Json
    const created = await adm({ action: "createInstallation", label: "Caixa (dois processos)" })
    const paired = await (await fetch(server.url + "/api/print/agent/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: created.pairingCode, agentVersion: "lab" }) })).json() as Json
    token = paired.token
    await fetch(server.url + "/api/print/agent/heartbeat", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ printers: [{ name: "POS-80 (simulada)", online: true, status: "3", isDefault: false, portKind: "USB" }] }) })
    expect((await adm({ action: "bindTerminal", terminalId: IDS.t1A, installationId: paired.installationId, printerName: "POS-80 (simulada)", profileId: "THERMAL_80" })).ok).toBe(true)
  })
  afterAll(async () => { for (const h of hosts) h.kill(); await server?.stop(); await prisma.$disconnect() })

  it("rajada de vendas com perdas de resposta e kill -9 de um processo: nenhuma venda chega duas vezes ao spooler; terceiro processo no mesmo diário é recusado", async () => {
    const A = host("A"), B = host("B")
    await Promise.all([A.ready, B.ready])
    expect((await A.start()).ok).toBe(true)
    expect((await B.start()).ok).toBe(true)
    const deps = depsFor(db, runtime, sessionOf(IDS.caixaA))
    const sales: string[] = [], jobs: string[] = []
    let killedInFlight = false
    let seen = 0
    for (let i = 0; i < 12; i++) {
      if (i === 5) {
        // Stop B only while it is idle. Stopped mid-submission, B leaves an UNKNOWN attempt that keeps the printer held
        // until B itself answers from its journal (by design: no resend). A would then sit idle and the kill below would
        // land on an idle process (flaky on CI). Idle = nothing SENDING and no READY copy under a live dispatch lease.
        for (let w = 0; w < 150; w++) {
          const [{ n }] = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_copies WHERE job_id = ANY($1::uuid[])
            AND (state = 'SENDING' OR (state = 'READY' AND lease_until > clock_timestamp()))`, jobs)
          if (n === 0) break
          await sleep(100)
        }
        await B.stop() // only A works the next sales, so the kill below lands inside one of its submissions
      }
      if (i === 6) {
        // Make A slow inside the spooler BEFORE its next job exists: otherwise a fast A prints sale 6 while the fault is
        // still being set, no submission is in flight and the kill below lands on an idle process (flaky on CI).
        await A.fault("SLOW_SUBMIT"); await A.fault("SLOW_SUBMIT"); await A.fault("SLOW_SUBMIT")
        seen = papers().filter(p => p.pid === A.child.pid).length
      }
      const s = await confirmedSale(prisma, IDS.storeA)
      const r = await (await direct.createJob(browserRequest("/api/print/direct/jobs", IDS.storeA, { saleId: s.id, kind: "INITIAL", terminalId: IDS.t1A }), deps)).json() as Json
      expect(r.ok).toBe(true)
      sales.push(s.id); jobs.push(r.job.jobId)
      // Not on sale 6: a lost claim response there delays A past the kill window below and the kill misses the submission.
      if (i % 3 === 0 && i !== 6) server.faults.dropResponseOnce.add("/api/print/agent/claim")
      if (i === 6) {
        // Kill A while that submission is in flight (journal SUBMITTING, no outcome).
        for (let w = 0; w < 200 && papers().filter(p => p.pid === A.child.pid).length === seen; w++) await sleep(100)
        A.child.kill("SIGKILL")
        killedInFlight = papers().filter(p => p.pid === A.child.pid).length > seen
        if (!killedInFlight) console.log("two-agents: kill missed a submission", JSON.stringify({ seen, papers: papers().map(p => [p.pid === A.child.pid ? "A" : "B", p.sale]),
          copies: await prisma.$queryRawUnsafe(`SELECT c.state, c.lease_until > clock_timestamp() live, (SELECT string_agg(a.result::text, ',') FROM public.print_attempts a WHERE a.copy_id=c.id) attempts
            FROM public.print_copies c WHERE c.job_id = ANY($1::uuid[]) ORDER BY c.created_at`, jobs),
          held: await prisma.$queryRawUnsafe(`SELECT held_attempt_id IS NOT NULL held FROM public.print_destinations`) }))
        expect((await B.start()).ok).toBe(true)
      }
      await sleep(150)
    }
    await sleep(300)
    const A2 = host("A") // same journal as the killed process: its stale lock is taken over
    await A2.ready
    expect((await A2.start()).ok).toBe(true)
    const A3 = host("A") // a THIRD process on the journal A2 now holds
    await A3.ready
    expect(await A3.start()).toMatchObject({ ok: false, error: "AGENT_ALREADY_RUNNING" })
    // Every copy must settle (accepted, uncertain, or proven not sent); nothing is resent blindly.
    const final = ["SPOOLER_ACCEPTED", "UNKNOWN", "PRE_SEND_FAILED", "CANCELLED", "EXPIRED"]
    for (let t = 0; t < 120; t++) {
      for (const j of jobs) await direct.getJob(browserRequest(`/api/print/direct/jobs/${j}`, IDS.storeA), deps, j) // lazy recovery
      const rows = await prisma.$queryRawUnsafe<Json[]>(`SELECT c.state FROM public.print_copies c WHERE c.job_id = ANY($1::uuid[])`, jobs)
      const ready = rows.filter(r => r.state === "READY").length
      if (rows.every(r => final.includes(r.state))) break
      if (ready) {
        // A READY copy whose dispatch lease lapsed was proven not sent: the operator may retry it explicitly.
        for (const j of jobs) await direct.retryJob(browserRequest(`/api/print/direct/jobs/${j}/retry`, IDS.storeA, {}), deps, j)
      }
      await sleep(500)
    }
    await Promise.all([A2.stop(), B.stop()])
    const states = await prisma.$queryRawUnsafe<Json[]>(`SELECT d.sale_id,c.state,(SELECT count(*)::int FROM public.print_attempts a WHERE a.copy_id=c.id AND a.result<>'PRE_SEND_FAILED') effects
      FROM public.print_copies c JOIN public.print_jobs j ON j.id=c.job_id JOIN public.print_documents d ON d.id=j.document_id WHERE c.job_id = ANY($1::uuid[])`, jobs)
    expect(states.every(r => final.includes(r.state))).toBe(true)
    expect(states.every(r => r.effects <= 1)).toBe(true)
    const pedidos = await prisma.$queryRawUnsafe<Json[]>(`SELECT id,"pedidoId" FROM public.vendas WHERE id = ANY($1::text[])`, sales)
    const bySale = new Map<string, number>()
    for (const p of papers()) bySale.set(p.sale, (bySale.get(p.sale) ?? 0) + 1)
    for (const v of pedidos) {
      const n = bySale.get(v.pedidoId) ?? 0
      const st = states.find(r => r.sale_id === v.id)!.state
      expect(n, `${v.pedidoId} reached the spooler ${n}x`).toBeLessThanOrEqual(1)
      if (st === "SPOOLER_ACCEPTED") expect(n).toBe(1)
    }
    const pids = new Set(papers().map(p => p.pid))
    expect(pids.size).toBeGreaterThanOrEqual(2) // both processes really worked the queue
    expect(killedInFlight).toBe(true) // the SIGKILL hit a submission in flight
    expect(states.some(r => r.state === "UNKNOWN")).toBe(true) // that copy is uncertain, never resent
    const counts: Record<string, number> = {}
    for (const r of states) counts[r.state] = (counts[r.state] ?? 0) + 1
    if (process.env.PRINT_EVIDENCE_FILE) appendFileSync(process.env.PRINT_EVIDENCE_FILE, JSON.stringify({ sales: sales.length, spoolerCalls: papers().length, processes: pids.size, states: counts, maxPerSale: Math.max(0, ...bySale.values()), killedInFlight, at: new Date().toISOString() }) + "\n")
  })
})
