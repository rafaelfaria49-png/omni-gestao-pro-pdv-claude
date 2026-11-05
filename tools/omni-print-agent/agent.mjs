#!/usr/bin/env node
// Omni Print local agent (OMNI-PRINT-004C candidate). Outbound-only: it never listens on a port,
// so a web page cannot reach it (no 127.0.0.1 assumption, no CORS/PNA surface, no SSRF relay).
// It pulls jobs leased to its installation, prints RAW to the bound queue and reports a spooler-level result.
// A spooler acceptance is NOT a physical print confirmation and is never reported as one.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, fsyncSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { AGENT_VERSION, createClient, HttpError, normalizeServerUrl, REASONS, sha256Hex, validateEscPos } from "./protocol.mjs"
import { Journal, PHASE } from "./journal.mjs"
import { acquireLease } from './runtime.mjs'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const PERMANENT_REPORT_ERRORS = new Set(["INVALID_REPORT", "PROOF_SCOPE_MISMATCH", "PROOF_CONFLICT", "RESULT_CONFLICT", "NOT_FOUND"])
function withTimeout(promise, ms) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("TIMEOUT"), { timeout: true })), ms) })]).finally(() => clearTimeout(timer))
}

export class Agent {
  static async create(opts) {
    const lease = await acquireLease(opts.journalFile, {transport:true})
    try { return new Agent({ ...opts, lease }) } catch (e) { await lease.release(); throw e }
  }
  /**
   * @param {{ serverUrl: string, token: string, journalFile: string, spooler: any, fetchImpl?: typeof fetch,
   *   statusTimeoutMs?: number, submitTimeoutMs?: number, hooks?: { afterSubmitBeforeJournal?: () => void }, log?: (e: object) => void }} opts
   */
  constructor(opts) {
    this.serverUrl = normalizeServerUrl(opts.serverUrl)
    this.call = createClient({ serverUrl: this.serverUrl, token: opts.token, fetchImpl: opts.fetchImpl })
    this.spooler = opts.spooler
    this.statusTimeoutMs = opts.statusTimeoutMs ?? 10_000
    this.submitTimeoutMs = opts.submitTimeoutMs ?? 20_000
    // Submitting must finish (submit + host kill) and be reported inside the server lease.
    this.minSendBudgetMs = opts.minSendBudgetMs ?? this.submitTimeoutMs + 15_000
    this.hooks = opts.hooks ?? {}
    this.log = opts.log ?? (() => {})
    this.stopped = false
    this.stopReason = 'INTENTIONAL'
    this.shouldStop = opts.shouldStop ?? (() => false)
    this.lease = opts.lease ?? null
    this.lockFile = opts.journalFile + ".lock"
    mkdirSync(path.dirname(this.lockFile), { recursive: true })
    if (!this.lease) this.acquireLock()
    try {
    this.journal = new Journal(opts.journalFile)
    // Stable identity of THIS journal: the server fences attempts to it, so only this process can get a redelivery.
    const idFile = opts.journalFile + ".instance"
    if (!existsSync(idFile)) { const fd = openSync(idFile, 'wx'); try { writeFileSync(fd, randomUUID()); fsyncSync(fd) } finally { closeSync(fd) } }
    this.instanceId = readFileSync(idFile, "utf8").trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.instanceId)) throw new Error('INSTANCE_CORRUPT')
    this.journal.recover()
    } catch (e) { if (!this.lease) this.releaseLock(); throw e }
  }

  /** One process per journal: a second agent on the same journal would break the sendKey dedup authority. */
  acquireLock() {
    try { const fd = openSync(this.lockFile, "wx"); writeFileSync(fd, String(process.pid)); closeSync(fd); return }
    catch (e) { if (e?.code !== "EEXIST") throw e }
    // Synchronous constructor is for isolated existing harnesses only. Recovery uses create() + OS lease.
    throw new Error("AGENT_ALREADY_RUNNING")
  }
  releaseLock() { if (this.lease) return this.lease.release(); try { if (readFileSync(this.lockFile, 'utf8') === String(process.pid)) unlinkSync(this.lockFile) } catch { /* already gone */ } }

  async heartbeat() {
    let printers = []
    try { printers = await withTimeout(this.spooler.listPrinters(), 30_000) } catch { printers = [] }
    await this.call("/api/print/agent/heartbeat", { printers: printers.map(p => ({ name: String(p.name).slice(0, 120), online: !!p.online,
      status: String(p.status ?? "UNKNOWN").slice(0, 40), isDefault: !!p.isDefault, portKind: String(p.portKind ?? "UNKNOWN").slice(0, 20) })), agentVersion: AGENT_VERSION })
  }

  /**
   * Sends every journaled-but-unreported outcome. Only answers that can never change are treated as final;
   * transient ones (404 DIRECT_PRINT_DISABLED, 409 LEDGER_GUARD, 5xx, network) keep the outcome pending (P2-1).
   */
  async flushReports() {
    for (const e of this.journal.unreported()) {
      const outcome = this.journal.outcomeOf(e)
      try {
        await this.call("/api/print/agent/report", { attemptId: e.attemptId, sendKey: e.sendKey, ...outcome })
        this.journal.append({ sendKey: e.sendKey, attemptId: e.attemptId, phase: PHASE.REPORTED })
      } catch (err) {
        if (err instanceof HttpError && PERMANENT_REPORT_ERRORS.has(err.code)) {
          this.log({ event: "report_rejected", sendKey: e.sendKey, code: err.code })
          this.journal.append({ sendKey: e.sendKey, attemptId: e.attemptId, phase: PHASE.REPORTED })
        } else throw err
      }
    }
  }

  /** One dispatch. The journal entry is durable BEFORE the spooler sees a byte; a known sendKey is never resubmitted. */
  async handle(d, receivedAt = Date.now()) {
    if (this.lease && !this.lease.alive()) throw new Error('LEASE_LOST')
    const known = this.journal.get(d.sendKey)
    // sendKey identifies the copy's effect. Only a NEW attempt after a PROVEN no-effect may submit again;
    // anything that might have reached the spooler (SUBMITTING/ACCEPTED/UNKNOWN/TOMBSTONE) is never resubmitted.
    const provenRetry = known && known.phase === PHASE.NO_EFFECT && known.reported && known.attemptId !== d.attemptId
    if (known && !provenRetry) { this.log({ event: "dedup", sendKey: d.sendKey, phase: known.phase }); return }
    const bytes = Buffer.from(String(d.payloadBase64), "base64")
    const close = (phase, reason, spoolJobId = null, release = true) => this.journal.append({ sendKey: d.sendKey, attemptId: d.attemptId, phase, reason, spoolJobId, release })
    if (sha256Hex(bytes) !== d.payloadHash || !validateEscPos(bytes) || bytes.length > 64 * 1024) return close(PHASE.NO_EFFECT, REASONS.PAYLOAD_REFUSED)
    let st
    try { st = await withTimeout(this.spooler.status(d.printerName), this.statusTimeoutMs) }
    catch (err) { await this.spooler.reset?.(); return close(PHASE.NO_EFFECT, err?.timeout ? REASONS.TIMEOUT_BEFORE_SUBMIT : REASONS.SPOOLER_UNAVAILABLE) }
    if (!st.serviceUp) return close(PHASE.NO_EFFECT, REASONS.SPOOLER_UNAVAILABLE)
    if (!st.exists) return close(PHASE.NO_EFFECT, REASONS.PRINTER_NOT_FOUND)
    if (!st.online) return close(PHASE.NO_EFFECT, REASONS.PRINTER_OFFLINE)
    if (st.paperOut) return close(PHASE.NO_EFFECT, REASONS.PAPER_OUT)
    if (st.paused) return close(PHASE.NO_EFFECT, REASONS.PRINTER_PAUSED)
    if (st.error) return close(PHASE.NO_EFFECT, REASONS.PRINTER_ERROR)
    // A dispatch that waited behind others must not reach the printer after the server already reports it uncertain.
    const remaining = Number(d.leaseRemainingMs ?? Infinity) - (Date.now() - receivedAt)
    if (!(remaining >= this.minSendBudgetMs)) return close(PHASE.NO_EFFECT, REASONS.TIMEOUT_BEFORE_SUBMIT) // NaN fails closed
    if (this.stopped || this.shouldStop()) return close(PHASE.NO_EFFECT, REASONS.TIMEOUT_BEFORE_SUBMIT)
    if (this.lease && !this.lease.alive()) throw new Error('LEASE_LOST')
    this.journal.append({ sendKey: d.sendKey, attemptId: d.attemptId, phase: PHASE.SUBMITTING })
    let result
    try { result = await withTimeout(this.spooler.submit(d.printerName, bytes, d.documentLabel), this.submitTimeoutMs) }
    catch (err) {
      // Egress is declared closed only once the host that might still write is confirmed dead (P2-2).
      if (err?.timeout) { const dead = (await this.spooler.reset?.()) !== false; return close(PHASE.UNKNOWN, REASONS.TIMEOUT_AFTER_SUBMIT, null, dead) }
      if (err?.phase === "BEFORE") return close(PHASE.NO_EFFECT, err.reason in REASONS ? err.reason : REASONS.OPEN_FAILED)
      return close(PHASE.UNKNOWN, err?.reason in REASONS ? err.reason : REASONS.WRITE_FAILED, err?.spoolJobId ?? null)
    }
    this.hooks.afterSubmitBeforeJournal?.()
    return close(PHASE.ACCEPTED, null, result.spoolJobId)
  }

  /** Server asks about an UNKNOWN attempt still holding the printer: known → re-report; absent → UNKNOWN (never "not printed"). */
  async answerQuery(q) {
    const known = this.journal.get(q.sendKey)
    if (!known || known.attemptId !== q.attemptId) { this.journal.append({ sendKey: q.sendKey, attemptId: q.attemptId, phase: PHASE.TOMBSTONE, reason: REASONS.NOT_FOUND_IN_JOURNAL }); return }
    if (known.release === false && (await this.spooler.reset?.()) !== false)
      this.journal.append({ sendKey: q.sendKey, attemptId: known.attemptId, phase: PHASE.UNKNOWN, reason: known.reason, spoolJobId: known.spoolJobId, release: true })
    else this.journal.markUnreported(q.sendKey)
  }

  async tick() {
    await this.flushReports()
    const r = await this.call("/api/print/agent/claim", { instanceId: this.instanceId })
    const receivedAt = Date.now()
    for (const q of r.queries ?? []) await this.answerQuery(q)
    // Each outcome is reported right away, not behind the remaining dispatches (keeps it inside its lease).
    for (const d of r.dispatches ?? []) { if (this.stopped || this.shouldStop()) break; await this.handle(d, receivedAt); await this.flushReports() }
    await this.flushReports()
    return (r.dispatches ?? []).length
  }

  async run({ pollMs = 1000, heartbeatMs = 5000 } = {}) {
    let lastBeat = 0, backoff = pollMs
    try { while (!this.stopped && !this.shouldStop()) {
      try {
        if (this.lease && !this.lease.alive()) throw new Error('LEASE_LOST')
        if (Date.now() - lastBeat >= heartbeatMs) { await this.heartbeat(); lastBeat = Date.now() }
        const n = await this.tick()
        backoff = pollMs
        if (n === 0) await sleep(pollMs)
      } catch (err) {
        const code = String(err?.code ?? err?.message ?? '')
        this.log({ event: "loop_error", code: /^[A-Z_0-9]{1,64}$/.test(code) ? code : 'NETWORK_OR_RUNTIME_ERROR' })
        if (err instanceof HttpError && err.status === 401) { this.log({ event: "credential_rejected" }); this.stopReason = 'REVOKED'; this.stopped = true; break }
        const transient = err instanceof HttpError ? err.status >= 500 || [404, 408, 409, 429].includes(err.status) : err instanceof TypeError || err?.name === 'AbortError' || err?.name === 'TimeoutError'
        if (!transient) throw err
        await sleep(backoff); backoff = Math.min(backoff * 2, 30_000)
      }
    } } finally {
      const closed = (await this.spooler.close?.()) !== false
      // A live unproven host retains its durable registry. The next create() reaps it before recovery.
      await this.releaseLock()
      if (!closed) throw new Error('HOST_EXIT_UNPROVEN')
    }
    return this.stopReason
  }
  stop() { this.stopped = true }
}

// ── CLI ──
const CONFIG_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), "OmniPrintAgent")

export async function cli(argv, deps = {}) {
  const [cmd, ...rest] = argv
  const arg = (name) => { const i = rest.indexOf("--" + name); return i >= 0 ? rest[i + 1] : undefined }
  const { runCli } = await import('./lifecycle.mjs')
  const configDir = arg('data-dir') ? path.resolve(arg('data-dir')) : CONFIG_DIR
  return runCli(cmd, arg, { configDir, configFile: path.join(configDir, 'config.json'), ...deps })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch((e) => { const c = String(e?.code ?? e?.message ?? ''); console.error(/^[A-Z_0-9]{1,64}$/.test(c) ? c : 'AGENT_FATAL'); process.exitCode = 65 })
}
