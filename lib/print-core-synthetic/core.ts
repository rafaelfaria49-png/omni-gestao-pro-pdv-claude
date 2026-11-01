import { randomUUID } from "node:crypto"
import { authorize, type Authority } from "./authority"
import { byteHash, canonical, cleanData, FixtureCrypto, hash, shape, text } from "./codec"
import { check, insert, one, type Database, type Row, type Sql } from "./db"
import { receipt, saleSnapshot } from "./sale"
import { SyntheticBoundary, type Outcome, type Start } from "./simulator"

export type FixturePolicy = { requestMs: number; authorizationMs: number; contentMs: number; leaseMs: number; riskMs: number; maxCopies: number; maxItems: number; maxBytes: number; maxRequestsPerMinute: number; expiredRequestRetentionMs: number }
export type Hooks = { beforeDocumentLock?: () => Promise<void>; afterDocumentLock?: () => Promise<void>; beforeT3Commit?: () => Promise<void> }
export type Prepared = { key: string; command: Row }
const commandKeys = ["storeId", "saleId", "documentId", "intentId", "kind", "terminalId", "deliveryMode", "bindingVersionId", "browserContextId", "copies", "documentVersion", "reasonCode", "previousJobId", "riskRevision", "riskHash", "consentHash"]
const inputKeys = ["storeId", "saleId", "kind", "terminalId", "deliveryMode", "bindingVersionId", "browserContextId", "copies", "reasonCode", "previousJobId", "consent"]
const safeStates = ["REGISTERED", "READY", "PRE_SEND_FAILED"]
const potentialStates = ["SENDING", "UNKNOWN", "TRANSPORT_ACCEPTED", "SPOOLER_ACCEPTED", "BROWSER_AVAILABLE"]
const reasons = ["CUSTOMER_REQUEST", "ILLEGIBLE", "LOST", "UNCERTAIN_RESULT", "EXPLICIT_FALLBACK", "UPDATED_DOCUMENT"]
const commandHash = (command: Row, principalId: string) => hash("command-v1", { command, principalId })
export function intentProjection(command: Row) {
  // Risk grant/revision/principal differ between receipts, but cannot silently retarget an INITIAL.
  return Object.fromEntries(Object.entries(command).filter(([k]) => !["riskRevision", "riskHash", "consentHash"].includes(k)))
}
export function summarize(copies: Row[]) {
  const states = copies.map(c => ({ ordinal: c.ordinal, state: c.state, retrySuppressed: !!c.retry_suppressed_by_job_id,
    canRetry: c.state === "PRE_SEND_FAILED" && !c.retry_suppressed_by_job_id && !!c.payload_cipher && c.payload_expires_at > new Date() }))
  const distinct = new Set(states.map(c => c.state))
  return { state: distinct.size > 1 ? "PARTIAL" : states[0]?.state ?? "EMPTY", copies: states, physicalPrintConfirmed: false }
}
export class PrintCoreSynthetic {
  constructor(private readonly db: Database, private readonly crypto: FixtureCrypto, readonly boundary: SyntheticBoundary,
    readonly policy: FixturePolicy, private readonly hooks: Hooks = {}) {
    check(boundary.mode === "SYNTHETIC_ONLY", "SYNTHETIC_BOUNDARY_REQUIRED", 500)
    for (const v of Object.values(policy)) check(Number.isSafeInteger(v) && v > 0, "FINITE_FIXTURE_POLICY_REQUIRED", 500)
    check(policy.maxCopies <= 2 && policy.contentMs >= policy.authorizationMs && policy.authorizationMs >= policy.requestMs, "INVALID_FIXTURE_POLICY", 500)
  }
  private async doc(sql: Sql, storeId: string, saleId: string | null, syntheticKey: string | null = null) {
    if (saleId) {
      await one(sql, 'SELECT id FROM public.vendas WHERE id=$1 AND "storeId"=$2', [saleId, storeId])
      await sql.exec(`INSERT INTO public.print_documents(id,store_id,document_kind,sale_id,family)
        VALUES($1::uuid,$2,'SALE',$3,'SALE_RECEIPT') ON CONFLICT(store_id,sale_id,family) DO NOTHING`, [randomUUID(), storeId, saleId])
    } else {
      await insert(sql, "print_documents", { id: randomUUID(), store_id: storeId, document_kind: "SYNTHETIC",
        synthetic_key: syntheticKey, family: "SYNTHETIC_TEST" })
    }
    await this.hooks.beforeDocumentLock?.()
    const d = await one(sql, "SELECT * FROM public.print_documents WHERE store_id=$1 AND " + (saleId ? "sale_id=$2" : "synthetic_key=$2::uuid") + " FOR UPDATE", [storeId, saleId ?? syntheticKey])
    await this.hooks.afterDocumentLock?.()
    check(!d.retired_at, "DOCUMENT_RETIRED")
    return d
  }
  private async lockedDoc(sql: Sql, storeId: string, id: string) {
    await this.hooks.beforeDocumentLock?.()
    const d = await one(sql, "SELECT * FROM public.print_documents WHERE id=$1::uuid AND store_id=$2 FOR UPDATE", [id, storeId])
    await this.hooks.afterDocumentLock?.()
    check(!d.retired_at, "DOCUMENT_RETIRED")
    return d
  }
  private async source(sql: Sql, storeId: string, saleId: string | null, store: Row, syntheticKey: string | null) {
    if (!saleId) return { version: hash("synthetic-v1", { storeId, syntheticKey }),
      snapshot: { synthetic: true, label: "TESTE SINTÉTICO — SEM VALOR COMERCIAL", source: null } }
    const s = await saleSnapshot(sql, storeId, saleId, this.policy.maxItems)
    const header = { name: store.name, cnpj: store.cnpj }
    return { version: hash("document-version-v1", { source: s.version, header }), snapshot: { synthetic: true, receipt: receipt(s, header) } }
  }
  private async target(sql: Sql, c: Row, family: string) {
    await one(sql, 'SELECT id FROM public.pdv_terminais WHERE id=$1 AND "storeId"=$2 AND status=$3', [c.terminalId, c.storeId, "ACTIVE"])
    if (c.deliveryMode === "BROWSER_A4") {
      check(c.browserContextId && !c.bindingVersionId && c.copies === 1, "INVALID_A4_TARGET", 400)
      return { profile_id: "A4", profile_version: 1, profile_hash: hash("profile", "A4_LOGICAL"), destination_id: null }
    }
    check(c.deliveryMode === "THERMAL_BOUND" && c.bindingVersionId && !c.browserContextId, "INVALID_TARGET", 400)
    const b = await one(sql, `SELECT b.*,i.proof_mode,i.revoked_at installation_revoked,q.serialization_mode
      FROM public.print_bindings b JOIN public.print_installations i ON i.id=b.installation_id
      JOIN public.print_destinations q ON q.id=b.destination_id
      WHERE b.id=$1::uuid AND b.store_id=$2 AND b.terminal_id=$3 AND b.family=$4`, [c.bindingVersionId, c.storeId, c.terminalId, family])
    check(b.state === "ACTIVE" && !b.installation_revoked && b.proof_mode === "SYNTHETIC" && b.serialization_mode === "SYNTHETIC", "BINDING_UNAVAILABLE")
    return b
  }
  private async exposure(sql: Sql, documentId: string, excludeIntent: string | null = null) {
    const rows = await sql.query(`SELECT j.id job_id,c.id copy_id,c.state,c.retry_suppressed_by_job_id,
      (SELECT a.result FROM public.print_attempts a WHERE a.copy_id=c.id ORDER BY a.number DESC LIMIT 1) result
      FROM public.print_jobs j JOIN public.print_copies c ON c.job_id=j.id
      WHERE j.document_id=$1::uuid AND ($2::uuid IS NULL OR j.intent_id<>$2::uuid) ORDER BY j.id,c.ordinal`, [documentId, excludeIntent])
    return { rows, hash: hash("exposure-v1", rows) }
  }
  async quoteReprint(auth: Authority, storeId: string, saleId: string) {
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      await this.source(sql, storeId, saleId, actor.store, null)
      const d = await this.doc(sql, storeId, saleId)
      const existing = d.active_reprint_intent_id ? await sql.query("SELECT id FROM public.print_jobs WHERE intent_id=$1::uuid", [d.active_reprint_intent_id]) : []
      const intentId = d.active_reprint_intent_id && d.active_reprint_until > new Date() && !existing.length ? d.active_reprint_intent_id : randomUUID()
      const until = new Date(Date.now() + this.policy.riskMs)
      await sql.exec("UPDATE public.print_documents SET active_reprint_intent_id=$1::uuid,active_reprint_until=$2 WHERE id=$3::uuid", [intentId, until, d.id])
      const exposure = await this.exposure(sql, d.id, intentId)
      // This operation represents an explicit authenticated additional-copy act in the laboratory.
      const consent = this.crypto.sign("risk-consent-v1", { storeId, documentId: d.id, intentId, principalId: actor.principalId,
        revision: String(d.risk_revision), exposureHash: exposure.hash, expires: until.getTime() })
      return { consent, documentId: d.id as string, intentId: intentId as string, riskRevision: String(d.risk_revision), exposureHash: exposure.hash,
        possibleAdditionalCopy: exposure.rows.some(r => potentialStates.includes(r.state)), sourceOriginal: d.initial_state === "OPEN" ? "UNKNOWN" : "KNOWN" }
    })
  }
  async prepare(auth: Authority, input: unknown): Promise<Prepared> {
    const v = shape(input, inputKeys)
    const c: Row = { storeId: text(v.storeId), saleId: v.saleId == null ? null : text(v.saleId), kind: text(v.kind),
      terminalId: text(v.terminalId), deliveryMode: v.deliveryMode ?? "THERMAL_BOUND",
      bindingVersionId: v.bindingVersionId ?? null, browserContextId: v.browserContextId ?? null,
      copies: v.copies ?? 1, reasonCode: v.reasonCode ?? null, previousJobId: v.previousJobId ?? null }
    check(["INITIAL", "REPRINT", "TEST"].includes(c.kind) && Number.isInteger(c.copies) && c.copies > 0 && c.copies <= this.policy.maxCopies, "COMMAND_LIMIT", 400)
    check((c.kind === "TEST") === (c.saleId === null), "DOCUMENT_KIND", 400)
    check(c.kind === "REPRINT" ? reasons.includes(c.reasonCode) : c.reasonCode === null && c.previousJobId === null, "REASON_REQUIRED", 400)
    for (const name of ["bindingVersionId", "browserContextId", "previousJobId"]) if (c[name] !== null) c[name] = text(c[name])
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, c.storeId)
      // Per-principal serialization makes the finite fixture admission limit race safe.
      await sql.query("SELECT pg_advisory_xact_lock(hashtextextended($1,4005))::text", [actor.principalId])
      const [rate] = await sql.query("SELECT count(*)::int n FROM public.print_requests WHERE principal_id=$1 AND issued_at>clock_timestamp()-interval '1 minute'", [actor.principalId])
      check(rate.n < this.policy.maxRequestsPerMinute, "RATE_LIMIT", 429)
      const syntheticKey = c.kind === "TEST" ? randomUUID() : null
      const d = await this.doc(sql, c.storeId, c.saleId, syntheticKey)
      const source = await this.source(sql, c.storeId, c.saleId, actor.store, syntheticKey)
      c.documentId = d.id; c.documentVersion = source.version
      let consent: Row | null = null
      if (c.kind === "REPRINT") {
        consent = this.crypto.verify("risk-consent-v1", text(v.consent, 8192))
        check(consent.storeId === c.storeId && consent.documentId === d.id && consent.principalId === actor.principalId &&
          consent.expires > Date.now() && consent.intentId === d.active_reprint_intent_id, "RISK_CONFIRMATION_REQUIRED")
        c.intentId = consent.intentId
      } else if (c.kind === "INITIAL") {
        check(d.initial_state !== "HISTORICAL_CLOSED", "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
        c.intentId = d.initial_intent_id ?? randomUUID()
        if (!d.initial_intent_id) await sql.exec("UPDATE public.print_documents SET initial_intent_id=$1::uuid WHERE id=$2::uuid", [c.intentId, d.id])
      } else c.intentId = randomUUID()
      if (c.previousJobId) await one(sql, "SELECT id FROM public.print_jobs WHERE id=$1::uuid AND document_id=$2::uuid AND store_id=$3", [c.previousJobId, d.id, c.storeId])
      await this.target(sql, c, d.family)
      const exposure = await this.exposure(sql, d.id, c.intentId)
      if (consent) check(consent.revision === String(d.risk_revision) && consent.exposureHash === exposure.hash, "STALE_RISK")
      c.riskRevision = String(d.risk_revision); c.riskHash = exposure.hash
      c.consentHash = consent ? hash("risk-token-v1", v.consent) : null
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
  private async delegation(sql: Sql, job: Row) {
    const g = await one(sql, "SELECT * FROM public.print_delegations WHERE id=$1::uuid AND store_id=$2 AND principal_id=$3 FOR UPDATE", [job.delegation_id, job.store_id, job.principal_id])
    check(!g.revoked_at && g.expires_at > new Date(), "DELEGATION_REVOKED")
    await authorize(sql, { principalId: g.principal_id, observedSessionVersion: g.session_version }, g.store_id)
    return g
  }
  async create(auth: Authority, key: string, input: unknown) {
    const c = shape(input, commandKeys)
    check(Object.keys(c).length === commandKeys.length && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(key), "INVALID_COMMAND", 400)
    for (const field of commandKeys.filter(k => k !== "copies")) {
      check(c[field] === null || (typeof c[field] === "string" && c[field].length <= 200 && !/[\u0000-\u001f\u007f-\u009f]/u.test(c[field] as string)), "INVALID_COMMAND", 400)
    }
    check(Number.isInteger(c.copies) && Number(c.copies) >= 1 && Number(c.copies) <= this.policy.maxCopies, "INVALID_COMMAND", 400)
    check(Buffer.byteLength(canonical(c)) <= this.policy.maxBytes, "COMMAND_LIMIT", 400)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, text(c.storeId))
      const peek = await sql.query("SELECT document_id FROM public.print_requests WHERE id=$1::uuid AND store_id=$2 AND principal_id=$3", [key, c.storeId, actor.principalId])
      check(peek.length, "REQUEST_EXPIRED", 410)
      const d = await this.lockedDoc(sql, String(c.storeId), peek[0].document_id)
      const r = await one(sql, "SELECT * FROM public.print_requests WHERE id=$1::uuid FOR UPDATE", [key])
      check(commandHash(c, actor.principalId) === r.command_hash, "REQUEST_CONFLICT")
      if (r.job_id) return this.metadata(sql, r.job_id, String(c.storeId), true)
      check(!r.revoked_at && r.command && r.expires_at > new Date(), "REQUEST_EXPIRED", 410)
      await this.delegation(sql, { delegation_id: r.delegation_id, store_id: r.store_id, principal_id: r.principal_id })
      const sameIntent = await sql.query("SELECT * FROM public.print_jobs WHERE intent_id=$1::uuid", [r.intent_id])
      if (sameIntent.length) {
        const j = sameIntent[0]
        const durable = { storeId: j.store_id, saleId: d.sale_id, documentId: j.document_id, intentId: j.intent_id,
          kind: j.kind, terminalId: j.terminal_id, deliveryMode: j.delivery_mode, bindingVersionId: j.binding_version_id,
          browserContextId: j.browser_context_id, copies: j.copies, documentVersion: j.document_version,
          reasonCode: j.reason_code, previousJobId: j.previous_job_id }
        check(hash("intent-v1", durable) === hash("intent-v1", intentProjection(c)), "INITIAL_SEMANTIC_CONFLICT")
        await sql.exec("UPDATE public.print_requests SET job_id=$1::uuid,consumed_at=clock_timestamp() WHERE id=$2::uuid", [sameIntent[0].id, key])
        return this.metadata(sql, sameIntent[0].id, r.store_id, true)
      }
      check(c.kind !== "INITIAL" || d.initial_state === "OPEN", "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
      const source = await this.source(sql, r.store_id, d.sale_id, actor.store, d.synthetic_key)
      check(source.version === c.documentVersion, "DOCUMENT_VERSION_CONFLICT")
      const target = await this.target(sql, c, d.family)
      const before = await this.exposure(sql, d.id, r.intent_id)
      if (c.kind === "REPRINT") check(r.risk_confirmed_at && r.risk_revision === d.risk_revision && r.risk_set_hash === before.hash, "STALE_RISK")
      const now = Date.now(), jobId = randomUUID(), contentUntil = new Date(now + this.policy.contentMs)
      // Job authority never exceeds the specific delegation that admitted it.
      const grant = await one(sql, "SELECT expires_at FROM public.print_delegations WHERE id=$1::uuid", [r.delegation_id])
      const snapshot = Buffer.from(canonical(cleanData({ ...source.snapshot, kind: c.kind, secondCopy: c.kind === "REPRINT", drawer: false })))
      const snapshotHash = byteHash(snapshot)
      check(snapshot.length <= this.policy.maxBytes, "SNAPSHOT_LIMIT", 400)
      const copies = Array.from({ length: Number(c.copies) }, (_, i) => {
        const id = randomUUID(), ordinal = i + 1
        // JSON data format, never raw/HTML/ESC/POS. Browser A4 is logical only.
        const payload = Buffer.from(canonical(cleanData({ format: "SYNTHETIC_JSON_V1", snapshot: JSON.parse(snapshot.toString("utf8")),
          ordinal, count: c.copies, profileId: target.profile_id, profileVersion: target.profile_version })))
        check(payload.length <= this.policy.maxBytes, "PAYLOAD_LIMIT", 400)
        return { id, ordinal, payload, payloadHash: byteHash(payload) }
      })
      await insert(sql, "print_jobs", { id: jobId, store_id: r.store_id, document_id: d.id, intent_id: r.intent_id, kind: c.kind,
        execution_mode: "SYNTHETIC_ONLY", principal_id: actor.principalId, delegation_id: r.delegation_id, terminal_id: c.terminalId,
        delivery_mode: c.deliveryMode, binding_version_id: c.bindingVersionId, browser_context_id: c.browserContextId, copies: c.copies,
        document_version: source.version, canonical_version: 1, snapshot_hash: snapshotHash,
        snapshot_cipher: this.crypto.seal(snapshot, "snapshot:" + r.store_id + ":" + jobId + ":" + snapshotHash), snapshot_key_ref: this.crypto.keyRef,
        payload_manifest_hash: hash("payload-manifest-v1", copies.map(cp => ({ ordinal: cp.ordinal, hash: cp.payloadHash }))),
        renderer_version: "synthetic-json-v1", profile_id: target.profile_id, profile_version: target.profile_version,
        previous_job_id: c.previousJobId, reason_code: c.reasonCode, confirmed_risk_revision: d.risk_revision,
        confirmed_exposure_hash: before.hash, risk_confirmed_at: r.risk_confirmed_at,
        authorization_expires_at: grant.expires_at, content_expires_at: contentUntil })
      for (const cp of copies) await insert(sql, "print_copies", { id: cp.id, store_id: r.store_id, document_id: d.id, job_id: jobId,
        ordinal: cp.ordinal, payload_hash: cp.payloadHash, payload_size: cp.payload.length,
        payload_cipher: this.crypto.seal(cp.payload, "payload:" + r.store_id + ":" + jobId + ":" + cp.id + ":" + cp.payloadHash),
        payload_key_ref: this.crypto.keyRef, payload_expires_at: contentUntil, send_key: randomUUID() })
      if (c.kind === "REPRINT") {
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
      return this.metadata(sql, jobId, r.store_id, false)
    })
  }
  private async metadata(sql: Sql, id: string, storeId: string, replay: boolean) {
    const j = await one(sql, "SELECT id,kind,delivery_mode,principal_id,document_id,content_expires_at FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [id, storeId])
    const copies = await sql.query("SELECT * FROM public.print_copies WHERE job_id=$1::uuid ORDER BY ordinal", [j.id])
    return { jobId: j.id as string, documentId: j.document_id as string, principalId: j.principal_id as string, kind: j.kind as string,
      deliveryMode: j.delivery_mode as string, replay, contentExpired: j.content_expires_at <= new Date() || copies.some(c => !c.payload_cipher),
      ...summarize(copies) }
  }
  async get(auth: Authority, storeId: string, jobId: string) {
    await authorize(this.db, auth, storeId)
    return this.metadata(this.db, jobId, storeId, true)
  }
  async ready(auth: Authority, storeId: string, jobId: string, copyId: string, owner: string) {
    text(owner, 100)
    return this.db.transaction(async sql => {
      await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      await this.delegation(sql, j)
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid AND job_id=$2::uuid AND store_id=$3 FOR UPDATE", [copyId, jobId, storeId])
      check(safeStates.includes(cp.state) && !cp.retry_suppressed_by_job_id && cp.payload_cipher && cp.payload_expires_at > new Date() &&
        j.authorization_expires_at > new Date(), "COPY_NOT_RETRYABLE")
      check(!cp.lease_owner || cp.lease_until <= new Date(), "LEASE_HELD")
      const epoch = BigInt(cp.lease_epoch) + 1n, until = new Date(Date.now() + this.policy.leaseMs)
      await sql.exec("UPDATE public.print_copies SET state='READY',lease_owner=$1,lease_until=$2,lease_epoch=$3 WHERE id=$4::uuid", [owner, until, epoch, copyId])
      await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId, copy_id: copyId }, "COPY_READY", null)
      return { epoch: String(epoch), owner, until }
    })
  }
  async start(auth: Authority, storeId: string, jobId: string, copyId: string, owner: string, epoch: string): Promise<Start> {
    return this.db.transaction(async sql => {
      await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      const d = await this.lockedDoc(sql, storeId, j.document_id)
      check(j.delivery_mode === "THERMAL_BOUND", "A4_LOGICAL_ONLY")
      await this.delegation(sql, j)
      check(j.authorization_expires_at > new Date(), "AUTHORIZATION_EXPIRED")
      const user = await authorize(sql, { principalId: j.principal_id, observedSessionVersion: (await one(sql, "SELECT session_version FROM public.print_delegations WHERE id=$1::uuid", [j.delegation_id])).session_version }, storeId)
      const current = await this.source(sql, storeId, d.sale_id, user.store, d.synthetic_key)
      check(current.version === j.document_version, "DOCUMENT_VERSION_CONFLICT")
      const c = { storeId, terminalId: j.terminal_id, deliveryMode: j.delivery_mode, bindingVersionId: j.binding_version_id, browserContextId: j.browser_context_id, copies: j.copies }
      const target = await this.target(sql, c, d.family)
      if (target.destination_id) {
        const destination = await one(sql, "SELECT * FROM public.print_destinations WHERE id=$1::uuid FOR UPDATE", [target.destination_id])
        check(!destination.held_attempt_id, "DESTINATION_BLOCKED")
      }
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid AND job_id=$2::uuid AND store_id=$3 FOR UPDATE", [copyId, jobId, storeId])
      check(cp.state === "READY" && cp.lease_owner === owner && String(cp.lease_epoch) === epoch && cp.lease_until > new Date() &&
        !cp.retry_suppressed_by_job_id && cp.payload_cipher && cp.payload_expires_at > new Date(), "LEASE_OR_COPY_INVALID")
      if (j.kind === "REPRINT") check((await this.exposure(sql, d.id, j.intent_id)).hash === j.confirmed_exposure_hash, "STALE_RISK")
      const payload = this.crypto.open(cp.payload_cipher, "payload:" + storeId + ":" + jobId + ":" + copyId + ":" + cp.payload_hash)
      check(byteHash(payload) === cp.payload_hash, "PAYLOAD_HASH_MISMATCH")
      const [{ n }] = await sql.query("SELECT COALESCE(max(number),0)+1 n FROM public.print_attempts WHERE copy_id=$1::uuid", [copyId])
      const attemptId = randomUUID()
      await insert(sql, "print_attempts", { id: attemptId, store_id: storeId, document_id: d.id, job_id: jobId, copy_id: copyId,
        number: n, lease_epoch: cp.lease_epoch, destination_id: target.destination_id, result: "STARTED" })
      if (target.destination_id) await sql.exec("UPDATE public.print_destinations SET held_attempt_id=$1::uuid,held_store_id=$2,blocked_at=clock_timestamp(),gate_epoch=gate_epoch+1 WHERE id=$3::uuid", [attemptId, storeId, target.destination_id])
      await sql.exec("UPDATE public.print_copies SET state='SENDING' WHERE id=$1::uuid", [copyId])
      await this.event(sql, { store_id: storeId, document_id: d.id, job_id: jobId, copy_id: copyId, attempt_id: attemptId, destination_id: target.destination_id }, "ATTEMPT_STARTED", null)
      await this.hooks.beforeT3Commit?.()
      return { storeId, documentId: d.id, jobId, copyId, attemptId, destinationId: target.destination_id,
        sendKey: cp.send_key, leaseEpoch: epoch, payloadHash: cp.payload_hash, payload }
    })
  }
  /** Explicit harness execution. No caller receives Start bytes from any public endpoint. */
  async execute(auth: Authority, storeId: string, jobId: string, copyId: string, owner: string, epoch: string, outcome: Outcome) {
    const started = await this.start(auth, storeId, jobId, copyId, owner, epoch)
    const proof = this.boundary.submit(started, outcome)
    if (proof) await this.reconcile(proof)
    return { attemptId: started.attemptId, proof, resultKnown: !!proof }
  }
  async reconcile(token: string) {
    const p = this.crypto.verify("synthetic-proof-v1", token)
    check(p.synthetic === true && ["ACCEPT", "NO_EFFECT", "UNKNOWN"].includes(String(p.result)) && typeof p.release === "boolean", "INVALID_PROOF", 403)
    return this.db.transaction(async sql => {
      const a = await one(sql, "SELECT * FROM public.print_attempts WHERE id=$1::uuid AND store_id=$2", [p.attemptId, p.storeId])
      await this.lockedDoc(sql, a.store_id, a.document_id)
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid FOR UPDATE", [a.copy_id])
      check(a.job_id === p.jobId && a.copy_id === p.copyId && a.document_id === p.documentId && a.destination_id === p.destinationId &&
        cp.send_key === p.sendKey && cp.payload_hash === p.payloadHash && String(a.lease_epoch) === p.leaseEpoch, "PROOF_SCOPE_MISMATCH", 403)
      if (a.destination_id) await one(sql, "SELECT * FROM public.print_destinations WHERE id=$1::uuid FOR UPDATE", [a.destination_id])
      const existing = await sql.query("SELECT id,evidence_hash,details FROM public.print_events WHERE attempt_id=$1::uuid AND (evidence_key=$2 OR (proof_kind='NONE' AND details->>'evidenceKey'=$2))", [a.id, p.evidenceKey])
      const proofHash = hash("proof-v1", p)
      if (existing.length) { check((existing[0].evidence_hash ?? existing[0].details?.evidenceHash) === proofHash, "PROOF_CONFLICT"); return { replay: true } }
      const proofKind = p.result === "ACCEPT" ? "SYNTHETIC_TRANSPORT_ACCEPTED" : p.result === "NO_EFFECT" ? "SYNTHETIC_NO_EFFECT" : "NONE"
      const chain = { store_id: a.store_id, document_id: a.document_id, job_id: a.job_id, copy_id: a.copy_id, attempt_id: a.id, destination_id: a.destination_id }
      if (proofKind !== "NONE") await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: "SYNTHETIC_RESULT",
        proof_kind: proofKind, evidence_hash: proofHash, evidence_key: p.evidenceKey, actor_kind: "SYNTHETIC_EXECUTOR", details: { synthetic: true } })
      else await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: "RESULT_UNKNOWN", proof_kind: "NONE", actor_kind: "SYSTEM", details: { evidenceKey: p.evidenceKey, evidenceHash: proofHash } })
      const result = p.result === "ACCEPT" ? "TRANSPORT_ACCEPTED" : p.result === "NO_EFFECT" ? "PRE_SEND_FAILED" : "UNKNOWN"
      // Never downgrade a known acceptance, even on a delayed unknown callback.
      if (a.result === "STARTED" || a.result === "UNKNOWN") {
        await sql.exec("UPDATE public.print_attempts SET result=$1,finished_at=clock_timestamp() WHERE id=$2::uuid", [result, a.id])
        await sql.exec("UPDATE public.print_copies SET state=$1 WHERE id=$2::uuid", [result, cp.id])
      } else check(a.result === result || result === "UNKNOWN", "RESULT_CONFLICT")
      if (p.release && a.destination_id) {
        const releaseId = randomUUID()
        await insert(sql, "print_events", { id: releaseId, ...chain, scope_kind: "DOCUMENT", event_type: "SYNTHETIC_EGRESS_CLOSED",
          proof_kind: "SYNTHETIC_EGRESS_CLOSED", evidence_hash: proofHash, evidence_key: String(p.evidenceKey) + ":release", actor_kind: "SYNTHETIC_EXECUTOR" })
        await sql.exec("UPDATE public.print_destinations SET held_attempt_id=NULL,held_store_id=NULL,release_event_id=$1::uuid,gate_epoch=gate_epoch+1 WHERE id=$2::uuid AND held_attempt_id=$3::uuid", [releaseId, a.destination_id, a.id])
      }
      return { replay: false }
    })
  }
  async recover(storeId: string, jobId: string, copyId: string) {
    // Harness service operation; timeout only records UNKNOWN and never releases/retries.
    return this.db.transaction(async sql => {
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      const cp = await one(sql, "SELECT * FROM public.print_copies WHERE id=$1::uuid AND job_id=$2::uuid AND store_id=$3 FOR UPDATE", [copyId, jobId, storeId])
      check(cp.state === "SENDING" && cp.lease_until <= new Date(), "RECOVERY_NOT_DUE")
      const a = await one(sql, "SELECT * FROM public.print_attempts WHERE copy_id=$1::uuid ORDER BY number DESC LIMIT 1", [copyId])
      await sql.exec("UPDATE public.print_attempts SET result='UNKNOWN' WHERE id=$1::uuid", [a.id])
      await sql.exec("UPDATE public.print_copies SET state='UNKNOWN' WHERE id=$1::uuid", [copyId])
      await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId, copy_id: copyId, attempt_id: a.id, destination_id: a.destination_id }, "RECOVERED_UNKNOWN", null)
    })
  }
  async cancel(auth: Authority, storeId: string, jobId: string) {
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      const count = await sql.exec("UPDATE public.print_copies SET state='CANCELLED' WHERE job_id=$1::uuid AND state IN ('REGISTERED','READY','PRE_SEND_FAILED')", [jobId])
      await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId }, "CANCEL_REQUESTED", actor.principalId)
      return { safeCopiesCancelled: count }
    })
  }
  async revokeDelegation(auth: Authority, storeId: string, delegationId: string) {
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      const g = await one(sql, "SELECT * FROM public.print_delegations WHERE id=$1::uuid AND store_id=$2 FOR UPDATE", [delegationId, storeId])
      check(g.principal_id === actor.principalId, "FORBIDDEN", 403)
      if (!g.revoked_at) await sql.exec("UPDATE public.print_delegations SET revoked_at=clock_timestamp(),revocation_reason='FIXTURE_EXPLICIT_REVOCATION' WHERE id=$1::uuid", [delegationId])
      await insert(sql, "print_events", { id: randomUUID(), store_id: storeId, scope_kind: "DELEGATION", delegation_id: delegationId,
        event_type: "DELEGATION_REVOKED", proof_kind: "NONE", actor_kind: "USER", actor_user_id: actor.principalId })
    })
  }
  async purgeExpired(auth: Authority, storeId: string, jobId: string) {
    return this.db.transaction(async sql => {
      await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      check(j.content_expires_at <= new Date(), "CONTENT_NOT_EXPIRED")
      await sql.exec("UPDATE public.print_copies SET payload_cipher=NULL,payload_key_ref=NULL,payload_purged_at=clock_timestamp() WHERE job_id=$1::uuid AND payload_cipher IS NOT NULL", [jobId])
      await sql.exec("UPDATE public.print_jobs SET snapshot_cipher=NULL,snapshot_key_ref=NULL,snapshot_purged_at=clock_timestamp() WHERE id=$1::uuid AND snapshot_cipher IS NOT NULL", [jobId])
      await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId }, "CONTENT_PURGED", null)
    })
  }
  async quoteExistingRisk(auth: Authority, storeId: string, jobId: string) {
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      const d = await this.lockedDoc(sql, storeId, j.document_id)
      check(j.kind === "REPRINT" && j.principal_id === actor.principalId, "FORBIDDEN", 403)
      const exposure = await this.exposure(sql, d.id, j.intent_id)
      return this.crypto.sign("existing-risk-v1", { jobId, storeId, principalId: actor.principalId,
        revision: String(d.risk_revision), exposureHash: exposure.hash, expires: Date.now() + this.policy.riskMs })
    })
  }
  async confirmExistingRisk(auth: Authority, storeId: string, jobId: string, token: string) {
    const proof = this.crypto.verify("existing-risk-v1", token)
    return this.db.transaction(async sql => {
      const actor = await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      const d = await this.lockedDoc(sql, storeId, j.document_id)
      check(j.kind === "REPRINT" && j.principal_id === actor.principalId && proof.principalId === actor.principalId &&
        proof.jobId === jobId && proof.storeId === storeId && Number(proof.expires) > Date.now(), "FORBIDDEN", 403)
      await this.delegation(sql, j)
      check(j.authorization_expires_at > new Date(), "AUTHORIZATION_EXPIRED")
      check(proof.revision === String(d.risk_revision) && proof.exposureHash === (await this.exposure(sql, d.id, j.intent_id)).hash, "STALE_RISK")
      await sql.exec("UPDATE public.print_jobs SET confirmed_risk_revision=$1,confirmed_exposure_hash=$2,risk_confirmed_at=clock_timestamp() WHERE id=$3::uuid", [d.risk_revision, proof.exposureHash, jobId])
      await this.event(sql, { store_id: storeId, document_id: d.id, job_id: jobId }, "EXISTING_RISK_CONFIRMED", actor.principalId)
    })
  }
  async expireSafeCopies(auth: Authority, storeId: string, jobId: string) {
    return this.db.transaction(async sql => {
      await authorize(sql, auth, storeId)
      const j = await one(sql, "SELECT * FROM public.print_jobs WHERE id=$1::uuid AND store_id=$2", [jobId, storeId])
      await this.lockedDoc(sql, storeId, j.document_id)
      check(j.authorization_expires_at <= new Date() || j.content_expires_at <= new Date(), "EXPIRY_NOT_DUE")
      const count = await sql.exec("UPDATE public.print_copies SET state='EXPIRED' WHERE job_id=$1::uuid AND state IN ('REGISTERED','READY','PRE_SEND_FAILED')", [jobId])
      await this.event(sql, { store_id: storeId, document_id: j.document_id, job_id: jobId }, "SAFE_COPIES_EXPIRED", null)
      return count
    })
  }
  async removeExpiredRequests() {
    return this.db.exec("DELETE FROM public.print_requests WHERE expires_at<clock_timestamp()-($1::bigint*interval '1 millisecond')", [this.policy.expiredRequestRetentionMs])
  }
  private async event(sql: Sql, chain: Row, type: string, actor: string | null) {
    await insert(sql, "print_events", { id: randomUUID(), ...chain, scope_kind: "DOCUMENT", event_type: type,
      proof_kind: "NONE", actor_kind: actor ? "USER" : "SYSTEM", actor_user_id: actor })
  }
}
