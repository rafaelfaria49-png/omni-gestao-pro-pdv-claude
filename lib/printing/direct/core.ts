import { randomUUID } from "node:crypto"
import { authorize, type Principal } from "./authority"
import { byteHash, canonical, cleanData, hash, PrintCrypto, shape, text } from "./codec"
import { check, insert, one, PrintError, type Database, type Row, type Sql } from "./db"
import type { DirectPrintPolicy } from "./activation"
import { receiptInput, saleSnapshot } from "./sale"
import { RENDERER_VERSION, renderBrowserHtml, renderReceipt, THERMAL_PROFILES } from "./renderer"
import { summarizeCopies, type CopyRow, type JobView } from "./status"

/**
 * OMNI-PRINT-004C direct-print ledger (LOCAL_AGENT execution mode), derived from the 004B core.
 * T0 prepare → T1 create (+T2 ready for the bound agent) → T3 agent claim/start → T4 agent report.
 * Invariants kept from 004B: one INITIAL per sale document, explicit REPRINT with server-computed risk,
 * immutable snapshot/payload per copy, fencing by lease epoch, destination serialization, UNKNOWN never
 * retried blindly, and no commercial table is ever written (sale/payment/stock/cash are read-only here).
 */
export type Hooks = { beforeT3Commit?: () => Promise<void>; afterClaimCommit?: () => Promise<void> }
const inputKeys = ["saleId", "kind", "terminalId", "copies", "reasonCode", "consent", "uiContextId"]
const commandKeys = ["storeId", "saleId", "documentId", "intentId", "kind", "terminalId", "deliveryMode", "bindingVersionId", "browserContextId", "copies", "documentVersion", "reasonCode", "previousJobId", "riskRevision", "riskHash", "consentHash"]
const reasons = ["CUSTOMER_REQUEST", "ILLEGIBLE", "LOST", "UNCERTAIN_RESULT", "EXPLICIT_FALLBACK", "UPDATED_DOCUMENT"]
const potentialStates = ["SENDING", "UNKNOWN", "TRANSPORT_ACCEPTED", "SPOOLER_ACCEPTED", "BROWSER_AVAILABLE"]
const commandHash = (command: Row, principalId: string) => hash("command-v1", { command, principalId })
const agentOwner = (installationId: string) => "agent:" + installationId
const instanceOwner = (installationId: string, instanceId: string) => "agent:" + installationId + ":" + instanceId
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type AgentDispatch = {
  attemptId: string; jobId: string; copyId: string; sendKey: string; leaseEpoch: string; printerName: string
  payloadBase64: string; payloadHash: string; documentLabel: string; redelivery: boolean
  /** Remaining send lease when the dispatch left the server: the agent never STARTS submitting near its end. */
  leaseRemainingMs: number
}
export type AgentReport = { attemptId: string; sendKey: string; result: "SPOOLER_ACCEPTED" | "NO_EFFECT" | "UNKNOWN"; release: boolean; spoolJobId?: string | null; reason?: string | null }
const REPORT_REASONS = ["PRINTER_NOT_FOUND", "PRINTER_OFFLINE", "PRINTER_PAUSED", "PRINTER_ERROR", "PAPER_OUT", "SPOOLER_UNAVAILABLE", "OPEN_FAILED", "START_DOC_FAILED", "WRITE_FAILED", "END_DOC_FAILED", "PAYLOAD_REFUSED", "TIMEOUT_BEFORE_SUBMIT", "TIMEOUT_AFTER_SUBMIT", "AGENT_RESTARTED", "SPOOL_JOB_ERROR", "NOT_FOUND_IN_JOURNAL"]

export class DirectPrintCore {
  constructor(private readonly db: Database, private readonly crypto: PrintCrypto, readonly policy: DirectPrintPolicy, private readonly hooks: Hooks = {}) {
    for (const v of Object.values(policy)) check(Number.isSafeInteger(v) && v > 0, "FINITE_POLICY_REQUIRED", 500)
    check(policy.maxCopies <= 2 && policy.contentMs >= policy.authorizationMs && policy.authorizationMs >= policy.requestMs, "INVALID_POLICY", 500)
  }

  private async doc(sql: Sql, storeId: string, saleId: string) {
    await one(sql, 'SELECT id FROM public.vendas WHERE id=$1 AND "storeId"=$2', [saleId, storeId])
    await sql.exec(`INSERT INTO public.print_documents(id,store_id,document_kind,sale_id,family)
      VALUES($1::uuid,$2,'SALE',$3,'SALE_RECEIPT') ON CONFLICT(store_id,sale_id,family) DO NOTHING`, [randomUUID(), storeId, saleId])
    const d = await one(sql, "SELECT * FROM public.print_documents WHERE store_id=$1 AND sale_id=$2 AND family='SALE_RECEIPT' FOR UPDATE", [storeId, saleId])
    check(!d.retired_at, "DOCUMENT_RETIRED")
    return d
  }
  private async lockedDoc(sql: Sql, storeId: string, id: string) {
    const d = await one(sql, "SELECT * FROM public.print_documents WHERE id=$1::uuid AND store_id=$2 FOR UPDATE", [id, storeId])
    check(!d.retired_at, "DOCUMENT_RETIRED")
    return d
  }
  private async source(sql: Sql, storeId: string, saleId: string) {
    const s = await saleSnapshot(sql, storeId, saleId, this.policy.maxItems)
    return { version: s.version, input: receiptInput(s), mode: s.settings.mode as "simplificado" | "completo",
      at: new Date(s.row.at), terminalId: (s.row.terminalId ?? null) as string | null }
  }
  /**
   * Active binding of the terminal → paired, non-revoked LOCAL_AGENT installation and serial destination.
   * deviceHash (browser requests only): a binding restricted to an authorized browser refuses any other browser (P3-4).
   */
  private async binding(sql: Sql, storeId: string, terminalId: string, bindingVersionId: string | null, deviceHash?: string | null) {
    const terminal = await sql.query('SELECT id FROM public.pdv_terminais WHERE id=$1 AND "storeId"=$2 AND status=$3', [terminalId, storeId, "ACTIVE"])
    check(terminal.length === 1, "TERMINAL_UNAVAILABLE", 409)
    const rows = await sql.query(`SELECT b.*,i.proof_mode,i.revoked_at installation_revoked,q.serialization_mode,l.credential_hash,l.store_id link_store
      FROM public.print_bindings b JOIN public.print_installations i ON i.id=b.installation_id
      JOIN public.print_destinations q ON q.id=b.destination_id JOIN public.print_agent_links l ON l.installation_id=b.installation_id
      WHERE b.store_id=$1 AND b.terminal_id=$2 AND b.family='SALE_RECEIPT' AND ($3::uuid IS NULL AND b.state='ACTIVE' OR b.id=$3::uuid)`, [storeId, terminalId, bindingVersionId])
    check(rows.length === 1, "TERMINAL_PRINTER_NOT_CONFIGURED", 409)
    const b = rows[0]
    check(b.state === "ACTIVE" && !b.installation_revoked && b.proof_mode === "LOCAL_AGENT" && b.serialization_mode === "LOCAL_AGENT_SERIAL" &&
      b.credential_hash && b.link_store === storeId, "BINDING_UNAVAILABLE")
    const restricted = b.profile && typeof b.profile === "object" ? (b.profile as Row).deviceHash : null
    if (deviceHash !== undefined && restricted) check(deviceHash === restricted, "DEVICE_NOT_AUTHORIZED", 403)
    return b
  }
  private async exposure(sql: Sql, documentId: string, excludeIntent: string | null = null) {
    const rows = await sql.query(`SELECT j.id job_id,c.id copy_id,c.state,c.retry_suppressed_by_job_id,
      (SELECT a.result FROM public.print_attempts a WHERE a.copy_id=c.id ORDER BY a.number DESC LIMIT 1) result
      FROM public.print_jobs j JOIN public.print_copies c ON c.job_id=j.id
      WHERE j.document_id=$1::uuid AND ($2::uuid IS NULL OR j.intent_id<>$2::uuid) ORDER BY j.id,c.ordinal`, [documentId, excludeIntent])
    // Browser copies opened by the operator are part of the disclosed risk (P2-4).
    const [f] = await sql.query("SELECT count(*)::int n FROM public.print_events WHERE document_id=$1::uuid AND event_type='BROWSER_FALLBACK_PRINTED'", [documentId])
    return { rows, browserCopies: Number(f.n), hash: hash("exposure-v2", { rows, browserCopies: Number(f.n) }) }
  }
  private async delegation(sql: Sql, job: Row) {
    const g = await one(sql, "SELECT * FROM public.print_delegations WHERE id=$1::uuid AND store_id=$2 AND principal_id=$3 FOR UPDATE", [job.delegation_id, job.store_id, job.principal_id])
    check(!g.revoked_at && g.expires_at > new Date(), "DELEGATION_REVOKED")
    await authorize(sql, { principalId: g.principal_id, observedSessionVersion: Number(g.session_version) }, g.store_id)
    return g
  }
  private async event(sql: Sql, chain: Row, type: string, actor: string | null, details: Row | null = null) {
    await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: type,
      proof_kind: "NONE", actor_kind: actor ? "USER" : "SYSTEM", actor_user_id: actor, details })
  }

  /** Explicit, authenticated act preceding a second copy: discloses every possibly-printed copy (risk) and binds consent to it. */
  async quoteReprint(auth: Principal, storeId: string, saleId: string) {
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      await this.source(sql, storeId, text(saleId, 160))
      const d = await this.doc(sql, storeId, saleId)
      const existing = d.active_reprint_intent_id ? await sql.query("SELECT id FROM public.print_jobs WHERE intent_id=$1::uuid", [d.active_reprint_intent_id]) : []
      const intentId = d.active_reprint_intent_id && d.active_reprint_until > new Date() && !existing.length ? d.active_reprint_intent_id : randomUUID()
      const until = new Date(Date.now() + this.policy.riskMs)
      await sql.exec("UPDATE public.print_documents SET active_reprint_intent_id=$1::uuid,active_reprint_until=$2 WHERE id=$3::uuid", [intentId, until, d.id])
      const exposure = await this.exposure(sql, d.id, intentId)
      const consent = this.crypto.sign("risk-consent-v1", { storeId, documentId: d.id, intentId, principalId: actor.principalId,
        revision: String(d.risk_revision), exposureHash: exposure.hash, expires: until.getTime() })
      return { consent, possibleAdditionalCopy: exposure.rows.some(r => potentialStates.includes(r.state)) || exposure.browserCopies > 0,
        browserCopies: exposure.browserCopies,
        uncertainCopies: exposure.rows.filter(r => r.state === "UNKNOWN" || r.state === "SENDING").length,
        acceptedCopies: exposure.rows.filter(r => r.state === "SPOOLER_ACCEPTED" || r.state === "TRANSPORT_ACCEPTED").length }
    })
  }

  /** T0: validates the envelope, re-derives authority, fixes document version/target/risk and issues a single-use request. */
  async prepare(auth: Principal, storeId: string, input: unknown, deviceHash: string | null = null): Promise<{ key: string; command: Row }> {
    const v = shape(input, inputKeys)
    if (v.uiContextId !== undefined) text(v.uiContextId, 100) // presentation only — excluded from the command (P01)
    const c: Row = { storeId: text(storeId, 160), saleId: text(v.saleId, 160), kind: v.kind, terminalId: text(v.terminalId, 160),
      deliveryMode: "THERMAL_BOUND", bindingVersionId: null, browserContextId: null, copies: v.copies ?? 1,
      reasonCode: v.reasonCode ?? null, previousJobId: null }
    check((c.kind === "INITIAL" || c.kind === "REPRINT") && Number.isInteger(c.copies) && c.copies > 0 && c.copies <= this.policy.maxCopies, "COMMAND_LIMIT", 400)
    check(c.kind === "REPRINT" ? reasons.includes(c.reasonCode) && typeof v.consent === "string" : c.reasonCode === null && v.consent === undefined, "REASON_REQUIRED", 400)
    check(Buffer.byteLength(canonical(c)) + (typeof v.consent === "string" ? v.consent.length : 0) <= this.policy.commandBytes, "COMMAND_LIMIT", 400)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, c.storeId)
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,4005))::text", [actor.principalId])
      const [rate] = await sql.query("SELECT count(*)::int n FROM public.print_requests WHERE principal_id=$1 AND issued_at>clock_timestamp()-interval '1 minute'", [actor.principalId])
      check(rate.n < this.policy.maxRequestsPerMinute, "RATE_LIMIT", 429)
      const d = await this.doc(sql, c.storeId, c.saleId)
      const source = await this.source(sql, c.storeId, c.saleId)
      c.documentId = d.id; c.documentVersion = source.version
      let consent: Row | null = null
      if (c.kind === "REPRINT") {
        consent = this.crypto.verify("risk-consent-v1", text(v.consent, 8192))
        // A consent already honoured converges on its job even if another operator re-quoted meanwhile (P3-7).
        const done = typeof consent.intentId === "string" && UUID.test(consent.intentId)
          ? (await sql.query("SELECT id FROM public.print_jobs WHERE intent_id=$1::uuid AND document_id=$2::uuid", [consent.intentId, d.id])).length > 0 : false
        check(consent.storeId === c.storeId && consent.documentId === d.id && consent.principalId === actor.principalId &&
          Number(consent.expires) > Date.now() && (done || consent.intentId === d.active_reprint_intent_id), "RISK_CONFIRMATION_REQUIRED")
        c.intentId = consent.intentId
      } else {
        check(d.initial_state !== "HISTORICAL_CLOSED", "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
        // INITIAL = the print of a sale just made at THIS terminal; anything else is an explicit second copy (P3-4).
        check(!source.terminalId || source.terminalId === c.terminalId, "TERMINAL_MISMATCH", 409)
        check(Date.now() - source.at.getTime() <= this.policy.initialWindowMs, "INITIAL_WINDOW_EXPIRED", 409)
        const [f] = await sql.query("SELECT count(*)::int n FROM public.print_events WHERE document_id=$1::uuid AND event_type='BROWSER_FALLBACK_PRINTED'", [d.id])
        check(Number(f.n) === 0, "BROWSER_COPY_ALREADY_ISSUED", 409)
        c.intentId = d.initial_intent_id ?? randomUUID()
        if (!d.initial_intent_id) await sql.exec("UPDATE public.print_documents SET initial_intent_id=$1::uuid WHERE id=$2::uuid", [c.intentId, d.id])
      }
      const b = await this.binding(sql, c.storeId, c.terminalId, null, deviceHash)
      c.bindingVersionId = b.id
      const exposure = await this.exposure(sql, d.id, c.intentId)
      // A replay of an already-honoured consent converges on its job (lost response); otherwise the disclosed risk must be current.
      const honoured = consent ? (await sql.query("SELECT id FROM public.print_jobs WHERE intent_id=$1::uuid", [c.intentId])).length > 0 : false
      if (consent && !honoured) check(consent.revision === String(d.risk_revision) && consent.exposureHash === exposure.hash, "STALE_RISK")
      c.riskRevision = String(d.risk_revision); c.riskHash = exposure.hash
      c.consentHash = consent ? hash("risk-token-v1", String(v.consent)) : null
      const delegationId = randomUUID(), key = randomUUID(), now = Date.now()
      await insert(sql, "print_delegations", { id: delegationId, store_id: c.storeId, principal_id: actor.principalId,
        session_version: actor.sessionVersion, expires_at: new Date(now + this.policy.authorizationMs) })
      await insert(sql, "print_requests", { id: key, store_id: c.storeId, document_id: d.id, principal_id: actor.principalId,
        delegation_id: delegationId, intent_id: c.intentId, command: c, command_hash: commandHash(c, actor.principalId),
        canonical_version: 1, risk_revision: d.risk_revision, risk_set_hash: exposure.hash,
        risk_confirmed_at: consent ? new Date(now) : null, expires_at: new Date(now + this.policy.requestMs) })
      await this.event(sql, { store_id: c.storeId, document_id: d.id }, "REQUEST_ISSUED", actor.principalId)
      return { key, command: c }
    })
  }

  /** T1 (+T2): consumes the request exactly once; an existing job for the same intent is replayed, never duplicated. */
  async create(auth: Principal, key: string, input: Row) {
    const c = shape(input, commandKeys) as Row
    check(Object.keys(c).length === commandKeys.length && UUID.test(key), "INVALID_COMMAND", 400)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, text(c.storeId, 160))
      const peek = await sql.query("SELECT document_id FROM public.print_requests WHERE id=$1::uuid AND store_id=$2 AND principal_id=$3", [key, c.storeId, actor.principalId])
      check(peek.length, "REQUEST_EXPIRED", 410)
      const d = await this.lockedDoc(sql, c.storeId, peek[0].document_id)
      const r = await one(sql, "SELECT * FROM public.print_requests WHERE id=$1::uuid FOR UPDATE", [key])
      check(commandHash(c, actor.principalId) === r.command_hash, "REQUEST_CONFLICT")
      if (r.job_id) return this.view(sql, r.job_id, c.storeId, true)
      check(!r.revoked_at && r.command && r.expires_at > new Date(), "REQUEST_EXPIRED", 410)
      await this.delegation(sql, { delegation_id: r.delegation_id, store_id: r.store_id, principal_id: r.principal_id })
      const sameIntent = await sql.query("SELECT * FROM public.print_jobs WHERE intent_id=$1::uuid", [r.intent_id])
      if (sameIntent.length) {
        // Same INITIAL slot (other tab/terminal/user) or same consent: converge on the existing job.
        await sql.exec("UPDATE public.print_requests SET job_id=$1::uuid,consumed_at=clock_timestamp() WHERE id=$2::uuid", [sameIntent[0].id, key])
        return this.view(sql, sameIntent[0].id, r.store_id, true)
      }
      check(c.kind !== "INITIAL" || d.initial_state === "OPEN", "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
      if (c.kind === "INITIAL") {
        const [f] = await sql.query("SELECT count(*)::int n FROM public.print_events WHERE document_id=$1::uuid AND event_type='BROWSER_FALLBACK_PRINTED'", [d.id])
        check(Number(f.n) === 0, "BROWSER_COPY_ALREADY_ISSUED", 409)
      }
      const source = await this.source(sql, r.store_id, d.sale_id)
      check(source.version === c.documentVersion, "DOCUMENT_VERSION_CONFLICT")
      const b = await this.binding(sql, r.store_id, c.terminalId, c.bindingVersionId)
      const profile = THERMAL_PROFILES[b.profile_id as keyof typeof THERMAL_PROFILES]
      check(profile && profile.version === b.profile_version, "THERMAL_PROFILE_UNSUPPORTED")
      const before = await this.exposure(sql, d.id, r.intent_id)
      if (c.kind === "REPRINT") check(r.risk_confirmed_at && String(r.risk_revision) === String(d.risk_revision) && r.risk_set_hash === before.hash, "STALE_RISK")
      const now = Date.now(), jobId = randomUUID(), contentUntil = new Date(now + this.policy.contentMs)
      const grant = await one(sql, "SELECT expires_at FROM public.print_delegations WHERE id=$1::uuid", [r.delegation_id])
      const snapshot = Buffer.from(canonical(cleanData({ input: source.input, mode: source.mode, kind: c.kind, drawer: false })))
      check(snapshot.length <= this.policy.snapshotBytes, "SNAPSHOT_LIMIT", 400)
      const copies = Array.from({ length: Number(c.copies) }, (_, i) => {
        const ordinal = i + 1
        let payload: Buffer
        try { payload = Buffer.from(renderReceipt(source.input, profile.id, source.mode, { kind: c.kind, ordinal, count: Number(c.copies) })) }
        catch (e) { throw e instanceof PrintError ? e : new PrintError("RENDER_REFUSED", 422) }
        check(payload.length <= this.policy.payloadBytes, "PAYLOAD_LIMIT", 400)
        return { id: randomUUID(), ordinal, payload, payloadHash: byteHash(payload) }
      })
      const snapshotHash = byteHash(snapshot)
      await insert(sql, "print_jobs", { id: jobId, store_id: r.store_id, document_id: d.id, intent_id: r.intent_id, kind: c.kind,
        execution_mode: "LOCAL_AGENT", principal_id: actor.principalId, delegation_id: r.delegation_id, terminal_id: c.terminalId,
        delivery_mode: "THERMAL_BOUND", binding_version_id: b.id, browser_context_id: null, copies: c.copies,
        document_version: source.version, canonical_version: 1, snapshot_hash: snapshotHash,
        snapshot_cipher: this.crypto.seal(snapshot, "snapshot:" + r.store_id + ":" + jobId + ":" + snapshotHash), snapshot_key_ref: this.crypto.keyRef,
        payload_manifest_hash: hash("payload-manifest-v1", copies.map(cp => ({ ordinal: cp.ordinal, hash: cp.payloadHash }))),
        renderer_version: RENDERER_VERSION, profile_id: b.profile_id, profile_version: b.profile_version,
        previous_job_id: null, reason_code: c.reasonCode, confirmed_risk_revision: d.risk_revision,
        confirmed_exposure_hash: before.hash, risk_confirmed_at: r.risk_confirmed_at,
        authorization_expires_at: grant.expires_at, content_expires_at: contentUntil })
      for (const cp of copies) await insert(sql, "print_copies", { id: cp.id, store_id: r.store_id, document_id: d.id, job_id: jobId,
        ordinal: cp.ordinal, payload_hash: cp.payloadHash, payload_size: cp.payload.length,
        payload_cipher: this.crypto.seal(cp.payload, "payload:" + r.store_id + ":" + jobId + ":" + cp.id + ":" + cp.payloadHash),
        payload_key_ref: this.crypto.keyRef, payload_expires_at: contentUntil, send_key: randomUUID() })
      if (c.kind === "REPRINT") {
        // Explicit substitute: safe copies of older jobs are cancelled; possibly-sent ones can never be retried later.
        await sql.exec(`UPDATE public.print_copies SET state='CANCELLED' WHERE document_id=$1::uuid AND job_id<>$2::uuid
          AND state IN ('REGISTERED','READY','PRE_SEND_FAILED')`, [d.id, jobId])
        await sql.exec(`UPDATE public.print_copies SET retry_suppressed_by_job_id=$1::uuid WHERE document_id=$2::uuid
          AND job_id<>$1::uuid AND state IN ('SENDING','UNKNOWN','TRANSPORT_ACCEPTED','SPOOLER_ACCEPTED','BROWSER_AVAILABLE')
          AND retry_suppressed_by_job_id IS NULL`, [jobId, d.id])
        const after = await this.exposure(sql, d.id, r.intent_id)
        const latest = await one(sql, "SELECT risk_revision FROM public.print_documents WHERE id=$1::uuid", [d.id])
        await sql.exec("UPDATE public.print_jobs SET confirmed_exposure_hash=$1,confirmed_risk_revision=$2 WHERE id=$3::uuid", [after.hash, latest.risk_revision, jobId])
      }
      if (c.kind === "INITIAL") await sql.exec("UPDATE public.print_documents SET initial_state='INITIAL_REGISTERED',closed_by_intent_id=$1::uuid WHERE id=$2::uuid", [r.intent_id, d.id])
      if (c.kind === "REPRINT" && d.initial_state === "OPEN") await sql.exec("UPDATE public.print_documents SET initial_state='HISTORICAL_CLOSED',closed_by_intent_id=$1::uuid WHERE id=$2::uuid", [r.intent_id, d.id])
      await sql.exec("UPDATE public.print_requests SET job_id=$1::uuid,consumed_at=clock_timestamp() WHERE id=$2::uuid", [jobId, key])
      await this.event(sql, { store_id: r.store_id, document_id: d.id, job_id: jobId }, "JOB_REGISTERED", actor.principalId)
      for (const cp of copies) await this.markReady(sql, r.store_id, d.id, jobId, cp.id, b.installation_id)
      return this.view(sql, jobId, r.store_id, false)
    })
  }

  /** T2: the copy becomes claimable only by the bound installation, for a short dispatch lease (no late surprise print). */
  private async markReady(sql: Sql, storeId: string, documentId: string, jobId: string, copyId: string, installationId: string) {
    const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid AND job_id=$2::uuid AND store_id=$3 FOR UPDATE", [copyId, jobId, storeId])
    const epoch = BigInt(cp.lease_epoch) + BigInt(1), until = new Date(Date.now() + this.policy.dispatchLeaseMs)
    await sql.exec("UPDATE public.print_copies SET state='READY',lease_owner=$1,lease_until=$2,lease_epoch=$3 WHERE id=$4::uuid", [agentOwner(installationId), until, epoch, copyId])
    await this.event(sql, { store_id: storeId, document_id: documentId, job_id: jobId, copy_id: copyId }, "COPY_READY", null)
  }

  /** Operator "Tentar novamente": only copies proven not sent (PRE_SEND_FAILED, or READY whose dispatch lease lapsed without any attempt). */
  async retry(auth: Principal, storeId: string, jobId: string, deviceHash: string | null = null) {
    return this.db.transaction(async sql => {
      await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [text(jobId, 64), storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      await this.delegation(sql, j)
      check(j.authorization_expires_at > new Date(), "AUTHORIZATION_EXPIRED", 410)
      const b = await this.binding(sql, storeId, j.terminal_id, j.binding_version_id, deviceHash)
      const copies = await sql.query("SELECT * FROM public.print_copies WHERE job_id=$1::uuid ORDER BY ordinal FOR UPDATE", [j.id])
      let n = 0
      for (const cp of copies) {
        const lapsed = cp.state === "READY" && cp.lease_until <= new Date()
        if ((cp.state === "PRE_SEND_FAILED" || lapsed) && !cp.retry_suppressed_by_job_id && cp.payload_cipher && cp.payload_expires_at > new Date()) {
          await this.markReady(sql, storeId, j.document_id, j.id, cp.id, b.installation_id); n++
        }
      }
      check(n > 0, "COPY_NOT_RETRYABLE")
      return this.view(sql, j.id, storeId, false)
    })
  }

  /** T3 for one copy, executed for the authenticated agent of the bound installation. */
  private async start(sql: Sql, installationId: string, instanceId: string, copyId: string): Promise<AgentDispatch> {
    const cp0 = await one(sql, "SELECT job_id,store_id FROM public.print_copies WHERE id=$1::uuid", [copyId])
    const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [cp0.job_id, cp0.store_id])
    const storeId = j.store_id as string
    const d = await this.lockedDoc(sql, storeId, j.document_id)
    check(j.execution_mode === "LOCAL_AGENT" && j.delivery_mode === "THERMAL_BOUND", "EXECUTION_MODE")
    await this.delegation(sql, j)
    check(j.authorization_expires_at > new Date(), "AUTHORIZATION_EXPIRED")
    const current = await this.source(sql, storeId, d.sale_id)
    check(current.version === j.document_version, "DOCUMENT_VERSION_CONFLICT")
    const b = await this.binding(sql, storeId, j.terminal_id, j.binding_version_id)
    check(b.installation_id === installationId, "INSTALLATION_SCOPE", 403)
    const destination = await one(sql, "SELECT * FROM public.print_destinations WHERE id=$1::uuid FOR UPDATE", [b.destination_id])
    check(!destination.held_attempt_id, "DESTINATION_BLOCKED")
    const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid AND job_id=$2::uuid AND store_id=$3 FOR UPDATE", [copyId, j.id, storeId])
    check(cp.state === "READY" && cp.lease_owner === agentOwner(installationId) && cp.lease_until > new Date() &&
      !cp.retry_suppressed_by_job_id && cp.payload_cipher && cp.payload_expires_at > new Date(), "LEASE_OR_COPY_INVALID")
    if (j.kind === "REPRINT") check((await this.exposure(sql, d.id, j.intent_id)).hash === j.confirmed_exposure_hash, "STALE_RISK")
    const payload = this.crypto.open(cp.payload_cipher, "payload:" + storeId + ":" + j.id + ":" + copyId + ":" + cp.payload_hash)
    check(byteHash(payload) === cp.payload_hash, "PAYLOAD_HASH_MISMATCH")
    // Fence the attempt to THIS agent process (instance): a new epoch + owner, so another process holding the same
    // credential (copied token, agent started twice) can never receive it as a redelivery and print it again (B08).
    // The lease is renewed for the full send budget (P2-3): a slow but alive send is not turned UNKNOWN prematurely.
    const epoch = BigInt(cp.lease_epoch) + BigInt(1)
    await sql.exec("UPDATE public.print_copies SET lease_owner=$1,lease_epoch=$2,lease_until=$3 WHERE id=$4::uuid",
      [instanceOwner(installationId, instanceId), epoch, new Date(Date.now() + this.policy.sendLeaseMs), copyId])
    const [{ n }] = await sql.query("SELECT COALESCE(max(number),0)+1 n FROM public.print_attempts WHERE copy_id=$1::uuid", [copyId])
    const attemptId = randomUUID()
    await insert(sql, "print_attempts", { id: attemptId, store_id: storeId, document_id: d.id, job_id: j.id, copy_id: copyId,
      number: n, lease_epoch: epoch, destination_id: b.destination_id, result: "STARTED" })
    await sql.exec("UPDATE public.print_destinations SET held_attempt_id=$1::uuid,held_store_id=$2,blocked_at=clock_timestamp(),gate_epoch=gate_epoch+1 WHERE id=$3::uuid", [attemptId, storeId, b.destination_id])
    await sql.exec("UPDATE public.print_copies SET state='SENDING' WHERE id=$1::uuid", [copyId])
    await this.event(sql, { store_id: storeId, document_id: d.id, job_id: j.id, copy_id: copyId, attempt_id: attemptId, destination_id: b.destination_id }, "ATTEMPT_STARTED", null)
    await this.hooks.beforeT3Commit?.()
    return { attemptId, jobId: j.id, copyId, sendKey: cp.send_key, leaseEpoch: String(epoch), printerName: b.transport_destination_ref,
      payloadBase64: payload.toString("base64"), payloadHash: cp.payload_hash, documentLabel: "OmniGestao " + String(j.kind) + " " + String(cp.ordinal), redelivery: false, leaseRemainingMs: this.policy.sendLeaseMs }
  }

  /**
   * Agent pull. Re-delivers the STARTED attempts of THIS agent instance whose lease is still valid (claim response
   * lost — its journal dedups by sendKey), then starts new READY copies leased to the installation, one transaction each.
   */
  async claim(installationId: string, instanceInput: unknown) {
    const instanceId = text(instanceInput, 64)
    check(UUID.test(instanceId), "INVALID_INSTANCE", 400)
    const out: AgentDispatch[] = []
    const owner = agentOwner(installationId), mine = instanceOwner(installationId, instanceId)
    const open = await this.db.query(`SELECT a.id attempt_id,a.copy_id,a.job_id,a.store_id,c.send_key,c.lease_epoch,c.payload_cipher,c.payload_hash,j.kind,c.ordinal,b.transport_destination_ref,
      GREATEST(0,(extract(epoch from c.lease_until-clock_timestamp())*1000))::int remaining
      FROM public.print_attempts a JOIN public.print_copies c ON c.id=a.copy_id JOIN public.print_jobs j ON j.id=a.job_id
      JOIN public.print_bindings b ON b.id=j.binding_version_id
      WHERE a.result='STARTED' AND c.state='SENDING' AND c.lease_owner=$1 AND c.lease_until>clock_timestamp() AND b.installation_id=$2::uuid
      ORDER BY a.started_at LIMIT $3`, [mine, installationId, this.policy.maxClaim])
    for (const a of open) {
      if (!a.payload_cipher) continue
      const payload = this.crypto.open(a.payload_cipher, "payload:" + a.store_id + ":" + a.job_id + ":" + a.copy_id + ":" + a.payload_hash)
      out.push({ attemptId: a.attempt_id, jobId: a.job_id, copyId: a.copy_id, sendKey: a.send_key, leaseEpoch: String(a.lease_epoch), printerName: a.transport_destination_ref,
        payloadBase64: payload.toString("base64"), payloadHash: a.payload_hash, documentLabel: "OmniGestao " + a.kind + " " + a.ordinal, redelivery: true, leaseRemainingMs: Number(a.remaining) })
    }
    const ready = await this.db.query(`SELECT c.id FROM public.print_copies c JOIN public.print_jobs j ON j.id=c.job_id
      JOIN public.print_bindings b ON b.id=j.binding_version_id
      WHERE c.state='READY' AND c.lease_owner=$1 AND c.lease_until>clock_timestamp() AND c.retry_suppressed_by_job_id IS NULL AND b.installation_id=$2::uuid
      ORDER BY c.created_at,c.ordinal LIMIT $3`, [owner, installationId, this.policy.maxClaim])
    for (const r of ready) {
      try {
        out.push(await this.db.transaction(sql => this.start(sql, installationId, instanceId, r.id)))
        await this.hooks.afterClaimCommit?.()
      } catch (error) {
        const code = error instanceof PrintError ? error.code : "LEDGER_GUARD"
        if (["DOCUMENT_INELIGIBLE", "DOCUMENT_VERSION_CONFLICT", "KG_RECEIPT_BLOCKED", "NOT_FOUND"].includes(code)) await this.abandon(r.id, "CANCELLED", "DOCUMENT_CHANGED")
        else if (["DELEGATION_REVOKED", "SESSION_REVOKED", "FORBIDDEN", "AUTHORIZATION_EXPIRED", "UNAUTHENTICATED"].includes(code)) await this.abandon(r.id, "EXPIRED", "AUTHORIZATION_LOST")
        else if (["BINDING_UNAVAILABLE", "TERMINAL_PRINTER_NOT_CONFIGURED", "TERMINAL_UNAVAILABLE", "INSTALLATION_SCOPE"].includes(code)) await this.abandon(r.id, "CANCELLED", "BINDING_CHANGED")
        else if (code === "STALE_RISK") await this.abandon(r.id, "CANCELLED", "RISK_CHANGED")
        // DESTINATION_BLOCKED / LEASE_OR_COPY_INVALID: leave untouched (another attempt holds the printer, or a newer epoch owns it).
      }
    }
    // UNKNOWN attempts of THIS instance still holding a printer: it answers from its own journal (I17).
    const queries = await this.db.query(`SELECT a.id "attemptId",c.send_key "sendKey" FROM public.print_attempts a JOIN public.print_copies c ON c.id=a.copy_id
      JOIN public.print_destinations q ON q.held_attempt_id=a.id JOIN public.print_jobs j ON j.id=a.job_id JOIN public.print_bindings b ON b.id=j.binding_version_id
      WHERE a.result='UNKNOWN' AND c.lease_owner=$2 AND b.installation_id=$1::uuid ORDER BY a.started_at LIMIT $3`, [installationId, mine, this.policy.maxClaim])
    return { dispatches: out, queries: queries as Array<{ attemptId: string; sendKey: string }> }
  }

  /**
   * Explicit browser print chosen by the operator (P2-4). It is recorded in the ledger (it counts as disclosed risk for any
   * later copy), cancels the safe thermal copies of the sale, and — when a copy may already exist — requires confirmation and
   * is marked SEGUNDA VIA. The HTML is rendered and escaped server-side from the confirmed sale.
   */
  async browserFallback(auth: Principal, storeId: string, input: unknown) {
    const v = shape(input, ["saleId", "confirm", "uiContextId"])
    const saleId = text(v.saleId, 160)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      const source = await this.source(sql, storeId, saleId)
      const d = await this.doc(sql, storeId, saleId)
      const exposure = await this.exposure(sql, d.id)
      const possible = exposure.rows.some(r => potentialStates.includes(r.state)) || exposure.browserCopies > 0
      if (possible && v.confirm !== true) return { requiresConfirmation: true as const, possibleAdditionalCopy: true,
        uncertainCopies: exposure.rows.filter(r => r.state === "UNKNOWN" || r.state === "SENDING").length,
        acceptedCopies: exposure.rows.filter(r => r.state === "SPOOLER_ACCEPTED" || r.state === "TRANSPORT_ACCEPTED").length, browserCopies: exposure.browserCopies }
      const cancelled = await sql.exec(`UPDATE public.print_copies SET state='CANCELLED' WHERE document_id=$1::uuid AND state IN ('REGISTERED','READY','PRE_SEND_FAILED')`, [d.id])
      const mark = possible ? "SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR" : "VIA IMPRESSA PELO NAVEGADOR"
      await this.event(sql, { store_id: storeId, document_id: d.id }, "BROWSER_FALLBACK_PRINTED", actor.principalId,
        { mark, possibleAdditionalCopy: possible, cancelledThermalCopies: cancelled, physicalPrintConfirmed: false })
      return { requiresConfirmation: false as const, mark, html: renderBrowserHtml(source.input, source.mode, mark) }
    })
  }

  /** A READY copy that can no longer start is closed safely (no attempt exists, so nothing was sent). */
  private async abandon(copyId: string, state: "CANCELLED" | "EXPIRED", reason: string) {
    await this.db.transaction(async sql => {
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid", [copyId])
      await this.lockedDoc(sql, cp.store_id, cp.document_id)
      const fresh = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid FOR UPDATE", [copyId])
      if (fresh.state !== "READY") return
      await sql.exec("UPDATE public.print_copies SET state=$1 WHERE id=$2::uuid", [state, copyId])
      await this.event(sql, { store_id: cp.store_id, document_id: cp.document_id, job_id: cp.job_id, copy_id: copyId }, "COPY_" + state, null, { reason })
    }).catch(() => undefined)
  }

  /** T4: authenticated agent result. Scope (installation→binding→destination→attempt→sendKey→epoch) must match exactly. */
  async report(installationId: string, input: unknown) {
    const v = shape(input, ["attemptId", "sendKey", "result", "release", "spoolJobId", "reason"])
    const r: AgentReport = { attemptId: text(v.attemptId, 64), sendKey: text(v.sendKey, 64), result: v.result as AgentReport["result"],
      release: v.release === true, spoolJobId: v.spoolJobId == null ? null : text(String(v.spoolJobId), 40),
      reason: v.reason == null ? null : text(v.reason, 40) }
    check(UUID.test(r.attemptId) && UUID.test(r.sendKey) && ["SPOOLER_ACCEPTED", "NO_EFFECT", "UNKNOWN"].includes(r.result) && typeof v.release === "boolean", "INVALID_REPORT", 400)
    check(!r.reason || REPORT_REASONS.includes(r.reason), "INVALID_REPORT", 400)
    check(r.result !== "NO_EFFECT" || r.release, "INVALID_REPORT", 400)
    return this.db.transaction(async sql => {
      const a = await one(sql, "SELECT * FROM public.print_attempts WHERE id=$1::uuid", [r.attemptId])
      await this.lockedDoc(sql, a.store_id, a.document_id)
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid FOR UPDATE", [a.copy_id])
      const j = await one(sql, "SELECT binding_version_id,execution_mode FROM public.print_jobs WHERE id=$1::uuid", [a.job_id])
      const b = await one(sql, "SELECT installation_id,destination_id FROM public.print_bindings WHERE id=$1::uuid", [j.binding_version_id])
      check(j.execution_mode === "LOCAL_AGENT" && b.installation_id === installationId && a.destination_id === b.destination_id && cp.send_key === r.sendKey, "PROOF_SCOPE_MISMATCH", 403)
      await one(sql, "SELECT id FROM public.print_destinations WHERE id=$1::uuid FOR UPDATE", [a.destination_id])
      const evidenceKey = r.result + ":" + r.release
      const proofHash = hash("agent-proof-v1", { ...r, installationId, leaseEpoch: String(a.lease_epoch) })
      const existing = await sql.query("SELECT id,evidence_hash,details FROM public.print_events WHERE attempt_id=$1::uuid AND (evidence_key=$2 OR (proof_kind='NONE' AND details->>'evidenceKey'=$2))", [a.id, evidenceKey])
      if (existing.length) {
        check((existing[0].evidence_hash ?? existing[0].details?.evidenceHash) === proofHash, "PROOF_CONFLICT")
        return { replay: true, state: cp.state as string }
      }
      const target = r.result === "SPOOLER_ACCEPTED" ? "SPOOLER_ACCEPTED" : r.result === "NO_EFFECT" ? "PRE_SEND_FAILED" : "UNKNOWN"
      if (!(a.result === "STARTED" || a.result === "UNKNOWN")) check(a.result === target || target === "UNKNOWN", "RESULT_CONFLICT")
      const chain = { store_id: a.store_id, document_id: a.document_id, job_id: a.job_id, copy_id: a.copy_id, attempt_id: a.id, destination_id: a.destination_id }
      const details = { evidenceKey, evidenceHash: proofHash, reason: r.reason, spoolJobId: r.spoolJobId, physicalPrintConfirmed: false }
      if (target === "UNKNOWN") await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: "RESULT_UNKNOWN", proof_kind: "NONE", actor_kind: "SYSTEM", details })
      else await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: "AGENT_RESULT",
        proof_kind: target === "SPOOLER_ACCEPTED" ? "AGENT_SPOOLER_ACCEPTED" : "AGENT_NO_EFFECT", evidence_hash: proofHash, evidence_key: evidenceKey, actor_kind: "LOCAL_AGENT", details })
      // Never downgrade a known result, even on a delayed UNKNOWN.
      if (a.result === "STARTED" || a.result === "UNKNOWN") {
        if (target !== "UNKNOWN" || a.result === "STARTED") {
          await sql.exec("UPDATE public.print_attempts SET result=$1,finished_at=clock_timestamp(),external_ref=COALESCE(external_ref,$3) WHERE id=$2::uuid", [target, a.id, r.spoolJobId])
          await sql.exec("UPDATE public.print_copies SET state=$1 WHERE id=$2::uuid AND state<>$1", [target, cp.id])
        }
      }
      if (r.release) {
        const held = await sql.query("SELECT id FROM public.print_destinations WHERE id=$1::uuid AND held_attempt_id=$2::uuid", [a.destination_id, a.id])
        const releaseId = randomUUID()
        await insert(sql, "print_events", { id: releaseId, ...chain, scope_kind: "DOCUMENT", event_type: "AGENT_EGRESS_CLOSED",
          proof_kind: "AGENT_EGRESS_CLOSED", evidence_hash: proofHash, evidence_key: evidenceKey + ":release", actor_kind: "LOCAL_AGENT" })
        if (held.length) await sql.exec("UPDATE public.print_destinations SET held_attempt_id=NULL,held_store_id=NULL,release_event_id=$1::uuid,gate_epoch=gate_epoch+1 WHERE id=$2::uuid AND held_attempt_id=$3::uuid", [releaseId, a.destination_id, a.id])
      }
      const after = await one(sql, "SELECT state FROM public.print_copies WHERE id=$1::uuid", [cp.id])
      return { replay: false, state: after.state as string }
    })
  }

  /** Server-side timeout: a SENDING copy whose lease lapsed becomes UNKNOWN. Never releases the destination, never retries (I17). */
  async recoverJob(storeId: string, jobId: string) {
    const due = await this.db.query("SELECT id FROM public.print_copies WHERE job_id=$1::uuid AND store_id=$2 AND state='SENDING' AND lease_until<=clock_timestamp()", [jobId, storeId])
    for (const c of due) {
      await this.db.transaction(async sql => {
        const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
        await this.lockedDoc(sql, storeId, j.document_id)
        const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid FOR UPDATE", [c.id])
        if (cp.state !== "SENDING" || cp.lease_until > new Date()) return
        const a = await one(sql, "SELECT * FROM public.print_attempts WHERE copy_id=$1::uuid ORDER BY number DESC LIMIT 1", [c.id])
        await sql.exec("UPDATE public.print_attempts SET result='UNKNOWN' WHERE id=$1::uuid", [a.id])
        await sql.exec("UPDATE public.print_copies SET state='UNKNOWN' WHERE id=$1::uuid", [c.id])
        await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId, copy_id: c.id, attempt_id: a.id, destination_id: a.destination_id }, "RECOVERED_UNKNOWN", null)
      })
    }
  }

  async get(auth: Principal, storeId: string, jobId: string): Promise<JobView> {
    text(jobId, 64); check(UUID.test(jobId), "NOT_FOUND", 404)
    await this.db.transaction(sql => authorize(sql, auth, storeId))
    await this.recoverJob(storeId, jobId)
    return this.view(this.db, jobId, storeId, true)
  }

  /** Latest job of a sale for this store (used after reload/second tab to show the real state). */
  async latestForSale(auth: Principal, storeId: string, saleId: string): Promise<JobView | null> {
    await this.db.transaction(sql => authorize(sql, auth, storeId))
    const rows = await this.db.query(`SELECT j.id FROM public.print_jobs j JOIN public.print_documents d ON d.id=j.document_id
      WHERE d.store_id=$1 AND d.sale_id=$2 AND j.store_id=$1 ORDER BY j.created_at DESC LIMIT 1`, [storeId, text(saleId, 160)])
    if (!rows.length) return null
    await this.recoverJob(storeId, rows[0].id)
    return this.view(this.db, rows[0].id, storeId, true)
  }

  private async view(sql: Sql, id: string, storeId: string, replay: boolean): Promise<JobView> {
    const j = await one(sql, `SELECT j.id,j.kind,j.document_id,j.copies,j.authorization_expires_at,j.content_expires_at,j.terminal_id,j.created_at,d.sale_id,
      l.last_seen_at agent_seen,b.transport_destination_ref printer FROM public.print_jobs j JOIN public.print_documents d ON d.id=j.document_id
      LEFT JOIN public.print_bindings b ON b.id=j.binding_version_id LEFT JOIN public.print_agent_links l ON l.installation_id=b.installation_id
      WHERE j.id=$1::uuid AND j.store_id=$2`, [id, storeId])
    const copies = await sql.query<CopyRow>(`SELECT c.ordinal,c.state,c.retry_suppressed_by_job_id,c.payload_cipher IS NOT NULL has_payload,c.payload_expires_at,c.lease_until,
      (SELECT count(*)::int FROM public.print_attempts a WHERE a.copy_id=c.id) attempts,
      (SELECT e.details->>'reason' FROM public.print_events e WHERE e.copy_id=c.id AND e.details->>'reason' IS NOT NULL ORDER BY e.created_at DESC LIMIT 1) reason
      FROM public.print_copies c WHERE c.job_id=$1::uuid ORDER BY c.ordinal`, [j.id])
    return summarizeCopies({ jobId: j.id, saleId: j.sale_id, kind: j.kind, terminalId: j.terminal_id, replay, printerName: j.printer ?? null,
      authorizationOpen: j.authorization_expires_at > new Date(),
      agentOnline: !!j.agent_seen && Date.now() - new Date(j.agent_seen).getTime() <= this.policy.agentOnlineMs }, copies)
  }
}
