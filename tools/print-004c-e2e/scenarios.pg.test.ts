/**
 * OMNI-PRINT-004C — integration scenarios: real route handlers + real ledger (PostgreSQL 17 disposable) +
 * real agent code over real HTTP + SIMULATED spooler/printer. Result class of every transport outcome here
 * is PASS_SIMULATED_TRANSPORT at most; nothing in this file is a physical print.
 * Run: tools/print-004c-e2e/run-pg.mjs (resets a print_lab_* database and sets PRINT_PG_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomBytes } from "node:crypto"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import * as direct from "@/lib/printing/direct/http"
import { DirectPrintCore } from "@/lib/printing/direct/core"
import { PrintCrypto } from "@/lib/printing/direct/codec"
import { validateEscPos } from "@/lib/printing/direct/renderer"
import { browserRequest, commercialDigest, confirmedSale, depsFor, IDS, LabServer, labPrisma, labRuntime, prismaDatabase, seed, sessionOf, withPolicy, type Database, type EnabledRuntime, type Session } from "./lab-env"
import { Agent } from "../omni-print-agent/agent.mjs"
import { FakeSpooler } from "../omni-print-agent/spooler-fake.mjs"

const URL_ = process.env.PRINT_PG_URL
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
type Json = Record<string, any>

describe.skipIf(!URL_)("OMNI-PRINT-004C — direct print end-to-end (simulated transport)", { timeout: 60_000 }, () => {
  const prisma = labPrisma(URL_ ?? "postgresql://x@127.0.0.1/print_lab_unused")
  const db: Database = prismaDatabase(prisma as never)
  // Suite-wide high admission limit (S18 asserts the real per-principal limit explicitly).
  let runtime: EnabledRuntime = labRuntime({ maxRequestsPerMinute: 1000 })
  let server: LabServer, serverB: LabServer
  const spoolerA = new FakeSpooler([{ name: "POS-80 (simulada)" }, { name: "POS-58 (simulada)" }])
  const spoolerB = new FakeSpooler([{ name: "POS-80 Loja B (simulada)" }])
  let tokenA = "", tokenB = "", installA = "", installB = ""
  const journals = mkdtempSync(path.join(os.tmpdir(), "p004c-journal-"))
  let agentSeq = 0
  const newAgent = (token: string, spooler: unknown, srv: LabServer, extra: Json = {}, journal?: string) =>
    new Agent({ serverUrl: srv.url, token, spooler, journalFile: journal ?? path.join(journals, `j${++agentSeq}.jsonl`), statusTimeoutMs: 400, submitTimeoutMs: 600, ...extra })
  let agentA: Json, agentB: Json

  const call = async (fn: (r: Request, d: direct.DirectPrintDeps) => Promise<Response>, session: Session | null, p: string, storeId: string | null, body?: unknown, rt = runtime, extra?: Record<string, string>) => {
    const res = await fn(browserRequest(p, storeId, body, extra), depsFor(db, rt, session))
    return { status: res.status, body: await res.json() as Json }
  }
  const createJob = (saleId: string, terminalId = IDS.t1A, session = sessionOf(IDS.caixaA), storeId = IDS.storeA, more: Json = {}, rt = runtime) =>
    call(direct.createJob, session, "/api/print/direct/jobs", storeId, { saleId, kind: "INITIAL", terminalId, uiContextId: "tab-" + Math.random().toString(36).slice(2), ...more }, rt)
  const getJob = (jobId: string, session = sessionOf(IDS.caixaA), storeId = IDS.storeA) =>
    call((r, d) => direct.getJob(r, d, jobId), session, `/api/print/direct/jobs/${jobId}`, storeId)
  const retry = (jobId: string, session = sessionOf(IDS.caixaA)) =>
    call((r, d) => direct.retryJob(r, d, jobId), session, `/api/print/direct/jobs/${jobId}/retry`, IDS.storeA, {})
  const reprint = async (saleId: string, terminalId = IDS.t1A, reasonCode = "CUSTOMER_REQUEST", session = sessionOf(IDS.caixaA)) => {
    const q = await call(direct.quoteReprint, session, "/api/print/direct/reprint-quote", IDS.storeA, { saleId })
    expect(q.status).toBe(200)
    return { quote: q.body.quote, res: await call(direct.createJob, session, "/api/print/direct/jobs", IDS.storeA, { saleId, kind: "REPRINT", terminalId, reasonCode, consent: q.body.quote.consent }) }
  }
  const admin = (body: Json, session = sessionOf(IDS.adminA), storeId = IDS.storeA) => call(direct.adminAction, session, "/api/print/direct/admin", storeId, body)
  const ledger = async (saleId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT c.state,c.ordinal,j.kind,(SELECT count(*)::int FROM public.print_attempts a WHERE a.copy_id=c.id) attempts
    FROM public.print_copies c JOIN public.print_jobs j ON j.id=c.job_id JOIN public.print_documents d ON d.id=j.document_id WHERE d.sale_id=$1 ORDER BY j.created_at,c.ordinal`, saleId)
  /** One destination admits one in-flight attempt; tick until the agent is idle. */
  const drain = async (agent: Json) => { for (let i = 0; i < 8; i++) if (await agent.tick() === 0) return }
  const outputs = (sp: Json, printer = "POS-80 (simulada)") => sp.spooled.filter((j: Json) => j.printer === printer).length

  beforeAll(async () => {
    await seed(prisma)
    server = await new LabServer(() => depsFor(db, runtime, null)).start()
    serverB = server
    // Pair one agent per store through the real admin + pairing endpoints.
    for (const [store, adminId, printers] of [[IDS.storeA, IDS.adminA, spoolerA], [IDS.storeB, IDS.platform, spoolerB]] as const) {
      const created = await admin({ action: "createInstallation", label: "Computador do caixa" }, sessionOf(adminId), store)
      expect(created.status).toBe(200)
      const paired = await fetch(server.url + "/api/print/agent/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: created.body.pairingCode.toLowerCase(), agentVersion: "lab" }) }).then(r => r.json())
      expect(paired.ok).toBe(true)
      if (store === IDS.storeA) { tokenA = paired.token; installA = paired.installationId } else { tokenB = paired.token; installB = paired.installationId }
      const agent = newAgent(store === IDS.storeA ? tokenA : tokenB, printers, server)
      await agent.heartbeat()
      if (store === IDS.storeA) agentA = agent; else agentB = agent
    }
    expect((await admin({ action: "bindTerminal", terminalId: IDS.t1A, installationId: installA, printerName: "POS-80 (simulada)", profileId: "THERMAL_80" })).status).toBe(200)
    expect((await admin({ action: "bindTerminal", terminalId: IDS.t2A, installationId: installA, printerName: "POS-58 (simulada)", profileId: "THERMAL_58" })).status).toBe(200)
    expect((await admin({ action: "bindTerminal", terminalId: IDS.t1B, installationId: installB, printerName: "POS-80 Loja B (simulada)", profileId: "THERMAL_80" }, sessionOf(IDS.platform), IDS.storeB)).status).toBe(200)
  }, 120_000)
  afterAll(async () => { await server?.stop(); await prisma.$disconnect() })

  it("S01 impressão automática após venda CONFIRMADA → fila da impressora, sem diálogo, sem confirmar papel", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA, { tendered: 50 })
    const r = await createJob(sale.id)
    expect(r.status).toBe(200)
    expect(r.body.job).toMatchObject({ kind: "INITIAL", phase: "QUEUED", physicalPrintConfirmed: false, replay: false })
    expect(await agentA.tick()).toBe(1)
    const v = await getJob(r.body.job.jobId)
    expect(v.body.job).toMatchObject({ phase: "IN_PRINTER_QUEUE", final: true, physicalPrintConfirmed: false })
    expect(v.body.job.copies[0].label).toBe("Enviado à fila da impressora")
    const spooled = spoolerA.spooled.at(-1)
    expect(spooled.printer).toBe("POS-80 (simulada)")
    expect(() => validateEscPos(spooled.bytes)).not.toThrow()
    const text = Buffer.from(spooled.bytes).toString("latin1")
    expect(text).toContain("NÃO É DOCUMENTO FISCAL")
    expect(text).toContain("NÃO SUBSTITUI NFC-e OU NF-e")
    expect(text).toContain("Café coado - grão especial")
    expect(text).toContain("Troco:")
    expect(text).toContain("Obrigado pela preferência!")
    expect(spooled.bytes.includes(0x70) && Buffer.from(spooled.bytes).includes(Buffer.from([0x1b, 0x70]))).toBe(false) // no drawer kick
  })

  it("S02 impressão manual explícita (mesma API) e envio duplicado/duas abas convergem num único INITIAL", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const [a, b] = await Promise.all([createJob(sale.id), createJob(sale.id, IDS.t1A, sessionOf(IDS.caixa2A))])
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    expect(a.body.job.jobId).toBe(b.body.job.jobId)
    expect([a.body.job.replay, b.body.job.replay].sort()).toEqual([false, true])
    const c = await createJob(sale.id) // manual click again after auto
    expect(c.body.job.jobId).toBe(a.body.job.jobId)
    const before = outputs(spoolerA)
    await agentA.tick(); await agentA.tick()
    expect(outputs(spoolerA) - before).toBe(1)
    expect(await ledger(sale.id)).toEqual([{ state: "SPOOLER_ACCEPTED", ordinal: 1, kind: "INITIAL", attempts: 1 }])
  })

  it("S03 dois terminais: outro terminal não cria segundo INITIAL; vendas distintas vão à impressora do próprio terminal (58 mm)", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const a = await createJob(sale.id, IDS.t1A)
    const b = await createJob(sale.id, IDS.t2A)
    expect(b.body.job.jobId).toBe(a.body.job.jobId)
    const sale2 = await confirmedSale(prisma, IDS.storeA)
    const c = await createJob(sale2.id, IDS.t2A)
    await agentA.tick()
    expect((await getJob(c.body.job.jobId)).body.job.printerName).toBe("POS-58 (simulada)")
    const last58 = spoolerA.spooled.filter((j: Json) => j.printer === "POS-58 (simulada)").at(-1)
    const lines = Buffer.from(last58.bytes).toString("latin1").split("\n").filter(l => !/[\x1b\x1d]/.test(l))
    expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(32)
  })

  it("S04 duas lojas: isolamento de venda, job, agente e prova", async () => {
    const saleA = await confirmedSale(prisma, IDS.storeA)
    const saleB = await confirmedSale(prisma, IDS.storeB)
    const a = await createJob(saleA.id)
    // Store B user cannot read/print store A objects, even naming them explicitly.
    expect((await createJob(saleA.id, IDS.t1A, sessionOf(IDS.caixaB), IDS.storeA)).status).toBe(403)
    expect((await createJob(saleA.id, IDS.t1B, sessionOf(IDS.caixaB), IDS.storeB)).status).toBe(404)
    expect((await getJob(a.body.job.jobId, sessionOf(IDS.caixaB), IDS.storeB)).status).toBe(404)
    const b = await createJob(saleB.id, IDS.t1B, sessionOf(IDS.caixaB), IDS.storeB)
    expect(b.status).toBe(200)
    // Agent A never receives store B work; agent B never receives store A work.
    const before = outputs(spoolerB, "POS-80 Loja B (simulada)")
    await agentA.tick()
    expect(outputs(spoolerB, "POS-80 Loja B (simulada)")).toBe(before)
    await agentB.tick()
    expect(outputs(spoolerB, "POS-80 Loja B (simulada)")).toBe(before + 1)
    // A forged report with agent B's credential for agent A's attempt is rejected.
    const [att] = await prisma.$queryRawUnsafe<Json[]>(`SELECT a.id,c.send_key FROM public.print_attempts a JOIN public.print_copies c ON c.id=a.copy_id WHERE a.job_id=$1::uuid`, a.body.job.jobId)
    const forged = await fetch(server.url + "/api/print/agent/report", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tokenB },
      body: JSON.stringify({ attemptId: att.id, sendKey: att.send_key, result: "NO_EFFECT", release: true, reason: "PRINTER_OFFLINE" }) })
    expect(forged.status).toBe(403)
    expect((await getJob(a.body.job.jobId)).body.job.phase).toBe("IN_PRINTER_QUEUE")
  })

  it("S05 venda PENDENTE (sem linha confirmada no servidor) nunca gera impressão definitiva", async () => {
    const r = await createJob("VDA-PROVISORIA-cs_attempt_123")
    expect(r.status).toBe(404)
    expect(r.body.error).toBe("NOT_FOUND")
    const n = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_documents WHERE sale_id='VDA-PROVISORIA-cs_attempt_123'`)
    expect(n[0].n).toBe(0)
  })

  it("S06 impressora desligada → falha comprovada antes do envio; religada → tentar novamente imprime uma vez", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    spoolerA.printers.get("POS-80 (simulada)")!.online = false
    const r = await createJob(sale.id)
    await agentA.tick()
    let v = (await getJob(r.body.job.jobId)).body.job
    expect(v.phase).toBe("FAILED_BEFORE_SEND")
    expect(v.copies[0].label).toContain("impressora desligada")
    expect(v.canRetry).toBe(true)
    spoolerA.printers.get("POS-80 (simulada)")!.online = true
    const before = outputs(spoolerA)
    expect((await retry(r.body.job.jobId)).status).toBe(200)
    await agentA.tick()
    v = (await getJob(r.body.job.jobId)).body.job
    expect(v.phase).toBe("IN_PRINTER_QUEUE")
    expect(outputs(spoolerA) - before).toBe(1)
  })

  it("S07 fila/spooler indisponível e erro de StartDoc → NO_EFFECT; erro no meio da escrita → UNKNOWN sem retry", async () => {
    spoolerA.serviceUp = false
    const s1 = await confirmedSale(prisma, IDS.storeA)
    const j1 = (await createJob(s1.id)).body.job.jobId
    await agentA.tick()
    expect((await getJob(j1)).body.job.copies[0].reason).toBe("SPOOLER_UNAVAILABLE")
    spoolerA.serviceUp = true
    spoolerA.faults.push("START_DOC_FAIL")
    const s2 = await confirmedSale(prisma, IDS.storeA)
    const j2 = (await createJob(s2.id)).body.job.jobId
    await agentA.tick()
    expect((await getJob(j2)).body.job).toMatchObject({ phase: "FAILED_BEFORE_SEND", canRetry: true })
    spoolerA.faults.push("WRITE_FAIL")
    const s3 = await confirmedSale(prisma, IDS.storeA)
    const j3 = (await createJob(s3.id)).body.job.jobId
    await agentA.tick()
    const v3 = (await getJob(j3)).body.job
    expect(v3).toMatchObject({ phase: "UNCERTAIN", canRetry: false })
    expect((await retry(j3)).body.error).toBe("COPY_NOT_RETRYABLE")
    // The printer is not left blocked: the agent closed its egress for that attempt.
    const s4 = await confirmedSale(prisma, IDS.storeA)
    const j4 = (await createJob(s4.id)).body.job.jobId
    await agentA.tick()
    expect((await getJob(j4)).body.job.phase).toBe("IN_PRINTER_QUEUE")
  })

  it("S08 timeout ANTES do envio → NO_EFFECT; timeout DEPOIS do envio → UNKNOWN, host reiniciado, zero reenvio", async () => {
    spoolerA.faults.push("TIMEOUT_BEFORE")
    const s1 = await confirmedSale(prisma, IDS.storeA)
    const j1 = (await createJob(s1.id)).body.job.jobId
    await agentA.tick()
    expect((await getJob(j1)).body.job.copies[0]).toMatchObject({ phase: "FAILED_BEFORE_SEND", reason: "TIMEOUT_BEFORE_SUBMIT" })
    spoolerA.faults.push("TIMEOUT_AFTER")
    const resets = spoolerA.resets
    const s2 = await confirmedSale(prisma, IDS.storeA)
    const j2 = (await createJob(s2.id)).body.job.jobId
    await agentA.tick()
    expect(spoolerA.resets).toBeGreaterThan(resets)
    const v = (await getJob(j2)).body.job
    expect(v).toMatchObject({ phase: "UNCERTAIN", canRetry: false })
    await agentA.tick()
    expect((await ledger(s2.id))[0].attempts).toBe(1)
  })

  it("S09 resposta perdida: claim (reentrega mesma sendKey), report (replay) e criação (reenvio do POST)", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const first = await createJob(sale.id)
    const again = await createJob(sale.id) // client lost the first response and re-posted
    expect(again.body.job.jobId).toBe(first.body.job.jobId)
    const before = outputs(spoolerA)
    server.faults.dropResponseOnce.add("/api/print/agent/claim")
    await expect(agentA.tick()).rejects.toThrow()
    expect((await ledger(sale.id))[0].state).toBe("SENDING")
    await agentA.tick() // redelivery of the STARTED attempt: journal has no entry → prints once
    expect(outputs(spoolerA) - before).toBe(1)
    const sale2 = await confirmedSale(prisma, IDS.storeA)
    await createJob(sale2.id)
    server.faults.dropResponseOnce.add("/api/print/agent/report")
    await agentA.tick().catch(() => undefined)
    await agentA.tick() // re-report: server answers replay, no second spool job
    expect(outputs(spoolerA) - before).toBe(2)
    expect((await ledger(sale2.id))[0]).toMatchObject({ state: "SPOOLER_ACCEPTED", attempts: 1 })
  })

  it("S10 queda de conexão / reconexão: agente fora do ar → 'não enviado' após o lease; ao voltar, retry imprime uma vez", async () => {
    const short = withPolicy(runtime, { dispatchLeaseMs: 1200 })
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, {}, short)
    server.faults.refuseAll = true
    await expect(agentA.tick()).rejects.toThrow()
    await sleep(1400)
    let v = (await getJob(r.body.job.jobId)).body.job
    expect(v.copies[0]).toMatchObject({ phase: "NOT_SENT", canRetry: true })
    server.faults.refuseAll = false
    const before = outputs(spoolerA)
    await agentA.tick() // lapsed lease: nothing is claimable, no late surprise print
    expect(outputs(spoolerA)).toBe(before)
    await call((rq, d) => direct.retryJob(rq, d, r.body.job.jobId), sessionOf(IDS.caixaA), "/x", IDS.storeA, {}, short)
    await agentA.tick()
    v = (await getJob(r.body.job.jobId)).body.job
    expect(v.phase).toBe("IN_PRINTER_QUEUE")
    expect(outputs(spoolerA) - before).toBe(1)
  })

  it("S11 reinício do agente após enviar e antes de registrar → UNKNOWN (AGENT_RESTARTED), zero reenvio", async () => {
    const journal = path.join(journals, "crash.jsonl")
    const crashing = newAgent(tokenA, spoolerA, server, { hooks: { afterSubmitBeforeJournal: () => { throw new Error("SIMULATED_PROCESS_CRASH") } } }, journal)
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id)
    const before = outputs(spoolerA)
    await expect(crashing.tick()).rejects.toThrow("SIMULATED_PROCESS_CRASH")
    expect(outputs(spoolerA) - before).toBe(1)
    expect(() => newAgent(tokenA, spoolerA, server, {}, journal)).toThrow("AGENT_ALREADY_RUNNING") // same process still holds the journal
    crashing.releaseLock() // the OS process died: its lock is stale
    const restarted = newAgent(tokenA, spoolerA, server, {}, journal)
    await restarted.tick()
    const v = (await getJob(r.body.job.jobId)).body.job
    expect(v).toMatchObject({ phase: "UNCERTAIN", canRetry: false })
    expect(outputs(spoolerA) - before).toBe(1)
  })

  it("S12 I17: tentativa UNKNOWN ausente do diário do agente segue UNKNOWN, libera a fila e nunca é reenviada", async () => {
    const saved = runtime
    runtime = withPolicy(runtime, { dispatchLeaseMs: 1000, sendLeaseMs: 1000 })
    try {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id)
    server.faults.dropResponseOnce.add("/api/print/agent/claim")
    await agentA.tick().catch(() => undefined) // attempt STARTED on server; the agent never saw it
    await sleep(1200)
    const v1 = (await getJob(r.body.job.jobId)).body.job // lazy recovery: lease lapsed → UNKNOWN
    expect(v1.phase).toBe("UNCERTAIN")
    const before = outputs(spoolerA)
    await agentA.tick() // answers the query: NOT_FOUND_IN_JOURNAL → UNKNOWN + release (tombstone)
    await agentA.tick()
    const [dest] = await prisma.$queryRawUnsafe<Json[]>(`SELECT q.held_attempt_id FROM public.print_destinations q JOIN public.print_bindings b ON b.destination_id=q.id WHERE b.terminal_id=$1 AND b.state='ACTIVE'`, IDS.t1A)
    expect(dest.held_attempt_id).toBeNull()
    expect((await getJob(r.body.job.jobId)).body.job).toMatchObject({ phase: "UNCERTAIN", canRetry: false })
    expect(outputs(spoolerA)).toBe(before)
    } finally { runtime = saved }
  })

  it("S13 segunda via exige ato explícito + consentimento; marca SEGUNDA VIA; suprime retry antigo; consentimento velho é recusado", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    await createJob(sale.id); await agentA.tick()
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, { kind: "REPRINT", reasonCode: "LOST" })).body.error).toBe("REASON_REQUIRED")
    const { quote, res } = await reprint(sale.id)
    expect(quote).toMatchObject({ possibleAdditionalCopy: true, acceptedCopies: 1 })
    expect(res.status).toBe(200)
    expect(res.body.job.kind).toBe("REPRINT")
    await agentA.tick()
    const last = Buffer.from(spoolerA.spooled.at(-1).bytes).toString("latin1")
    expect(last).toContain("SEGUNDA VIA - REIMPRESSAO 1/1")
    // Replaying the same consent converges; a consent whose risk changed is stale.
    const replay = await call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, { saleId: sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: quote.consent })
    expect(replay.status).toBe(200)
    expect(replay.body.job).toMatchObject({ jobId: res.body.job.jobId, replay: true })
    expect((await ledger(sale.id)).map(x => x.kind)).toEqual(["INITIAL", "REPRINT"])
  })

  it("S14 venda cancelada/corrigida depois do job e antes do agente → cópia cancelada, nada enviado", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id)
    await prisma.$executeRawUnsafe(`UPDATE public.vendas SET status='cancelada',"canceladaEm"=now() WHERE id=$1`, sale.id)
    const before = outputs(spoolerA)
    await agentA.tick()
    const v = (await getJob(r.body.job.jobId)).body.job
    expect(v).toMatchObject({ phase: "CANCELLED", canRetry: false })
    expect(v.copies[0].reason).toBe("DOCUMENT_CHANGED")
    expect(outputs(spoolerA)).toBe(before)
    expect((await createJob(sale.id)).body.error).toBe("DOCUMENT_INELIGIBLE")
    const s2 = await confirmedSale(prisma, IDS.storeA)
    const r2 = await createJob(s2.id)
    await prisma.$executeRawUnsafe(`UPDATE public.venda_itens SET "precoUnitario"=8.5,"lineTotal"=17 WHERE "vendaId"=$1 AND id LIKE '%-i1'`, s2.id)
    await agentA.tick()
    expect((await getJob(r2.body.job.jobId)).body.job.copies[0].reason).toBe("DOCUMENT_CHANGED")
  })

  it("S15 permissão negada, sessão expirada/revogada, usuário inativo, CSRF/Origin e troca de loja", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.tecnicoA))).status).toBe(403)
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.inactive))).status).toBe(401)
    expect((await createJob(sale.id, IDS.t1A, null as never)).status).toBe(401)
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA, 7))).status).toBe(401) // stale sessionVersion
    expect((await admin({ action: "createInstallation", label: "x" }, sessionOf(IDS.caixaA))).status).toBe(403) // STORE caixa cannot configure
    const csrf = await call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A }, runtime, { origin: "https://evil.example" })
    expect(csrf.status).toBe(403)
    const conflict = await call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs?storeId=" + IDS.storeB, IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A })
    expect(conflict.body.error).toBe("STORE_CONTEXT_CONFLICT")
    // Session revoked after the job was created but before the agent started it → copy expires, nothing sent.
    const r = await createJob(sale.id)
    await prisma.$executeRawUnsafe(`UPDATE public.admin_users SET "sessionVersion"="sessionVersion"+1 WHERE id=$1`, IDS.caixaA)
    const before = outputs(spoolerA)
    await agentA.tick()
    expect(outputs(spoolerA)).toBe(before)
    const sessionNow = sessionOf(IDS.caixaA, 1)
    const v = (await getJob(r.body.job.jobId, sessionNow)).body.job
    expect(v.copies[0]).toMatchObject({ phase: "CANCELLED", reason: "AUTHORIZATION_LOST" })
    await prisma.$executeRawUnsafe(`UPDATE public.admin_users SET "sessionVersion"=0 WHERE id=$1`, IDS.caixaA)
  })

  it("S16 agente: token inválido/revogado, Origin de navegador e payload adulterado são recusados", async () => {
    const bad = await fetch(server.url + "/api/print/agent/claim", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer opa1.00000000-0000-0000-0000-000000000000." + "A".repeat(43) }, body: "{}" })
    expect(bad.status).toBe(401)
    const browserish = await fetch(server.url + "/api/print/agent/claim", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tokenA, origin: "https://evil.example" }, body: "{}" })
    expect(browserish.status).toBe(403)
    const tampered = newAgent(tokenA, spoolerA, server)
    const before = spoolerA.spooled.length
    await tampered.handle({ attemptId: "00000000-0000-4000-8000-000000000001", sendKey: "00000000-0000-4000-8000-000000000002", printerName: "POS-80 (simulada)", documentLabel: "x",
      payloadBase64: Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1d, 0x56, 0x00]).toString("base64"), payloadHash: "0".repeat(64) })
    expect(spoolerA.spooled.length).toBe(before)
    // Revoke store B installation: its credential stops working at once.
    const sale = await confirmedSale(prisma, IDS.storeB)
    await createJob(sale.id, IDS.t1B, sessionOf(IDS.caixaB), IDS.storeB)
    expect((await admin({ action: "revokeInstallation", installationId: installB }, sessionOf(IDS.platform), IDS.storeB)).status).toBe(200)
    await expect(agentB.tick()).rejects.toMatchObject({ status: 401 })
    expect((await createJob((await confirmedSale(prisma, IDS.storeB)).id, IDS.t1B, sessionOf(IDS.caixaB), IDS.storeB)).body.error).toBe("TERMINAL_PRINTER_NOT_CONFIGURED")
  })

  it("S17 reinício da aplicação: instâncias novas do núcleo continuam o ledger; mesmo job, sem duplicar", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id)
    runtime = { ...runtime } // new handler/core objects; same deployment keys
    const core = new DirectPrintCore(db, runtime.crypto, runtime.policy)
    const again = await core.latestForSale({ principalId: IDS.caixaA, observedSessionVersion: 0 }, IDS.storeA, sale.id)
    expect(again?.jobId).toBe(r.body.job.jobId)
    await agentA.tick()
    expect((await getJob(r.body.job.jobId)).body.job.phase).toBe("IN_PRINTER_QUEUE")
  })

  it("S18 limites e abuso: rate limit por principal, campos desconhecidos (SSRF/host/porta/bytes) e corpo grande", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    for (const field of ["host", "port", "data", "printerName", "html", "url"]) {
      expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, { [field]: "127.0.0.1" })).body.error).toBe("UNKNOWN_FIELD")
    }
    const big = await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, { uiContextId: "x".repeat(20000) })
    expect(big.status).toBe(413)
    const limited = withPolicy(runtime, { maxRequestsPerMinute: 3 })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixa2A), IDS.storeA, {}, limited)).status)
    expect(codes.filter(c => c === 429).length).toBeGreaterThanOrEqual(1)
  })

  it("S19 conteúdo hostil (ESC/GS/DLE/C0, HTML/XSS, bidi; NUL é recusado pelo próprio PostgreSQL) vira texto inerte; sem gaveta; CPF fora do payload", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA, { items: [{ nome: "<script>alert(1)</script>\u001bp\u0001\u0019ú\u0010\u0014\u202eSabão", q: 1, p: 3 }] })
    await prisma.$executeRawUnsafe(`UPDATE public.vendas SET payload=payload||'{"customerCpf":"52998224725"}'::jsonb,"clienteCpf"='52998224725' WHERE id=$1`, sale.id).catch(async () =>
      prisma.$executeRawUnsafe(`UPDATE public.vendas SET payload=payload||'{"customerCpf":"52998224725"}'::jsonb WHERE id=$1`, sale.id))
    const r = await createJob(sale.id)
    expect(r.status).toBe(200)
    await drain(agentA)
    const bytes = Buffer.from(spoolerA.spooled.at(-1).bytes)
    expect(() => validateEscPos(bytes)).not.toThrow()
    expect(bytes.includes(Buffer.from([0x1b, 0x70]))).toBe(false)
    expect(bytes.includes(Buffer.from([0x10, 0x14]))).toBe(false)
    expect(bytes.toString("latin1")).toContain("<script>alert(1)</script>") // printed as inert text; never interpreted
    expect(bytes.toString("latin1")).not.toContain("52998224725")
    expect(JSON.stringify((await getJob(r.body.job.jobId)).body)).not.toMatch(/token|credential|cipher|52998224725/i)
  })

  it("S20 integridade comercial: impressão, falhas, retries, segunda via e reinícios não alteram venda/estoque/caixa/financeiro", async () => {
    const sales = [await confirmedSale(prisma, IDS.storeA), await confirmedSale(prisma, IDS.storeA), await confirmedSale(prisma, IDS.storeA)]
    const before = await commercialDigest(prisma)
    await createJob(sales[0].id); await agentA.tick()
    spoolerA.printers.get("POS-80 (simulada)")!.online = false
    const j = (await createJob(sales[1].id)).body.job.jobId; await agentA.tick()
    spoolerA.printers.get("POS-80 (simulada)")!.online = true
    await retry(j); await agentA.tick()
    spoolerA.faults.push("WRITE_FAIL"); await createJob(sales[2].id); await agentA.tick()
    await reprint(sales[2].id, IDS.t1A, "UNCERTAIN_RESULT"); await agentA.tick()
    await newAgent(tokenA, spoolerA, server).tick()
    expect(await commercialDigest(prisma)).toBe(before)
  })

  it("S21 P11: COMMAND_LIMIT, SNAPSHOT_LIMIT e PAYLOAD_LIMIT específicos, com zero job/tentativa/efeito", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const jobsOf = async () => (await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_jobs j JOIN public.print_documents d ON d.id=j.document_id WHERE d.sale_id=$1`, sale.id))[0].n
    const rt = (p: Json) => withPolicy(runtime, p)
    const before = spoolerA.spooled.length
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.adminA), IDS.storeA, {}, rt({ commandBytes: 64 }))).body.error).toBe("COMMAND_LIMIT")
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.adminA), IDS.storeA, {}, rt({ snapshotBytes: 200 }))).body.error).toBe("SNAPSHOT_LIMIT")
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.adminA), IDS.storeA, {}, rt({ payloadBytes: 200 }))).body.error).toBe("PAYLOAD_LIMIT")
    expect((await createJob(sale.id, IDS.t1A, sessionOf(IDS.adminA), IDS.storeA, { copies: 3 })).body.error).toBe("COPIES_LIMIT") // configuration error: never a fallback to the unregistered flow
    const many = await confirmedSale(prisma, IDS.storeA, { items: Array.from({ length: 5 }, (_, i) => ({ nome: "Item " + i, q: 1, p: 1 })) })
    expect((await createJob(many.id, IDS.t1A, sessionOf(IDS.adminA), IDS.storeA, {}, rt({ maxItems: 4 }))).body.error).toBe("ITEM_LIMIT")
    expect(await jobsOf()).toBe(0)
    await drain(agentA)
    expect(spoolerA.spooled.length).toBe(before)
  })
  const agentPost = (p: string, body: Json, token = tokenA) => fetch(server.url + p, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify(body) })
  const attemptsOf = (jobId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT a.id,a.result,c.send_key,c.state FROM public.print_attempts a JOIN public.print_copies c ON c.id=a.copy_id WHERE a.job_id=$1::uuid ORDER BY a.number`, jobId)

  it("S22 P02/B05 chave com comando alterado ou de outra identidade; I01 A01; I03 módulo; I05 quarentena; I06 terminal inativo; I07 código de uso único; B16 UNKNOWN tardio não rebaixa", async () => {
    const core = new DirectPrintCore(db, runtime.crypto, runtime.policy)
    const auth = { principalId: IDS.caixaA, observedSessionVersion: 0 }
    const sale = await confirmedSale(prisma, IDS.storeA)
    const p = await core.prepare(auth, IDS.storeA, { saleId: sale.id, kind: "INITIAL", terminalId: IDS.t1A })
    await expect(core.create(auth, p.key, { ...p.command, copies: 2 })).rejects.toMatchObject({ code: "REQUEST_CONFLICT" })
    await expect(core.create({ principalId: IDS.caixa2A, observedSessionVersion: 0 }, p.key, p.command)).rejects.toMatchObject({ code: "REQUEST_EXPIRED" })
    const j = await core.create(auth, p.key, p.command)
    expect(j.replay).toBe(false)
    expect(await core.create(auth, p.key, p.command)).toMatchObject({ jobId: j.jobId, replay: true })
    const s2 = await confirmedSale(prisma, IDS.storeA)
    expect((await createJob(s2.id, IDS.t1A, sessionOf(IDS.platform))).status).toBe(200) // A01 with explicit store
    await prisma.$executeRawUnsafe(`UPDATE public.stores SET "moduleAccess"='{"version":1,"modules":["home","catalog"]}'::jsonb WHERE id=$1`, IDS.storeA)
    const s3 = await confirmedSale(prisma, IDS.storeA)
    expect((await createJob(s3.id)).status).toBe(403)
    await prisma.$executeRawUnsafe(`UPDATE public.stores SET "moduleAccess"='{"version":1,"modules":["home","pdv","sales","cash","catalog","stock","reports","settings"]}'::jsonb WHERE id=$1`, IDS.storeA)
    await prisma.$executeRawUnsafe(`UPDATE public.vendas SET payload=payload||'{"quarantine":{"reason":"lab"}}'::jsonb WHERE id=$1`, s3.id)
    expect((await createJob(s3.id)).body.error).toBe("DOCUMENT_INELIGIBLE")
    await prisma.$executeRawUnsafe(`UPDATE public.pdv_terminais SET status='INACTIVE' WHERE id=$1`, IDS.t2A)
    expect((await createJob((await confirmedSale(prisma, IDS.storeA)).id, IDS.t2A)).body.error).toBe("TERMINAL_UNAVAILABLE")
    await prisma.$executeRawUnsafe(`UPDATE public.pdv_terminais SET status='ACTIVE' WHERE id=$1`, IDS.t2A)
    const created = await admin({ action: "createInstallation", label: "Outro computador" })
    const pair = () => fetch(server.url + "/api/print/agent/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: created.body.pairingCode, agentVersion: "lab" }) })
    expect((await pair()).status).toBe(200)
    expect((await pair()).status).toBe(401)
    expect((await admin({ action: "revokeInstallation", installationId: created.body.installationId })).status).toBe(200)
    await drain(agentA)
    const [att] = await attemptsOf(j.jobId)
    expect(att.result).toBe("SPOOLER_ACCEPTED")
    expect((await agentPost("/api/print/agent/report", { attemptId: att.id, sendKey: att.send_key, result: "UNKNOWN", release: true, reason: "TIMEOUT_AFTER_SUBMIT" })).status).toBe(200)
    expect((await getJob(j.jobId)).body.job.phase).toBe("IN_PRINTER_QUEUE")
    expect((await agentPost("/api/print/agent/report", { attemptId: att.id, sendKey: att.send_key, result: "NO_EFFECT", release: true, reason: "PRINTER_OFFLINE" })).status).toBe(409)
  })

  it("S23 P08 transições inválidas e imutabilidade no modo LOCAL_AGENT são recusadas pelo banco", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id)
    await drain(agentA)
    const [att] = await attemptsOf(r.body.job.jobId)
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_copies SET state='READY' WHERE job_id=$1::uuid`, r.body.job.jobId)).rejects.toThrow(/p004/)
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_attempts SET result='PRE_SEND_FAILED',finished_at=now() WHERE id=$1::uuid`, att.id)).rejects.toThrow(/p004/)
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_copies SET payload_hash=repeat('0',64) WHERE job_id=$1::uuid`, r.body.job.jobId)).rejects.toThrow(/p004 immutable/)
    await expect(prisma.$executeRawUnsafe(`DELETE FROM public.print_jobs WHERE id=$1::uuid`, r.body.job.jobId)).rejects.toThrow(/p004/)
    // SENDING → PRE_SEND_FAILED without an AGENT_NO_EFFECT proof is impossible.
    const short = withPolicy(runtime, { dispatchLeaseMs: 1500 })
    const s2 = await confirmedSale(prisma, IDS.storeA)
    const r2 = await createJob(s2.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, {}, short)
    server.faults.dropResponseOnce.add("/api/print/agent/claim")
    await agentA.tick().catch(() => undefined)
    const [att2] = await attemptsOf(r2.body.job.jobId)
    expect(att2.state).toBe("SENDING")
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_attempts SET result='PRE_SEND_FAILED',finished_at=now() WHERE id=$1::uuid`, att2.id)).rejects.toThrow(/p004 result requires correlated evidence/)
    await drain(agentA) // redelivery to the same instance prints once and releases the printer
    expect((await getJob(r2.body.job.jobId)).body.job.phase).toBe("IN_PRINTER_QUEUE")
  })

  it("S24 P14/B22/B23 venda histórica sem impressão anterior: segunda via fecha o slot INITIAL; INITIAL depois é recusado", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const { quote, res } = await reprint(sale.id, IDS.t1A, "LOST")
    expect(quote).toMatchObject({ possibleAdditionalCopy: false, acceptedCopies: 0, uncertainCopies: 0 })
    expect(res.body.job.kind).toBe("REPRINT")
    const [doc] = await prisma.$queryRawUnsafe<Json[]>(`SELECT initial_state FROM public.print_documents WHERE sale_id=$1`, sale.id)
    expect(doc.initial_state).toBe("HISTORICAL_CLOSED")
    expect((await createJob(sale.id)).body.error).toBe("INITIAL_CLOSED_BY_HISTORICAL_REPRINT")
    await drain(agentA)
    expect(Buffer.from(spoolerA.spooled.at(-1).bytes).toString("latin1")).toContain("SEGUNDA VIA")
  })

  it("S25 B08 dois processos com a mesma credencial disputam uma via: um único envio, sem reentrega cruzada; B14 confirmações concorrentes da segunda via convergem", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    await createJob(sale.id)
    const twin = newAgent(tokenA, spoolerA, server)
    const before = outputs(spoolerA)
    server.faults.dropResponseOnce.add("/api/print/agent/claim") // one of the two loses its claim response
    await Promise.allSettled([agentA.tick(), twin.tick()])
    await Promise.allSettled([agentA.tick(), twin.tick()])
    await Promise.allSettled([agentA.tick(), twin.tick()])
    expect(outputs(spoolerA) - before).toBe(1)
    expect((await ledger(sale.id)).map(x => x.attempts)).toEqual([1])
    const q = await call(direct.quoteReprint, sessionOf(IDS.caixaA), "/api/print/direct/reprint-quote", IDS.storeA, { saleId: sale.id })
    const body = { saleId: sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: q.body.quote.consent }
    const [x, y] = await Promise.all([call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, body), call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, body)])
    expect(x.status).toBe(200); expect(y.status).toBe(200)
    expect(x.body.job.jobId).toBe(y.body.job.jobId)
    await drain(agentA)
    expect((await ledger(sale.id)).map(r => r.kind)).toEqual(["INITIAL", "REPRINT"])
  })

  it("S26 B15/B21 duas vias: aceite + falha → PARCIAL, retry só da via não enviada; I30/B24 via substituída nunca volta a ser reenviada", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(sale.id, IDS.t1A, sessionOf(IDS.caixaA), IDS.storeA, { copies: 2 })
    expect(await agentA.tick()).toBe(1) // the printer (destination) admits one in-flight copy at a time
    spoolerA.printers.get("POS-80 (simulada)")!.online = false
    await agentA.tick()
    spoolerA.printers.get("POS-80 (simulada)")!.online = true
    const v = (await getJob(r.body.job.jobId)).body.job
    expect(v.phase).toBe("PARTIAL")
    expect(v.copies.map((c: Json) => [c.phase, c.canRetry])).toEqual([["IN_PRINTER_QUEUE", false], ["FAILED_BEFORE_SEND", true]])
    expect(Buffer.from(spoolerA.spooled.at(-1).bytes).toString("latin1")).toContain("VIA 1/2")
    // An explicit substitute (second copy) cancels the safe retry of the old via 2 for good.
    await reprint(sale.id, IDS.t1A, "CUSTOMER_REQUEST")
    await drain(agentA)
    expect((await retry(r.body.job.jobId)).body.error).toBe("COPY_NOT_RETRYABLE")
    // An old UNKNOWN copy suppressed by a substitute stays non-retryable even if a late callback says "no effect".
    const s2 = await confirmedSale(prisma, IDS.storeA)
    spoolerA.faults.push("WRITE_FAIL")
    const r2 = await createJob(s2.id)
    await drain(agentA)
    const [old] = await attemptsOf(r2.body.job.jobId)
    await reprint(s2.id, IDS.t1A, "UNCERTAIN_RESULT")
    await drain(agentA)
    expect((await agentPost("/api/print/agent/report", { attemptId: old.id, sendKey: old.send_key, result: "NO_EFFECT", release: true, reason: "PRINTER_OFFLINE" })).status).toBe(200)
    const oldView = (await getJob(r2.body.job.jobId)).body.job
    expect(oldView.copies[0]).toMatchObject({ retrySuppressed: true, canRetry: false })
    expect((await retry(r2.body.job.jobId)).body.error).toBe("COPY_NOT_RETRYABLE")
  })

  it("S27 I29 risco muda entre a consulta e a confirmação → consentimento obsoleto é recusado; nova consulta funciona", async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    await createJob(sale.id)
    const q = await call(direct.quoteReprint, sessionOf(IDS.caixaA), "/api/print/direct/reprint-quote", IDS.storeA, { saleId: sale.id })
    await drain(agentA) // the INITIAL copy changes state after the risk was disclosed
    const stale = await call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, { saleId: sale.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: q.body.quote.consent })
    expect(stale.body.error).toBe("STALE_RISK")
    expect((await reprint(sale.id)).res.status).toBe(200)
  })
  it("S28 P2-4 impressão pelo navegador: registrada, cancela vias térmicas seguras, SEGUNDA VIA quando já pode haver cópia, HTML escapado", async () => {
    const fb = (saleId: string, confirm = false) => call(direct.browserFallback, sessionOf(IDS.caixaA), "/api/print/direct/browser-fallback", IDS.storeA, { saleId, confirm })
    const s1 = await confirmedSale(prisma, IDS.storeA, { items: [{ nome: "<img src=x onerror=alert(1)> Pão", q: 1, p: 2 }] })
    spoolerA.printers.get("POS-80 (simulada)")!.online = false
    const j1 = (await createJob(s1.id)).body.job.jobId
    await drain(agentA)
    spoolerA.printers.get("POS-80 (simulada)")!.online = true
    expect((await getJob(j1)).body.job.phase).toBe("FAILED_BEFORE_SEND")
    const a = await fb(s1.id)
    expect(a.status).toBe(200)
    expect(a.body.fallback).toMatchObject({ requiresConfirmation: false, mark: "VIA IMPRESSA PELO NAVEGADOR" })
    expect(a.body.fallback.html).toContain("&lt;img src=x onerror=alert(1)&gt;")
    expect(a.body.fallback.html).not.toMatch(/<img|<script/i)
    expect((await getJob(j1)).body.job.phase).toBe("CANCELLED") // the safe thermal copy can no longer print later
    expect((await retry(j1)).body.error).toBe("COPY_NOT_RETRYABLE")
    expect((await createJob(s1.id)).body.error).toBe("BROWSER_COPY_ALREADY_ISSUED")
    const q = await call(direct.quoteReprint, sessionOf(IDS.caixaA), "/api/print/direct/reprint-quote", IDS.storeA, { saleId: s1.id })
    expect(q.body.quote).toMatchObject({ possibleAdditionalCopy: true, browserCopies: 1 })
    const s2 = await confirmedSale(prisma, IDS.storeA)
    await createJob(s2.id)
    await drain(agentA)
    const before = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_events e JOIN public.print_documents d ON d.id=e.document_id WHERE d.sale_id=$1 AND e.event_type='BROWSER_FALLBACK_PRINTED'`, s2.id)
    const b0 = await fb(s2.id)
    expect(b0.body.fallback).toMatchObject({ requiresConfirmation: true, possibleAdditionalCopy: true, acceptedCopies: 1 })
    expect(b0.body.fallback.html).toBeUndefined()
    const b1 = await fb(s2.id, true)
    expect(b1.body.fallback.mark).toBe("SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR")
    expect(b1.body.fallback.html).toContain("SEGUNDA VIA - IMPRESSAO PELO NAVEGADOR")
    const after = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.print_events e JOIN public.print_documents d ON d.id=e.document_id WHERE d.sale_id=$1 AND e.event_type='BROWSER_FALLBACK_PRINTED'`, s2.id)
    expect([before[0].n, after[0].n]).toEqual([0, 1])
  })

  it("S29 P2-1 relatório recusado de forma transitória é reenviado e libera a impressora; P2-3 envio lento não vira incerto; risco mudado na T3 → RISK_CHANGED", async () => {
    for (const fail of [{ status: 404, error: "DIRECT_PRINT_DISABLED" }, { status: 409, error: "LEDGER_GUARD" }, { status: 503, error: "LEDGER_BUSY" }]) {
      const s = await confirmedSale(prisma, IDS.storeA)
      const j = (await createJob(s.id)).body.job.jobId
      server.faults.failOnce.set("/api/print/agent/report", fail)
      await agentA.tick().catch(() => undefined) // first report refused transiently, re-sent right after the dispatch
      await agentA.tick()
      expect(server.faults.failOnce.size).toBe(0) // the refusal really happened
      expect(server.requests.filter(r => r === "POST /api/print/agent/report").length).toBeGreaterThanOrEqual(2)
      expect((await getJob(j)).body.job.phase).toBe("IN_PRINTER_QUEUE")
    }
    const saved = runtime
    runtime = withPolicy(runtime, { dispatchLeaseMs: 800 })
    try {
      const slow = newAgent(tokenA, spoolerA, server, { submitTimeoutMs: 5000 })
      spoolerA.faults.push("SLOW_SUBMIT") // 1.5 s inside the spooler, longer than the 0.8 s dispatch lease
      const s = await confirmedSale(prisma, IDS.storeA)
      const j = (await createJob(s.id)).body.job.jobId
      await slow.tick()
      expect((await getJob(j)).body.job.phase).toBe("IN_PRINTER_QUEUE")
      slow.releaseLock()
    } finally { runtime = saved }
    const s3 = await confirmedSale(prisma, IDS.storeA)
    spoolerA.faults.push("TIMEOUT_AFTER")
    const j3 = (await createJob(s3.id)).body.job.jobId
    await drain(agentA)
    expect((await getJob(j3)).body.job.phase).toBe("UNCERTAIN")
    const [old] = await attemptsOf(j3)
    const { res } = await reprint(s3.id, IDS.t1A, "UNCERTAIN_RESULT")
    expect((await agentPost("/api/print/agent/report", { attemptId: old.id, sendKey: old.send_key, result: "SPOOLER_ACCEPTED", release: true, spoolJobId: "77" })).status).toBe(200)
    const before = outputs(spoolerA)
    await drain(agentA)
    expect(outputs(spoolerA)).toBe(before)
    expect((await getJob(res.body.job.jobId)).body.job.copies[0]).toMatchObject({ phase: "CANCELLED", reason: "RISK_CHANGED" })
  })

  it("S30 P3-4 INITIAL só da venda do próprio caixa e dentro da janela; terminal restrito ao navegador autorizado", async () => {
    const own = await confirmedSale(prisma, IDS.storeA, { terminalId: IDS.t1A })
    expect((await createJob(own.id, IDS.t2A)).body.error).toBe("TERMINAL_MISMATCH")
    expect((await createJob(own.id, IDS.t1A)).status).toBe(200)
    const old = await confirmedSale(prisma, IDS.storeA, { minutesAgo: 120 })
    expect((await createJob(old.id)).body.error).toBe("INITIAL_WINDOW_EXPIRED")
    expect((await reprint(old.id)).res.status).toBe(200)
    const bind = (extra: Record<string, string>, restrict: boolean) => call(direct.adminAction, sessionOf(IDS.adminA), "/api/print/direct/admin", IDS.storeA,
      { action: "bindTerminal", terminalId: IDS.t2A, installationId: installA, printerName: "POS-58 (simulada)", profileId: "THERMAL_58", restrictToThisBrowser: restrict }, runtime, extra)
    expect((await bind({}, true)).body.error).toBe("DEVICE_ID_REQUIRED")
    expect((await bind({ "x-omni-device-id": "caixa-2-device" }, true)).status).toBe(200)
    const s = await confirmedSale(prisma, IDS.storeA)
    const mk = (dev?: string) => call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA, { saleId: s.id, kind: "INITIAL", terminalId: IDS.t2A }, runtime, dev ? { "x-omni-device-id": dev } : {})
    expect((await mk()).body.error).toBe("DEVICE_NOT_AUTHORIZED")
    expect((await mk("outro-navegador")).status).toBe(403)
    expect((await mk("caixa-2-device")).status).toBe(200)
    expect((await bind({}, false)).status).toBe(200)
    await drain(agentA)
  })

  it("S31 G-AUTH (I12): sessão revogada DEPOIS do envio — o ACK atrasado do agente é registrado, nada é reenviado e a sessão antiga perde acesso", async () => {
    const journal = path.join(journals, "gauth.jsonl")
    // Bytes reach the spooler, then the network to the server drops before the report (the ACK is delayed).
    const delayed = newAgent(tokenA, spoolerA, server, { hooks: { afterSubmitBeforeJournal: () => { server.faults.refuseAll = true } } }, journal)
    try {
      const sale = await confirmedSale(prisma, IDS.storeA)
      const r = await createJob(sale.id)
      const before = outputs(spoolerA)
      await delayed.tick().catch(() => undefined)
      expect(outputs(spoolerA) - before).toBe(1)
      const [pending] = await prisma.$queryRawUnsafe<Json[]>(`SELECT a.result FROM public.print_attempts a WHERE a.job_id=$1::uuid`, r.body.job.jobId)
      expect(pending.result).toBe("STARTED") // the ACK really is still missing on the server
      // While the ACK is pending, the cashier session is revoked (sessionVersion+1 = the effect of a global logout).
      await prisma.$executeRawUnsafe(`UPDATE public.admin_users SET "sessionVersion"="sessionVersion"+1 WHERE id=$1`, IDS.caixaA)
      server.faults.refuseAll = false
      await drain(delayed) // the report is authenticated by the agent credential, not by the user session
      expect((await getJob(r.body.job.jobId)).status).toBe(401) // old session (version 0) lost access
      expect((await createJob(sale.id)).status).toBe(401)
      const v = (await getJob(r.body.job.jobId, sessionOf(IDS.caixaA, 1))).body.job
      expect(v.phase).toBe("IN_PRINTER_QUEUE") // late ACK recorded: the evidence of the paper is kept
      await drain(agentA)
      expect(outputs(spoolerA) - before).toBe(1) // never re-sent
    } finally {
      server.faults.refuseAll = false
      delayed.releaseLock()
      await prisma.$executeRawUnsafe(`UPDATE public.admin_users SET "sessionVersion"=0 WHERE id=$1`, IDS.caixaA)
    }
  })

  it("S32 D03 rotação da chave de conteúdo com tentativa em voo: o claim não trava; a via em voo nunca é reenviada; venda nova imprime", async () => {
    const saved = runtime
    runtime = withPolicy(runtime, { dispatchLeaseMs: 1000, sendLeaseMs: 1000 })
    try {
      const s1 = await confirmedSale(prisma, IDS.storeA)
      const j1 = (await createJob(s1.id)).body.job.jobId
      server.faults.dropResponseOnce.add("/api/print/agent/claim")
      await agentA.tick().catch(() => undefined) // attempt STARTED for this instance; the agent never saw it
      const [live] = await prisma.$queryRawUnsafe<Json[]>(`SELECT c.lease_until>clock_timestamp() live FROM public.print_copies c WHERE c.job_id=$1::uuid`, j1)
      expect(live.live).toBe(true) // the redelivery path is really exercised (lease still valid)
      const before = outputs(spoolerA)
      const rotated = new PrintCrypto(randomBytes(32), randomBytes(32))
      runtime = { ...runtime, crypto: rotated } // keys rotated
      await expect(agentA.tick()).resolves.toBeTypeOf("number") // redelivery skipped, the claim answers normally
      expect(outputs(spoolerA)).toBe(before)
      await sleep(1200) // lease lapses → UNKNOWN, never re-sent
      expect((await getJob(j1)).body.job.phase).toBe("UNCERTAIN")
      runtime = { ...saved, crypto: rotated } // normal leases again (a 1 s lease is below the agent send budget)
      const s2 = await confirmedSale(prisma, IDS.storeA)
      const j2 = (await createJob(s2.id)).body.job.jobId
      await agentA.tick() // answers the query for the old attempt (NOT_FOUND_IN_JOURNAL → stays UNKNOWN, printer released)
      await drain(agentA)
      expect(outputs(spoolerA) - before).toBe(1)
      expect((await getJob(j2)).body.job.phase).toBe("IN_PRINTER_QUEUE")
      expect((await getJob(j1)).body.job.phase).toBe("UNCERTAIN")
    } finally { runtime = saved }
  })

  it("S33 D03 expurgo de conteúdo em via finalizada: único sentido, sem DELETE; a identidade anti-duplicata continua valendo", async () => {
    const s = await confirmedSale(prisma, IDS.storeA)
    const r = await createJob(s.id)
    await drain(agentA)
    const jobId = r.body.job.jobId
    expect((await getJob(jobId)).body.job.phase).toBe("IN_PRINTER_QUEUE")
    const x = (q: string) => prisma.$executeRawUnsafe(q, jobId)
    expect(await x(`UPDATE public.print_copies SET payload_cipher=NULL,payload_key_ref=NULL,payload_purged_at=now() WHERE job_id=$1::uuid`)).toBeGreaterThan(0)
    expect(await x(`UPDATE public.print_jobs SET snapshot_cipher=NULL,snapshot_key_ref=NULL,snapshot_purged_at=now() WHERE id=$1::uuid`)).toBeGreaterThan(0)
    expect(await x(`UPDATE public.print_requests SET command=NULL,command_purged_at=now() WHERE job_id=$1::uuid`)).toBeGreaterThan(0)
    expect(await x(`UPDATE public.print_events SET details=NULL,details_purged_at=now()
      WHERE document_id=(SELECT document_id FROM public.print_jobs WHERE id=$1::uuid) AND details IS NOT NULL`)).toBeGreaterThan(0)
    // One way only: no second purge stamp, no restored content, no deleted ledger rows.
    await expect(x(`UPDATE public.print_copies SET payload_purged_at=now()+interval '1 day' WHERE job_id=$1::uuid`)).rejects.toThrow(/p004/)
    await expect(x(`UPDATE public.print_copies SET payload_cipher='\\x00'::bytea,payload_key_ref='k',payload_purged_at=NULL WHERE job_id=$1::uuid`)).rejects.toThrow(/p004|payload_ck/)
    await expect(x(`DELETE FROM public.print_copies WHERE job_id=$1::uuid`)).rejects.toThrow(/p004/)
    await expect(x(`DELETE FROM public.print_jobs WHERE id=$1::uuid`)).rejects.toThrow(/p004/)
    // The anti-duplicate identity survives the purge: a new INITIAL for the same sale converges and nothing prints.
    const before = outputs(spoolerA)
    const again = await createJob(s.id)
    expect(again.body.job.jobId).toBe(jobId)
    await drain(agentA)
    expect(outputs(spoolerA)).toBe(before)
  })
  it("S34 D01-A1 reimpressão do Histórico/Conferência pelo navegador: sempre SEGUNDA VIA, consentimento preso ao risco, concorrência, permissão e loja", async () => {
    const quote = async (saleId: string, session = sessionOf(IDS.caixaA)) =>
      (await call(direct.quoteReprint, session, "/api/print/direct/reprint-quote", IDS.storeA, { saleId })).body.quote as Json
    const fb = (saleId: string, consent: unknown, extra: Json = {}, session = sessionOf(IDS.caixaA), storeId = IDS.storeA) =>
      call(direct.browserFallback, session, "/api/print/direct/browser-fallback", storeId, { saleId, confirm: false, origin: "REPRINT", consent, ...extra })
    const events = async (saleId: string) => prisma.$queryRawUnsafe<Json[]>(`SELECT e.details->>'origin' origin,e.actor_user_id actor FROM public.print_events e
      JOIN public.print_documents d ON d.id=e.document_id WHERE d.sale_id=$1 AND e.event_type='BROWSER_FALLBACK_PRINTED' ORDER BY e.created_at`, saleId)

    // A sale with no registered copy still prints marked as a second copy (a reprint by definition) and closes INITIAL.
    const s1 = await confirmedSale(prisma, IDS.storeA)
    const q1 = await quote(s1.id)
    expect(q1).toMatchObject({ possibleAdditionalCopy: false, queuedCopies: 0 })
    expect((await fb(s1.id, q1.consent)).body.fallback).toMatchObject({ requiresConfirmation: false, mark: "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR" })
    expect((await createJob(s1.id)).body.error).toBe("BROWSER_COPY_ALREADY_ISSUED")
    // The same (now stale) quote prints nothing: the server answers with the current risk and a new consent bound to it.
    const again = (await fb(s1.id, q1.consent)).body.fallback
    expect(again).toMatchObject({ requiresConfirmation: true, possibleAdditionalCopy: true, browserCopies: 1 })
    expect(typeof again.consent).toBe("string")
    expect((await fb(s1.id, again.consent)).body.fallback).toMatchObject({ requiresConfirmation: false, mark: "SEGUNDA VIA - REIMPRESSAO PELO NAVEGADOR" })
    expect(await events(s1.id)).toEqual([{ origin: "REPRINT", actor: IDS.caixaA }, { origin: "REPRINT", actor: IDS.caixaA }])
    // A consent is single-risk: once used, the risk changed and it asks again.
    expect((await fb(s1.id, again.consent)).body.fallback.requiresConfirmation).toBe(true)

    // Two tabs that BOTH saw a risk (a copy already accepted by the printer): the second one must confirm the new risk.
    const s2 = await confirmedSale(prisma, IDS.storeA)
    await createJob(s2.id); await drain(agentA)
    const [qa, qb] = [await quote(s2.id), await quote(s2.id)]
    expect(qa).toMatchObject({ possibleAdditionalCopy: true, acceptedCopies: 1 })
    expect((await fb(s2.id, qa.consent)).body.fallback.requiresConfirmation).toBe(false)
    const b2 = (await fb(s2.id, qb.consent)).body.fallback
    expect(b2).toMatchObject({ requiresConfirmation: true, acceptedCopies: 1, browserCopies: 1 })
    expect(await events(s2.id)).toHaveLength(1)
    // A thermal reprint on the quoted intent (another tab) also makes the browser quote stale.
    const s3 = await confirmedSale(prisma, IDS.storeA)
    const [q3a, q3b] = [await quote(s3.id), await quote(s3.id)]
    expect((await call(direct.createJob, sessionOf(IDS.caixaA), "/api/print/direct/jobs", IDS.storeA,
      { saleId: s3.id, kind: "REPRINT", terminalId: IDS.t1A, reasonCode: "CUSTOMER_REQUEST", consent: q3a.consent })).status).toBe(200)
    expect((await fb(s3.id, q3b.consent)).body.fallback.requiresConfirmation).toBe(true)
    await drain(agentA)
    // Two simultaneous browser reprints with the same quote: the document lock serializes them — one prints, one must confirm.
    const s4 = await confirmedSale(prisma, IDS.storeA)
    const q4 = await quote(s4.id)
    const both = await Promise.all([fb(s4.id, q4.consent), fb(s4.id, q4.consent)])
    expect(both.map(r => r.body.fallback.requiresConfirmation).sort()).toEqual([false, true])

    // Consent is mandatory, bound to principal/store and unforgeable; origin is validated.
    expect((await fb(s4.id, undefined)).body.error).toBe("RISK_CONFIRMATION_REQUIRED")
    expect((await fb(s4.id, q4.consent.slice(0, -2) + "xx")).status).toBe(403)
    expect((await fb(s4.id, q4.consent, {}, sessionOf(IDS.caixa2A))).body.fallback.requiresConfirmation).toBe(true) // another user's consent
    expect((await fb(s4.id, q4.consent, { origin: "HISTORICO" })).body.error).toBe("INVALID_INPUT")
    // Permission and store isolation: a technician (no sales module) and another store's user cannot reprint.
    expect((await fb(s4.id, q4.consent, {}, sessionOf(IDS.tecnicoA))).status).toBe(403)
    expect((await fb(s4.id, q4.consent, {}, sessionOf(IDS.caixaB), IDS.storeB)).status).toBe(404)
    expect(await prisma.$queryRawUnsafe<Json[]>(`SELECT 1 FROM public.print_documents WHERE store_id=$1 AND sale_id=$2`, IDS.storeB, s4.id)).toEqual([])
    // A copy still waiting for the agent is disclosed as queued and replaced (cancelled), never printed in addition.
    const s5 = await confirmedSale(prisma, IDS.storeA)
    await createJob(s5.id)
    const q5 = await quote(s5.id)
    expect(q5).toMatchObject({ possibleAdditionalCopy: false, queuedCopies: 1 })
    expect((await fb(s5.id, q5.consent)).body.fallback.requiresConfirmation).toBe(false)
    const before = outputs(spoolerA)
    await drain(agentA)
    expect(outputs(spoolerA)).toBe(before)
    expect((await ledger(s5.id)).map(c => c.state)).toEqual(["CANCELLED"])
  })
})
