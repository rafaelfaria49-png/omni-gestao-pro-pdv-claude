import { randomUUID } from "node:crypto"
import { check, insert, type Database, type Sql } from "./db"

/** D03-A: lifetime of CONTENT only. Ledger identities and evidence have no expiry. */
export const CONTENT_RETENTION_DAYS = 7
const RETENTION_MS = CONTENT_RETENTION_DAYS * 86_400_000
const FINAL_STATES = new Set(["TRANSPORT_ACCEPTED", "SPOOLER_ACCEPTED", "BROWSER_AVAILABLE", "PRE_SEND_FAILED", "CANCELLED", "EXPIRED"])
const SAFE_DETAIL_TYPES = new Set(["JOB_REGISTERED", "COPY_READY"])
const ROW_LIMIT = 1000
type Counts = { copies: number; jobs: number; requests: number; events: number }
const counts = (): Counts => ({ copies: 0, jobs: 0, requests: 0, events: 0 })
export type RetentionOptions = { storeId: string; dryRun?: boolean; batchSize?: number; afterDocumentId?: string }
export type RetentionResult = {
  runId: string; mode: "DRY_RUN" | "EXECUTE"; retentionDays: number; scannedDocuments: number
  busyDocuments: number; oversizedDocuments: number; committedDocuments: number
  eligible: Counts; purged: Counts; errors: Record<string, number>; nextDocumentId: string | null; hasMore: boolean
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ms = (v: unknown) => v == null ? NaN : new Date(v as string).getTime()
const latest = (values: unknown[]) => Math.max(...values.map(ms))

/** Only stable codes may leave the job. Database errors can contain credentials, SQL and content. */
export function retentionError(error: unknown): string {
  const e = error as { code?: string; message?: string; meta?: { code?: string } }
  if (e?.code === "P1000" || e?.code === "P1010" || e?.meta?.code === "42501") return "DATABASE_ACCESS_DENIED"
  if (e?.meta?.code === "57014" || /statement timeout|Transaction already closed/i.test(e?.message ?? "")) return "DATABASE_TIMEOUT"
  if (e?.meta?.code === "55P03" || /lock timeout|deadlock|could not serialize/i.test(e?.message ?? "")) return "DATABASE_BUSY"
  return "RETENTION_FAILED"
}

/** Select metadata only: no ciphertext, command, customer data or evidence body enters process memory. */
async function metadata(sql: Sql, storeId: string, documentId: string) {
  const get = (table: string, columns: string) => sql.query(`SELECT ${columns} FROM public.${table}
    WHERE store_id=$1 AND document_id=$2::uuid ORDER BY id LIMIT ${ROW_LIMIT + 1}`, [storeId, documentId])
  // Sequential on one transaction connection; each relation is bounded independently.
  const jobs = await get("print_jobs", "id,intent_id,execution_mode,copies,created_at,authorization_expires_at,content_expires_at,snapshot_key_ref,snapshot_purged_at,snapshot_cipher IS NOT NULL has_content")
  const copies = await get("print_copies", "id,job_id,state,ordinal,payload_key_ref,payload_purged_at,payload_cipher IS NOT NULL has_content,payload_expires_at,lease_until")
  const attempts = await get("print_attempts", "id,job_id,copy_id,number,result,finished_at")
  const events = await get("print_events", "id,job_id,copy_id,event_type,proof_kind,created_at,details_purged_at,details = '{}'::jsonb AND evidence_key IS NULL AND evidence_hash IS NULL safe_empty_details")
  const requests = await get("print_requests", "id,job_id,intent_id,issued_at,expires_at,revoked_at,consumed_at,command_purged_at,command IS NOT NULL has_content")
  const held = await sql.query(`SELECT q.held_attempt_id id FROM public.print_destinations q
    JOIN public.print_attempts a ON a.id=q.held_attempt_id AND a.store_id=q.held_store_id
    WHERE a.store_id=$1 AND a.document_id=$2::uuid LIMIT ${ROW_LIMIT + 1}`, [storeId, documentId])
  return { jobs, copies, attempts, events, requests, held }
}

/** Same document lock/order as create, start, retry, report, recovery and browser fallback. */
async function documentBatch(sql: Sql, storeId: string, documentId: string, dryRun: boolean) {
  await sql.exec("SET LOCAL statement_timeout = '5s'")
  await sql.exec("SET LOCAL lock_timeout = '200ms'")
  await sql.exec("SET LOCAL idle_in_transaction_session_timeout = '10s'")
  const locked = await sql.query(`SELECT id FROM public.print_documents WHERE store_id=$1 AND id=$2::uuid FOR UPDATE SKIP LOCKED`, [storeId, documentId])
  if (!locked.length) return { busy: true, oversized: false, eligible: counts() }
  const m = await metadata(sql, storeId, documentId)
  if (Object.values(m).some(rows => rows.length > ROW_LIMIT)) return { busy: false, oversized: true, eligible: counts() }
  const [{ now }] = await sql.query("SELECT clock_timestamp() now")
  const nowMs = ms(now), cutoff = nowMs - RETENTION_MS
  const heldIds = new Set(m.held.map(a => a.id))
  const eligible = counts()
  const finalJobs = new Map<string, number>()
  for (const j of m.jobs) {
    const copies = m.copies.filter(c => c.job_id === j.id)
    const attempts = m.attempts.filter(a => a.job_id === j.id)
    if (j.execution_mode !== "LOCAL_AGENT" || copies.length !== j.copies || !copies.length) continue
    if (copies.some(c => !FINAL_STATES.has(c.state) || (c.lease_until && ms(c.lease_until) > nowMs))) continue
    if (attempts.some(a => ["STARTED", "UNKNOWN"].includes(a.result) || !Number.isFinite(ms(a.finished_at)) || heldIds.has(a.id))) continue
    if (ms(j.authorization_expires_at) > nowMs || ms(j.content_expires_at) > nowMs) continue
    const ends: unknown[] = [j.created_at, ...attempts.map(a => a.finished_at)]
    let proven = true
    for (const c of copies) {
      const history = attempts.filter(a => a.copy_id === c.id).sort((a, b) => b.number - a.number)
      const last = history[0]
      if (c.state === "CANCELLED" || c.state === "EXPIRED") {
        // A document-level browser event cannot date a later cancellation of a previously SENDING copy.
        const transitions = m.events.filter(e => e.copy_id === c.id && e.event_type === "COPY_" + c.state)
        if (!transitions.length) { proven = false; break }
        ends.push(...transitions.map(e => e.created_at))
      } else if (!last || last.result !== c.state) { proven = false; break }
      if (c.state === "PRE_SEND_FAILED") {
        // A failure is retryable until all authorizations/content expire. Expiry never finishes UNKNOWN.
        ends.push(j.authorization_expires_at, j.content_expires_at, c.payload_expires_at)
      }
    }
    if (!proven) continue
    ends.push(...m.events.filter(e => e.job_id === j.id && e.event_type !== "CONTENT_PURGED").map(e => e.created_at))
    const finalAt = latest(ends)
    if (!Number.isFinite(finalAt) || finalAt > cutoff) continue
    finalJobs.set(j.id, finalAt)
    const payloads = copies.filter(c => c.has_content && !c.payload_purged_at)
    const details = m.events.filter(e => e.job_id === j.id && SAFE_DETAIL_TYPES.has(e.event_type) && e.proof_kind === "NONE" &&
      e.safe_empty_details && !e.details_purged_at && ms(e.created_at) <= cutoff)
    const jobContent = j.has_content && !j.snapshot_purged_at
    eligible.copies += payloads.length; eligible.jobs += jobContent ? 1 : 0; eligible.events += details.length
    if (dryRun || (!payloads.length && !jobContent && !details.length)) continue
    // Existing CHECKs require key_ref=NULL on purge. Preserve these public references in an immutable ledger event.
    await insert(sql, "print_events", { id: randomUUID(), store_id: storeId, document_id: documentId, job_id: j.id,
      scope_kind: "DOCUMENT", event_type: "CONTENT_PURGED", proof_kind: "NONE", actor_kind: "SYSTEM",
      details: { policy: "D03_A_V1", retentionDays: CONTENT_RETENTION_DAYS, finalAt: new Date(finalAt).toISOString(),
        snapshotKeyRef: jobContent ? j.snapshot_key_ref : null, payloadKeyRefs: payloads.map(c => ({ copyId: c.id, keyRef: c.payload_key_ref })),
        counts: { jobs: jobContent ? 1 : 0, copies: payloads.length, events: details.length } } })
    for (const c of payloads) await sql.exec(`UPDATE public.print_copies SET payload_cipher=NULL,payload_key_ref=NULL,payload_purged_at=$1
      WHERE id=$2::uuid AND store_id=$3 AND payload_purged_at IS NULL AND payload_cipher IS NOT NULL`, [now, c.id, storeId])
    if (jobContent) await sql.exec(`UPDATE public.print_jobs SET snapshot_cipher=NULL,snapshot_key_ref=NULL,snapshot_purged_at=$1
      WHERE id=$2::uuid AND store_id=$3 AND snapshot_purged_at IS NULL AND snapshot_cipher IS NOT NULL`, [now, j.id, storeId])
    for (const e of details) await sql.exec(`UPDATE public.print_events SET details=NULL,details_purged_at=$1
      WHERE id=$2::uuid AND store_id=$3 AND details_purged_at IS NULL`, [now, e.id, storeId])
  }
  for (const r of m.requests) {
    if (!r.has_content || r.command_purged_at) continue
    // Even an unconsumed request may refer to an intent executed by another tab.
    const job = m.jobs.find(j => j.id === r.job_id || j.intent_id === r.intent_id)
    if (job && !finalJobs.has(job.id)) continue
    if (r.job_id && !job) continue
    const end = latest([r.expires_at, r.issued_at, ...(r.revoked_at ? [r.revoked_at] : []),
      ...(r.consumed_at ? [r.consumed_at] : []), ...(job ? [new Date(finalJobs.get(job.id)!)] : [])])
    if (!Number.isFinite(end) || end > cutoff) continue
    eligible.requests++
    if (dryRun) continue
    await insert(sql, "print_events", { id: randomUUID(), store_id: storeId, document_id: documentId, scope_kind: "DOCUMENT",
      event_type: "REQUEST_CONTENT_PURGED", proof_kind: "NONE", actor_kind: "SYSTEM",
      details: { policy: "D03_A_V1", requestId: r.id, finalAt: new Date(end).toISOString() } })
    await sql.exec(`UPDATE public.print_requests SET command=NULL,command_purged_at=$1
      WHERE id=$2::uuid AND store_id=$3 AND command_purged_at IS NULL AND command IS NOT NULL`, [now, r.id, storeId])
  }
  return { busy: false, oversized: false, eligible }
}

/** One bounded page, one short transaction per document. No timer, HTTP route, .env loading or production activation. */
export async function runPrintRetention(db: Database, options: RetentionOptions): Promise<RetentionResult> {
  const { storeId, afterDocumentId } = options, batchSize = options.batchSize ?? 25, dryRun = options.dryRun !== false
  check(typeof storeId === "string" && storeId.length > 0 && storeId.length <= 160, "INVALID_STORE", 400)
  check(Number.isInteger(batchSize) && batchSize >= 1 && batchSize <= 100, "INVALID_BATCH", 400)
  check(!afterDocumentId || UUID.test(afterDocumentId), "INVALID_CURSOR", 400)
  const result: RetentionResult = { runId: randomUUID(), mode: dryRun ? "DRY_RUN" : "EXECUTE", retentionDays: CONTENT_RETENTION_DAYS,
    scannedDocuments: 0, busyDocuments: 0, oversizedDocuments: 0, committedDocuments: 0, eligible: counts(), purged: counts(), errors: {}, nextDocumentId: null, hasMore: false }
  const page = await db.transaction(async sql => {
    await sql.exec("SET LOCAL statement_timeout = '5s'")
    return sql.query(`SELECT d.id FROM public.print_documents d WHERE d.store_id=$1 AND ($2::uuid IS NULL OR d.id>$2::uuid)
      ORDER BY d.id LIMIT $3`, [storeId, afterDocumentId ?? null, batchSize + 1])
  })
  result.hasMore = page.length > batchSize
  for (const d of page.slice(0, batchSize)) {
    result.scannedDocuments++; result.nextDocumentId = d.id
    try {
      const doc = await db.transaction(sql => documentBatch(sql, storeId, d.id, dryRun))
      if (doc.busy) result.busyDocuments++
      else if (doc.oversized) result.oversizedDocuments++
      else {
        result.committedDocuments++
        for (const k of Object.keys(doc.eligible) as Array<keyof Counts>) {
          result.eligible[k] += doc.eligible[k]
          if (!dryRun) result.purged[k] += doc.eligible[k]
        }
      }
    } catch (error) { const code = retentionError(error); result.errors[code] = (result.errors[code] ?? 0) + 1 }
  }
  return result
}
