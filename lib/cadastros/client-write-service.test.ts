/**
 * CAD-R2-008 — Testes focados do ClientWriteService.
 *
 * Sem banco: fake em memória via `deps.db`. Cobre autoridade, IDOR,
 * omit vs clear, identidade/dedupe, revisão explícita, force ignorado,
 * audit atômico, ausência de IA/PII e variantes Tx sem nested transaction.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma"
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type { ClientIdentityRecord } from "@/lib/cadastros/client-identity"
import { createMemoryClientIdentitySource, toStrongDocumentKey } from "@/lib/cadastros/client-identity"
import type { ClientWriteContext, ClientWriteInput } from "@/lib/cadastros/client-write-contract"
import {
  CLIENT_WRITE_AUDIT_SOURCE,
  CLIENT_WRITE_CONCURRENCY_GAP,
  createClient,
  createClientTx,
  updateClient,
  updateClientTx,
  type ClientWriteDb,
  type ClientWriteFoundRow,
  type ClientWriteTx,
} from "@/lib/cadastros/client-write-service"

const CPF_A = "529.982.247-25"
const CPF_B = "390.533.447-05"
const PHONE_A = "11988887777"
const PHONE_B = "11977776666"

const PRINCIPAL: CadastrosAuditPrincipal = {
  userId: "user-1",
  email: "u@x.com",
  role: "ADMIN",
  displayLabel: "U",
}

function ctx(storeId = "loja-a", principal: CadastrosAuditPrincipal | null = PRINCIPAL): ClientWriteContext {
  return { storeId, principal }
}

type FakeRow = ClientWriteFoundRow
type AuditRow = {
  action: string
  userLabel: string
  detail: string
  metadata: string
  source: string
}

function seedRow(partial: Partial<FakeRow> & { id: string; storeId: string }): FakeRow {
  const document = partial.document ?? ""
  return {
    name: "Cliente",
    kind: "PF",
    document,
    // Estado pós-backfill: chave derivada do legado (idempotente).
    documentKey: partial.documentKey !== undefined ? partial.documentKey : toStrongDocumentKey(document),
    phone: null,
    email: null,
    city: "",
    tags: null,
    active: true,
    totalSpent: 0,
    lastPurchaseAt: null,
    ...partial,
  }
}

function contains(hay: string | null | undefined, needle: string): boolean {
  return (hay ?? "").includes(needle)
}

function matchIdentityWhere(row: FakeRow, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true
  if (where.storeId !== undefined && row.storeId !== where.storeId) return false
  if (typeof where.id === "string" && row.id !== where.id) return false
  const or = where.OR as Array<Record<string, unknown>> | undefined
  if (Array.isArray(or) && or.length > 0) {
    const hit = or.some((cond) => {
      // CAD-R2-019: caminho canônico exato (documentKey) + fallback legado.
      if (typeof cond.documentKey === "string") return row.documentKey === cond.documentKey
      const doc = cond.document as { contains?: string } | undefined
      if (doc?.contains) return contains(row.document, doc.contains)
      const phone = cond.phone as { contains?: string } | undefined
      if (phone?.contains) return contains(row.phone, phone.contains)
      const email = cond.email as { equals?: string; mode?: string } | undefined
      if (email?.equals) return (row.email ?? "").toLowerCase() === email.equals.toLowerCase()
      return false
    })
    if (!hit) return false
  }
  return true
}

function duplicateKeyError(): Error {
  // Equivalente fiel à UNIQUE (storeId, documentKey) do PostgreSQL.
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the constraint: Cliente_storeId_documentKey_key", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["storeId", "documentKey"] },
  } as never)
}

function assertNoDuplicateKey(rows: Map<string, FakeRow>, storeId: string, key: string | null, excludeId?: string): void {
  if (key === null) return
  for (const row of rows.values()) {
    if (row.id !== excludeId && row.storeId === storeId && row.documentKey === key) {
      throw duplicateKeyError()
    }
  }
}

function makeFakeDb(seed: FakeRow[] = [], opts?: { failAudit?: boolean }) {
  const rows = new Map<string, FakeRow>(seed.map((r) => [r.id, { ...r }]))
  const audits: AuditRow[] = []
  const calls: string[] = []
  let idSeq = 1
  let nested = 0

  const cliente = {
    findMany: async (args: { where?: Record<string, unknown> }) => {
      calls.push("cliente.findMany")
      return [...rows.values()].filter((row) => matchIdentityWhere(row, args.where))
    },
    findFirst: async (args: { where?: Record<string, unknown> }): Promise<FakeRow | null> => {
      calls.push("cliente.findFirst")
      for (const row of rows.values()) {
        if (matchIdentityWhere(row, args.where)) return { ...row }
      }
      return null
    },
    create: async (args: { data: Record<string, unknown>; select?: { id: true } }) => {
      calls.push("tx.cliente.create")
      const id = `c-${idSeq++}`
      const storeId = String(args.data.storeId)
      const documentKey = (args.data.documentKey as string | null) ?? null
      // CAD-R2-019: UNIQUE (storeId, documentKey) como no PostgreSQL.
      assertNoDuplicateKey(rows, storeId, documentKey)
      const row = seedRow({
        id,
        storeId,
        name: String(args.data.name),
        kind: String(args.data.kind ?? "PF"),
        document: String(args.data.document ?? ""),
        documentKey,
        phone: (args.data.phone as string | null) ?? null,
        email: (args.data.email as string | null) ?? null,
        city: String(args.data.city ?? ""),
        tags: (args.data.tags as Prisma.JsonValue | null) ?? null,
        active: args.data.active === undefined ? true : Boolean(args.data.active),
        totalSpent: typeof args.data.totalSpent === "number" ? args.data.totalSpent : 0,
        lastPurchaseAt: (args.data.lastPurchaseAt as Date | null) ?? null,
      })
      rows.set(id, row)
      return { id }
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      calls.push("tx.cliente.update")
      const row = rows.get(args.where.id)
      if (!row) {
        throw new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" })
      }
      const next = { ...row }
      if (args.data.name !== undefined) next.name = String(args.data.name)
      if (args.data.kind !== undefined) next.kind = String(args.data.kind)
      if (args.data.document !== undefined) next.document = String(args.data.document)
      if (args.data.documentKey !== undefined) {
        const key = (args.data.documentKey as string | null) ?? null
        assertNoDuplicateKey(rows, next.storeId, key, next.id)
        next.documentKey = key
      }
      if (args.data.phone !== undefined) next.phone = (args.data.phone as string | null) ?? null
      if (args.data.email !== undefined) next.email = (args.data.email as string | null) ?? null
      if (args.data.city !== undefined) next.city = String(args.data.city)
      if (args.data.tags !== undefined) {
        next.tags = args.data.tags === Prisma.DbNull ? null : (args.data.tags as Prisma.JsonValue | null)
      }
      if (args.data.active !== undefined) next.active = Boolean(args.data.active)
      if (args.data.totalSpent !== undefined) next.totalSpent = Number(args.data.totalSpent)
      if (args.data.lastPurchaseAt !== undefined) next.lastPurchaseAt = args.data.lastPurchaseAt as Date | null
      rows.set(next.id, next)
      return { id: next.id }
    },
  }

  const tx = {
    cliente,
    logsAuditoria: {
      create: async (args: { data: AuditRow }) => {
        calls.push("tx.logsAuditoria.create")
        if (opts?.failAudit) throw new Error("audit down")
        audits.push(args.data)
        return {}
      },
    },
  } as unknown as ClientWriteTx

  const db: ClientWriteDb = {
    cliente: { findFirst: cliente.findFirst },
    $transaction: async <T>(fn: (t: ClientWriteTx) => Promise<T>) => {
      calls.push("$transaction")
      nested += 1
      if (nested > 1) throw new Error("nested transaction")
      const snapRows = new Map([...rows.entries()].map(([k, v]) => [k, { ...v }]))
      const snapAudits = audits.length
      try {
        return await fn(tx)
      } catch (e) {
        rows.clear()
        for (const [k, v] of snapRows) rows.set(k, { ...v })
        audits.splice(snapAudits)
        throw e
      } finally {
        nested -= 1
      }
    },
  }

  return { db, tx, rows, audits, calls }
}

function memorySourceFrom(rows: Map<string, FakeRow>): ReturnType<typeof createMemoryClientIdentitySource> {
  const recs: ClientIdentityRecord[] = [...rows.values()].map((r) => ({
    id: r.id,
    storeId: r.storeId,
    document: r.document,
    phone: r.phone,
    email: r.email,
    name: r.name,
  }))
  return createMemoryClientIdentitySource(recs)
}

describe("ClientWriteService — autoridade", () => {
  it("contexto sem loja é UNTRUSTED_SCOPE sem tocar o banco", async () => {
    const fake = makeFakeDb()
    const res = await createClient({ storeId: "  ", principal: PRINCIPAL }, { nome: "Ana" }, undefined, {
      db: fake.db,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("UNTRUSTED_SCOPE")
    expect(fake.calls).not.toContain("$transaction")
    expect(fake.rows.size).toBe(0)
  })

  it("storeId/actor/force no payload não ampliam autoridade", async () => {
    const fake = makeFakeDb()
    const res = await createClient(ctx("loja-a"), {
      nome: "Ana",
      storeId: "loja-b",
      actor: "hacker",
      principal: { userId: "evil" },
      force: true,
    } as ClientWriteInput, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const row = [...fake.rows.values()][0]
    expect(row.storeId).toBe("loja-a")
    expect(row.storeId).not.toBe("loja-b")
  })

  it("principal nulo audita userLabel vazio — não inventa Operador", async () => {
    const fake = makeFakeDb()
    const res = await createClient(ctx("loja-a", null), { nome: "Ana" }, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
    expect(fake.audits[0]?.userLabel).toBe("")
    expect(fake.audits[0]?.userLabel).not.toBe("Operador")
    const meta = JSON.parse(fake.audits[0]?.metadata ?? "{}") as { actor: unknown }
    expect(meta.actor).toBeNull()
  })
})

describe("ClientWriteService — create / identidade", () => {
  it("NO_MATCH (só nome) persiste", async () => {
    const fake = makeFakeDb()
    const res = await createClient(ctx(), { nome: "Cliente Balcão" }, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
    expect([...fake.rows.values()][0]?.name).toBe("Cliente Balcão")
  })

  it("EXACT_DOCUMENT_MATCH não cria outro cliente", async () => {
    const existing = seedRow({ id: "c-old", storeId: "loja-a", name: "Ana", document: "52998224725" })
    const fake = makeFakeDb([existing])
    const res = await createClient(ctx(), { nome: "Ana 2", documento: CPF_A }, undefined, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("IDENTITY_REVIEW_REQUIRED")
    expect(res.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(res.candidateIds).toEqual(["c-old"])
    expect(fake.rows.size).toBe(1)
    expect(JSON.stringify(res)).not.toContain(CPF_A.replace(/\D/g, ""))
  })

  it("documento forte na outra loja NÃO bloqueia (sem vazamento)", async () => {
    const other = seedRow({ id: "c-b", storeId: "loja-b", name: "Outra", document: CPF_A })
    const fake = makeFakeDb([other])
    const res = await createClient(ctx("loja-a"), { nome: "Ana", documento: CPF_A }, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
    expect(JSON.stringify(res)).not.toContain("c-b")
    expect(JSON.stringify(res)).not.toContain("Outra")
  })

  it("POSSIBLE_CONTACT_MATCH exige revisão — force=true não atravessa", async () => {
    const existing = seedRow({ id: "c-old", storeId: "loja-a", name: "Ana", phone: PHONE_A })
    const fake = makeFakeDb([existing])
    const res = await createClient(
      ctx(),
      { nome: "Bruno", telefone: PHONE_A, force: true } as ClientWriteInput,
      undefined,
      { db: fake.db },
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("IDENTITY_REVIEW_REQUIRED")
    expect(res.outcome).toBe("POSSIBLE_CONTACT_MATCH")
    expect(fake.rows.size).toBe(1)
  })

  it("revisão explícita PROCEED_CREATE em contato possível persiste e audita", async () => {
    const existing = seedRow({ id: "c-old", storeId: "loja-a", name: "Ana", phone: PHONE_A })
    const fake = makeFakeDb([existing])
    const res = await createClient(
      ctx(),
      { nome: "Bruno", telefone: PHONE_A },
      {
        reviewDecision: {
          expectedOutcome: "POSSIBLE_CONTACT_MATCH",
          expectedCandidateIds: ["c-old"],
          action: "PROCEED_CREATE",
        },
      },
      { db: fake.db },
    )
    expect(res.ok).toBe(true)
    expect(fake.rows.size).toBe(2)
    const meta = JSON.parse(fake.audits[0]?.metadata ?? "{}") as {
      identity: { reviewed: boolean; autoMerge: boolean; aiDecision: boolean }
    }
    expect(meta.identity.reviewed).toBe(true)
    expect(meta.identity.autoMerge).toBe(false)
    expect(meta.identity.aiDecision).toBe(false)
  })

  it("revisão não permite criar com EXACT_DOCUMENT_MATCH", async () => {
    const existing = seedRow({ id: "c-old", storeId: "loja-a", document: "52998224725", name: "Ana" })
    const fake = makeFakeDb([existing])
    const res = await createClient(
      ctx(),
      { nome: "Clone", documento: CPF_A },
      {
        reviewDecision: {
          expectedOutcome: "EXACT_DOCUMENT_MATCH",
          expectedCandidateIds: ["c-old"],
          action: "PROCEED_CREATE",
        },
      },
      { db: fake.db },
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("IDENTITY_REVIEW_REQUIRED")
    expect(fake.rows.size).toBe(1)
  })

  it("decisão stale (candidatos divergentes) não persiste", async () => {
    const existing = seedRow({ id: "c-old", storeId: "loja-a", phone: PHONE_A, name: "Ana" })
    const fake = makeFakeDb([existing])
    const res = await createClient(
      ctx(),
      { nome: "Bruno", telefone: PHONE_A },
      {
        reviewDecision: {
          expectedOutcome: "POSSIBLE_CONTACT_MATCH",
          expectedCandidateIds: ["outro"],
          action: "PROCEED_CREATE",
        },
      },
      { db: fake.db },
    )
    expect(res.ok).toBe(false)
    expect(fake.rows.size).toBe(1)
  })

  it("AMBIGUOUS (dois contatos) fail-closed", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", phone: PHONE_A, name: "A" }),
      seedRow({ id: "c2", storeId: "loja-a", email: "a@x.com", name: "B" }),
    ])
    const res = await createClient(ctx(), { nome: "C", telefone: PHONE_A, email: "a@x.com" }, undefined, {
      db: fake.db,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("AMBIGUOUS")
  })

  it("IDENTITY_CONFLICT (documentos fortes diferentes + contato) fail-closed", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", document: "52998224725", phone: PHONE_A, name: "A" }),
    ])
    const res = await createClient(
      ctx(),
      { nome: "B", documento: CPF_B, telefone: PHONE_A },
      undefined,
      { db: fake.db },
    )
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("IDENTITY_CONFLICT")
  })

  it("create + audit são atômicos na mesma transação", async () => {
    const fake = makeFakeDb()
    await createClient(ctx(), { nome: "Ana" }, undefined, { db: fake.db })
    const txIdx = fake.calls.indexOf("$transaction")
    const createIdx = fake.calls.indexOf("tx.cliente.create")
    const auditIdx = fake.calls.indexOf("tx.logsAuditoria.create")
    expect(txIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(txIdx)
    expect(auditIdx).toBeGreaterThan(createIdx)
    expect(fake.audits[0]?.source).toBe(CLIENT_WRITE_AUDIT_SOURCE)
    expect(fake.audits[0]?.action).toBe("cliente.create")
    expect(fake.audits[0]?.metadata).toContain(CLIENT_WRITE_CONCURRENCY_GAP)
    expect(fake.audits[0]?.detail).not.toMatch(/\d{11}/)
  })

  it("documento fraco (sem DV) persiste e NÃO é identidade forte", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c-old", storeId: "loja-a", document: "11111111111", name: "A" }),
    ])
    const res = await createClient(ctx(), { nome: "B", documento: "11111111111" }, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
  })

  it("falha de auditoria no create faz rollback da linha", async () => {
    const fake = makeFakeDb([], { failAudit: true })
    const res = await createClient(ctx(), { nome: "Ana" }, undefined, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("PERSISTENCE")
    expect(fake.rows.size).toBe(0)
    expect(fake.audits).toHaveLength(0)
  })
})

describe("ClientWriteService — update", () => {
  it("cross-store é NOT_FOUND sem write", async () => {
    const fake = makeFakeDb([seedRow({ id: "c9", storeId: "loja-b", name: "Outra" })])
    const res = await updateClient(ctx("loja-a"), "c9", { nome: "Invadir" }, undefined, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("NOT_FOUND")
    expect(fake.rows.get("c9")?.name).toBe("Outra")
    expect(fake.calls).not.toContain("tx.cliente.update")
  })

  it("campo omitido preserva; null/vazio limpa phone/email", async () => {
    const fake = makeFakeDb([
      seedRow({
        id: "c1",
        storeId: "loja-a",
        name: "Ana",
        phone: PHONE_A,
        email: "ana@x.com",
        city: "SP",
        document: "x",
      }),
    ])
    const res = await updateClient(ctx(), "c1", { cidade: "RJ", telefone: "", email: null }, undefined, {
      db: fake.db,
    })
    expect(res.ok).toBe(true)
    const row = fake.rows.get("c1")
    expect(row?.name).toBe("Ana")
    expect(row?.document).toBe("x")
    expect(row?.city).toBe("RJ")
    expect(row?.phone).toBeNull()
    expect(row?.email).toBeNull()
  })

  it("update de active não dispara identidade (mesmo com telefone compartilhado)", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", name: "Ana", phone: PHONE_A }),
      seedRow({ id: "c2", storeId: "loja-a", name: "Bruno", phone: PHONE_A }),
    ])
    const res = await updateClient(ctx(), "c1", { active: false }, undefined, { db: fake.db })
    expect(res.ok).toBe(true)
    expect(fake.rows.get("c1")?.active).toBe(false)
  })

  it("update exclui o próprio cliente da duplicidade", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", name: "Ana", phone: PHONE_A, document: "52998224725" }),
    ])
    const res = await updateClient(ctx(), "c1", { telefone: PHONE_A, documento: CPF_A, nome: "Ana Silva" }, undefined, {
      db: fake.db,
    })
    expect(res.ok).toBe(true)
    expect(fake.rows.get("c1")?.name).toBe("Ana Silva")
  })

  it("update de telefone para o de OUTRO cliente exige revisão", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", name: "Ana", phone: PHONE_B }),
      seedRow({ id: "c2", storeId: "loja-a", name: "Bruno", phone: PHONE_A }),
    ])
    const res = await updateClient(ctx(), "c1", { telefone: PHONE_A }, undefined, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("IDENTITY_REVIEW_REQUIRED")
    expect(res.candidateIds).toEqual(["c2"])
    expect(fake.rows.get("c1")?.phone).toBe(PHONE_B)
  })

  it("tags null limpa; tags omitidas preservam", async () => {
    const fake = makeFakeDb([
      seedRow({ id: "c1", storeId: "loja-a", name: "Ana", tags: ["vip"] }),
    ])
    const keep = await updateClient(ctx(), "c1", { cidade: "SP" }, undefined, { db: fake.db })
    expect(keep.ok).toBe(true)
    expect(fake.rows.get("c1")?.tags).toEqual(["vip"])
    const clear = await updateClient(ctx(), "c1", { tags: null }, undefined, { db: fake.db })
    expect(clear.ok).toBe(true)
    expect(fake.rows.get("c1")?.tags).toBeNull()
  })

  it("falha de auditoria no update faz rollback do cadastro", async () => {
    const fake = makeFakeDb([seedRow({ id: "c1", storeId: "loja-a", name: "Ana", city: "SP" })], {
      failAudit: true,
    })
    const res = await updateClient(ctx(), "c1", { cidade: "RJ" }, undefined, { db: fake.db })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.code).toBe("PERSISTENCE")
    expect(fake.rows.get("c1")?.city).toBe("SP")
    expect(fake.audits).toHaveLength(0)
  })
})

describe("ClientWriteService — Tx composável", () => {
  it("createClientTx não abre nested transaction", async () => {
    const fake = makeFakeDb()
    const res = await createClientTx(fake.tx, ctx(), { nome: "Ana" })
    expect(res.ok).toBe(true)
    expect(fake.calls).not.toContain("$transaction")
    expect(fake.calls).toContain("tx.cliente.create")
  })

  it("updateClientTx não abre nested transaction", async () => {
    const fake = makeFakeDb([seedRow({ id: "c1", storeId: "loja-a", name: "Ana" })])
    const res = await updateClientTx(fake.tx, ctx(), "c1", { nome: "Ana 2" })
    expect(res.ok).toBe(true)
    expect(fake.calls).not.toContain("$transaction")
    expect(fake.calls).toContain("tx.cliente.update")
  })
})

describe("ClientWriteService — boundaries estáticos", () => {
  const src = readFileSync(resolve("lib/cadastros/client-write-service.ts"), "utf8")
  const contract = readFileSync(resolve("lib/cadastros/client-write-contract.ts"), "utf8")

  it("não chama IA / browser / schema / merge", () => {
    expect(src).not.toMatch(/openai|openrouter|anthropic|generateObject|\bllm\b/i)
    expect(src).not.toMatch(/localStorage|sessionStorage|window\./)
    expect(src).not.toMatch(/schema\.prisma|prisma\s+migrate/)
    expect(src).not.toMatch(/autoMerge\s*:\s*true|survivor|mergeClientes/)
    expect(src).toMatch(/import\s+["']server-only["']/)
  })

  it("não aceita force como autoridade", () => {
    expect(src).not.toMatch(/input\.force|opts\.force|body\.force/)
    expect(contract).toMatch(/force/)
  })

  it("reusa client-identity e não duplica política", () => {
    expect(src).toMatch(/classifyClientIdentity/)
    expect(src).toMatch(/createPrismaClientIdentitySource/)
    expect(src).not.toMatch(/docDigitsForDedupe/)
  })

  it("mensagens de erro não interpolam PII", () => {
    expect(src).not.toMatch(/\$\{[^}]*(document|phone|email|cpf|cnpj)[^}]*\}/i)
  })
})

describe("ClientWriteService — identitySource injetável na mesma tx", () => {
  it("usa a fonte injetada (não um lookup desconectado)", async () => {
    const fake = makeFakeDb()
    const source = createMemoryClientIdentitySource([
      { id: "ghost", storeId: "loja-a", phone: PHONE_A, name: "Ghost" },
    ])
    const res = await createClient(ctx(), { nome: "X", telefone: PHONE_A }, undefined, {
      db: fake.db,
      identitySource: source,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.candidateIds).toEqual(["ghost"])
    expect(fake.rows.size).toBe(0)
  })
})
