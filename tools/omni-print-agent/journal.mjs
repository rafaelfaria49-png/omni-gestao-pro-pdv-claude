// Durable append-only journal keyed by sendKey. It is the agent's only dedup authority:
// an entry is fsync'ed BEFORE any byte reaches the spooler, so a crash can never cause a second submission.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs"
import path from "node:path"

export const PHASE = Object.freeze({ SUBMITTING: "SUBMITTING", ACCEPTED: "ACCEPTED", NO_EFFECT: "NO_EFFECT", UNKNOWN: "UNKNOWN", TOMBSTONE: "TOMBSTONE", REPORTED: "REPORTED" })

export class Journal {
  constructor(file) {
    this.file = file
    this.entries = new Map() // sendKey -> { attemptId, phase, reason, spoolJobId, reported }
    mkdirSync(path.dirname(file), { recursive: true })
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8")
      for (const line of text.split("\n")) {
        if (!line.trim()) continue
        try { this.apply(JSON.parse(line)) } catch { /* a torn final line (crash mid-write) is ignored: its fsync never completed */ }
      }
      // Terminate a torn last line so the next record is never glued to it and lost on reload (P3-1).
      if (text.length && !text.endsWith("\n")) { const fd = openSync(file, "a"); try { writeSync(fd, "\n"); fsyncSync(fd) } finally { closeSync(fd) } }
    }
  }
  apply(rec) {
    const cur = this.entries.get(rec.sendKey) ?? { attemptId: rec.attemptId, phase: null, reason: null, spoolJobId: null, reported: false, release: true }
    if (rec.phase === PHASE.REPORTED) cur.reported = true
    else { cur.phase = rec.phase; cur.reason = rec.reason ?? cur.reason; cur.spoolJobId = rec.spoolJobId ?? cur.spoolJobId; cur.attemptId = rec.attemptId ?? cur.attemptId; cur.reported = false; cur.release = rec.release !== false }
    this.entries.set(rec.sendKey, cur)
  }
  append(rec) {
    const fd = openSync(this.file, "a")
    try { writeSync(fd, JSON.stringify({ ...rec, at: new Date().toISOString() }) + "\n"); fsyncSync(fd) } finally { closeSync(fd) }
    this.apply(rec)
  }
  get(sendKey) { return this.entries.get(sendKey) ?? null }
  /** Outcome to report for a known sendKey (SUBMITTING without completion = crash in the middle = UNKNOWN). */
  outcomeOf(entry) {
    if (!entry) return null
    if (entry.phase === PHASE.ACCEPTED) return { result: "SPOOLER_ACCEPTED", release: true, spoolJobId: entry.spoolJobId, reason: null }
    if (entry.phase === PHASE.NO_EFFECT) return { result: "NO_EFFECT", release: true, spoolJobId: null, reason: entry.reason }
    // release=false: the agent could not prove its spooler host is gone, so egress is NOT declared closed.
    if (entry.phase === PHASE.UNKNOWN || entry.phase === PHASE.TOMBSTONE) return { result: "UNKNOWN", release: entry.release !== false, spoolJobId: entry.spoolJobId, reason: entry.reason }
    return { result: "UNKNOWN", release: true, spoolJobId: null, reason: "AGENT_RESTARTED" }
  }
  /** Startup: an interrupted submission is closed as UNKNOWN (never resubmitted). */
  recover() {
    for (const [sendKey, e] of this.entries) if (e.phase === PHASE.SUBMITTING) this.append({ sendKey, attemptId: e.attemptId, phase: PHASE.UNKNOWN, reason: "AGENT_RESTARTED" })
  }
  /** The server still waits on this outcome (its report was lost or refused transiently): send it again (P2-1). */
  markUnreported(sendKey) { const e = this.entries.get(sendKey); if (e && e.phase && e.phase !== PHASE.SUBMITTING) e.reported = false }
  unreported() { return [...this.entries].filter(([, e]) => !e.reported && e.phase && e.phase !== PHASE.SUBMITTING).map(([sendKey, e]) => ({ sendKey, ...e })) }
}
