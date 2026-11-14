/** Real PostgreSQL + existing D02 triggers/core. Only the retention clock is advanced in the test adapter. */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { DirectPrintAdmin } from "../../lib/printing/direct/admin"
import { DirectPrintCore } from "../../lib/printing/direct/core"
import { insert, type Database, type Row, type Sql } from "../../lib/printing/direct/db"
import { CONTENT_RETENTION_DAYS, runPrintRetention } from "../../lib/printing/direct/retention"
import { assertDisposable, commercialDigest, confirmedSale, IDS, labPrisma, labRuntime, prismaDatabase, seed } from "../print-004c-e2e/lab-env"

const URL_ = process.env.PRINT_PG_URL
const DAY = 86_400_000
const runtime = labRuntime({ maxRequestsPerMinute: 10000 })
const principal = (id: string) => ({ principalId: id, observedSessionVersion: 0 })
const user = principal(IDS.caixaA), adminUser = principal(IDS.adminA)
const ownerUrl = (db: string) => { const u = new URL(assertDisposable(URL_!)); u.pathname = "/" + db; return u.toString() }
function pg(sql: string, database = "postgres") {
  const u = new URL(assertDisposable(URL_!))
  const exe = path.join(process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin", process.platform === "win32" ? "psql.exe" : "psql")
  const r = spawnSync(exe, ["-h", "127.0.0.1", "-p", u.port, "-U", "pgadmin", "-d", database, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", windowsHide: true })
  if (r.status !== 0) throw new Error(r.stderr)
}

/** Fault/clock injection lives only in the test adapter; production has no clock or retention override. */
function clockDb(db: Database, at: number, intercept?: (sql: Sql, q: string, v: readonly unknown[]) => Promise<number>): Database {
  return { ...db, transaction: body => db.transaction(sql => body({
    query: (async (q: string, v: readonly unknown[] = []) => q === "SELECT clock_timestamp() now" ? [{ now: new Date(at) }] : sql.query(q, v)) as Sql["query"],
    exec: (q, v = []) => intercept ? intercept(sql, q, v) : sql.exec(q, v),
  })) }
}

describe.skipIf(!URL_)("D03-A retention (disposable PostgreSQL)", { timeout: 120000 }, () => {
  let prisma: ReturnType<typeof labPrisma>, db: Database, core: DirectPrintCore
  let installA = "", installB = "", tokenA = "", seq = 0, database = ""
  const instance = randomUUID()
  beforeAll(async () => {
    const template = labPrisma(URL_!)
    await seed(template)
    const admin = new DirectPrintAdmin(prismaDatabase(template as never), runtime.policy)
    for (const [store, actor, terminal] of [[IDS.storeA, adminUser, IDS.t1A], [IDS.storeB, principal(IDS.platform), IDS.t1B]] as const) {
      const created = await admin.createInstallation(actor, store, "D03 lab")
      const paired = await admin.pair({ code: created.pairingCode, agentVersion: "d03-lab" })
      await admin.heartbeat(paired.installationId, { printers: [{ name: "D03 fake", online: true, status: "READY", isDefault: true, portKind: "LOCAL" }] })
      await admin.bindTerminal(actor, store, { terminalId: terminal, installationId: paired.installationId, printerName: "D03 fake", profileId: "THERMAL_80" })
      if (store === IDS.storeA) { installA = paired.installationId; tokenA = paired.token } else installB = paired.installationId
    }
    await template.$disconnect()
  }, 60000)
  beforeEach(() => {
    const template = new URL(assertDisposable(URL_!)).pathname.slice(1)
    database = `${template}_case_${++seq}`
    pg(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    pg(`CREATE DATABASE ${database} WITH TEMPLATE ${template} OWNER omni_print_lab_owner`)
    prisma = labPrisma(ownerUrl(database)); db = prismaDatabase(prisma as never)
    core = new DirectPrintCore(db, runtime.crypto, runtime.policy)
  }, 60000)
  afterEach(async () => { await prisma?.$disconnect(); pg(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`) }, 60000)
  const future = () => Date.now() + 8 * DAY
  const run = (at = future(), more = {}, port = db) => runPrintRetention(clockDb(port, at), { storeId: IDS.storeA, batchSize: 100, dryRun: false, ...more })
  const create = async (more: Row = {}, store = IDS.storeA) => {
    const sale = await confirmedSale(prisma, store)
    const actor = store === IDS.storeA ? user : principal(IDS.caixaB)
    const p = await core.prepare(actor, store, { saleId: sale.id, kind: "INITIAL", terminalId: store === IDS.storeA ? IDS.t1A : IDS.t1B, ...more })
    const job = await core.create(actor, p.key, p.command)
    return { sale, p, job: { ...job, documentId: p.command.documentId as string } }
  }
  const dispatch = async (installation = installA) => {
    const response = await core.claim(installation, instance)
    expect(response.dispatches.length).toBeGreaterThan(0)
    return response.dispatches[0]
  }
  const accepted = async (more: Row = {}, store = IDS.storeA, release = true) => {
    const fixture = await create(more, store), installation = store === IDS.storeA ? installA : installB
    const sent = await dispatch(installation)
    await core.report(installation, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "SPOOLER_ACCEPTED", release, spoolJobId: "123" })
    return { ...fixture, sent }
  }
  const contents = () => db.query(`SELECT c.id,c.payload_cipher IS NOT NULL payload,j.snapshot_cipher IS NOT NULL snapshot,r.command IS NOT NULL command,
    c.payload_purged_at,j.snapshot_purged_at,r.command_purged_at,c.send_key,r.id request_id,j.id job_id
    FROM public.print_copies c JOIN public.print_jobs j ON j.id=c.job_id JOIN public.print_requests r ON r.job_id=j.id ORDER BY c.id`)

  it("R01 before seven days preserved; exact final boundary; dry run counts without changing any row", async () => {
    const f = await accepted()
    await insert(db, "print_events", { id: randomUUID(), store_id: IDS.storeA, document_id: f.job.documentId, job_id: f.job.jobId,
      scope_kind: "DOCUMENT", event_type: "JOB_REGISTERED", proof_kind: "NONE", actor_kind: "SYSTEM", details: {} })
    const [{ end }] = await db.query("SELECT max(created_at) AS end FROM public.print_events WHERE job_id=$1::uuid", [f.job.jobId])
    const boundary = new Date(end).getTime() + CONTENT_RETENTION_DAYS * DAY
    expect((await run(boundary - 1)).purged.copies).toBe(0)
    const before = await contents()
    const dry = await run(boundary + 1, { dryRun: true })
    expect(dry.eligible).toMatchObject({ copies: 1, jobs: 1, events: 1 })
    expect(dry.purged).toEqual({ copies: 0, jobs: 0, requests: 0, events: 0 })
    expect(await contents()).toEqual(before)
    const done = await run()
    expect(done.errors).toEqual({}); expect(done.purged).toEqual({ copies: 1, jobs: 1, requests: 1, events: 1 })
  })
  it("R02 purge is irreversible/idempotent; no DELETE; hashes, sendKey/requestKey, first slot and key refs survive", async () => {
    const f = await accepted(), before = await contents(), commerce = await commercialDigest(prisma)
    expect((await run()).purged.copies).toBe(1)
    const after = await contents()
    expect(after[0]).toMatchObject({ payload: false, snapshot: false, command: false, send_key: before[0].send_key, request_id: before[0].request_id })
    expect((await run()).purged).toEqual({ copies: 0, jobs: 0, requests: 0, events: 0 })
    expect(await contents()).toEqual(after)
    for (const q of [
      `UPDATE public.print_copies SET payload_cipher='\\x00',payload_key_ref='k',payload_purged_at=NULL`,
      `UPDATE public.print_jobs SET snapshot_cipher='\\x00',snapshot_key_ref='k',snapshot_purged_at=NULL`,
      `UPDATE public.print_requests SET command='{}',command_purged_at=NULL`,
      `DELETE FROM public.print_jobs`, `DELETE FROM public.print_copies`, `DELETE FROM public.print_attempts`, `DELETE FROM public.print_events`,
    ]) await expect(db.exec(q)).rejects.toThrow(/p004/)
    const audit = await db.query("SELECT details FROM public.print_events WHERE event_type='CONTENT_PURGED'")
    expect(audit[0].details.snapshotKeyRef).toBe(runtime.crypto.keyRef)
    expect(audit[0].details.payloadKeyRefs[0].keyRef).toBe(runtime.crypto.keyRef)
    const replay = await core.create(user, f.p.key, f.p.command)
    expect(replay.jobId).toBe(f.job.jobId)
    expect((await core.claim(installA, instance)).dispatches).toHaveLength(0)
    await expect(core.retry(user, IDS.storeA, f.job.jobId)).rejects.toThrow()
    expect(await commercialDigest(prisma)).toBe(commerce)
  })
  it("R03 second copy reconstructs the sale only with fresh authorized consent, two tabs converge after purge", async () => {
    const f = await accepted(); await run()
    const quote = await core.quoteReprint(user, IDS.storeA, f.sale.id)
    const input = { saleId: f.sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: quote.consent }
    await expect(core.prepare(principal(IDS.tecnicoA), IDS.storeA, input)).rejects.toThrow("FORBIDDEN")
    await expect(core.prepare(principal(IDS.caixaB), IDS.storeA, input)).rejects.toThrow("FORBIDDEN")
    await expect(core.prepare(user, IDS.storeA, { ...input, consent: "forged" })).rejects.toThrow("INVALID_PROOF")
    const [a, b] = await Promise.all([core.prepare(user, IDS.storeA, input), core.prepare(user, IDS.storeA, input)])
    const [j1, j2] = await Promise.all([core.create(user, a.key, a.command), core.create(user, b.key, b.command)])
    expect(j1.jobId).toBe(j2.jobId); expect(j1.jobId).not.toBe(f.job.jobId)
    expect((await contents()).filter(c => c.payload)).toHaveLength(2) // same new copy joined to both requests
    expect((await core.create(user, f.p.key, f.p.command)).jobId).toBe(f.job.jobId)
    const [c1, c2] = await Promise.all([core.claim(installA, randomUUID()), core.claim(installA, randomUUID())])
    expect(c1.dispatches.length + c2.dispatches.length).toBe(1)
  })
  it("R04 READY/SENDING/UNKNOWN and partial operations are preserved even after years", async () => {
    await create({ copies: 2 })
    expect((await run(Date.now() + 365 * DAY)).purged.copies).toBe(0)
    const sent = await dispatch()
    expect((await run()).purged.copies).toBe(0)
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "UNKNOWN", release: true, reason: "TIMEOUT_AFTER_SUBMIT" })
    expect((await run(Date.now() + 365 * DAY)).purged).toEqual({ copies: 0, jobs: 0, requests: 0, events: 0 })
    const evidence = await db.query("SELECT details FROM public.print_events WHERE event_type='RESULT_UNKNOWN'")
    expect(evidence[0].details).toMatchObject({ evidenceKey: "UNKNOWN:true", reason: "TIMEOUT_AFTER_SUBMIT" })
    expect(evidence[0].details.evidenceHash).toMatch(/^[a-f0-9]{64}$/)
  })
  it("R05 evidence of UNKNOWN survives reconciliation; accepted with held egress is preserved", async () => {
    const f = await create(), sent = await dispatch()
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "UNKNOWN", release: false, reason: "TIMEOUT_AFTER_SUBMIT" })
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "SPOOLER_ACCEPTED", release: false, spoolJobId: "123" })
    expect((await run()).purged.copies).toBe(0)
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "SPOOLER_ACCEPTED", release: true, spoolJobId: "123" })
    const proofs = await db.query("SELECT id,evidence_key,evidence_hash,details FROM public.print_events WHERE details IS NOT NULL")
    expect((await run()).purged.copies).toBe(1)
    expect(await db.query("SELECT id,evidence_key,evidence_hash,details FROM public.print_events WHERE details IS NOT NULL AND event_type NOT IN ('CONTENT_PURGED','REQUEST_CONTENT_PURGED')")).toEqual(proofs)
    expect(await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "UNKNOWN", release: false, reason: "TIMEOUT_AFTER_SUBMIT" })).toMatchObject({ replay: true })
    expect((await core.get(user, IDS.storeA, f.job.jobId)).phase).toBe("IN_PRINTER_QUEUE")
  })
  it("R06 final failure waits for retry expiry; cancellation without a proven date is preserved", async () => {
    const f = await create(), sent = await dispatch()
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "NO_EFFECT", release: true, reason: "PRINTER_NOT_FOUND" })
    expect((await run(Date.now() + 7 * DAY)).purged.copies).toBe(0)
    expect((await run()).purged.copies).toBe(1)
    const missing = await create()
    await db.exec("UPDATE public.print_copies SET state='CANCELLED' WHERE job_id=$1::uuid", [missing.job.jobId])
    expect((await run()).purged.copies).toBe(0)
    expect((await core.get(user, IDS.storeA, f.job.jobId)).phase).toBe("FAILED_BEFORE_SEND")
  })
  it("R07 unconsumed expired requests lose only command; browser consent/reason/firstCopy remains permanent", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const p = await core.prepare(user, IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A })
    expect((await run()).purged.requests).toBe(1)
    await expect(core.create(user, p.key, p.command)).rejects.toThrow("REQUEST_EXPIRED")
    const f = await create()
    const quote = await core.quoteReprint(user, IDS.storeA, f.sale.id)
    await core.browserFallback(user, IDS.storeA, { saleId: f.sale.id, origin: "REPRINT", consent: quote.consent })
    const before = await db.query("SELECT details FROM public.print_events WHERE event_type='BROWSER_FALLBACK_PRINTED'")
    expect((await run()).purged.copies).toBe(1)
    expect(await db.query("SELECT details FROM public.print_events WHERE event_type='BROWSER_FALLBACK_PRINTED'")).toEqual(before)
  })
  it("R08 store-scoped job cannot touch the other store; replay stays scoped after cleanup", async () => {
    const a = await accepted(), b = await accepted({}, IDS.storeB)
    expect((await run()).purged.copies).toBe(1)
    const rows = await contents()
    expect(rows.find(c => c.job_id === b.job.jobId)?.payload).toBe(true)
    expect(rows.find(c => c.job_id === a.job.jobId)?.payload).toBe(false)
    await expect(core.get(user, IDS.storeB, b.job.jobId)).rejects.toThrow("FORBIDDEN")
    const admin = new DirectPrintAdmin(db, runtime.policy)
    await expect(admin.authenticateAgent("Bearer invalid")).rejects.toThrow("AGENT_UNAUTHENTICATED")
    await expect(admin.authenticateAgent("Bearer " + tokenA.slice(0, -4) + "abcd")).rejects.toThrow("AGENT_UNAUTHENTICATED")
  })
  it("R09 failure in the middle of a document rolls back content AND purge evidence, then resumes", async () => {
    await accepted()
    let injected = false
    const interrupted = clockDb(db, future(), async (sql, q, v) => {
      if (!injected && q.includes("UPDATE public.print_jobs SET snapshot_cipher")) { injected = true; throw new Error("fault-before-COMMIT-secret") }
      return sql.exec(q, v)
    })
    const failed = await runPrintRetention(interrupted, { storeId: IDS.storeA, dryRun: false })
    expect(injected).toBe(true); expect(failed.errors).toEqual({ RETENTION_FAILED: 1 }); expect(failed.purged.copies).toBe(0)
    expect((await contents())[0].payload).toBe(true)
    expect(await db.query("SELECT id FROM public.print_events WHERE event_type='CONTENT_PURGED'")).toHaveLength(0)
    expect((await run()).purged).toMatchObject({ copies: 1, jobs: 1, requests: 1 })
  })
  it("R10 lost response after COMMIT and two retention workers do not duplicate events or updates", async () => {
    await accepted()
    let failed = false
    const lost: Database = { ...db, transaction: async body => {
      const result = await clockDb(db, future()).transaction(body)
      if (!failed && (await contents())[0].payload === false) { failed = true; throw new Error("lost after COMMIT") }
      return result
    } }
    expect((await runPrintRetention(lost, { storeId: IDS.storeA, dryRun: false })).errors).toEqual({ RETENTION_FAILED: 1 })
    const before = await contents()
    await Promise.all([run(), run()])
    expect(await contents()).toEqual(before)
    expect(await db.query("SELECT id FROM public.print_events WHERE event_type='CONTENT_PURGED'")).toHaveLength(1)
    const next = await accepted()
    const [a, b] = await Promise.all([run(), run()])
    expect(a.purged.copies + b.purged.copies).toBe(1)
    expect((await contents()).find(c => c.job_id === next.job.jobId)?.payload).toBe(false)
  })
  it("R11 busy document is skipped without waiting, timeout rolls back and next run resumes", async () => {
    const f = await accepted()
    let release!: () => void, ready!: () => void
    const acquired = new Promise<void>(r => { ready = r }), hold = new Promise<void>(r => { release = r })
    const lock = db.transaction(async sql => { await sql.query("SELECT id FROM public.print_documents WHERE id=$1::uuid FOR UPDATE", [f.job.documentId]); ready(); await hold })
    await acquired
    try { const r = await run(); expect(r.busyDocuments).toBe(1); expect(r.purged.copies).toBe(0) } finally { release(); await lock }
    let timeout = false
    const slow = clockDb(db, future(), async (sql, q, v) => {
      if (q.includes("UPDATE public.print_copies SET payload_cipher")) { timeout = true; await sql.query("SELECT pg_sleep(6)") }
      return sql.exec(q, v)
    })
    const r = await runPrintRetention(slow, { storeId: IDS.storeA, dryRun: false })
    expect(timeout).toBe(true); expect(r.errors).toEqual({ DATABASE_TIMEOUT: 1 })
    expect((await contents())[0].payload).toBe(true)
    expect((await run()).purged.copies).toBe(1)
  })
  it("R12 least privilege role runs without keys, cannot delete/change state/read commerce; invalid role is refused", async () => {
    await accepted()
    pg("DO $$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='omni_print_retention') THEN CREATE ROLE omni_print_retention LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END$$")
    pg(readFileSync(path.join(__dirname, "least-privilege.sql"), "utf8"), database)
    const url = new URL(ownerUrl(database)); url.username = "omni_print_retention"; url.password = "lab"
    const restricted = labPrisma(url.toString()), least = prismaDatabase(restricted as never)
    try {
      expect((await run(future(), {}, least)).errors).toEqual({})
      expect((await contents())[0].payload).toBe(false)
      for (const q of ["SELECT * FROM public.vendas", "DELETE FROM public.print_requests", "UPDATE public.print_copies SET state='READY'", "UPDATE public.print_documents SET id=gen_random_uuid()"])
        await expect(least.exec(q)).rejects.toThrow()
    } finally { await restricted.$disconnect() }
    url.username = "d03_no_such_role"
    const invalid = labPrisma(url.toString())
    try { await expect(invalid.$queryRawUnsafe("SELECT 1")).rejects.toThrow() } finally { await invalid.$disconnect() }
  })
  it("R13 bounded pages handle volume, interrupted batches resume and busy rows remain for the next sweep", async () => {
    for (let i = 0; i < 110; i++) {
      const sale = await confirmedSale(prisma, IDS.storeA)
      await core.prepare(user, IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A })
    }
    const first = await run(future(), { batchSize: 10 })
    expect(first.scannedDocuments).toBe(10); expect(first.hasMore).toBe(true); expect(first.purged.requests).toBe(10)
    // Deliberately stop between pages; a new process resumes only with the opaque document cursor.
    const second = await run(future(), { afterDocumentId: first.nextDocumentId, batchSize: 100 })
    expect(second.scannedDocuments).toBe(100); expect(second.hasMore).toBe(false); expect(second.purged.requests).toBe(100)
    expect((await run(future())).purged.requests).toBe(0)
  })
  it("R14 legacy cancellation after browser-while-SENDING + late NO_EFFECT + REPRINT cannot use the old browser date", async () => {
    const f = await create(), sent = await dispatch()
    const q1 = await core.quoteReprint(user, IDS.storeA, f.sale.id)
    await core.browserFallback(user, IDS.storeA, { saleId: f.sale.id, origin: "REPRINT", consent: q1.consent })
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "NO_EFFECT", release: true, reason: "PRINTER_NOT_FOUND" })
    // Reproduce the pre-D03 bulk cancellation: state changed but there was no copy-level cancellation event.
    const legacyDb: Database = { ...db, transaction: body => db.transaction(sql => body({ ...sql,
      exec: (q, v = []) => q.includes('INSERT INTO public."print_events"') && v.includes("COPY_CANCELLED") ? Promise.resolve(0) : sql.exec(q, v),
    })) }
    const legacyCore = new DirectPrintCore(legacyDb, runtime.crypto, runtime.policy)
    const q2 = await legacyCore.quoteReprint(user, IDS.storeA, f.sale.id)
    const prepared = await legacyCore.prepare(user, IDS.storeA, { saleId: f.sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: q2.consent })
    await legacyCore.create(user, prepared.key, prepared.command)
    expect((await db.query("SELECT state FROM public.print_copies WHERE id=$1::uuid", [sent.copyId]))[0].state).toBe("CANCELLED")
    expect(await db.query("SELECT id FROM public.print_events WHERE copy_id=$1::uuid AND event_type='COPY_CANCELLED'", [sent.copyId])).toHaveLength(0)
    expect((await run()).purged.copies).toBe(0)
    expect((await contents()).find(c => c.job_id === f.job.jobId)?.payload).toBe(true)
  })
  it("R15 UNKNOWN alone is preserved, even with finished_at and released egress; oversized documents fail closed", async () => {
    const f = await create(), sent = await dispatch()
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "UNKNOWN", release: true, reason: "TIMEOUT_AFTER_SUBMIT" })
    expect((await run(Date.now() + 365 * DAY)).purged).toEqual({ copies: 0, jobs: 0, requests: 0, events: 0 })
    await db.exec(`INSERT INTO public.print_events(id,store_id,document_id,job_id,scope_kind,event_type,proof_kind,actor_kind)
      SELECT gen_random_uuid(),$1,$2::uuid,$3::uuid,'DOCUMENT','LAB_EVENT','NONE','SYSTEM' FROM generate_series(1,1001)`, [IDS.storeA, f.job.documentId, f.job.jobId])
    const r = await run(); expect(r.oversizedDocuments).toBe(1); expect(r.purged.copies).toBe(0)
  })
  it("R16 B19/B23 historical REPRINT closes INITIAL permanently, including after purge", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA, { minutesAgo: 120 })
    const quote = await core.quoteReprint(user, IDS.storeA, sale.id)
    const p = await core.prepare(user, IDS.storeA, { saleId: sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: quote.consent })
    const job = await core.create(user, p.key, p.command), sent = await dispatch()
    await core.report(installA, { attemptId: sent.attemptId, sendKey: sent.sendKey, result: "SPOOLER_ACCEPTED", release: true, spoolJobId: "123" })
    expect((await run()).purged.copies).toBe(1)
    expect((await db.query("SELECT initial_state,closed_by_intent_id FROM public.print_documents WHERE sale_id=$1", [sale.id]))[0])
      .toMatchObject({ initial_state: "HISTORICAL_CLOSED", closed_by_intent_id: p.command.intentId })
    await expect(core.prepare(user, IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A })).rejects.toThrow()
    expect((await db.query("SELECT count(*)::int n FROM public.print_jobs WHERE id=$1::uuid", [job.jobId]))[0].n).toBe(1)
    expect((await core.claim(installA, instance)).dispatches).toHaveLength(0)
  })
  it("R17 CLI defaults to dry run; execution disabled and invalid credentials never expose SQL/URL/secret", async () => {
    await accepted()
    const args = ["node_modules/tsx/dist/cli.mjs", "tools/print-d03/run.ts", "--store", IDS.storeA, "--expect-host", "127.0.0.1", "--expect-db", database]
    const invoke = (extra: string[], url = ownerUrl(database)) => spawnSync(process.execPath, [...args, ...extra], { encoding: "utf8", windowsHide: true, timeout: 30000,
      env: { ...process.env, OMNI_PRINT_RETENTION_DATABASE_URL: url, OMNI_PRINT_RETENTION_ENABLED: "" } })
    const dry = invoke([])
    expect(dry.status).toBe(0); expect(JSON.parse(dry.stdout).mode).toBe("DRY_RUN")
    expect((await contents())[0].payload).toBe(true)
    const refused = invoke(["--execute"])
    expect(refused.status).toBe(2); expect(JSON.parse(refused.stdout).error).toBe("RETENTION_OPTIONS_REFUSED")
    const invalid = new URL(ownerUrl(database)); invalid.username = "d03_no_such_role"; invalid.password = "sentinel-secret-never-log"
    const bad = invoke([], invalid.toString()), output = bad.stdout + bad.stderr
    expect(bad.status).toBe(3); expect(JSON.parse(bad.stdout).error).toMatch(/DATABASE_ACCESS_DENIED|RETENTION_FAILED/)
    expect(output).not.toContain("sentinel-secret-never-log"); expect(output).not.toContain("postgresql:"); expect(output).not.toContain("SELECT ")
  })
})
