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
  const runtime = labRuntime({ sendLeaseMs: 5000, maxRequestsPerMinute: 1000 })
  const dir = mkdtempSync(path.join(os.tmpdir(), "p004c-two-agents-"))
  const paper = (n: string) => path.join(dir, n + ".paper.jsonl")
  const journal = (n: string) => path.join(dir, n + ".journal.jsonl")
  let server: LabServer, token = ""
  const hosts: ChildProcess[] = []
  const observations = new Set<() => void>()

  function host(name: string) {
    const child = fork(path.resolve(__dirname, "agent-host.mjs"), [server.url, journal(name), paper(name)], { execPath: process.execPath, execArgv: [], env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" } as unknown as NodeJS.ProcessEnv })
    hosts.push(child)
    const pending = new Map<number, (m: Json) => void>()
    const exited = new Promise<Json>(resolve => child.once("exit", (code, signal) => resolve({ code, signal })))
    let onSubmit: ((m: Json) => void) | null = null
    let id = 0
    const ready = new Promise<void>(resolve => child.on("message", (m: Json) => {
      if (m.event === "SUBMIT_BARRIER_ENTERED") { onSubmit?.(m); return }
      if (m.ready) resolve(); else pending.get(m.id)?.(m)
    }))
    const ctl = (cmd: string, extra: Json = {}) => new Promise<Json>(resolve => { const i = ++id; pending.set(i, resolve); child.send({ id: i, cmd, ...extra }) })
    const killNextSubmit = () => {
      let cancel = () => {}
      const promise = new Promise<Json>((resolve, reject) => {
        let done = false, signalled = false
        const cleanup = () => { done = true; clearTimeout(timeout); onSubmit = null; child.off("exit", prematureExit); observations.delete(cancel) }
        const fail = (error: unknown) => { if (!done) { cleanup(); reject(error) } }
        const prematureExit = () => { if (!signalled) fail(new Error("CHILD_EXITED_BEFORE_SUBMIT_BARRIER")) }
        const timeout = setTimeout(() => fail(new Error("SUBMIT_BARRIER_NOT_OBSERVED")), 30_000)
        cancel = () => fail(new Error("SUBMIT_OBSERVATION_CANCELLED"))
        observations.add(cancel)
        child.once("exit", prematureExit)
        onSubmit = m => {
          try {
            const entry = JSON.parse(readFileSync(journal(name), "utf8").trim().split("\n").at(-1)!)
            if (m.pid !== child.pid || !m.sale || entry.phase !== "SUBMITTING") throw new Error("KILL_BOUNDARY_NOT_PROVEN")
            signalled = true
            if (!child.kill("SIGKILL")) throw new Error("KILL_SIGNAL_REFUSED")
            void exited.then(exit => { if (!done) { cleanup(); resolve({ ...m, ...entry, exit, killed: true }) } })
          } catch (error) { fail(error) }
        }
        if (child.exitCode !== null || child.signalCode !== null) prematureExit()
      })
      // Observe immediately even if job setup fails before the caller reaches await; finally/afterAll cancel timers.
      void promise.catch(() => {})
      return { promise, cancel: () => cancel() }
    }
    return { child, ready, killNextSubmit, start: () => ctl("start", { token }), stop: () => ctl("stop"), fault: (f: string) => ctl("fault", { fault: f }) }
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
  afterAll(async () => { for (const cancel of observations) cancel(); for (const h of hosts) h.kill(); await server?.stop(); await prisma.$disconnect() })

  it("rajada de vendas com perdas de resposta e kill -9 de um processo: nenhuma venda chega duas vezes ao spooler; terceiro processo no mesmo diário é recusado", async () => {
    const A = host("A"), B = host("B")
    await Promise.all([A.ready, B.ready])
    expect((await A.start()).ok).toBe(true)
    expect((await B.start()).ok).toBe(true)
    const deps = depsFor(db, runtime, sessionOf(IDS.caixaA))
    const sales: string[] = [], jobs: string[] = []
    let killedInFlight = false
    let killedSubmission: Json | null = null
    for (let i = 0; i < 12; i++) {
      const kill = i === 6 ? A.killNextSubmit() : null
      try {
        if (kill) {
          // A lost claim can hide a delivery for the 20s dispatch lease. Keep it separate from the crash boundary.
          server.faults.dropResponseOnce.delete("/api/print/agent/claim")
          await A.fault("HOLD_SUBMIT_FOR_KILL") // arm before createJob can race with the real agent polling
        }
        const s = await confirmedSale(prisma, IDS.storeA)
        const r = await (await direct.createJob(browserRequest("/api/print/direct/jobs", IDS.storeA, { saleId: s.id, kind: "INITIAL", terminalId: IDS.t1A }), deps)).json() as Json
        expect(r.ok).toBe(true)
        sales.push(s.id); jobs.push(r.job.jobId)
        if (i % 3 === 0 && i !== 6) server.faults.dropResponseOnce.add("/api/print/agent/claim")
        if (i === 5) await B.stop() // only A works the next sale, so the kill below lands inside one of its submissions
        if (i === 6) {
          killedSubmission = await kill!.promise
          expect(killedSubmission.phase).toBe("SUBMITTING")
          expect(killedSubmission.exit.signal === "SIGKILL" || (process.platform === "win32" && killedSubmission.exit.code !== 0)).toBe(true)
          killedInFlight = killedSubmission.killed
          expect((await B.start()).ok).toBe(true)
        }
      } finally { kill?.cancel() }
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
    const states = await prisma.$queryRawUnsafe<Json[]>(`SELECT d.sale_id,c.send_key,c.state,(SELECT count(*)::int FROM public.print_attempts a WHERE a.copy_id=c.id AND a.result<>'PRE_SEND_FAILED') effects
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
    expect(states.find(r => r.send_key === killedSubmission!.sendKey)?.state).toBe("UNKNOWN")
    expect(papers().filter(p => p.sale === killedSubmission!.sale)).toHaveLength(1)
    expect(readFileSync(journal("A"), "utf8").trim().split("\n").map(l => JSON.parse(l)).filter(r => r.sendKey === killedSubmission!.sendKey && r.phase === "SUBMITTING")).toHaveLength(1)
    const counts: Record<string, number> = {}
    for (const r of states) counts[r.state] = (counts[r.state] ?? 0) + 1
    if (process.env.PRINT_EVIDENCE_FILE) appendFileSync(process.env.PRINT_EVIDENCE_FILE, JSON.stringify({ sales: sales.length, spoolerCalls: papers().length, processes: pids.size, states: counts, maxPerSale: Math.max(0, ...bySale.values()), killedInFlight, killedSendKey: killedSubmission!.sendKey, killedAttemptId: killedSubmission!.attemptId, killedJournalPhase: killedSubmission!.phase, killedProcessExit: killedSubmission!.exit, at: new Date().toISOString() }) + "\n")
  })
})
