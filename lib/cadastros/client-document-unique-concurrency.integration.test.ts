/**
 * CAD-R2-019 — Concorrência REAL contra PostgreSQL descartável.
 *
 * Gateado por `CAD_R2_019_TEST_DATABASE_URL`: pula fora de CI local sem
 * banco (`describe.skipIf`). Na validação do GOAL, aponta para um Postgres
 * descartável com as migrations 0020+0021 aplicadas.
 *
 * Prova ponta a ponta, sem fakes:
 * - duas criações paralelas (mesma store, mesmo documento forte, formatos
 *   distintos máscara/dígitos) → só uma persiste; a outra vira erro de
 *   domínio seguro (IDENTITY_REVIEW_REQUIRED/EXACT_DOCUMENT_MATCH, 409);
 * - update concorrente para a mesma chave → idem;
 * - cross-store permitido; múltiplos NULL permitidos;
 * - merge 018-B não é testado aqui (fakes com unique fiel cobrem a ordem).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type { ClientWriteContext } from "@/lib/cadastros/client-write-contract"
import { mapClientWriteFailureToResponse } from "@/lib/cadastros/client-write-http"
import {
  createClient,
  updateClient,
  type ClientWriteDb,
} from "@/lib/cadastros/client-write-service"

const TEST_URL = process.env.CAD_R2_019_TEST_DATABASE_URL ?? ""

const CPF_A = "529.982.247-25"
const CPF_A_DIGITS = "52998224725"

const PRINCIPAL: CadastrosAuditPrincipal = {
  userId: "user-1",
  email: "u@x.com",
  role: "ADMIN",
  displayLabel: "U",
}

describe.skipIf(!TEST_URL)("CAD-R2-019 — concorrência real (PostgreSQL descartável)", () => {
  const db = new PrismaClient({ datasourceUrl: TEST_URL })
  const realDb = db as unknown as ClientWriteDb & {
    cliente: {
      create(args: unknown): Promise<{ id: string }>
      deleteMany(args: unknown): Promise<unknown>
      count(args: unknown): Promise<number>
    }
    store: { upsert(args: unknown): Promise<unknown>; deleteMany(args: unknown): Promise<unknown> }
  }

  const run = `r2-019-${Date.now()}`
  const storeA = `${run}-a`
  const storeB = `${run}-b`

  function ctx(storeId: string): ClientWriteContext {
    return { storeId, principal: PRINCIPAL }
  }

  beforeAll(async () => {
    await realDb.store.upsert({
      where: { id: storeA },
      update: {},
      create: { id: storeA, name: "R2-019 A" },
    })
    await realDb.store.upsert({
      where: { id: storeB },
      update: {},
      create: { id: storeB, name: "R2-019 B" },
    })
  })

  afterAll(async () => {
    await realDb.cliente.deleteMany({ where: { storeId: { in: [storeA, storeB] } } }).catch(() => {})
    await realDb.store.deleteMany({ where: { id: { in: [storeA, storeB] } } }).catch(() => {})
    await db.$disconnect()
  })

  it("create concorrente mesma store/documento: só uma persiste (409, sem PII)", async () => {
    const dbA = { ...realDb } as unknown as ClientWriteDb
    const [r1, r2] = await Promise.all([
      createClient(ctx(storeA), { nome: "Ana 1", documento: CPF_A }, undefined, { db: dbA }),
      createClient(ctx(storeA), { nome: "Ana 2", documento: CPF_A_DIGITS }, undefined, { db: dbA }),
    ])
    const oks = [r1, r2].filter((r) => r.ok)
    const fails = [r1, r2].filter((r) => !r.ok)
    // Sob corrida real, pelo menos a unicidade por lookup bloqueia uma; se
    // ambas passarem do lookup, o banco (P2002) fecha — nunca duas linhas.
    expect(oks.length + fails.length).toBe(2)
    const count = await realDb.cliente.count({
      where: { storeId: storeA, documentKey: CPF_A_DIGITS },
    })
    expect(count).toBe(1)
    if (fails.length > 0) {
      const fail = fails[0]
      if (!fail.ok) {
        expect(fail.code).toBe("IDENTITY_REVIEW_REQUIRED")
        expect(fail.outcome).toBe("EXACT_DOCUMENT_MATCH")
        expect(mapClientWriteFailureToResponse(fail).status).toBe(409)
        expect(JSON.stringify(fail)).not.toContain(CPF_A_DIGITS)
      }
    }
  })

  it("update concorrente para a mesma chave: só um persiste", async () => {
    const dbA = { ...realDb } as unknown as ClientWriteDb
    const c1 = await createClient(ctx(storeA), { nome: "C1" }, undefined, { db: dbA })
    const c2 = await createClient(ctx(storeA), { nome: "C2" }, undefined, { db: dbA })
    if (!c1.ok || !c2.ok) throw new Error("setup falhou")
    const [r1, r2] = await Promise.all([
      updateClient(ctx(storeA), c1.id, { documento: CPF_A }, undefined, { db: dbA }),
      updateClient(ctx(storeA), c2.id, { documento: CPF_A_DIGITS }, undefined, { db: dbA }),
    ])
    const oks = [r1, r2].filter((r) => r.ok)
    expect(oks.length).toBeLessThanOrEqual(1)
    const count = await realDb.cliente.count({
      where: { storeId: storeA, documentKey: CPF_A_DIGITS },
    })
    expect(count).toBe(1)
    for (const r of [r1, r2]) {
      if (!r.ok) expect(r.code).not.toBe("PERSISTENCE")
    }
  })

  it("cross-store permitido e múltiplos NULL permitidos no banco real", async () => {
    const dbA = { ...realDb } as unknown as ClientWriteDb
    const cross = await createClient(ctx(storeB), { nome: "Cross", documento: CPF_A }, undefined, { db: dbA })
    expect(cross.ok).toBe(true)
    const e1 = await createClient(ctx(storeB), { nome: "Vazio 1", documento: "" }, undefined, { db: dbA })
    const e2 = await createClient(ctx(storeB), { nome: "Vazio 2", documento: "invalido" }, undefined, { db: dbA })
    expect(e1.ok).toBe(true)
    expect(e2.ok).toBe(true)
  })

  it("segunda create sequencial com mesmo documento é bloqueada no lookup", async () => {
    const dbA = { ...realDb } as unknown as ClientWriteDb
    const dup = await createClient(ctx(storeB), { nome: "Duplo", documento: CPF_A_DIGITS }, undefined, {
      db: dbA,
    })
    expect(dup.ok).toBe(false)
    if (!dup.ok) {
      expect(dup.code).toBe("IDENTITY_REVIEW_REQUIRED")
      expect(dup.outcome).toBe("EXACT_DOCUMENT_MATCH")
    }
  })
})
