/**
 * D02 rehearsal: applies the FUTURE layout with psql exactly as a production window would (00 outside a transaction,
 * 01-futura and 02 with their own BEGIN/COMMIT) and measures what happens to sales while it runs.
 *  - 00 (CONCURRENTLY): sales keep writing; a sale open longer than the file's lock_timeout leaves an INVALID index
 *    that blocks a naive re-run until DROP INDEX CONCURRENTLY.
 *  - 01-futura/02 add FKs to vendas/stores/admin_users/pdv_terminais (SHARE ROW EXCLUSIVE until COMMIT): as written
 *    (no lock_timeout), one open sale makes every new sale queue behind the migration.
 *  - The numbered migration to be cut at D02 must carry its own guard right after BEGIN (CUT_GUARD below): a local
 *    lock_timeout and the parent locks taken up front, vendas first. Then the migration gives up atomically, a queued
 *    sale waits about the timeout and terminal heartbeats are never held.
 *  - d02/rollback_print_candidate.sql returns to the baseline without touching sales; under load it gives up
 *    atomically instead of stalling; the cycle can be repeated.
 * Every test prepares its own starting state, so any single test can run alone.
 * Disposable PostgreSQL only; database reset with PRINT_LAB_LAYOUT=baseline (no print objects).
 */
import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { assertDisposable, labPrisma } from "./lab-env"

const URL_ = process.env.PRINT_PG_URL
const BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin"
const MIG = path.resolve(__dirname, "candidate-migrations")
const F00 = path.join(MIG, "future/00_parent_indexes_concurrently.sql")
const F01 = path.join(MIG, "future/01_print_core_without_parent_indexes.sql")
const F02 = path.join(MIG, "02_20261102_print_local_agent_candidate.sql")
const ROLLBACK = path.resolve(__dirname, "d02/rollback_print_candidate.sql")
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Small pools: several clients must not exhaust the lab server connections. */
const small = (u?: string) => {
  const url = new URL(u ?? "postgresql://x@127.0.0.1/print_lab_unused")
  url.searchParams.set("connection_limit", "2")
  return url.toString()
}

/**
 * Guard the cut migration must carry right after BEGIN (D02). Parent locks are taken up front with vendas FIRST: while
 * the migration waits for an open sale it holds nothing else, so terminal heartbeats and logins keep working while it
 * waits (during the sub-second execution itself they do wait).
 */
export const CUT_GUARD: Record<"01" | "02", string> = {
  "01": "SET LOCAL lock_timeout = '2s';\nLOCK TABLE public.vendas IN SHARE ROW EXCLUSIVE MODE;\nLOCK TABLE public.pdv_terminais, public.stores, public.admin_users IN SHARE ROW EXCLUSIVE MODE;\n",
  "02": "SET LOCAL lock_timeout = '2s';\nLOCK TABLE public.stores, public.admin_users IN SHARE ROW EXCLUSIVE MODE;\n",
}
let tmp = ""
/** Body of a candidate file between its single top-level BEGIN and COMMIT (the candidate files stay untouched). */
function body(file: string) {
  const sql = readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  const at = sql.indexOf("\nBEGIN;\n"), end = sql.lastIndexOf("\nCOMMIT;")
  if (at < 0 || sql.indexOf("\nBEGIN;\n", at + 1) >= 0 || end < at) throw new Error("expected exactly one top-level BEGIN/COMMIT in " + file)
  return { head: sql.slice(0, at + 1), inner: sql.slice(at + 8, end + 1), tail: sql.slice(end + 1) }
}
function write(name: string, sql: string) {
  const out = path.join(tmp, name)
  writeFileSync(out, sql)
  return out
}
/** The candidate file with CUT_GUARD inserted right after its BEGIN. */
function guarded(file: string, which: "01" | "02") {
  const b = body(file)
  return write(`guarded_${which}.sql`, b.head + "BEGIN;\n" + CUT_GUARD[which] + b.inner + b.tail)
}
const G01 = () => guarded(F01, "01")
const G02 = () => guarded(F02, "02")
/** Recommended cut (ii): 01-futura + 02 in ONE transaction; guard "01" already covers every parent of both. */
const CUT_II = () => write("cut_ii.sql", "BEGIN;\n" + CUT_GUARD["01"] + body(F01).inner + body(F02).inner + "COMMIT;\n")

type PsqlResult = { code: number | null; out: string; ms: number }
/** psql -f with ON_ERROR_STOP, never -1 (files carry their own transactions); no PGOPTIONS unless asked. */
function psqlFile(file: string, lockTimeout?: string): Promise<PsqlResult> {
  const u = new URL(assertDisposable(URL_))
  const env: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: decodeURIComponent(u.password), PGAPPNAME: "d02-rehearsal" }
  if (lockTimeout) env.PGOPTIONS = `-c lock_timeout=${lockTimeout}`
  else delete env.PGOPTIONS
  const started = Date.now()
  return new Promise(resolve => {
    const p = spawn(path.join(BIN, "psql.exe"), ["-h", u.hostname, "-p", u.port || "5432", "-U", decodeURIComponent(u.username), "-d", u.pathname.slice(1),
      "-v", "ON_ERROR_STOP=1", "-X", "-q", "-f", file], { env, windowsHide: true })
    let out = ""
    p.stdout.on("data", d => { out += d })
    p.stderr.on("data", d => { out += d })
    p.on("close", code => resolve({ code, out, ms: Date.now() - started }))
  })
}
const ok = async (file: string, lockTimeout?: string) => {
  const r = await psqlFile(file, lockTimeout)
  expect(r.code, r.out).toBe(0)
}

describe.skipIf(!URL_)("D02 — ensaio de aplicação, trava e rollback do schema candidato", { timeout: 120_000 }, () => {
  const holder = labPrisma(small(URL_))
  const writer = labPrisma(small(URL_))
  const reader = labPrisma(small(URL_))
  let n = 0
  /** A new sale as the PDV writes it; returns how long it took (it may legitimately wait for a lock). */
  const insertSale = (lockTimeout = "8s") => {
    const started = Date.now()
    return writer.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockTimeout}'`)
      await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'d02-lab',$2,1)`, "d02-v-" + ++n, "D02-" + n)
    }).then(() => Date.now() - started)
  }
  /** Terminal heartbeat as /api/ops/terminal/heartbeat does it (UPDATE pdv_terminais). */
  const heartbeat = () => {
    const started = Date.now()
    return reader.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '1500ms'`)
      await tx.$executeRawUnsafe(`UPDATE public.pdv_terminais SET "heartbeatAt"=now() WHERE id='d02-term'`)
    }).then(() => Date.now() - started)
  }
  /** An in-flight sale transaction (uncommitted INSERT) held until release(). */
  const openSale = () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const done = holder.$transaction(async tx => {
      await tx.$executeRawUnsafe(`INSERT INTO public.vendas(id,"storeId","pedidoId",total) VALUES ($1,'d02-lab',$2,1)`, "d02-hold-" + ++n, "D02-H-" + n)
      await gate
    }, { maxWait: 5000, timeout: 60000 })
    return { release, done }
  }
  /** Proof (pg_stat_activity, not a sleep) that the psql session is waiting on a lock. */
  const waitPsqlBlocked = async () => {
    for (let i = 0; i < 150; i++) {
      const rows = await reader.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM pg_stat_activity WHERE application_name='d02-rehearsal' AND wait_event_type='Lock'`)
      if (rows[0].n > 0) return
      await sleep(100)
    }
    throw new Error("migration never blocked on a lock")
  }
  /** Lock modes the psql session is waiting for, per table (from pg_locks, granted = false). */
  const pendingLocks = () => reader.$queryRawUnsafe<Array<{ rel: string; mode: string }>>(`SELECT c.relname rel, l.mode FROM pg_locks l
    JOIN pg_stat_activity s ON s.pid=l.pid JOIN pg_class c ON c.oid=l.relation WHERE s.application_name='d02-rehearsal' AND NOT l.granted`)
  const printObjects = async () => {
    const [r] = await reader.$queryRawUnsafe<Array<{ tables: number; functions: number; indexes: number }>>(`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relkind='r' AND c.relname LIKE 'print\\_%') tables,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname LIKE 'p004\\_%') functions,
      (SELECT count(*)::int FROM pg_class c WHERE c.relkind='i' AND c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq')) indexes`)
    return r
  }
  const parentIndexes = () => reader.$queryRawUnsafe<Array<{ name: string; valid: boolean }>>(
    `SELECT c.relname name, i.indisvalid valid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname IN ('p004_vendas_id_store_uq','p004_term_id_store_uq') ORDER BY 1`)
  const salesCount = async () => (await reader.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int n FROM public.vendas WHERE "storeId"='d02-lab'`))[0].n
  const NONE = { tables: 0, functions: 0, indexes: 0 }, INDEXES_ONLY = { tables: 0, functions: 0, indexes: 2 }, FULL = { tables: 11, functions: 7, indexes: 2 }
  /** Starting state of a test: baseline, baseline + 00, or the full future layout (guarded cut). */
  const prepare = async (state: "baseline" | "indexes" | "full") => {
    await ok(ROLLBACK)
    if (state !== "baseline") await ok(F00)
    if (state === "full") await ok(CUT_II())
    expect(await printObjects()).toEqual(state === "baseline" ? NONE : state === "indexes" ? INDEXES_ONLY : FULL)
  }

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "p004c-d02-"))
    await writer.$executeRawUnsafe(`INSERT INTO public.stores(id,name,"updatedAt") VALUES ('d02-lab','Lab D02',now()) ON CONFLICT DO NOTHING`)
    await writer.$executeRawUnsafe(`INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES ('d02-term','d02-lab','PDV1','PDV 1',now()) ON CONFLICT DO NOTHING`)
  })
  // A failed assertion must not leave a sale transaction open for the next test.
  let pending: Array<{ release: () => void; done: Promise<unknown> }> = []
  beforeEach(async () => { for (const p of pending) { p.release(); await p.done.catch(() => undefined) } pending = [] })
  const track = (s: ReturnType<typeof openSale>) => { pending.push(s); return s }
  afterAll(async () => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
    for (const p of pending) { p.release(); await p.done.catch(() => undefined) }
    await Promise.all([holder.$disconnect(), writer.$disconnect(), reader.$disconnect()])
  })

  it("00 CONCURRENTLY com venda aberta por 1 s: novas vendas gravam durante a espera; índices terminam VÁLIDOS", async () => {
    await prepare("baseline")
    const sale = track(openSale())
    await sleep(500)
    const run = psqlFile(F00)
    await waitPsqlBlocked()
    expect(await insertSale("1500ms")).toBeLessThan(1500)
    await sleep(500)
    sale.release(); await sale.done
    const r = await run
    expect(r.code, r.out).toBe(0)
    expect(await parentIndexes()).toEqual([{ name: "p004_term_id_store_uq", valid: true }, { name: "p004_vendas_id_store_uq", valid: true }])
  })

  it("01-futura como está (sem lock_timeout) com venda aberta: a migration espera e as vendas novas ficam presas atrás dela", async () => {
    await prepare("indexes")
    const sale = track(openSale())
    await sleep(500)
    const run = psqlFile(F01)
    await waitPsqlBlocked()
    expect(await pendingLocks()).toEqual([{ rel: "vendas", mode: "ShareRowExclusiveLock" }])
    // A sale that normally takes milliseconds cannot get its lock while the migration is queued.
    await expect(insertSale("1500ms")).rejects.toThrow(/lock timeout|55P03/i)
    sale.release(); await sale.done
    const r = await run
    expect(r.code, r.out).toBe(0)
  })

  it("recorte (ii) = 01-futura + 02 numa transação COM a guarda no arquivo e venda aberta: desiste inteira em ~2 s, venda nova espera e segue, heartbeat do terminal não trava", async () => {
    await prepare("indexes")
    const sale = track(openSale())
    await sleep(500)
    const run = psqlFile(CUT_II()) // no PGOPTIONS: the guard inside the file is what protects sales
    await waitPsqlBlocked()
    expect(await pendingLocks()).toEqual([{ rel: "vendas", mode: "ShareRowExclusiveLock" }]) // nothing else held yet
    expect(await heartbeat()).toBeLessThan(500)
    const queued = await insertSale("8s") // queued behind the migration until it gives up
    const r = await run
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/lock timeout/i)
    expect(r.ms).toBeLessThan(6000)
    expect(queued).toBeGreaterThanOrEqual(300) // it really waited behind the migration
    expect(queued).toBeLessThan(4000)
    expect(await printObjects()).toEqual(INDEXES_ONLY) // atomic: nothing from 01 or 02 committed
    sale.release(); await sale.done
    await ok(CUT_II()) // retry in a quiet moment, as the recommended single-transaction cut (ii)
    expect(await printObjects()).toEqual(FULL)
  })

  it("rollback com venda aberta: desiste inteiro (ledger intacto) em vez de travar; sem carga remove tudo sem tocar vendas; ciclo se repete", async () => {
    await prepare("full")
    const sales = await salesCount()
    const sale = track(openSale())
    await sleep(500)
    const run = psqlFile(ROLLBACK)
    await waitPsqlBlocked()
    // Measured effect (PostgreSQL 17): dropping the FKs needs ACCESS EXCLUSIVE on the parents. With the locks taken up
    // front, vendas first, the rollback waits on vendas holding nothing else: logins (admin_users) and heartbeats keep
    // working, but even READS of vendas wait behind it until it gives up.
    expect(await pendingLocks()).toEqual([{ rel: "vendas", mode: "AccessExclusiveLock" }])
    expect(await heartbeat()).toBeLessThan(500)
    const login = Date.now()
    await reader.$queryRawUnsafe(`SELECT count(*) FROM public.admin_users`)
    expect(Date.now() - login).toBeLessThan(500)
    const readStarted = Date.now()
    await writer.$queryRawUnsafe(`SELECT count(*) FROM public.vendas WHERE "storeId"='d02-lab'`)
    const readWaited = Date.now() - readStarted
    const r = await run
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/lock timeout/i)
    expect(readWaited).toBeGreaterThanOrEqual(300) // the read really waited behind the rollback…
    expect(readWaited).toBeLessThan(4000) // …only until it gave up
    console.log(`D02 rollback under load: vendas read waited ${readWaited} ms; rollback gave up after ${r.ms} ms`)
    expect(await printObjects()).toEqual(FULL) // atomic: nothing dropped
    sale.release(); await sale.done
    await ok(ROLLBACK)
    expect(await printObjects()).toEqual(NONE)
    expect(await salesCount()).toBe(sales + 1)
    await ok(F00); await ok(G01()); await ok(G02()) // the two-file variant applies as well
    expect(await printObjects()).toEqual(FULL)
    expect(await insertSale()).toBeLessThan(1000)
  })

  it("00 com venda aberta além do lock_timeout do arquivo (5 s): índice fica INVÁLIDO; reaplicar sem limpar falha; DROP CONCURRENTLY + reaplicar resolve", async () => {
    await prepare("baseline")
    const sale = track(openSale())
    await sleep(500)
    const run = psqlFile(F00)
    await waitPsqlBlocked()
    expect(await insertSale("1500ms")).toBeLessThan(1500) // sales are never blocked by the concurrent build
    const r = await run // gives up after the file's own lock_timeout while the sale is still open
    sale.release(); await sale.done
    expect(r.code).not.toBe(0)
    expect(r.out).toMatch(/lock timeout/i)
    expect(await parentIndexes()).toEqual([{ name: "p004_vendas_id_store_uq", valid: false }])
    const naive = await psqlFile(F00)
    expect(naive.code).not.toBe(0)
    expect(naive.out).toMatch(/already exists/i)
    await writer.$executeRawUnsafe(`DROP INDEX CONCURRENTLY public."p004_vendas_id_store_uq"`)
    await ok(F00)
    expect(await parentIndexes()).toEqual([{ name: "p004_term_id_store_uq", valid: true }, { name: "p004_vendas_id_store_uq", valid: true }])
  })
})
