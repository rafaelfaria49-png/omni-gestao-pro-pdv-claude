// Durable append-only journal keyed by sendKey. It is the agent's only dedup authority:
// an entry is fsync'ed BEFORE any byte reaches the spooler, so a crash can never cause a second submission.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"

export const PHASE = Object.freeze({ SUBMITTING: "SUBMITTING", ACCEPTED: "ACCEPTED", NO_EFFECT: "NO_EFFECT", UNKNOWN: "UNKNOWN", TOMBSTONE: "TOMBSTONE", REPORTED: "REPORTED" })

export class Journal {
  constructor(file) {
    this.file = file
    this.entries = new Map() // sendKey -> { attemptId, phase, reason, spoolJobId, reported }
    mkdirSync(path.dirname(file), { recursive: true })
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8")
      const lines = text.split("\n")
      let torn = null
      const hash = line => createHash('sha256').update(line).digest('hex')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.trim()) continue
        let rec
        try { rec = JSON.parse(line) } catch {
          // Preserve a torn final write in place, recording its exact hash. Interior damage fails closed.
          let marker
          try { marker = JSON.parse(lines[i + 1]) } catch { /* not a recovery marker */ }
          if (marker?.phase === 'TORN_TAIL' && marker.sha256 === hash(line)) { i++; continue }
          if (i === lines.length - 1 && !text.endsWith('\n')) { torn = hash(line); continue }
          throw new Error('JOURNAL_CORRUPT')
        }
        if (!rec || typeof rec.sendKey !== 'string' || !rec.sendKey || typeof rec.attemptId !== 'string' || !rec.attemptId || !Object.values(PHASE).includes(rec.phase)) throw new Error('JOURNAL_CORRUPT')
        if (rec.phase === PHASE.REPORTED && !this.entries.has(rec.sendKey)) throw new Error('JOURNAL_CORRUPT')
        this.apply(rec)
      }
      // Terminate a torn last line so the next record is never glued to it and lost on reload (P3-1).
      if (text.length && !text.endsWith("\n")) { const fd = openSync(file, "a"); try { writeFileSync(fd, '\n' + (torn ? JSON.stringify({ phase: 'TORN_TAIL', sha256: torn }) + '\n' : '')); fsyncSync(fd) } finally { closeSync(fd) } }
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
    try { writeFileSync(fd, JSON.stringify({ ...rec, at: new Date().toISOString() }) + "\n"); fsyncSync(fd) } finally { closeSync(fd) }
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
