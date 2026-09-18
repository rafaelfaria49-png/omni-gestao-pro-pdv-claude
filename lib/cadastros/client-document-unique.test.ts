/**
 * CAD-R2-019 — Garantia de unicidade forte de documento por loja.
 *
 * Sem banco: fake em memória que impõe a UNIQUE (storeId, documentKey) com
 * P2002 fiel ao PostgreSQL (múltiplos NULL liberados). Cobre:
 * - representação canônica mantida atomicamente em create/update;
 * - máscara vs. dígitos equivalentes colidem;
 * - cross-store permitido; múltiplos null permitidos;
 * - corrida concorrente create/create e update/update: só uma persiste e a
 *   outra vira erro de domínio seguro (409), nunca 500 genérico;
 * - mapeamento P2002 → identidade (unit + HTTP 409);
 * - idempotência do backfill (reaplicar = zero writes).
 */
import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma"
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import { toStrongDocumentKey } from "@/lib/cadastros/client-identity"
import type { ClientWriteContext } from "@/lib/cadastros/client-write-contract"
import { CLIENT_WRITE_MESSAGES } from "@/lib/cadastros/client-write-contract"
import { mapClientWriteFailureToResponse } from "@/lib/cadastros/client-write-http"
import {
  createClient,
  isClientDocumentUniqueViolation,
  mapDocumentUniqueViolationToFailure,
  updateClient,
  type ClientWriteDb,
  type ClientWriteFoundRow,
  type ClientWriteTx,
} from "@/lib/cadastros/client-write-service"

const CPF_A = "529.982.247-25"
const CPF_A_DIGITS = "52998224725"
const CPF_B = "390.533.447-05"
const CNPJ_A = "11.222.333/0001-81"

const PRINCIPAL: CadastrosAuditPrincipal = {
  userId: "user-1",
  email: "u@x.com",
  role: "ADMIN",
  displayLabel: "U",
}

function ctx(storeId = "loja-a"): ClientWriteContext {
  return { storeId, principal: PRINCIPAL }
}

type FakeRow = ClientWriteFoundRow

function seedRow(partial: Partial<FakeRow> & { id: string; storeId: string }): FakeRow {
  const document = partial.document ?? ""
  return {
    name: "Cliente",
    kind: "PF",
    document,
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

function duplicateKeyError(): Error {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on the constraint: Cliente_storeId_documentKey_key",
    { code: "P2002", clientVersion: "test", meta: { target: ["storeId", "documentKey"] } } as never,
  )
}

function assertNoDuplicateKey(rows: Map<string, FakeRow>, storeId: string, key: string | null, excludeId?: string): void {
  if (key === null) return
  for (const row of rows.values()) {
    if (row.id !== excludeId && row.storeId === storeId && row.documentKey === key) {
      throw duplicateKeyError()
    }
  }
}

function contains(hay: string | null | undefined, needle: string): boolean {
  return (hay ?? "").includes(needle)
}

/**
 * Fake com barreira de corrida: N escritas aguardam até que N lookups de
 * identidade tenham ocorrido — reproduzindo a janela lookup→write que o
 * banco fecha com a unique. Sem deadlock: liberação por timeout de
 * segurança.
 */
function makeRacyDb(seed: FakeRow[] = [], racers = 0) {
  const rows = new Map<string, FakeRow>(seed.map((r) => [r.id, { ...r }]))
  let idSeq = 100
  let lookups = 0
  let released = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = () => {
      released = true
      resolve()
    }
  })
  const safety = setTimeout(() => release(), 2000)

  const noteLookup = () => {
    lookups += 1
    if (racers > 0 && lookups >= racers) release()
  }
  const awaitGate = async () => {
    if (racers > 0 && !released) await gate
  }

  const matchWhere = (row: FakeRow, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true
    if (where.storeId !== undefined && row.storeId !== where.storeId) return false
    if (typeof where.id === "string" && row.id !== where.id) return false
    const or = where.OR as Array<Record<string, unknown>> | undefined
    if (Array.isArray(or) && or.length > 0) {
      const hit = or.some((cond) => {
        if (typeof cond.documentKey === "string") return row.documentKey === cond.documentKey
        const doc = cond.document as { contains?: string } | undefined
        if (doc?.contains) return contains(row.document, doc.contains)
        const phone = cond.phone as { contains?: string } | undefined
        if (phone?.contains) return contains(row.phone, phone.contains)
        const email = cond.email as { equals?: string } | undefined
        if (email?.equals) return (row.email ?? "").toLowerCase() === email.equals.toLowerCase()
        return false
      })
      if (!hit) return false
    }
    return true
  }

  const cliente = {
    findMany: async (args: { where?: Record<string, unknown> }) => {
      noteLookup()
      return [...rows.values()].filter((row) => matchWhere(row, args.where))
    },
    findFirst: async (args: { where?: Record<string, unknown> }): Promise<FakeRow | null> => {
      for (const row of rows.values()) {
        if (matchWhere(row, args.where)) return { ...row }
      }
      return null
    },
    create: async (args: { data: Record<string, unknown> }) => {
      await awaitGate()
      const storeId = String(args.data.storeId)
      const key = (args.data.documentKey as string | null) ?? null
      assertNoDuplicateKey(rows, storeId, key)
      const id = `c-${idSeq++}`
      rows.set(
        id,
        seedRow({
          id,
          storeId,
          name: String(args.data.name),
          kind: String(args.data.kind ?? "PF"),
          document: String(args.data.document ?? ""),
          documentKey: key,
        }),
      )
      return { id }
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      await awaitGate()
      const row = rows.get(args.where.id)
      if (!row) {
        throw new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "test" })
      }
      const next = { ...row }
      if (args.data.document !== undefined) next.document = String(args.data.document)
      if (args.data.documentKey !== undefined) {
        const key = (args.data.documentKey as string | null) ?? null
        assertNoDuplicateKey(rows, next.storeId, key, next.id)
        next.documentKey = key
      }
      rows.set(next.id, next)
      return { id: next.id }
    },
  }

  const tx = {
    cliente,
    logsAuditoria: { create: async () => ({}) },
  } as unknown as ClientWriteTx

  const db: ClientWriteDb = {
    cliente: { findFirst: cliente.findFirst },
    $transaction: async <T>(fn: (t: ClientWriteTx) => Promise<T>) => fn(tx),
  }

  return {
    db,
    rows,
    lookups: () => lookups,
    dispose: () => clearTimeout(safety),
  }
}

describe("CAD-R2-019 — chave canônica mantida atomicamente", () => {
  it("create persiste documentKey (máscara → dígitos) junto do legado", async () => {
    const fake = makeRacyDb()
    try {
      const res = await createClient(ctx(), { nome: "Ana", documento: CPF_A }, undefined, { db: fake.db })
      expect(res.ok).toBe(true)
      const row = [...fake.rows.values()][0]
      expect(row?.document).toBe(CPF_A)
      expect(row?.documentKey).toBe(CPF_A_DIGITS)
    } finally {
      fake.dispose()
    }
  })

  it("CNPJ válido gera chave de 14 dígitos; vazio/inválido gera NULL", async () => {
    const fake = makeRacyDb()
    try {
      const a = await createClient(ctx(), { nome: "PJ", documento: CNPJ_A }, undefined, { db: fake.db })
      expect(a.ok).toBe(true)
      const b = await createClient(ctx(), { nome: "Vazio", documento: "" }, undefined, { db: fake.db })
      expect(b.ok).toBe(true)
      const c = await createClient(ctx(), { nome: "Fraco", documento: "11111111111" }, undefined, { db: fake.db })
      expect(c.ok).toBe(true)
      const byName = new Map([...fake.rows.values()].map((r) => [r.name, r]))
      expect(byName.get("PJ")?.documentKey).toBe("11222333000181")
      expect(byName.get("Vazio")?.documentKey).toBeNull()
      expect(byName.get("Fraco")?.documentKey).toBeNull()
    } finally {
      fake.dispose()
    }
  })

  it("update recalcula a chave; limpar documento volta a NULL", async () => {
    const fake = makeRacyDb([seedRow({ id: "c1", storeId: "loja-a", name: "Ana" })])
    try {
      const set = await updateClient(ctx(), "c1", { documento: CPF_B }, undefined, { db: fake.db })
      expect(set.ok).toBe(true)
      expect(fake.rows.get("c1")?.documentKey).toBe("39053344705")
      const clear = await updateClient(ctx(), "c1", { documento: "" }, undefined, { db: fake.db })
      expect(clear.ok).toBe(true)
      expect(fake.rows.get("c1")?.documentKey).toBeNull()
    } finally {
      fake.dispose()
    }
  })

  it("máscara vs. dígitos equivalentes colidem na mesma store", async () => {
    const fake = makeRacyDb([seedRow({ id: "c-old", storeId: "loja-a", name: "Ana", document: CPF_A })])
    try {
      const res = await createClient(ctx(), { nome: "Clone", documento: CPF_A_DIGITS }, undefined, { db: fake.db })
      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.code).toBe("IDENTITY_REVIEW_REQUIRED")
      expect(res.outcome).toBe("EXACT_DOCUMENT_MATCH")
      expect(fake.rows.size).toBe(1)
    } finally {
      fake.dispose()
    }
  })

  it("mesmo documento em stores diferentes continua permitido", async () => {
    const fake = makeRacyDb([seedRow({ id: "c-b", storeId: "loja-b", name: "Outra", document: CPF_A })])
    try {
      const res = await createClient(ctx("loja-a"), { nome: "Ana", documento: CPF_A }, undefined, { db: fake.db })
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(fake.rows.get(res.id)?.documentKey).toBe(CPF_A_DIGITS)
    } finally {
      fake.dispose()
    }
  })

  it("múltiplos NULL (vazio/inválido) são permitidos na mesma store", async () => {
    const fake = makeRacyDb()
    try {
      for (const [i, documento] of ["", "   ", "11111111111", "abc"].entries()) {
        const res = await createClient(ctx(), { nome: `C${i}`, documento }, undefined, { db: fake.db })
        expect(res.ok).toBe(true)
      }
      expect(fake.rows.size).toBe(4)
    } finally {
      fake.dispose()
    }
  })
})

describe("CAD-R2-019 — corrida concorrente fechada pelo banco", () => {
  it("create concorrente: só uma persiste; a outra vira erro de domínio (409)", async () => {
    const fake = makeRacyDb([], 2)
    try {
      const [r1, r2] = await Promise.all([
        createClient(ctx(), { nome: "Ana 1", documento: CPF_A }, undefined, { db: fake.db }),
        createClient(ctx(), { nome: "Ana 2", documento: CPF_A_DIGITS }, undefined, { db: fake.db }),
      ])
      const oks = [r1, r2].filter((r) => r.ok)
      const fails = [r1, r2].filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const fail = fails[0]
      if (fail.ok) return
      // Erro de domínio seguro: conflito de identidade, nunca PERSISTENCE.
      expect(fail.code).toBe("IDENTITY_REVIEW_REQUIRED")
      expect(fail.outcome).toBe("EXACT_DOCUMENT_MATCH")
      expect(JSON.stringify(fail)).not.toContain(CPF_A_DIGITS)
      expect(JSON.stringify(fail)).not.toContain(CPF_A)
      // Mapeamento HTTP: 409, não 500/503.
      const http = mapClientWriteFailureToResponse(fail)
      expect(http.status).toBe(409)
      expect(fake.rows.size).toBe(1)
    } finally {
      fake.dispose()
    }
  })

  it("update concorrente para o mesmo documento: só um persiste", async () => {
    const fake = makeRacyDb(
      [
        seedRow({ id: "c1", storeId: "loja-a", name: "Ana" }),
        seedRow({ id: "c2", storeId: "loja-a", name: "Bruno" }),
      ],
      2,
    )
    try {
      const [r1, r2] = await Promise.all([
        updateClient(ctx(), "c1", { documento: CPF_A }, undefined, { db: fake.db }),
        updateClient(ctx(), "c2", { documento: CPF_A_DIGITS }, undefined, { db: fake.db }),
      ])
      const oks = [r1, r2].filter((r) => r.ok)
      const fails = [r1, r2].filter((r) => !r.ok)
      expect(oks).toHaveLength(1)
      expect(fails).toHaveLength(1)
      const fail = fails[0]
      if (fail.ok) return
      expect(fail.code).toBe("IDENTITY_REVIEW_REQUIRED")
      expect(fail).not.toMatchObject({ code: "PERSISTENCE" })
      const keys = [...fake.rows.values()].map((r) => r.documentKey)
      expect(keys.filter((k) => k === CPF_A_DIGITS)).toHaveLength(1)
    } finally {
      fake.dispose()
    }
  })
})

describe("CAD-R2-019 — mapeamento P2002", () => {
  it("isClientDocumentUniqueViolation reconhece P2002 de documentKey", () => {
    expect(isClientDocumentUniqueViolation(duplicateKeyError())).toBe(true)
    expect(
      isClientDocumentUniqueViolation(
        new Prisma.PrismaClientKnownRequestError("x", { code: "P2025", clientVersion: "test" }),
      ),
    ).toBe(false)
    expect(isClientDocumentUniqueViolation(new Error("boom"))).toBe(false)
    expect(
      isClientDocumentUniqueViolation(
        new Prisma.PrismaClientKnownRequestError("x", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["outra_unique"] },
        } as never),
      ),
    ).toBe(false)
  })

  it("falha mapeada é 409 com mensagem de documento, sem PII", async () => {
    const failure = mapDocumentUniqueViolationToFailure()
    expect(failure.code).toBe("IDENTITY_REVIEW_REQUIRED")
    expect(failure.outcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(failure.message).toBe(CLIENT_WRITE_MESSAGES.exactDocument)
    const res = mapClientWriteFailureToResponse(failure)
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(JSON.stringify(body)).not.toMatch(/\d{11}|\d{14}/)
  })
})

describe("CAD-R2-019 — backfill idempotente", () => {
  it("reaplicar a chave canônica não muda nada (zero writes na 2ª passada)", () => {
    const rows: FakeRow[] = [
      seedRow({ id: "c1", storeId: "loja-a", name: "A", document: CPF_A, documentKey: null }),
      seedRow({ id: "c2", storeId: "loja-a", name: "B", document: "", documentKey: null }),
      seedRow({ id: "c3", storeId: "loja-a", name: "C", document: "11111111111", documentKey: null }),
    ]
    const pass = () => {
      let writes = 0
      for (const row of rows) {
        const key = toStrongDocumentKey(row.document)
        if (key !== row.documentKey) {
          row.documentKey = key
          writes += 1
        }
      }
      return writes
    }
    expect(pass()).toBe(1)
    expect(rows[0]?.documentKey).toBe(CPF_A_DIGITS)
    expect(pass()).toBe(0)
    expect(pass()).toBe(0)
  })
})
