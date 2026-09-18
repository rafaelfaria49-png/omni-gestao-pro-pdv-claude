/**
 * CAD-R2-018-B — Testes do ClientMergeService (plan + execute).
 *
 * Sem banco: fake em memória via `deps.db`/`deps.identitySource`. Cobre
 * elegibilidade, survivor explícito, stale fingerprint, reassign das 6
 * relações, snapshots intactos, rollback total, concorrência, PII e regressão.
 */
import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma"
import type { CadastrosAuditPrincipal } from "@/lib/cadastros/cadastros-audit-principal"
import type { ClientIdentityRecord } from "@/lib/cadastros/client-identity"
import { createMemoryClientIdentitySource } from "@/lib/cadastros/client-identity"
import type { ClientMergeContext } from "@/lib/cadastros/client-merge-contract"
import { CLIENT_MERGE_AUDIT_ACTION, CLIENT_MERGE_AUDIT_SOURCE } from "@/lib/cadastros/client-merge-contract"
import {
  buildMergePlan,
  executeMerge,
  type ClientMergeDb,
  type ClientMergeExecuteInput,
  type ClientMergeRow,
  type ClientMergeTx,
} from "@/lib/cadastros/client-merge-service"

const CPF_A = "529.982.247-25"
const CPF_A_DIGITS = "52998224725"
const CPF_B = "390.533.447-05"
const PHONE_A = "11988887777"
const PHONE_T = "11900001111"

const STORE_A = "loja-a"
const STORE_B = "loja-b"

const PRINCIPAL: CadastrosAuditPrincipal = {
  userId: "user-1",
  email: "u@x.com",
  role: "ADMIN",
  displayLabel: "U",
}

function ctx(storeId = STORE_A): ClientMergeContext {
  return { storeId, principal: PRINCIPAL }
}

type FakeClient = ClientMergeRow
type LinkKey = "ordemServico" | "venda" | "whatsAppConversation" | "clienteCredito" | "omniAgentMemory" | "financialTransaction"
type LinkRow = {
  id: string
  clienteId: string | null
  storeId: string
  clienteNome?: string
  clienteDoc?: string
  payload?: unknown
}
type AuditRow = { action: string; userLabel: string; detail: string; metadata: string; source: string }

function seedClient(partial: Partial<FakeClient> & { id: string; storeId: string }): FakeClient {
  return {
    name: "Cliente",
    kind: "PF",
    document: "",
    phone: null,
    email: null,
    city: "",
    tags: null,
    active: true,
    totalSpent: 0,
    lastPurchaseAt: null,
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...partial,
  }
}

function link(id: string, clienteId: string | null, storeId: string, extra?: Partial<LinkRow>): LinkRow {
  return { id, clienteId, storeId, ...extra }
}

type FakeOpts = {
  failAudit?: boolean
  failReassign?: LinkKey | null
  failDelete?: "P2003" | "P2025" | "ERROR" | null
}

function knownError(code: "P2002" | "P2003" | "P2025", message: string): Error {
  return new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test" })
}

function makeFake(seedClients: FakeClient[] = [], seedLinks: Partial<Record<LinkKey, LinkRow[]>> = {}, opts: FakeOpts = {}) {
  const clientes = new Map<string, FakeClient>(seedClients.map((r) => [r.id, { ...r }]))
  const links: Record<LinkKey, LinkRow[]> = {
    ordemServico: [...(seedLinks.ordemServico ?? [])],
    venda: [...(seedLinks.venda ?? [])],
    whatsAppConversation: [...(seedLinks.whatsAppConversation ?? [])],
    clienteCredito: [...(seedLinks.clienteCredito ?? [])],
    omniAgentMemory: [...(seedLinks.omniAgentMemory ?? [])],
    financialTransaction: [...(seedLinks.financialTransaction ?? [])],
  }
  const audits: AuditRow[] = []
  const calls: string[] = []
  const locks: string[] = []
  let nested = 0
  let txCount = 0

  const matchClient = (row: FakeClient, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true
    if (where.id !== undefined && row.id !== where.id) return false
    if (where.storeId !== undefined && row.storeId !== where.storeId) return false
    return true
  }

  const cliente = {
    findFirst: async (args: { where?: Record<string, unknown> }): Promise<FakeClient | null> => {
      calls.push("cliente.findFirst")
      for (const row of clientes.values()) {
        if (matchClient(row, args.where)) return { ...row }
      }
      return null
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      calls.push("tx.cliente.update")
      const row = clientes.get(args.where.id)
      if (!row) throw knownError("P2025", "not found")
      const next = { ...row }
      if (args.data.name !== undefined) next.name = String(args.data.name)
      if (args.data.kind !== undefined) next.kind = String(args.data.kind)
      if (args.data.document !== undefined) next.document = String(args.data.document)
      if (args.data.phone !== undefined) next.phone = (args.data.phone as string | null) ?? null
      if (args.data.email !== undefined) next.email = (args.data.email as string | null) ?? null
      if (args.data.city !== undefined) next.city = String(args.data.city)
      if (args.data.tags !== undefined) {
        next.tags = args.data.tags === Prisma.DbNull ? null : (args.data.tags as Prisma.JsonValue | null)
      }
      if (args.data.active !== undefined) next.active = Boolean(args.data.active)
      if (args.data.totalSpent !== undefined) next.totalSpent = Number(args.data.totalSpent)
      clientes.set(next.id, next)
      return { id: next.id }
    },
    delete: async (args: { where: { id: string } }) => {
      calls.push("tx.cliente.delete")
      if (opts.failDelete === "P2003") throw knownError("P2003", "restrict")
      if (opts.failDelete === "P2025") throw knownError("P2025", "gone")
      if (opts.failDelete === "ERROR") throw new Error("delete boom")
      if (!clientes.has(args.where.id)) throw knownError("P2025", "not found")
      clientes.delete(args.where.id)
      return { id: args.where.id }
    },
  }

  const delegate = (key: LinkKey) => ({
    count: async (args: { where: { clienteId: string; storeId: string } }) => {
      calls.push(`${key}.count`)
      return links[key].filter((r) => r.clienteId === args.where.clienteId && r.storeId === args.where.storeId).length
    },
    updateMany: async (args: { where: { clienteId: string; storeId: string }; data: { clienteId: string } }) => {
      calls.push(`${key}.updateMany`)
      if (opts.failReassign === key) throw new Error(`reassign ${key} down`)
      let n = 0
      for (const r of links[key]) {
        if (r.clienteId === args.where.clienteId && r.storeId === args.where.storeId) {
          r.clienteId = args.where.clienteId === r.clienteId ? args.data.clienteId : r.clienteId
          n += 1
        }
      }
      return { count: n }
    },
  })

  const tx = {
    cliente,
    ordemServico: delegate("ordemServico"),
    venda: delegate("venda"),
    whatsAppConversation: delegate("whatsAppConversation"),
    clienteCredito: delegate("clienteCredito"),
    omniAgentMemory: delegate("omniAgentMemory"),
    financialTransaction: delegate("financialTransaction"),
    logsAuditoria: {
      create: async (args: { data: AuditRow }) => {
        calls.push("tx.logsAuditoria.create")
        if (opts.failAudit) throw new Error("audit down")
        audits.push(args.data)
        return {}
      },
    },
    $queryRaw: async (...args: unknown[]) => {
      calls.push("tx.$queryRaw.lock")
      const values = args.slice(1)
      if (values.length > 0) locks.push(String(values[0]))
      return [{ lock: "ok" }]
    },
  } as unknown as ClientMergeTx

  const db = {
    cliente: { findFirst: cliente.findFirst },
    ordemServico: { count: (tx.ordemServico as { count: unknown }).count },
    venda: { count: (tx.venda as { count: unknown }).count },
    whatsAppConversation: { count: (tx.whatsAppConversation as { count: unknown }).count },
    clienteCredito: { count: (tx.clienteCredito as { count: unknown }).count },
    omniAgentMemory: { count: (tx.omniAgentMemory as { count: unknown }).count },
    financialTransaction: { count: (tx.financialTransaction as { count: unknown }).count },
    $transaction: async <T>(fn: (t: ClientMergeTx) => Promise<T>) => {
      calls.push("$transaction")
      txCount += 1
      nested += 1
      if (nested > 1) throw new Error("nested transaction")
      const snapClients = new Map([...clientes.entries()].map(([k, v]) => [k, { ...v }]))
      const snapLinks: Record<LinkKey, LinkRow[]> = {
        ordemServico: links.ordemServico.map((r) => ({ ...r })),
        venda: links.venda.map((r) => ({ ...r })),
        whatsAppConversation: links.whatsAppConversation.map((r) => ({ ...r })),
        clienteCredito: links.clienteCredito.map((r) => ({ ...r })),
        omniAgentMemory: links.omniAgentMemory.map((r) => ({ ...r })),
        financialTransaction: links.financialTransaction.map((r) => ({ ...r })),
      }
      const snapAudits = audits.length
      try {
        return await fn(tx)
      } catch (e) {
        clientes.clear()
        for (const [k, v] of snapClients) clientes.set(k, { ...v })
        for (const k of Object.keys(snapLinks) as LinkKey[]) links[k] = snapLinks[k].map((r) => ({ ...r }))
        audits.splice(snapAudits)
        throw e
      } finally {
        nested -= 1
      }
    },
  } as unknown as ClientMergeDb

  // Source de identidade espelha os clientes atuais (inclui loser e terceiros).
  const identitySource = createMemoryClientIdentitySource(
    [...clientes.values()].map(
      (r): ClientIdentityRecord => ({
        id: r.id,
        storeId: r.storeId,
        document: r.document,
        phone: r.phone,
        email: r.email,
        name: r.name,
      }),
    ),
  )

  return { db, tx, clientes, links, audits, calls, locks, txCount: () => txCount, identitySource }
}

function stdSeed(): { clients: FakeClient[]; links: Partial<Record<LinkKey, LinkRow[]>> } {
  const clients = [
    seedClient({ id: "c-s", storeId: STORE_A, name: "Ana Souza", document: CPF_A, phone: PHONE_A, email: "ana@x.com", city: "SP", totalSpent: 150 }),
    seedClient({ id: "c-l", storeId: STORE_A, name: "Ana S.", document: CPF_A_DIGITS, phone: PHONE_A, city: "São Paulo" }),
  ]
  const links: Partial<Record<LinkKey, LinkRow[]>> = {
    ordemServico: [
      link("os-s1", "c-s", STORE_A, { payload: { cliente: { id: "c-s", nome: "Ana Souza" } } }),
      link("os-s2", "c-s", STORE_A, {}),
      link("os-l1", "c-l", STORE_A, { payload: { cliente: { id: "c-l", nome: "Ana S." } } }),
    ],
    venda: [
      link("v-s1", "c-s", STORE_A, { clienteNome: "ANA SOUZA", payload: { customerName: "ANA SOUZA", total: 100 } }),
      link("v-l1", "c-l", STORE_A, { clienteNome: "ANA S.", payload: { customerName: "ANA S.", total: 40 } }),
      link("v-l2", "c-l", STORE_A, { clienteNome: "ANA S.", payload: { customerName: "ANA S.", total: 60 } }),
    ],
    whatsAppConversation: [link("wa-s1", "c-s", STORE_A, {})],
    clienteCredito: [link("cc-l1", "c-l", STORE_A, { clienteDoc: CPF_A_DIGITS, clienteNome: "ANA S." })],
    omniAgentMemory: [link("oa-s1", "c-s", STORE_A, {})],
    financialTransaction: [
      link("ft-s1", "c-s", STORE_A, {}),
      link("ft-s2", "c-s", STORE_A, {}),
      link("ft-l1", "c-l", STORE_A, {}),
    ],
  }
  return { clients, links }
}

function execInput(fingerprint: string, resolution?: Record<string, unknown>): ClientMergeExecuteInput {
  return {
    survivorId: "c-s",
    loserId: "c-l",
    resolution,
    fingerprint,
    confirmation: { survivorId: "c-s", loserId: "c-l" },
  }
}

describe("buildMergePlan", () => {
  it("exact document gera plano revisável com fingerprint", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect("fingerprint" in plan).toBe(true)
    if (!("fingerprint" in plan)) return
    expect(plan.eligibility).toBe("REVIEWABLE_EXACT_DOCUMENT")
    expect(plan.pairOutcome).toBe("EXACT_DOCUMENT_MATCH")
    expect(plan.reviewable).toBe(true)
    expect(plan.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(plan.reassigned).toEqual({
      ordensServico: 1,
      vendas: 2,
      whatsappConversations: 0,
      clienteCreditos: 1,
      omniAgentMemories: 0,
      financialTransactions: 1,
    })
    expect(plan.survivor.links.ordensServico).toBe(2)
  })

  it("preview é read-only: nada é escrito", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect(fake.calls).not.toContain("tx.cliente.delete")
    expect(fake.calls).not.toContain("tx.logsAuditoria.create")
    expect(fake.calls.some((c) => c.endsWith(".updateMany"))).toBe(false)
    expect(fake.calls).not.toContain("$transaction")
    expect(fake.clientes.size).toBe(2)
  })

  it("possible contact sem documentos é revisável", async () => {
    const fake = makeFake([
      seedClient({ id: "c-s", storeId: STORE_A, name: "Ana", phone: PHONE_A }),
      seedClient({ id: "c-l", storeId: STORE_A, name: "Ana S", phone: PHONE_A }),
    ])
    const plan = await buildMergePlan(
      ctx(),
      { survivorId: "c-s", loserId: "c-l" },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect("fingerprint" in plan).toBe(true)
    if (!("fingerprint" in plan)) return
    expect(plan.eligibility).toBe("REVIEWABLE_CONTACT")
  })

  it("documentos fortes diferentes = IDENTITY_CONFLICT", async () => {
    const fake = makeFake([
      seedClient({ id: "c-s", storeId: STORE_A, document: CPF_A, phone: PHONE_A }),
      seedClient({ id: "c-l", storeId: STORE_A, document: CPF_B, phone: PHONE_A }),
    ])
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "IDENTITY_CONFLICT" })
  })

  it("nome igual sem sinais = NOT_ELIGIBLE", async () => {
    const fake = makeFake([
      seedClient({ id: "c-s", storeId: STORE_A, name: "José" }),
      seedClient({ id: "c-l", storeId: STORE_A, name: "José" }),
    ])
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "NOT_ELIGIBLE" })
  })

  it("self-merge é VALIDATION", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-s" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" })
  })

  it("ids ausentes exigem escolha explícita", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const a = await buildMergePlan(ctx(), { survivorId: "", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect(a).toMatchObject({ ok: false, code: "VALIDATION" })
    const b = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "  " }, { db: fake.db, identitySource: fake.identitySource })
    expect(b).toMatchObject({ ok: false, code: "VALIDATION" })
  })

  it("loser de outra loja = NOT_FOUND sem oráculo e sem escrita", async () => {
    const { clients, links } = stdSeed()
    clients.push(seedClient({ id: "c-x", storeId: STORE_B, name: "Ana", document: CPF_A }))
    const fake = makeFake(clients, links)
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-x" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" })
    expect(JSON.stringify(res)).not.toContain("c-x")
    expect(fake.calls.some((c) => c.endsWith(".updateMany"))).toBe(false)
  })

  it("loser inexistente = NOT_FOUND", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "ghost" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "NOT_FOUND" })
  })

  it("terceiro com mesmo documento = AMBIGUOUS fail-closed", async () => {
    const { clients, links } = stdSeed()
    clients.push(seedClient({ id: "c-t", storeId: STORE_A, name: "Terceiro", document: CPF_A }))
    const fake = makeFake(clients, links)
    const res = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "AMBIGUOUS" })
    expect(fake.clientes.size).toBe(3)
  })

  it("resolução com documento novo é bloqueada", async () => {
    const fake = makeFake([
      seedClient({ id: "c-s", storeId: STORE_A, name: "Ana", phone: PHONE_A }),
      seedClient({ id: "c-l", storeId: STORE_A, name: "Ana S", phone: PHONE_A }),
    ])
    const res = await buildMergePlan(
      ctx(),
      { survivorId: "c-s", loserId: "c-l", resolution: { documento: CPF_B } },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" })
  })

  it("resolução trocando documento forte é bloqueada", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const res = await buildMergePlan(
      ctx(),
      { survivorId: "c-s", loserId: "c-l", resolution: { documento: CPF_B } },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect(res).toMatchObject({ ok: false, code: "NOT_ELIGIBLE" })
  })

  it("contexto sem loja é UNTRUSTED sem tocar o banco", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const res = await buildMergePlan({ storeId: "  ", principal: PRINCIPAL }, { survivorId: "c-s", loserId: "c-l" }, { db: fake.db })
    expect(res).toMatchObject({ ok: false, code: "UNTRUSTED_SCOPE" })
    expect(fake.calls).toHaveLength(0)
  })
})

describe("executeMerge", () => {
  async function planned(resolution?: Record<string, unknown>) {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links)
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l", resolution }, { db: fake.db, identitySource: fake.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    return { fake, plan }
  }

  it("caminho feliz: reassign + campos + audit + delete em UMA transaction", async () => {
    const { fake, plan } = await planned({ nome: "Ana Consolidada", cidade: "Osasco/SP" })
    const res = await executeMerge(ctx(), execInput(plan.fingerprint, { nome: "Ana Consolidada", cidade: "Osasco/SP" }), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: true, survivorId: "c-s", loserId: "c-l" })
    if (!res.ok) return
    expect(res.fingerprint).toBe(plan.fingerprint)
    expect(res.reassigned).toEqual(plan.reassigned)
    expect(res.fieldsUpdated).toEqual(expect.arrayContaining(["nome", "city"]))
    // UMA transaction, sem nested
    expect(fake.calls.filter((c) => c === "$transaction")).toHaveLength(1)
    // lock consultivo do par
    expect(fake.locks).toEqual(["client-merge:loja-a:c-l:c-s"])
    // loser removido; survivor atualizado
    expect(fake.clientes.has("c-l")).toBe(false)
    expect(fake.clientes.get("c-s")?.name).toBe("Ana Consolidada")
    expect(fake.clientes.get("c-s")?.city).toBe("Osasco/SP")
    // vínculos movidos
    for (const rows of Object.values(fake.links)) {
      for (const r of rows) expect(r.clienteId).not.toBe("c-l")
    }
    expect(fake.links.ordemServico.filter((r) => r.clienteId === "c-s")).toHaveLength(3)
    expect(fake.links.venda.filter((r) => r.clienteId === "c-s")).toHaveLength(3)
    expect(fake.links.financialTransaction.filter((r) => r.clienteId === "c-s")).toHaveLength(3)
    // audit própria, atômica, sem PII
    const merges = fake.audits.filter((a) => a.action === CLIENT_MERGE_AUDIT_ACTION)
    expect(merges).toHaveLength(1)
    expect(merges[0].source).toBe(CLIENT_MERGE_AUDIT_SOURCE)
    const meta = JSON.parse(merges[0].metadata) as Record<string, unknown>
    expect(meta.survivorId).toBe("c-s")
    expect(meta.loserId).toBe("c-l")
    expect(meta.reassigned).toEqual(plan.reassigned)
    expect(meta.fingerprint).toBe(plan.fingerprint.slice(0, 16))
    const blob = `${merges[0].detail} ${merges[0].metadata}`
    for (const needle of [CPF_A, CPF_A_DIGITS, PHONE_A, "ana@x.com", "Ana Souza", "Ana S.", "Ana Consolidada"]) {
      expect(blob).not.toContain(needle)
    }
  })

  it("merge de contato preserva documento do survivor", async () => {
    const fake = makeFake([
      seedClient({ id: "c-s", storeId: STORE_A, name: "Ana", document: CPF_A, phone: PHONE_A }),
      seedClient({ id: "c-l", storeId: STORE_A, name: "Ana S", phone: PHONE_A }),
    ])
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: true })
    expect(fake.clientes.get("c-s")?.document).toBe(CPF_A)
    expect(fake.clientes.has("c-l")).toBe(false)
  })

  it("resolução vazia = consolidação pura (sem update de campos)", async () => {
    const { fake, plan } = await planned()
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: true })
    if (!res.ok) return
    expect(res.fieldsUpdated).toEqual([])
    expect(fake.clientes.get("c-s")?.name).toBe("Ana Souza")
  })

  it("totalSpent/lastPurchaseAt na resolução são ignorados", async () => {
    const { fake, plan } = await planned({ totalSpent: 9999, lastPurchaseAt: new Date().toISOString() } as Record<string, unknown>)
    const before = fake.clientes.get("c-s")?.totalSpent
    const res = await executeMerge(ctx(), execInput(plan.fingerprint, { totalSpent: 9999 } as Record<string, unknown>), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: true })
    expect(fake.clientes.get("c-s")?.totalSpent).toBe(before)
  })

  it("tags substituem por inteiro, nunca concatenam", async () => {
    const { clients, links } = stdSeed()
    clients[0] = { ...clients[0], tags: { origem: "import" } as Prisma.JsonValue }
    const fake = makeFake(clients, links)
    const plan = await buildMergePlan(
      ctx(),
      { survivorId: "c-s", loserId: "c-l", resolution: { tags: { vip: true } } },
      { db: fake.db, identitySource: fake.identitySource },
    )
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    const res = await executeMerge(ctx(), execInput(plan.fingerprint, { tags: { vip: true } }), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: true })
    expect(fake.clientes.get("c-s")?.tags).toEqual({ vip: true })
  })

  it("fingerprint adulterado = STALE sem aplicar nada", async () => {
    const { fake, plan } = await planned({ nome: "Ana Consolidada" })
    const before = JSON.stringify({ c: [...fake.clientes.values()], l: fake.links, a: fake.audits })
    const res = await executeMerge(ctx(), execInput(plan.fingerprint, { nome: "Outro Nome" }), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: false, code: "STALE_PLAN" })
    expect(JSON.stringify({ c: [...fake.clientes.values()], l: fake.links, a: fake.audits })).toBe(before)
  })

  it("cliente alterado após o preview = STALE", async () => {
    const { fake, plan } = await planned()
    fake.clientes.get("c-s")!.updatedAt = new Date("2026-09-02T00:00:00.000Z")
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "STALE_PLAN" })
    expect(fake.clientes.has("c-l")).toBe(true)
  })

  it("dependência criada após o preview = STALE", async () => {
    const { fake, plan } = await planned()
    fake.links.venda.push(link("v-late", "c-l", STORE_A, { clienteNome: "ANA" }))
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "STALE_PLAN" })
    expect(fake.links.venda.find((r) => r.id === "v-late")?.clienteId).toBe("c-l")
  })

  it("double-submit: segunda execução falha e só há 1 audit de merge", async () => {
    const { fake, plan } = await planned()
    const first = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(first).toMatchObject({ ok: true })
    const second = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(second).toMatchObject({ ok: false, code: "STALE_PLAN" })
    expect(fake.audits.filter((a) => a.action === CLIENT_MERGE_AUDIT_ACTION)).toHaveLength(1)
  })

  it("confirmação ausente/divergente é VALIDATION sem escrita", async () => {
    const { fake, plan } = await planned()
    const noConfirm = await executeMerge(
      ctx(),
      { survivorId: "c-s", loserId: "c-l", fingerprint: plan.fingerprint, confirmation: { survivorId: "", loserId: "" } },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect(noConfirm).toMatchObject({ ok: false, code: "VALIDATION" })
    const swapped = await executeMerge(
      ctx(),
      { survivorId: "c-s", loserId: "c-l", fingerprint: plan.fingerprint, confirmation: { survivorId: "c-l", loserId: "c-s" } },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect(swapped).toMatchObject({ ok: false, code: "VALIDATION" })
    expect(fake.clientes.size).toBe(2)
    expect(fake.audits).toHaveLength(0)
  })

  it("snapshots históricos permanecem intactos", async () => {
    const { fake, plan } = await planned({ nome: "Ana Consolidada" })
    const res = await executeMerge(ctx(), execInput(plan.fingerprint, { nome: "Ana Consolidada" }), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: true })
    const v = fake.links.venda.find((r) => r.id === "v-l1")!
    expect(v.clienteId).toBe("c-s")
    expect(v.clienteNome).toBe("ANA S.")
    expect(v.payload).toEqual({ customerName: "ANA S.", total: 40 })
    const os = fake.links.ordemServico.find((r) => r.id === "os-l1")!
    expect(os.clienteId).toBe("c-s")
    expect(os.payload).toEqual({ cliente: { id: "c-l", nome: "Ana S." } })
    const cc = fake.links.clienteCredito.find((r) => r.id === "cc-l1")!
    expect(cc.clienteId).toBe("c-s")
    expect(cc.clienteDoc).toBe(CPF_A_DIGITS)
    expect(cc.clienteNome).toBe("ANA S.")
  })

  it("rollback total quando o reassign falha no meio", async () => {
    const { clients, links } = stdSeed()
    const clean = makeFake(structuredClone(clients), structuredClone(links))
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: clean.db, identitySource: clean.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    const fake = makeFake(clients, links, { failReassign: "venda" })
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "PERSISTENCE" })
    // Nada aplicado: clientes, vínculos, audits e loser intactos.
    expect(fake.clientes.size).toBe(2)
    expect(fake.clientes.has("c-l")).toBe(true)
    expect(fake.links.ordemServico.find((r) => r.id === "os-l1")?.clienteId).toBe("c-l")
    expect(fake.links.venda.filter((r) => r.clienteId === "c-s")).toHaveLength(1)
    expect(fake.audits).toHaveLength(0)
  })

  it("rollback total quando a auditoria falha", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links, { failAudit: true })
    // Plano precisa ser gerado sem falha de audit: gera com fake limpo e replica o estado.
    const clean = makeFake(structuredClone(clients), structuredClone(links))
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: clean.db, identitySource: clean.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    // updateClientTx também audita (cliente.update sem mudanças? resolução vazia
    // não chama update) — a falha vem do audit do merge.
    expect(res).toMatchObject({ ok: false, code: "PERSISTENCE" })
    expect(fake.clientes.has("c-l")).toBe(true)
    expect(fake.links.venda.filter((r) => r.clienteId === "c-s")).toHaveLength(1)
    expect(fake.audits).toHaveLength(0)
  })

  it("rollback total quando o delete trava (P2003 = relação não inventariada)", async () => {
    const { clients, links } = stdSeed()
    const fake = makeFake(clients, links, { failDelete: "P2003" })
    const clean = makeFake(structuredClone(clients), structuredClone(links))
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: clean.db, identitySource: clean.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    const res = await executeMerge(ctx(), execInput(plan.fingerprint), { db: fake.db, identitySource: fake.identitySource })
    expect(res).toMatchObject({ ok: false, code: "PERSISTENCE" })
    // Reassign foi desfeito: vínculos voltaram ao loser.
    expect(fake.clientes.has("c-l")).toBe(true)
    expect(fake.links.ordemServico.find((r) => r.id === "os-l1")?.clienteId).toBe("c-l")
    expect(fake.links.venda.filter((r) => r.clienteId === "c-l")).toHaveLength(2)
    expect(fake.audits).toHaveLength(0)
  })

  it("resolução colidindo com terceiro aborta com rollback", async () => {
    const { clients, links } = stdSeed()
    clients.push(seedClient({ id: "c-t", storeId: STORE_A, name: "Terceiro", phone: PHONE_T, email: "terceiro@x.com" }))
    const fake = makeFake(clients, links)
    // Plano sem resolução passa (terceiro não colide com os sinais atuais)...
    const plan = await buildMergePlan(ctx(), { survivorId: "c-s", loserId: "c-l" }, { db: fake.db, identitySource: fake.identitySource })
    if (!("fingerprint" in plan)) throw new Error("plano esperado")
    // ...mas trocar o telefone do survivor para o do terceiro trava no execute.
    const res = await executeMerge(ctx(), execInput("0".repeat(64), { telefone: PHONE_T }), {
      db: fake.db,
      identitySource: fake.identitySource,
    })
    expect(res).toMatchObject({ ok: false, code: "AMBIGUOUS" })
    expect(fake.clientes.has("c-l")).toBe(true)
    expect(fake.clientes.get("c-s")?.phone).toBe(PHONE_A)
    expect(fake.audits).toHaveLength(0)
  })

  it("cross-store no execute = STALE sem escrita (ausência vira stale)", async () => {
    const { clients, links } = stdSeed()
    clients.push(seedClient({ id: "c-x", storeId: STORE_B, name: "Ana", document: CPF_A }))
    const fake = makeFake(clients, links)
    const res = await executeMerge(
      ctx(),
      {
        survivorId: "c-s",
        loserId: "c-x",
        fingerprint: "0".repeat(64),
        confirmation: { survivorId: "c-s", loserId: "c-x" },
      },
      { db: fake.db, identitySource: fake.identitySource },
    )
    expect(res).toMatchObject({ ok: false, code: "STALE_PLAN" })
    expect(fake.calls.some((c) => c.endsWith(".updateMany"))).toBe(false)
    expect(fake.calls).not.toContain("tx.cliente.delete")
  })
})
