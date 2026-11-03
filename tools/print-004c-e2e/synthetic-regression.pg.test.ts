/**
 * Regression: the 004B SYNTHETIC_ONLY core keeps working on the schema extended by the 004C LOCAL_AGENT migration,
 * and proofs never cross execution modes. Disposable PostgreSQL only (PRINT_PG_URL → print_lab_*).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomBytes, randomUUID } from "node:crypto"
import { PrintCoreSynthetic } from "@/lib/print-core-synthetic/core"
import { FixtureCrypto, hash } from "@/lib/print-core-synthetic/codec"
import { SyntheticBoundary } from "@/lib/print-core-synthetic/simulator"
import { confirmedSale, IDS, labPrisma, prismaDatabase, seed } from "./lab-env"

const URL_ = process.env.PRINT_PG_URL
type Json = Record<string, any>

describe.skipIf(!URL_)("004B synthetic core on the 004C-extended schema", { timeout: 60_000 }, () => {
  const prisma = labPrisma(URL_ ?? "postgresql://x@127.0.0.1/print_lab_unused")
  const db = prismaDatabase(prisma as never)
  const crypto = new FixtureCrypto(randomBytes(32), randomBytes(32))
  const boundary = new SyntheticBoundary(crypto)
  const core = new PrintCoreSynthetic(db as never, crypto, boundary, { requestMs: 60_000, authorizationMs: 120_000, contentMs: 300_000, leaseMs: 30_000,
    riskMs: 60_000, maxCopies: 2, maxItems: 50, maxBytes: 65_536, maxRequestsPerMinute: 100, expiredRequestRetentionMs: 1000 })
  const auth = { principalId: IDS.caixaA, observedSessionVersion: 0 }
  const terminal = "p004c-term-syn"
  let binding = ""

  beforeAll(async () => {
    const seeded = await prisma.$queryRawUnsafe<Json[]>(`SELECT count(*)::int n FROM public.stores WHERE id=$1`, IDS.storeA)
    if (!seeded[0].n) await seed(prisma)
    await prisma.$executeRawUnsafe(`INSERT INTO public.pdv_terminais(id,"storeId",code,name,"updatedAt") VALUES ($1,$2,'PDV9','Sintético',now())`, terminal, IDS.storeA)
    const inst = randomUUID(), dest = randomUUID()
    binding = randomUUID()
    await prisma.$executeRawUnsafe(`INSERT INTO public.print_installations(id,identity_hash,proof_mode) VALUES ($1::uuid,$2,'SYNTHETIC')`, inst, hash("i", inst))
    await prisma.$executeRawUnsafe(`INSERT INTO public.print_destinations(id,identity_hash,serialization_mode) VALUES ($1::uuid,$2,'SYNTHETIC')`, dest, hash("d", dest))
    await prisma.$executeRawUnsafe(`INSERT INTO public.print_bindings(id,store_id,binding_id,version,terminal_id,installation_id,destination_id,transport_destination_ref,profile_id,profile_version,profile_hash,profile,state,family,configured_by_id)
      VALUES ($1::uuid,$2,$3::uuid,1,$4,$5::uuid,$6::uuid,'synthetic','SYN80',1,$7,'{}'::jsonb,'ACTIVE','SALE_RECEIPT',$8)`, binding, IDS.storeA, randomUUID(), terminal, inst, dest, hash("p", "SYN80"), IDS.adminA)
  })
  afterAll(async () => { await prisma.$disconnect() })

  const job = async () => {
    const sale = await confirmedSale(prisma, IDS.storeA)
    const p = await core.prepare(auth, { storeId: IDS.storeA, saleId: sale.id, kind: "INITIAL", terminalId: terminal, bindingVersionId: binding })
    const j = await core.create(auth, p.key, p.command)
    const [copy] = await prisma.$queryRawUnsafe<Json[]>(`SELECT id FROM public.print_copies WHERE job_id=$1::uuid`, j.jobId)
    const r = await core.ready(auth, IDS.storeA, j.jobId, copy.id, "lab-worker")
    return { jobId: j.jobId, copyId: copy.id, epoch: r.epoch }
  }
  const destinationHeld = async () => (await prisma.$queryRawUnsafe<Json[]>(`SELECT q.held_attempt_id FROM public.print_destinations q JOIN public.print_bindings b ON b.destination_id=q.id WHERE b.id=$1::uuid`, binding))[0].held_attempt_id

  it("R1 ACCEPT → TRANSPORT_ACCEPTED e destino liberado", async () => {
    const j = await job()
    await core.execute(auth, IDS.storeA, j.jobId, j.copyId, "lab-worker", j.epoch, "ACCEPT")
    expect((await core.get(auth, IDS.storeA, j.jobId)).state).toBe("TRANSPORT_ACCEPTED")
    expect(await destinationHeld()).toBeNull()
  })
  it("R2 NO_EFFECT → PRE_SEND_FAILED com prova sintética; R3 UNKNOWN mantém destino retido", async () => {
    const a = await job()
    await core.execute(auth, IDS.storeA, a.jobId, a.copyId, "lab-worker", a.epoch, "NO_EFFECT")
    expect((await core.get(auth, IDS.storeA, a.jobId)).state).toBe("PRE_SEND_FAILED")
    const b = await job()
    await core.execute(auth, IDS.storeA, b.jobId, b.copyId, "lab-worker", b.epoch, "UNKNOWN")
    expect((await core.get(auth, IDS.storeA, b.jobId)).state).toBe("UNKNOWN")
    expect(await destinationHeld()).not.toBeNull()
  })
  it("R4 provas não cruzam modos: evento AGENT_* em tentativa SYNTHETIC é recusado; modo de execução é imutável", async () => {
    const [a] = await prisma.$queryRawUnsafe<Json[]>(`SELECT a.* FROM public.print_attempts a JOIN public.print_jobs j ON j.id=a.job_id WHERE j.execution_mode='SYNTHETIC_ONLY' AND a.result='UNKNOWN' LIMIT 1`)
    await expect(prisma.$executeRawUnsafe(`INSERT INTO public.print_events(id,store_id,scope_kind,document_id,job_id,copy_id,attempt_id,destination_id,event_type,proof_kind,evidence_hash,evidence_key,actor_kind)
      VALUES ($1::uuid,$2,'DOCUMENT',$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7::uuid,'FORGED','AGENT_EGRESS_CLOSED',$8,'forged','LOCAL_AGENT')`,
      randomUUID(), a.store_id, a.document_id, a.job_id, a.copy_id, a.id, a.destination_id, "0".repeat(64))).rejects.toThrow(/p004 proof must identify/)
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_jobs SET execution_mode='LOCAL_AGENT' WHERE id=$1::uuid`, a.job_id)).rejects.toThrow(/p004 immutable/)
    await expect(prisma.$executeRawUnsafe(`UPDATE public.print_destinations SET held_attempt_id=NULL,held_store_id=NULL,gate_epoch=gate_epoch+1 WHERE id=$1::uuid`, a.destination_id)).rejects.toThrow(/p004/)
  })
})
