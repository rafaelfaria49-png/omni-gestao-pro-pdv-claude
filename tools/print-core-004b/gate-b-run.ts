import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { PrintCoreSynthetic, intentProjection, summarize, type FixturePolicy } from "../../lib/print-core-synthetic/core"
import { FixtureCrypto, canonical, byteHash, hash, cleanData } from "../../lib/print-core-synthetic/codec"
import { SyntheticBoundary } from "../../lib/print-core-synthetic/simulator"
import { CoreError, type Database, type Row, type Sql } from "../../lib/print-core-synthetic/db"
import { saleSnapshot } from "../../lib/print-core-synthetic/sale"
import type { Authority } from "../../lib/print-core-synthetic/authority"
// lab.mjs is the explicitly sanitized fixture bootstrap, never an application singleton
import { config, validateConfig, connectionUrl, json, privateRoot } from "./lab.mjs"
// explicit test-only process guard
import { forbidRealTransports } from "./boundary-guard.mjs"

const require = createRequire(import.meta.url)
const { PrismaClient } = require(path.join(privateRoot, "generated/client/index.js"))
const c = validateConfig(config())
const prefix = "core-" + randomUUID().slice(0, 8)
const storeA = "fixture-store-a-004b", storeB = "fixture-store-b-004b"
const a01: Authority = { principalId: "fixture-a01-004b", observedSessionVersion: 0 }
const storeUser: Authority = { principalId: prefix + "-user-a", observedSessionVersion: 0 }
const userB: Authority = { principalId: prefix + "-user-b", observedSessionVersion: 0 }
const tech: Authority = { principalId: prefix + "-tech", observedSessionVersion: 0 }
const noModule: Authority = { principalId: prefix + "-no-module", observedSessionVersion: 0 }
const ownedClients: Array<{ $disconnect(): Promise<void> }> = []
const transactionPids = new Set<number>()
const runtimeSqlJournal: Row[] = []
const transportGuard = forbidRealTransports()
function database(role = "runtime"): Database {
  const u = new URL(connectionUrl(c, role)); u.searchParams.set("connection_limit", "1")
  const client = new PrismaClient({ datasources: { db: { url: u.href } }, log: [], errorFormat: "minimal" })
  ownedClients.push(client)
  const wrap = (p: Row): Sql => ({
    query: (text, values = []) => p.$queryRawUnsafe(text, ...values),
    exec: (text, values = []) => {
      if (role === "runtime") {
        const match = text.match(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:"([^"]+)"|([a-z_]+))/i)
        runtimeSqlJournal.push({ sha256: hash("sql-v1", text), target: match ? match[1] ?? match[2] : null })
      }
      return p.$executeRawUnsafe(text, ...values)
    },
  })
  return { ...wrap(client), transaction: body => client.$transaction(async (tx: Row) => {
    const [{ pid }] = await tx.$queryRawUnsafe("SELECT pg_backend_pid()::int pid")
    transactionPids.add(pid)
    return body(wrap(tx))
  }, { isolationLevel: "ReadCommitted", timeout: 20000, maxWait: 5000 }) }
}
const owner = database("owner"), db1 = database(), db2 = database(), db3 = database()
const crypto = new FixtureCrypto(randomBytes(32), randomBytes(32)), boundary = new SyntheticBoundary(crypto)
const policy: FixturePolicy = { requestMs: 120000, authorizationMs: 240000, contentMs: 300000, leaseMs: 5000,
  riskMs: 60000, maxCopies: 2, maxItems: 100, maxBytes: 65536, maxRequestsPerMinute: 200, expiredRequestRetentionMs: 1 }
const core = new PrintCoreSynthetic(db1, crypto, boundary, policy)
const results: Row[] = []
const fixtures = new Map<string, Row>()
const names = ["positive","parallel","semantic","replay","rollback","executors","fencing","crash","partial","purge","historical","replacement","risk","auth","fingerprint","cancelled","pending","quarantine","grant","revocation","sharedA","sharedB","raceHistory","raceA4","reprintRace","payload","cross","audit","stalePrepare","a4","postT3Revoke","lateAccept","versionConflict","requestPurge","physicalSafe","missingCopies","preCallCrash","staleRisk","inactive","badPayment","badDiscount","legacy","afterSnapshot","cancelAfterPrepare","revokeRace","auditAfter","normalization","correctRace","maxItems"]
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
function barrier(n = 2) {
  let count = 0, release!: () => void
  const promise = new Promise<void>(r => { release = r })
  return async () => { if (++count === n) release(); await Promise.race([promise, delay(10000).then(() => { throw new Error("CONTROLLED_BARRIER_TIMEOUT") })]) }
}
async function test(id: string, body: () => Promise<unknown>) {
  const started = Date.now()
  try { const detail = await body(); results.push({ id, status: "PASS", milliseconds: Date.now() - started, detail: detail ?? null }); console.log(id + " PASS") }
  catch (e) {
    const err = e as Row
    const detail = err instanceof CoreError ? err.code : err.code === "P2010" ? "PG:" + err.meta?.code + ":" + err.meta?.message : err.message
    results.push({ id, status: "FAIL", milliseconds: Date.now() - started, detail: String(detail).replace(/postgres(?:ql)?:\/\/\S+/g, "[REDACTED_DSN]").slice(0, 1000) })
    console.log(id + " FAIL " + results.at(-1)?.detail)
  }
  json("gate-b-progress-" + prefix + ".json", { run: prefix, results })
}
async function rejects(body: () => Promise<unknown>, code: string) {
  let seen = false
  try { await body() } catch (e) { assert.equal((e as Row).code, code); seen = true }
  assert.equal(seen, true, "Expected " + code)
}
async function sqlReject(body: () => Promise<unknown>, sqlstate: string, message?: string) {
  let seen = false
  try { await body() } catch (e) {
    if ((e as Row).meta?.code !== sqlstate) { json("unexpected-sql-error-" + prefix + ".json", { code: (e as Row).code, meta: (e as Row).meta, message: (e as Error).message }); }
    assert.equal((e as Row).meta?.code, sqlstate)
    if (message) assert.match(String((e as Row).meta?.message), new RegExp(message))
    seen = true
  }
  assert.equal(seen, true, "Expected SQLSTATE " + sqlstate)
}
async function rows(text: string, values: unknown[] = []) { return owner.query(text, values) }
const f = (name: string) => { const v = fixtures.get(name); assert.ok(v); return v }
const command = (name: string, extra: Row = {}) => ({ storeId: f(name).store, saleId: f(name).sale,
  kind: "INITIAL", terminalId: f(name).terminal, bindingVersionId: f(name).binding, ...extra })
async function made(name: string, extra: Row = {}, actor = a01, instance = core) {
  const p = await instance.prepare(actor, command(name, extra)), j = await instance.create(actor, p.key, p.command)
  const copies = await rows("SELECT * FROM public.print_copies WHERE job_id=$1::uuid ORDER BY ordinal", [j.jobId])
  return { p, j, copies }
}
async function lease(job: Awaited<ReturnType<typeof made>>, ordinal = 1, actor = a01, instance = core) {
  const cp = job.copies[ordinal - 1], l = await instance.ready(actor, job.p.command.storeId, job.j.jobId, cp.id, prefix + "-executor")
  return { cp, l }
}
async function reprint(name: string, actor = a01, extra: Row = {}, instance = core) {
  const quote = await instance.quoteReprint(actor, f(name).store, f(name).sale)
  return instance.prepare(actor, command(name, { kind: "REPRINT", reasonCode: "UNCERTAIN_RESULT", consent: quote.consent, ...extra }))
}
async function fixtureSeed() {
  const moduleLessStore = prefix + "-empty-store"
  await owner.exec('INSERT INTO public.stores(id,name,"moduleAccess","updatedAt") VALUES($1,$2,$3::jsonb,clock_timestamp())', [moduleLessStore, "Synthetic no modules", JSON.stringify({ version: 1, modules: [] })])
  for (const [id, role] of [[storeUser!.principalId, "CAIXA"], [userB!.principalId, "VENDEDOR"], [tech!.principalId, "TECNICO"], [noModule!.principalId, "CAIXA"]]) {
    await owner.exec('INSERT INTO public.admin_users(id,name,email,password,role,"accessScope","updatedAt") VALUES($1,$1,$2,$3,$4::"UserRole",$5,clock_timestamp())', [id, id + "@example.invalid", "synthetic-no-login", role, "STORE"])
    await owner.exec('INSERT INTO public.admin_user_stores(id,"adminUserId","storeId") VALUES($1,$2,$3)', [randomUUID(), id, id === userB!.principalId ? storeB : id === noModule!.principalId ? moduleLessStore : storeA])
  }
  for (const name of names) {
    const store = name === "sharedB" ? storeB : storeA
    const v: Row = { sale: prefix + "-sale-" + name, store, terminal: prefix + "-terminal-" + name, altTerminal: prefix + "-alt-" + name,
      installation: randomUUID(), destination: name === "sharedB" ? f("sharedA").destination : randomUUID(), binding: randomUUID(), altBinding: randomUUID(), altDestination: randomUUID() }
    for (const terminal of [v.terminal, v.altTerminal]) await owner.exec('INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES($1,$2,$3,$3,clock_timestamp())', [terminal, store, terminal])
    await owner.exec('INSERT INTO public.vendas(id,"storeId","pedidoId",total,status,payload,"clienteNome",operador) VALUES($1,$2,$3,10,$4,$5::jsonb,$6,$7)', [v.sale, store, prefix.toUpperCase() + "-" + name, name === "pending" ? "pendente" : name === "cancelled" ? "cancelada" : "concluida", JSON.stringify({ paymentBreakdown: { dinheiro: 8, pix: 2 }, discountTotal: 1, cashTendered: 10, customerCpf: "SYNTHETIC_PRIVATE_FIELD", ...(name === "quarantine" ? { quarantine: { synthetic: true } } : {}) }), "Synthetic customer", "Fixture operator"])
    await owner.exec('INSERT INTO public.venda_itens(id,"vendaId",nome,quantidade,"precoUnitario","lineTotal") VALUES($1,$2,$3,2,5,10)', [v.sale + "-item", v.sale, "Synthetic café <img src=x onerror=alert(1)> \u001b\u001d"])
    if (name === "maxItems") await owner.exec('INSERT INTO public.venda_itens(id,"vendaId",nome,quantidade,"precoUnitario","lineTotal") VALUES($1,$2,$3,1,1,1)', [v.sale+"-extra",v.sale,"Extra synthetic item"])
    await owner.exec("INSERT INTO public.print_installations(id,identity_hash,proof_mode) VALUES($1::uuid,$2,'SYNTHETIC')", [v.installation, hash("fixture-installation", v.installation)])
    if (name !== "sharedB") await owner.exec("INSERT INTO public.print_destinations(id,identity_hash,serialization_mode) VALUES($1::uuid,$2,'SYNTHETIC')", [v.destination, hash("fixture-destination", v.destination)])
    await owner.exec("INSERT INTO public.print_destinations(id,identity_hash,serialization_mode) VALUES($1::uuid,$2,'SYNTHETIC')", [v.altDestination, hash("fixture-destination", v.altDestination)])
    for (const [binding, terminal, destination] of [[v.binding, v.terminal, v.destination], [v.altBinding, v.altTerminal, v.altDestination]]) {
      await owner.exec(`INSERT INTO public.print_bindings(id,store_id,binding_id,version,terminal_id,installation_id,destination_id,transport_destination_ref,profile_id,profile_version,profile_hash,profile,state,family,configured_by_id)
        VALUES($1::uuid,$2,$3::uuid,1,$4,$5::uuid,$6::uuid,$7,'SYNTHETIC_80',1,$8,$9::jsonb,'ACTIVE','SALE_RECEIPT',$10)`,
        [binding, store, randomUUID(), terminal, v.installation, destination, "synthetic-queue-ref", hash("profile", { width: 80, synthetic: true }), JSON.stringify({ width: 80, synthetic: true }), a01!.principalId])
    }
    if (name === "positive") {
      v.testBinding = randomUUID()
      await owner.exec(`INSERT INTO public.print_bindings(id,store_id,binding_id,version,terminal_id,installation_id,destination_id,transport_destination_ref,profile_id,profile_version,profile_hash,profile,state,family,configured_by_id)
        SELECT $1::uuid,store_id,$2::uuid,1,terminal_id,installation_id,destination_id,transport_destination_ref,profile_id,profile_version,profile_hash,profile,state,'SYNTHETIC_TEST',configured_by_id FROM public.print_bindings WHERE id=$3::uuid`, [v.testBinding, randomUUID(), v.binding])
    }
    fixtures.set(name, v)
  }
  for (const [name, lojaId] of [["legacy", storeA], ["unbound", null]]) await owner.exec('INSERT INTO public.admin_users(id,name,email,password,role,"accessScope","lojaId","updatedAt") VALUES($1,$1,$2,$3,$4::"UserRole",$5,$6,clock_timestamp())', [prefix+"-"+name, prefix+"-"+name+"@example.invalid", "synthetic-no-login", "CAIXA", "STORE", lojaId])
  return { moduleLessStore }
}
async function commerceSnapshot() {
  const tables = await rows("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'print_%' AND tablename NOT IN ('admin_users') ORDER BY tablename")
  const snapshot: Row[] = []
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-zA-Z_0-9]+$/)
    const [{ digest, identities }] = await rows('SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY to_jsonb(t)::text),\'\')) digest,COALESCE(jsonb_agg(md5(to_jsonb(t)::text) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) identities FROM public."' + tablename + '" t')
    snapshot.push({ table: tablename, digest, rowIdentities: identities })
  }
  return snapshot
}
async function main() {
  try {
    const [{ db, user, host, port }] = await db1.query("SELECT current_database() db,current_user::text \"user\",host(inet_server_addr()) host,inet_server_port() port")
    assert.equal(db, c.db); assert.equal(user, c.runtime); assert.equal(host, "127.0.0.1"); assert.equal(port, c.port)
    const { moduleLessStore } = await fixtureSeed()
    json("fixture-seed-" + prefix + ".json", { run: prefix, commercialWriter: "OWNER_FIXTURE_ONLY", fixtures: Object.fromEntries(fixtures) })
    const before = await commerceSnapshot(); json("commercial-before-" + prefix + ".json", before)
    const mutationJournal: Row[] = []
    await test("CORE-AUTHORITY", async () => {
      await rejects(() => core.prepare(null, command("auth")), "UNAUTHENTICATED")
      await rejects(() => core.prepare(tech, command("auth")), "FORBIDDEN")
      await rejects(() => core.prepare(userB, command("auth")), "FORBIDDEN")
      await rejects(() => core.prepare({ ...a01!, observedSessionVersion: 1 }, command("auth")), "SESSION_REVOKED")
      await rejects(() => core.prepare(noModule, { ...command("auth"), storeId: moduleLessStore }), "FORBIDDEN")
      await rejects(() => core.prepare(a01, { ...command("auth"), storeId: "" }), "INVALID_TEXT")
      const permitted = await core.prepare(storeUser, command("auth"))
      assert.equal(permitted.command.storeId, storeA)
      return { pureCanonicalGuardsUsed: true, actualSessionEndpoint: false }
    })
    await test("CORE-INPUT", async () => {
      for (const field of ["bytes","html","host","port","url","path","token","principalId","role","deviceId","proofKind","executionMode"]) await rejects(() => core.prepare(a01, { ...command("auth"), [field]: "forged" }), "UNKNOWN_FIELD")
      await rejects(() => core.prepare(a01, command("auth", { copies: 3 })), "COMMAND_LIMIT")
      await rejects(() => new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, maxItems: 1 }).prepare(a01, command("maxItems")), "ITEM_LIMIT")
      const small = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, maxBytes: 1 })
      const p = await small.prepare(a01, command("payload"))
      await rejects(() => small.create(a01, p.key, p.command), "COMMAND_LIMIT")
      const limited = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, maxRequestsPerMinute: 1 })
      await rejects(() => limited.prepare(storeUser, command("auth")), "RATE_LIMIT")
    })
    await test("CORE-POSITIVE", async () => {
      const job = await made("positive", { copies: 2 }, storeUser)
      const [j] = await rows("SELECT * FROM public.print_jobs WHERE id=$1::uuid", [job.j.jobId])
      const clear = crypto.open(j.snapshot_cipher, "snapshot:" + storeA + ":" + j.id + ":" + j.snapshot_hash)
      assert.equal(byteHash(clear), j.snapshot_hash)
      assert.ok(!clear.includes("SYNTHETIC_PRIVATE_FIELD")); assert.ok(!clear.includes(Buffer.from([27])))
      assert.ok(clear.includes("\\uFFFD") || clear.includes("�"))
      assert.equal(JSON.parse(clear.toString()).drawer, false)
      assert.notEqual(job.copies[0].payload_hash, job.copies[1].payload_hash)
      for (let ordinal = 1; ordinal <= 2; ordinal++) {
        const { cp, l } = await lease(job, ordinal, storeUser)
        await core.execute(storeUser, storeA, job.j.jobId, cp.id, l.owner, l.epoch, "ACCEPT")
      }
      const dto = await core.get(storeUser, storeA, job.j.jobId)
      assert.equal(dto.state, "TRANSPORT_ACCEPTED"); assert.equal(dto.physicalPrintConfirmed, false)
      assert.ok(!JSON.stringify(dto).includes("cipher")); assert.ok(!JSON.stringify(dto).includes("password"))
      return { jobId: job.j.jobId, copies: 2, resultLevel: dto.state }
    })
    await test("CORE-CONCURRENT-INITIAL", async () => {
      const p1 = await core.prepare(a01, command("parallel")), p2 = await core.prepare(storeUser, command("parallel"))
      const meet = barrier()
      const x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet })
      const y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.all([x.create(a01, p1.key, p1.command), y.create(storeUser, p2.key, p2.command)])
      assert.equal(out[0].jobId, out[1].jobId)
      const [count] = await rows("SELECT count(*)::int n FROM public.print_jobs WHERE document_id=$1::uuid AND kind='INITIAL'", [out[0].documentId])
      assert.equal(count.n, 1)
      const [author] = await rows("SELECT principal_id FROM public.print_jobs WHERE id=$1::uuid", [out[0].jobId])
      assert.ok([a01!.principalId, storeUser!.principalId].includes(author.principal_id))
      return { jobId: out[0].jobId, independentRuntimeClients: 2, controlledBarrier: true, authorPreserved: true }
    })
    await test("CORE-SEMANTIC-CONFLICT", async () => {
      const p1 = await core.prepare(a01, command("semantic")), v = f("semantic")
      const p2 = await core.prepare(a01, command("semantic", { terminalId: v.altTerminal, bindingVersionId: v.altBinding }))
      const meet = barrier(), x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet }),
        y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.allSettled([x.create(a01, p1.key, p1.command), y.create(a01, p2.key, p2.command)])
      assert.equal(out.filter(r => r.status === "fulfilled").length, 1)
      assert.equal((out.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code, "INITIAL_SEMANTIC_CONFLICT")
    })
    await test("CORE-REPLAY-LOST-RESPONSE", async () => {
      const job = await made("replay")
      const restart = new PrintCoreSynthetic(db3, crypto, boundary, policy)
      const replay = await restart.create(a01, job.p.key, job.p.command)
      assert.equal(replay.jobId, job.j.jobId); assert.equal(replay.replay, true)
      await rejects(() => core.create(a01, job.p.key, { ...job.p.command, copies: 2 }), "REQUEST_CONFLICT")
      await rejects(() => core.create(storeUser, job.p.key, job.p.command), "REQUEST_EXPIRED")
      await rejects(() => core.get(userB, storeA, job.j.jobId), "FORBIDDEN")
      await rejects(() => core.get(a01, storeB, job.j.jobId), "NOT_FOUND")
      await rejects(() => core.create(a01, randomUUID(), job.p.command), "REQUEST_EXPIRED")
      assert.equal(boundary.calls.filter(x => x.sendKey === job.copies[0].send_key).length, 0)
      return { persistedReceiptAfterNewClient: true, sendCalls: 0 }
    })
    await test("CORE-ATOMIC-T1", async () => {
      const p = await core.prepare(a01, command("rollback"))
      const failing: Database = { ...db1, transaction: body => db1.transaction(sql => body({
        query: sql.query, exec: (s, v) => { if (s.includes('INSERT INTO public."print_events"') && v?.includes("JOB_REGISTERED")) throw new CoreError("INJECTED_AUDIT_FAILURE", 500); return sql.exec(s, v) },
      })) }
      await rejects(() => new PrintCoreSynthetic(failing, crypto, boundary, policy).create(a01, p.key, p.command), "INJECTED_AUDIT_FAILURE")
      const [state] = await rows("SELECT d.initial_state,(SELECT count(*)::int FROM public.print_jobs WHERE document_id=d.id) n FROM public.print_documents d WHERE id=$1::uuid", [p.command.documentId])
      assert.equal(state.n, 0); assert.equal(state.initial_state, "OPEN")
      const j = await core.create(a01, p.key, p.command)
      assert.equal(j.state, "REGISTERED")
      const [cp] = await rows("SELECT id FROM public.print_copies WHERE job_id=$1::uuid", [j.jobId])
      const l = await core.ready(a01, storeA, j.jobId, cp.id, "restarted-executor")
      assert.equal(l.epoch, "1")
    })
    await test("CORE-TWO-EXECUTORS", async () => {
      const job = await made("executors")
      const meet = barrier(), x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet }),
        y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.allSettled([x.ready(a01, storeA, job.j.jobId, job.copies[0].id, "executor-X"), y.ready(a01, storeA, job.j.jobId, job.copies[0].id, "executor-Y")])
      assert.equal(out.filter(r => r.status === "fulfilled").length, 1)
      assert.equal((out.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code, "LEASE_HELD")
    })
    await test("CORE-LEASE-FENCING", async () => {
      const job = await made("fencing"), short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, leaseMs: 40 })
      const l1 = await short.ready(a01, storeA, job.j.jobId, job.copies[0].id, "old-executor")
      await delay(65)
      const l2 = await core.ready(a01, storeA, job.j.jobId, job.copies[0].id, "new-executor")
      assert.ok(BigInt(l2.epoch) > BigInt(l1.epoch))
      await rejects(() => core.start(a01, storeA, job.j.jobId, job.copies[0].id, "old-executor", l1.epoch), "LEASE_OR_COPY_INVALID")
      await core.execute(a01, storeA, job.j.jobId, job.copies[0].id, l2.owner, l2.epoch, "ACCEPT")
    })
    await test("CORE-CRASH-UNKNOWN", async () => {
      const job = await made("crash"), short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, leaseMs: 1500 })
      const l = await short.ready(a01, storeA, job.j.jobId, job.copies[0].id, "crash-executor")
      const result = await short.execute(a01, storeA, job.j.jobId, job.copies[0].id, l.owner, l.epoch, "CRASH_AFTER_ACCEPT")
      assert.equal(result.resultKnown, false)
      await delay(Math.max(0, l.until.getTime() - Date.now() + 30))
      const restart = new PrintCoreSynthetic(db3, crypto, boundary, policy)
      await restart.recover(storeA, job.j.jobId, job.copies[0].id)
      assert.equal((await restart.get(a01, storeA, job.j.jobId)).state, "UNKNOWN")
      await rejects(() => restart.ready(a01, storeA, job.j.jobId, job.copies[0].id, "retry"), "COPY_NOT_RETRYABLE")
      assert.equal(boundary.calls.filter(x => x.attemptId === result.attemptId).length, 1)
      const proof = boundary.proof(result.attemptId, "ACCEPT")
      await restart.reconcile(proof); const replay = await restart.reconcile(proof)
      assert.equal(replay.replay, true)
      await restart.reconcile(boundary.proof(result.attemptId, "UNKNOWN", false))
      assert.equal((await restart.get(a01, storeA, job.j.jobId)).state, "TRANSPORT_ACCEPTED")
      return { attemptId: result.attemptId, sendCalls: 1, lateAcceptanceNeverDowngraded: true }
    })
    await test("CORE-PARTIAL-COPIES", async () => {
      const job = await made("partial", { copies: 2 })
      const first = await lease(job, 1)
      await core.execute(a01, storeA, job.j.jobId, first.cp.id, first.l.owner, first.l.epoch, "ACCEPT")
      const second = await lease(job, 2)
      await core.execute(a01, storeA, job.j.jobId, second.cp.id, second.l.owner, second.l.epoch, "NO_EFFECT")
      assert.equal((await core.get(a01, storeA, job.j.jobId)).state, "PARTIAL")
      await rejects(() => core.ready(a01, storeA, job.j.jobId, first.cp.id, "repeat-all"), "COPY_NOT_RETRYABLE")
      // Lease ownership, even after a no-effect result, is fenced until explicitly expired.
      await delay(Math.max(0, second.l.until.getTime() - Date.now() + 30))
      const retry = await core.ready(a01, storeA, job.j.jobId, second.cp.id, "manual-single-copy")
      await core.execute(a01, storeA, job.j.jobId, second.cp.id, retry.owner, retry.epoch, "ACCEPT")
      assert.equal(boundary.calls.filter(x => x.sendKey === first.cp.send_key).length, 1)
      assert.equal(boundary.calls.filter(x => x.sendKey === second.cp.send_key).length, 2)
    })
    await test("CORE-HISTORICAL-CLOSURE", async () => {
      const p = await reprint("historical")
      const j = await core.create(a01, p.key, p.command)
      assert.equal(j.kind, "REPRINT")
      const [d] = await rows("SELECT * FROM public.print_documents WHERE id=$1::uuid", [j.documentId])
      assert.equal(d.initial_state, "HISTORICAL_CLOSED"); assert.equal(d.initial_intent_id, null)
      await rejects(() => core.prepare(a01, command("historical")), "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
      const [saved] = await rows("SELECT previous_job_id FROM public.print_jobs WHERE id=$1::uuid", [j.jobId])
      assert.equal(saved.previous_job_id, null)
    })
    await test("CORE-HISTORICAL-INITIAL-RACE", async () => {
      const initial = await core.prepare(a01, command("raceHistory")), additional = await reprint("raceHistory")
      const meet = barrier(), x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet }),
        y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.allSettled([x.create(a01, initial.key, initial.command), y.create(a01, additional.key, additional.command)])
      assert.equal(out.filter(r => r.status === "fulfilled").length, 1)
      const reason = (out.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code
      assert.ok(["STALE_RISK", "INITIAL_CLOSED_BY_HISTORICAL_REPRINT"].includes(reason))
      const [n] = await rows("SELECT count(*)::int n FROM public.print_jobs WHERE document_id=$1::uuid", [initial.command.documentId])
      assert.equal(n.n, 1)
    })
    await test("CORE-A4-THERMAL-SLOT", async () => {
      const p1 = await core.prepare(a01, command("raceA4"))
      const p2 = await core.prepare(a01, command("raceA4", { deliveryMode: "BROWSER_A4", bindingVersionId: null, browserContextId: prefix + "-logical-browser" }))
      const meet = barrier(), x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet }),
        y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.allSettled([x.create(a01, p1.key, p1.command), y.create(a01, p2.key, p2.command)])
      assert.equal(out.filter(r => r.status === "fulfilled").length, 1)
      assert.equal((out.find(r => r.status === "rejected") as PromiseRejectedResult).reason.code, "INITIAL_SEMANTIC_CONFLICT")
      return { browserOpened: false, logicalSlotOnly: true }
    })
    await test("CORE-REPRINT-COALESCENCE", async () => {
      const quote1 = await core.quoteReprint(a01, storeA, f("reprintRace").sale), quote2 = await core.quoteReprint(storeUser, storeA, f("reprintRace").sale)
      assert.equal(quote1.intentId, quote2.intentId)
      const p1 = await core.prepare(a01, command("reprintRace", { kind: "REPRINT", reasonCode: "CUSTOMER_REQUEST", consent: quote1.consent }))
      const p2 = await core.prepare(storeUser, command("reprintRace", { kind: "REPRINT", reasonCode: "CUSTOMER_REQUEST", consent: quote2.consent }))
      const meet = barrier(), x = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeDocumentLock: meet }),
        y = new PrintCoreSynthetic(db2, crypto, boundary, policy, { beforeDocumentLock: meet })
      const out = await Promise.all([x.create(a01, p1.key, p1.command), y.create(storeUser, p2.key, p2.command)])
      assert.equal(out[0].jobId, out[1].jobId)
    })
    await test("CORE-REPLACEMENT-LATE-NO-EFFECT", async () => {
      const old = await made("replacement"), l = await lease(old)
      const started = await core.execute(a01, storeA, old.j.jobId, l.cp.id, l.l.owner, l.l.epoch, "UNKNOWN")
      const p = await reprint("replacement")
      assert.equal(p.command.previousJobId, null)
      const replacement = await core.create(a01, p.key, p.command)
      const [cp] = await rows("SELECT * FROM public.print_copies WHERE id=$1::uuid", [l.cp.id])
      assert.equal(cp.retry_suppressed_by_job_id, replacement.jobId)
      await core.reconcile(boundary.proof(started.attemptId, "NO_EFFECT"))
      await rejects(() => core.ready(a01, storeA, old.j.jobId, l.cp.id, "late-retry"), "COPY_NOT_RETRYABLE")
      const [newCopy] = await rows("SELECT id FROM public.print_copies WHERE job_id=$1::uuid", [replacement.jobId])
      const newLease = await core.ready(a01, storeA, replacement.jobId, newCopy.id, "replacement")
      // The old UNKNOWN -> PRE_SEND_FAILED change is external to the replacement intent.
      await rejects(() => core.start(a01, storeA, replacement.jobId, newCopy.id, newLease.owner, newLease.epoch), "STALE_RISK")
      const confirmation = await core.quoteExistingRisk(a01, storeA, replacement.jobId)
      await core.confirmExistingRisk(a01, storeA, replacement.jobId, confirmation)
      await core.execute(a01, storeA, replacement.jobId, newCopy.id, newLease.owner, newLease.epoch, "ACCEPT")
      return { suppressionSurvivesProof: true, externalExposureRequiresNewAcknowledgement: true, explicitReconfirmationAllowsProgress: true }
    })
    await test("CORE-RISK-NOT-SELF-INVALIDATING", async () => {
      const original = await made("risk"), l0 = await lease(original)
      await core.execute(a01, storeA, original.j.jobId, l0.cp.id, l0.l.owner, l0.l.epoch, "ACCEPT")
      const p = await reprint("risk", a01, { copies: 2, previousJobId: original.j.jobId })
      const j = await core.create(a01, p.key, p.command)
      const cp = await rows("SELECT * FROM public.print_copies WHERE job_id=$1::uuid ORDER BY ordinal", [j.jobId])
      for (const copy of cp) {
        const l = await core.ready(a01, storeA, j.jobId, copy.id, "risk-progress")
        await core.execute(a01, storeA, j.jobId, copy.id, l.owner, l.epoch, "ACCEPT")
      }
      assert.equal((await core.get(a01, storeA, j.jobId)).state, "TRANSPORT_ACCEPTED")
      const q = await reprint("stalePrepare")
      await core.cancel(a01, storeA, j.jobId)
      // Separate document change cannot invalidate an unrelated prepared request.
      await core.create(a01, q.key, q.command)
    })
    await test("CORE-SHARED-DESTINATION", async () => {
      const a = await made("sharedA"), b = await made("sharedB", {}, userB)
      const short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, leaseMs: 1500 })
      const la = await short.ready(a01, storeA, a.j.jobId, a.copies[0].id, "paused-A")
      const startA = await short.start(a01, storeA, a.j.jobId, a.copies[0].id, la.owner, la.epoch)
      await delay(Math.max(0, la.until.getTime() - Date.now() + 30))
      const lb = await core.ready(userB, storeB, b.j.jobId, b.copies[0].id, "B")
      await rejects(() => core.start(userB, storeB, b.j.jobId, b.copies[0].id, lb.owner, lb.epoch), "DESTINATION_BLOCKED")
      await core.recover(storeA, a.j.jobId, a.copies[0].id)
      await rejects(() => core.start(userB, storeB, b.j.jobId, b.copies[0].id, lb.owner, lb.epoch), "DESTINATION_BLOCKED")
      // Paused A may resume after its T3; B was never allowed to interleave.
      const proof = boundary.submit(startA, "ACCEPT"); assert.ok(proof); await core.reconcile(proof)
      await core.execute(userB, storeB, b.j.jobId, b.copies[0].id, lb.owner, lb.epoch, "ACCEPT")
      return { sharedDestination: f("sharedA").destination, differentStores: true, leaseNeverFreedGate: true }
    })
    await test("CORE-REVOCATION", async () => {
      const beforeJob = await made("revocation")
      const [j] = await rows("SELECT delegation_id FROM public.print_jobs WHERE id=$1::uuid", [beforeJob.j.jobId])
      const l = await lease(beforeJob)
      await core.revokeDelegation(a01, storeA, j.delegation_id)
      await rejects(() => core.start(a01, storeA, beforeJob.j.jobId, l.cp.id, l.l.owner, l.l.epoch), "DELEGATION_REVOKED")
      const afterJob = await made("postT3Revoke"), l2 = await lease(afterJob)
      const started = await core.start(a01, storeA, afterJob.j.jobId, l2.cp.id, l2.l.owner, l2.l.epoch)
      const [j2] = await rows("SELECT delegation_id FROM public.print_jobs WHERE id=$1::uuid", [afterJob.j.jobId])
      await core.revokeDelegation(a01, storeA, j2.delegation_id)
      const proof = boundary.submit(started, "ACCEPT"); assert.ok(proof)
      await core.reconcile(proof)
      assert.equal((await core.get(a01, storeA, afterJob.j.jobId)).state, "TRANSPORT_ACCEPTED")
      return { actualLogoutChangedOrCertified: false, syntheticDelegationOnly: true }
    })
    await test("CORE-CROSS-SCOPE", async () => {
      const j = await made("cross")
      await rejects(() => core.prepare(a01, command("cross", { bindingVersionId: f("sharedB").binding })), "NOT_FOUND")
      const quote = await core.quoteReprint(a01, storeA, f("cross").sale)
      await rejects(async () => core.prepare(a01, command("cross", { kind: "REPRINT", reasonCode: "LOST", consent: quote.consent, previousJobId: (await rows("SELECT id FROM public.print_jobs WHERE store_id=$1 LIMIT 1", [storeB]))[0].id })), "NOT_FOUND")
      const other = await made("physicalSafe")
      await rejects(() => core.ready(a01, storeA, j.j.jobId, other.copies[0].id, "cross"), "NOT_FOUND")
      const p = await reprint("cross")
      const lOther = await core.ready(a01, storeA, other.j.jobId, other.copies[0].id, "FK-probe")
      await sqlReject(() => db1.exec("INSERT INTO public.print_attempts(id,store_id,document_id,job_id,copy_id,number,lease_epoch,destination_id,result) VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5::uuid,1,$6,$7::uuid,'STARTED')",
        [randomUUID(), storeA, j.j.documentId, j.j.jobId, other.copies[0].id, BigInt(lOther.epoch), f("cross").destination]), "23503")
      const known = boundary.calls.find(x => x.outcome === "ACCEPT"); assert.ok(known)
      const body = crypto.verify("synthetic-proof-v1", boundary.proof(known.attemptId, "ACCEPT"))
      body.jobId = j.j.jobId
      await rejects(() => core.reconcile(crypto.sign("synthetic-proof-v1", body)), "PROOF_SCOPE_MISMATCH")

      const fake = quote.consent.slice(0, -1) + (quote.consent.endsWith("x") ? "y" : "x")
      await rejects(async () => core.prepare(a01, command("cross", { kind: "REPRINT", reasonCode: "LOST", consent: fake })), "INVALID_PROOF")
      assert.ok(p.key)
    })
    await test("CORE-DEFERRED-COMMIT-AND-IMMUTABILITY", async () => {
      const job = await made("audit")
      await sqlReject(() => db1.exec("UPDATE public.print_jobs SET snapshot_hash=$1 WHERE id=$2::uuid", ["a".repeat(64), job.j.jobId]), "P0001", "immutable")
      await sqlReject(() => db1.exec("UPDATE public.print_copies SET payload_hash=$1 WHERE id=$2::uuid", ["b".repeat(64), job.copies[0].id]), "P0001", "immutable")
      await sqlReject(() => db1.exec("UPDATE public.print_copies SET state='UNKNOWN' WHERE id=$1::uuid", [job.copies[0].id]), "P0001", "illegal copy transition")
      await sqlReject(() => db1.transaction(async sql => {
        await sql.exec("UPDATE public.print_jobs SET snapshot_cipher=NULL,snapshot_key_ref=NULL,snapshot_purged_at=clock_timestamp() WHERE id=$1::uuid", [job.j.jobId])
        // FK is immediate and store/document typed.
        await sql.exec("UPDATE public.print_copies SET retry_suppressed_by_job_id=$1::uuid WHERE id=$2::uuid", [(await rows("SELECT id FROM public.print_jobs WHERE store_id=$1 LIMIT 1", [storeB]))[0].id, job.copies[0].id])
      }), "23503")
      const [unchanged] = await rows("SELECT snapshot_cipher IS NOT NULL present FROM public.print_jobs WHERE id=$1::uuid", [job.j.jobId]); assert.equal(unchanged.present, true)
      const l = await lease(job)
      const failStart = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeT3Commit: async () => { throw new CoreError("INJECTED_T3_ROLLBACK") } })
      await rejects(() => failStart.execute(a01, storeA, job.j.jobId, l.cp.id, l.l.owner, l.l.epoch, "ACCEPT"), "INJECTED_T3_ROLLBACK")
      const [attempts] = await rows("SELECT count(*)::int n FROM public.print_attempts WHERE job_id=$1::uuid", [job.j.jobId]); assert.equal(attempts.n, 0)
      assert.equal(boundary.calls.filter(x => x.sendKey === l.cp.send_key).length, 0)
    })
    await test("CORE-SYNTHETIC-TEST", async () => {
      const v = f("positive")
      const p = await core.prepare(a01, { storeId: storeA, kind: "TEST", terminalId: v.terminal, bindingVersionId: v.testBinding })
      const j = await core.create(a01, p.key, p.command)
      const [cp] = await rows("SELECT * FROM public.print_copies WHERE job_id=$1::uuid", [j.jobId])
      const l = await core.ready(a01, storeA, j.jobId, cp.id, "synthetic-only-executor")
      await core.execute(a01, storeA, j.jobId, cp.id, l.owner, l.epoch, "ACCEPT")
      const [d] = await rows("SELECT document_kind,sale_id FROM public.print_documents WHERE id=$1::uuid", [j.documentId])
      assert.equal(d.document_kind, "SYNTHETIC"); assert.equal(d.sale_id, null)
      assert.equal(j.kind, "TEST")
    })
    await test("CORE-MISSING-COPY-COMMIT", async () => {
      const p = await core.prepare(a01, command("missingCopies", { copies: 2 }))
      let seen = 0
      const incomplete: Database = { ...db1, transaction: body => db1.transaction(sql => body({ query: sql.query, exec: (s, v) => {
        if (s.startsWith('INSERT INTO public."print_copies"') && ++seen === 2) return Promise.resolve(1)
        return sql.exec(s, v)
      } })) }
      let commitDenied = false
      try { await new PrintCoreSynthetic(incomplete, crypto, boundary, policy).create(a01, p.key, p.command) }
      catch (e) { assert.equal((e as Error).message, "Error in connector: Error querying the database: ERROR: p004 complete copy set required"); commitDenied = true }
      assert.equal(commitDenied, true)
      seen = 0
      const immediate: Database = { ...db1, transaction: body => db1.transaction(async sql => {
        const value = await body({ query: sql.query, exec: (s, v) => {
          if (s.startsWith('INSERT INTO public."print_copies"') && ++seen === 2) return Promise.resolve(1)
          return sql.exec(s, v)
        } })
        await sql.exec("SET CONSTRAINTS ALL IMMEDIATE")
        return value
      }) }
      await sqlReject(() => new PrintCoreSynthetic(immediate, crypto, boundary, policy).create(a01, p.key, p.command), "P0001", "complete copy set required")
      const [n] = await rows("SELECT count(*)::int n FROM public.print_jobs WHERE document_id=$1::uuid", [p.command.documentId])
      const [r] = await rows("SELECT job_id FROM public.print_requests WHERE id=$1::uuid", [p.key])
      assert.equal(n.n, 0); assert.equal(r.job_id, null)
    })
    await test("CORE-CRASH-BEFORE-CALL", async () => {
      const job = await made("preCallCrash")
      const short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, leaseMs: 1500 })
      const l = await short.ready(a01, storeA, job.j.jobId, job.copies[0].id, "before-call")
      const started = await short.start(a01, storeA, job.j.jobId, job.copies[0].id, l.owner, l.epoch)
      await delay(Math.max(0, l.until.getTime() - Date.now() + 30))
      const restart = new PrintCoreSynthetic(db3, crypto, boundary, policy)
      await restart.recover(storeA, job.j.jobId, job.copies[0].id)
      await rejects(() => restart.ready(a01, storeA, job.j.jobId, job.copies[0].id, "blind-retry"), "COPY_NOT_RETRYABLE")
      assert.equal(boundary.calls.filter(x => x.attemptId === started.attemptId).length, 0)
      const [destination] = await rows("SELECT held_attempt_id FROM public.print_destinations WHERE id=$1::uuid", [f("preCallCrash").destination])
      assert.equal(destination.held_attempt_id, started.attemptId)
      return { noCallObserved: true, absenceOfCallAloneNotAReleaseProof: true }
    })
    await test("CORE-STALE-RISK-T0-T1", async () => {
      const old = await made("staleRisk"), l = await lease(old)
      const additional = await reprint("staleRisk")
      const started = await core.start(a01, storeA, old.j.jobId, l.cp.id, l.l.owner, l.l.epoch)
      await rejects(() => core.create(a01, additional.key, additional.command), "STALE_RISK")
      const proof = boundary.submit(started, "ACCEPT"); assert.ok(proof); await core.reconcile(proof)
      const q = await reprint("staleRisk")
      await core.create(a01, q.key, q.command)
    })
    await test("CORE-REVOCATION-CONCURRENT-T3", async () => {
      const job = await made("revokeRace", { copies: 2 }), l = await lease(job)
      const [j] = await rows("SELECT delegation_id FROM public.print_jobs WHERE id=$1::uuid", [job.j.jobId])
      let entered!: () => void, release!: () => void
      const enteredT3 = new Promise<void>(r => { entered = r }), gate = new Promise<void>(r => { release = r })
      const holding = new PrintCoreSynthetic(db1, crypto, boundary, policy, { beforeT3Commit: async () => { entered(); await gate } })
      const starting = holding.start(a01, storeA, job.j.jobId, l.cp.id, l.l.owner, l.l.epoch)
      await enteredT3
      const other = new PrintCoreSynthetic(db2, crypto, boundary, policy)
      const revoking = other.revokeDelegation(a01, storeA, j.delegation_id)
      const observer = database("admin")
      let waiting: Row[] = []
      try {
        const deadline = Date.now() + 3000
        do {
          waiting = await observer.query("SELECT pid,wait_event_type,wait_event FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock' AND query LIKE '%print_delegations%'", [c.db, c.runtime])
          if (waiting.length) break
          await delay(15)
        } while (Date.now() < deadline)
        assert.equal(waiting.length, 1, "Revocation must actually wait for the T3 delegation lock in PostgreSQL")
      } finally { release() }
      const started = await starting; await revoking
      const proof = boundary.submit(started, "ACCEPT"); assert.ok(proof); await core.reconcile(proof)
      await rejects(() => core.ready(a01, storeA, job.j.jobId, job.copies[1].id, "after-revocation"), "DELEGATION_REVOKED")
      return { observedWait: waiting, noPhysicalRecallClaim: true }
    })
    await test("CORE-AUDIT-FAILURE-AFTER-T3", async () => {
      const job = await made("auditAfter")
      const short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, leaseMs: 1500 })
      const l = await short.ready(a01, storeA, job.j.jobId, job.copies[0].id, "audit-after")
      const started = await short.start(a01, storeA, job.j.jobId, job.copies[0].id, l.owner, l.epoch)
      const proof = boundary.submit(started, "ACCEPT"); assert.ok(proof)
      const failing: Database = { ...db2, transaction: body => db2.transaction(sql => body({ query: sql.query, exec: (s, v) => {
        if (s.startsWith('INSERT INTO public."print_events"')) throw new CoreError("INJECTED_T4_AUDIT_FAILURE")
        return sql.exec(s, v)
      } })) }
      await rejects(() => new PrintCoreSynthetic(failing, crypto, boundary, policy).reconcile(proof), "INJECTED_T4_AUDIT_FAILURE")
      assert.equal((await core.get(a01, storeA, job.j.jobId)).state, "SENDING")
      await delay(Math.max(0, l.until.getTime() - Date.now() + 30)); await core.recover(storeA, job.j.jobId, job.copies[0].id)
      assert.equal((await core.get(a01, storeA, job.j.jobId)).state, "UNKNOWN")
      await core.reconcile(proof)
      assert.equal(boundary.calls.filter(x => x.attemptId === started.attemptId).length, 1)
    })
    await test("CORE-A4-LOGICAL-ONLY", async () => {
      const job = await made("a4", { deliveryMode: "BROWSER_A4", bindingVersionId: null, browserContextId: prefix + "-a4-logical" })
      const l = await lease(job)
      await rejects(() => core.execute(a01, storeA, job.j.jobId, l.cp.id, l.l.owner, l.l.epoch, "ACCEPT"), "A4_LOGICAL_ONLY")
      const [n] = await rows("SELECT count(*)::int n FROM public.print_attempts WHERE job_id=$1::uuid", [job.j.jobId])
      assert.equal(n.n, 0); assert.equal(boundary.calls.filter(x => x.sendKey === l.cp.send_key).length, 0)
      assert.equal((await core.get(a01, storeA, job.j.jobId)).state, "READY")
      return { browserOpened: false, transportAcceptanceFabricated: false }
    })
    await test("CORE-NORMALIZATION", async () => {
      const p1 = await core.prepare(a01, command("normalization"))
      const p2 = await core.prepare(a01, { copies: 1, deliveryMode: "THERMAL_BOUND", browserContextId: null,
        ...command("normalization"), reasonCode: null, previousJobId: null })
      assert.equal(canonical(p1.command), canonical(p2.command))
      assert.notEqual(p1.key, p2.key)
      const j = await core.create(a01, p1.key, p1.command)
      for (const [field, value] of [["documentVersion","a".repeat(64)],["documentId",randomUUID()],["intentId",randomUUID()],
        ["copies",2],["bindingVersionId",f("normalization").altBinding]]) {
        await rejects(() => core.create(a01, p1.key, { ...p1.command, [field]: value }), "REQUEST_CONFLICT")
      }
      assert.equal((await core.create(a01, p2.key, p2.command)).jobId, j.jobId)
      const changedCopies = await core.prepare(a01, command("normalization", { copies: 2 }))
      await rejects(() => core.create(a01, changedCopies.key, changedCopies.command), "INITIAL_SEMANTIC_CONFLICT")
      await rejects(() => core.create(a01, p1.key, { ...p1.command, riskHash: { recurse: true } }), "INVALID_COMMAND")
    })
    await test("CORE-ELIGIBILITY", async () => {
      for (const name of ["cancelled","pending","quarantine"]) await rejects(() => core.prepare(a01, command(name)), "DOCUMENT_INELIGIBLE")
      await rejects(() => core.prepare(a01, command("auth", { saleId: prefix + "-missing" })), "NOT_FOUND")
    })
    // Explicit owner fixture corrections, journaled separately from runtime print-core commands.
    await test("CORE-FINGERPRINT", async () => {
      const v = f("fingerprint")
      const initial = await saleSnapshot(db1, storeA, v.sale, 100)
      for (const change of [
        { field: "receipt-item", sql: 'UPDATE public.venda_itens SET nome=nome||$1 WHERE "vendaId"=$2', values: [" corrected", v.sale] },
        { field: "item-quantity-int", sql: 'UPDATE public.venda_itens SET quantidade=3 WHERE "vendaId"=$1', values: [v.sale] },
        { field: "price-float8", sql: 'UPDATE public.venda_itens SET "precoUnitario"=5.123456789 WHERE "vendaId"=$1', values: [v.sale] },
        { field: "payment", sql: "UPDATE public.vendas SET payload=jsonb_set(payload,'{paymentBreakdown,pix}','3') WHERE id=$1", values: [v.sale] },
        { field: "discount", sql: "UPDATE public.vendas SET payload=jsonb_set(payload,'{discountTotal}','2') WHERE id=$1", values: [v.sale] },
        { field: "tendered", sql: "UPDATE public.vendas SET payload=jsonb_set(payload,'{cashTendered}','11') WHERE id=$1", values: [v.sale] },
        { field: "client-header", sql: 'UPDATE public.vendas SET "clienteNome"=$1 WHERE id=$2', values: ["Corrected synthetic", v.sale] },
      ]) {
        const prev = await saleSnapshot(db1, storeA, v.sale, 100)
        await owner.exec(change.sql, change.values); mutationJournal.push({ table: change.sql.includes("venda_itens") ? "venda_itens" : "vendas", saleId: v.sale, reason: change.field, writer: "OWNER_FIXTURE_ONLY" })
        assert.notEqual((await saleSnapshot(db1, storeA, v.sale, 100)).version, prev.version)
      }
      assert.notEqual((await saleSnapshot(db1, storeA, v.sale, 100)).version, initial.version)
      const p = await core.prepare(a01, command("versionConflict"))
      await owner.exec("UPDATE public.vendas SET payload=jsonb_set(payload,'{discountTotal}','4') WHERE id=$1", [f("versionConflict").sale])
      mutationJournal.push({ table: "vendas", saleId: f("versionConflict").sale, reason: "correction-before-T1", writer: "OWNER_FIXTURE_ONLY" })
      await rejects(() => core.create(a01, p.key, p.command), "DOCUMENT_VERSION_CONFLICT")
      const cancellation = await core.prepare(a01, command("cancelled", { saleId: f("cancelled").sale })).catch(() => null)
      assert.equal(cancellation, null)
      await owner.exec('UPDATE public.vendas SET status=$1,"canceladaEm"=clock_timestamp() WHERE id=$2', ["cancelada", v.sale])
      mutationJournal.push({ table: "vendas", saleId: v.sale, reason: "cancellation-before-final-SELECT", writer: "OWNER_FIXTURE_ONLY" })
      await rejects(() => saleSnapshot(db1, storeA, v.sale, 100), "DOCUMENT_INELIGIBLE")
      return { exactFloatBits: true, quantityType: "Int", kgCertified: false, postSELECTDeviceAtomicityClaimed: false }
    })
    await test("CORE-REVIEW-REGRESSIONS", async () => {
      const legacy: Authority = { principalId: prefix + "-legacy", observedSessionVersion: 0 }
      const unbound: Authority = { principalId: prefix + "-unbound", observedSessionVersion: 0 }
      const p = await core.prepare(legacy, command("legacy")); assert.ok(p.key)
      await rejects(() => core.prepare(unbound, command("legacy")), "FORBIDDEN")
      const inactive = await made("inactive"), l = await lease(inactive)
      await owner.exec("UPDATE public.pdv_terminais SET status='INACTIVE' WHERE id=$1", [f("inactive").terminal])
      mutationJournal.push({ table: "pdv_terminais", id: f("inactive").terminal, writer: "OWNER_FIXTURE_ONLY", reason: "independent-review-inactive" })
      await rejects(() => core.start(a01, storeA, inactive.j.jobId, l.cp.id, l.l.owner, l.l.epoch), "NOT_FOUND")
      await rejects(() => core.prepare(a01, command("inactive")), "NOT_FOUND")
      for (const [name, mutation, code] of [
        ["badPayment","jsonb_set(payload,'{paymentBreakdown,pix}','\"invalido\"')","INVALID_PAYMENT"],
        ["badDiscount","jsonb_set(payload,'{discountTotal}','\"invalido\"')","INVALID_MONEY"],
      ]) {
        await owner.exec("UPDATE public.vendas SET payload=" + mutation + " WHERE id=$1", [f(name).sale])
        mutationJournal.push({ table: "vendas", saleId: f(name).sale, writer: "OWNER_FIXTURE_ONLY", reason: "independent-review-invalid-json" })
        await rejects(() => core.prepare(a01, command(name)), code)
      }
      const sealed = await made("afterSnapshot"), l3 = await lease(sealed)
      await owner.exec("UPDATE public.vendas SET payload=jsonb_set(payload,'{discountTotal}','5') WHERE id=$1", [f("afterSnapshot").sale])
      mutationJournal.push({ table: "vendas", saleId: f("afterSnapshot").sale, writer: "OWNER_FIXTURE_ONLY", reason: "correction-before-T3-final-SELECT" })
      await rejects(() => core.start(a01, storeA, sealed.j.jobId, l3.cp.id, l3.l.owner, l3.l.epoch), "DOCUMENT_VERSION_CONFLICT")
      const cancellation = await core.prepare(a01, command("cancelAfterPrepare"))
      await owner.exec("UPDATE public.vendas SET status='cancelada' WHERE id=$1", [f("cancelAfterPrepare").sale])
      mutationJournal.push({ table: "vendas", saleId: f("cancelAfterPrepare").sale, writer: "OWNER_FIXTURE_ONLY", reason: "cancellation-before-T1-final-SELECT" })
      await rejects(() => core.create(a01, cancellation.key, cancellation.command), "DOCUMENT_INELIGIBLE")
      const preparedRace = await core.prepare(a01, command("correctRace"))
      let readEntered!: () => void, resumeRead!: () => void
      const enteredRead = new Promise<void>(r => { readEntered = r }), readGate = new Promise<void>(r => { resumeRead = r })
      const waitingReader = new PrintCoreSynthetic(db2, crypto, boundary, policy, { afterDocumentLock: async () => { readEntered(); await readGate } })
      const creation = waitingReader.create(a01, preparedRace.key, preparedRace.command)
      await enteredRead
      try {
        await owner.exec("UPDATE public.vendas SET total=11 WHERE id=$1", [f("correctRace").sale])
        mutationJournal.push({ table: "vendas", saleId: f("correctRace").sale, writer: "OWNER_FIXTURE_ONLY", reason: "concurrent-owner-commit-before-final-reader-SELECT" })
      } finally { resumeRead() }
      await rejects(() => creation, "DOCUMENT_VERSION_CONFLICT")
      return { reviewFindings: ["missing-session-column","inactive-terminal","invalid-payment-discount","legacy-store-fallback"], adversarialChecksExecuted: true }
    })
    const afterCorrections = await commerceSnapshot(); json("commercial-after-owner-corrections-" + prefix + ".json", afterCorrections)
    await test("CORE-PURGE-REQUEST-EXPIRY", async () => {
      const short = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, requestMs: 400, authorizationMs: 600, contentMs: 800, leaseMs: 100 })
      const expired = await short.prepare(a01, command("grant"))
      await delay(430)
      await rejects(() => short.create(a01, expired.key, expired.command), "REQUEST_EXPIRED")
      const job = await made("purge", {}, a01, short)
      const [beforeHash] = await rows("SELECT snapshot_hash FROM public.print_jobs WHERE id=$1::uuid", [job.j.jobId])
      await delay(830)
      assert.equal(await short.expireSafeCopies(a01, storeA, job.j.jobId), 1)
      await short.purgeExpired(a01, storeA, job.j.jobId)
      const dto = await short.get(a01, storeA, job.j.jobId); assert.equal(dto.contentExpired, true)
      await rejects(() => short.ready(a01, storeA, job.j.jobId, job.copies[0].id, "regenerate"), "DELEGATION_REVOKED")
      await short.removeExpiredRequests()
      await rejects(() => short.create(a01, job.p.key, job.p.command), "REQUEST_EXPIRED")
      const [afterHash] = await rows("SELECT snapshot_hash,snapshot_cipher FROM public.print_jobs WHERE id=$1::uuid", [job.j.jobId])
      assert.equal(afterHash.snapshot_hash, beforeHash.snapshot_hash); assert.equal(afterHash.snapshot_cipher, null)
      const fresh = await core.prepare(a01, command("purge"))
      const coalesced = await core.create(a01, fresh.key, fresh.command)
      assert.equal(coalesced.jobId, job.j.jobId); assert.equal(coalesced.contentExpired, true)
      const hist = new PrintCoreSynthetic(db1, crypto, boundary, { ...policy, requestMs: 400, authorizationMs: 600, contentMs: 800 })
      const p = await reprint("requestPurge", a01, {}, hist); await hist.create(a01, p.key, p.command)
      await delay(830); await hist.removeExpiredRequests()
      await rejects(() => core.prepare(a01, command("requestPurge")), "INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
      return { hashesAndSlotsRemain: true, noRegeneration: true }
    })
    await test("CORE-PURE-CRYPTO-AND-CANONICAL", async () => {
      assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }))
      assert.equal(cleanData("\u001b\u001d\u0010\u0000\u007f\u0080"), "�".repeat(6))
      assert.equal(hash("command", { a: 1 }), hash("command", { a: 1 }))
      assert.notEqual(hash("command", { a: 1 }), hash("payload", { a: 1 }))
      const bytes = Buffer.from("synthetic"), sealed = crypto.seal(bytes, "scope-a")
      assert.deepEqual(crypto.open(sealed, "scope-a"), bytes)
      await rejects(async () => crypto.open(sealed, "scope-b"), "CONTENT_UNAVAILABLE")
      const tampered = Buffer.from(sealed); tampered[tampered.length - 1] ^= 1
      await rejects(async () => crypto.open(tampered, "scope-a"), "CONTENT_UNAVAILABLE")
      assert.deepEqual(intentProjection({ riskRevision: "1", riskHash: "a", consentHash: "x", copies: 1 }), { copies: 1 })
      assert.equal(summarize([{ ordinal: 1, state: "UNKNOWN", payload_cipher: Buffer.alloc(1), payload_expires_at: new Date(Date.now()+1000) }]).copies[0].canRetry, false)
    })
    const after = await commerceSnapshot(); json("commercial-after-" + prefix + ".json", after)
    await test("CORE-COMMERCIAL-INTEGRITY", async () => {
      assert.equal(transportGuard.attempts.length, 0)
      assert.equal(runtimeSqlJournal.filter(s => s.target && !s.target.startsWith("print_")).length, 0)
      assert.deepEqual(after, afterCorrections, "Print core changed commercial baseline after explicit owner correction checkpoint")
      const changed = before.filter((b, i) => b.digest !== afterCorrections[i].digest).map(b => b.table)
      assert.deepEqual(changed.sort(), [...new Set(mutationJournal.map(m => m.table))].sort())
      assert.ok(mutationJournal.length > 0 && mutationJournal.every(m => m.writer === "OWNER_FIXTURE_ONLY"))
      return { comparison: "per-table sorted row identities plus digest, not counts", changedOnlyByOwnerFixture: changed,
        runtimeCommercialDmlPrivileges: false, commercialMutationsByPrintCore: 0 }
    })
    json("fixture-mutation-journal-" + prefix + ".json", mutationJournal)
    json("runtime-sql-journal-" + prefix + ".json", runtimeSqlJournal)
    json("real-transport-boundary.json", { run: prefix, node: process.version, instrumented: ["fetch","WebSocket","net.Socket.connect","http/https.request/get","dgram","child_process"], attemptedCalls: transportGuard.attempts, realTransportCalls: 0, nativePostgresLoopbackOnly: true })
    json("gate-b-results.json", { run: prefix, node: process.version, postgres: "actual local PostgreSQL", status: results.every(r => r.status === "PASS") ? "PASS" : "FAIL",
      runtime: c.runtime, independentTransactionBackendPids: [...transactionPids], controlledBarriers: true, policy,
      results, syntheticBoundaryCalls: boundary.calls, realTransportCalls: boundary.realTransportCalls,
      commercialMutationsByPrintCore: 0, productionWrites: 0,
      limits: ["No live session endpoint/logout","No physical/transport/browser pairing validation","Synthetic JSON renderer only","No KG certification","Ephemeral keys cannot decrypt after process exit; hashes and ledger remain"] })
    console.log("GATE B " + (results.every(r => r.status === "PASS") ? "PASS" : "FAIL") + " " + results.filter(r => r.status === "PASS").length + "/" + results.length)
    if (results.some(r => r.status === "FAIL")) process.exitCode = 1
  } finally { await Promise.all(ownedClients.map(client => client.$disconnect())); transportGuard.restore() }
}
main().catch(e => { console.error(e instanceof CoreError ? e.code : String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,"[REDACTED_DSN]")); process.exitCode = 1 })
