/**
 * OMNI-AGENT-HUB-MEMORY-REAL-001 — Server Actions da memória operacional (Prisma EM MEMÓRIA).
 *
 * Cobre isolamento por storeId, criação/edição/arquivamento, listagem por cliente/loja,
 * busca por termo e o gate de permissão `workspace.omniAgent`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const STORE_A = "loja-a"
const STORE_B = "loja-b"

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const store = {
    memories: [] as Row[],
    clientes: [] as Row[],
    auditLogs: [] as Row[],
  }
  let seq = 0
  const reset = () => {
    store.memories = []
    store.clientes = []
    store.auditLogs = []
    seq = 0
  }

  function matchesMemory(row: Row, where: Row): boolean {
    if (where.id !== undefined && row.id !== where.id) return false
    if (where.storeId !== undefined && row.storeId !== where.storeId) return false
    if (where.clienteId !== undefined && row.clienteId !== where.clienteId) return false
    if (where.status !== undefined && row.status !== where.status) return false
    if (where.OR !== undefined) {
      const ors = where.OR as Row[]
      const ok = ors.some((cond) => {
        if (cond.titulo) return String(row.titulo).toLowerCase().includes(String((cond.titulo as Row).contains).toLowerCase())
        if (cond.conteudo) return String(row.conteudo).toLowerCase().includes(String((cond.conteudo as Row).contains).toLowerCase())
        if (cond.tags) return (row.tags as string[]).includes((cond.tags as Row).has as string)
        return false
      })
      if (!ok) return false
    }
    return true
  }

  const prisma = {
    cliente: {
      findFirst: async ({ where }: { where: Row }) =>
        store.clientes.find((c) => c.id === where.id && c.storeId === where.storeId) ?? null,
    },
    omniAgentMemory: {
      create: async ({ data }: { data: Row }) => {
        seq += 1
        const now = new Date()
        const row: Row = {
          id: `mem-${seq}`,
          createdAt: now,
          updatedAt: now,
          ...data,
        }
        store.memories.push(row)
        return row
      },
      findFirst: async ({ where }: { where: Row }) => store.memories.find((r) => matchesMemory(r, where)) ?? null,
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const rows = store.memories
          .filter((r) => matchesMemory(r, where))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())
        return take ? rows.slice(0, take) : rows
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = store.memories.find((r) => r.id === where.id)
        if (!row) throw new Error("not found")
        Object.assign(row, data, { updatedAt: new Date() })
        return row
      },
    },
    logsAuditoria: {
      create: async ({ data }: { data: Row }) => {
        store.auditLogs.push(data)
        return data
      },
    },
  }

  type GuardResult =
    | { ok: true; session: { user: { name: string; email: string } }; permissions: Record<string, never> }
    | { ok: false; error: string }

  const requireEnterpriseWith = vi.fn<() => Promise<GuardResult>>(async () => ({
    ok: true,
    session: { user: { name: "Operador Teste", email: "op@teste.com" } },
    permissions: {},
  }))

  return { store, prisma, requireEnterpriseWith, reset }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: h.requireEnterpriseWith }))

import {
  createOmniAgentMemory,
  updateOmniAgentMemory,
  archiveOmniAgentMemory,
  listOmniAgentMemoriesByCliente,
  listRecentOmniAgentMemories,
  searchOmniAgentMemories,
} from "./omni-agent-memory"

beforeEach(() => {
  h.reset()
  h.requireEnterpriseWith.mockClear()
  h.requireEnterpriseWith.mockImplementation(async () => ({
    ok: true as const,
    session: { user: { name: "Operador Teste", email: "op@teste.com" } },
    permissions: {},
  }))
  h.store.clientes.push({ id: "cli-1", storeId: STORE_A, nome: "Maria" })
})

describe("createOmniAgentMemory", () => {
  it("cria memória com criadoPor derivado da sessão e origem padrão manual", async () => {
    const row = await createOmniAgentMemory(STORE_A, {
      tipo: "nota",
      titulo: "  Prefere contato de manhã  ",
      conteudo: "Cliente pediu para ligar só de manhã.",
    })
    expect(row.titulo).toBe("Prefere contato de manhã")
    expect(row.origem).toBe("manual")
    expect(row.criadoPor).toBe("Operador Teste")
    expect(row.status).toBe("ativo")
  })

  it("rejeita tipo inválido", async () => {
    await expect(
      createOmniAgentMemory(STORE_A, { tipo: "bogus" as never, titulo: "x", conteudo: "y" }),
    ).rejects.toThrow(/Tipo de memória inválido/)
  })

  it("rejeita título ou conteúdo vazio", async () => {
    await expect(createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "  ", conteudo: "y" })).rejects.toThrow(
      /Título obrigatório/,
    )
    await expect(createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "x", conteudo: "  " })).rejects.toThrow(
      /Conteúdo obrigatório/,
    )
  })

  it("rejeita clienteId de outra loja (isolamento por storeId)", async () => {
    await expect(
      createOmniAgentMemory(STORE_B, { clienteId: "cli-1", tipo: "nota", titulo: "x", conteudo: "y" }),
    ).rejects.toThrow(/Cliente não encontrado/)
  })

  it("propaga erro de permissão quando o gate falha", async () => {
    h.requireEnterpriseWith.mockImplementationOnce(async () => ({ ok: false as const, error: "Sem permissão" }))
    await expect(createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "x", conteudo: "y" })).rejects.toThrow(
      "Sem permissão",
    )
  })
})

describe("listOmniAgentMemoriesByCliente / listRecentOmniAgentMemories", () => {
  it("lista apenas memórias ativas do cliente e da loja corretos", async () => {
    await createOmniAgentMemory(STORE_A, { clienteId: "cli-1", tipo: "nota", titulo: "A", conteudo: "conteudo a" })
    const arquivada = await createOmniAgentMemory(STORE_A, {
      clienteId: "cli-1",
      tipo: "incidente",
      titulo: "B",
      conteudo: "conteudo b",
    })
    await archiveOmniAgentMemory(STORE_A, arquivada.id)

    const rows = await listOmniAgentMemoriesByCliente(STORE_A, "cli-1")
    expect(rows).toHaveLength(1)
    expect(rows[0]!.titulo).toBe("A")

    const withArchived = await listOmniAgentMemoriesByCliente(STORE_A, "cli-1", { includeArchived: true })
    expect(withArchived).toHaveLength(2)
  })

  it("listRecentOmniAgentMemories nunca cruza loja", async () => {
    await createOmniAgentMemory(STORE_A, { tipo: "observacao", titulo: "Da loja A", conteudo: "x" })
    const rows = await listRecentOmniAgentMemories(STORE_B)
    expect(rows).toHaveLength(0)
  })
})

describe("searchOmniAgentMemories", () => {
  it("encontra por termo no título, conteúdo ou tag", async () => {
    await createOmniAgentMemory(STORE_A, { tipo: "preferencia", titulo: "Prefere pix", conteudo: "sem detalhe" })
    await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "Outro", conteudo: "gosta de pix também", tags: ["vip"] })
    await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "Irrelevante", conteudo: "nada a ver" })

    const byTitulo = await searchOmniAgentMemories(STORE_A, "Prefere")
    expect(byTitulo.map((r) => r.titulo)).toEqual(["Prefere pix"])

    const byConteudo = await searchOmniAgentMemories(STORE_A, "pix")
    expect(byConteudo).toHaveLength(2)
  })

  it("termo vazio cai para as memórias recentes da loja", async () => {
    await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "Recente", conteudo: "x" })
    const rows = await searchOmniAgentMemories(STORE_A, "   ")
    expect(rows).toHaveLength(1)
  })
})

describe("updateOmniAgentMemory / archiveOmniAgentMemory", () => {
  it("edita título/conteúdo/tags de uma memória ativa", async () => {
    const created = await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "Antigo", conteudo: "velho" })
    const updated = await updateOmniAgentMemory(STORE_A, created.id, { titulo: "Novo", tags: ["a", "a", " b "] })
    expect(updated.titulo).toBe("Novo")
    expect(updated.tags).toEqual(["a", "b"])
  })

  it("não permite editar memória já arquivada", async () => {
    const created = await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "X", conteudo: "y" })
    await archiveOmniAgentMemory(STORE_A, created.id)
    await expect(updateOmniAgentMemory(STORE_A, created.id, { titulo: "Y" })).rejects.toThrow(
      /arquivada não pode ser editada/,
    )
  })

  it("arquivar nunca apaga fisicamente (status vira arquivado, registro continua existindo)", async () => {
    const created = await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "X", conteudo: "y" })
    const archived = await archiveOmniAgentMemory(STORE_A, created.id)
    expect(archived.status).toBe("arquivado")
    expect(h.store.memories).toHaveLength(1)
  })

  it("não permite editar/arquivar memória de outra loja", async () => {
    const created = await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "X", conteudo: "y" })
    await expect(updateOmniAgentMemory(STORE_B, created.id, { titulo: "Y" })).rejects.toThrow(/não encontrada/)
    await expect(archiveOmniAgentMemory(STORE_B, created.id)).rejects.toThrow(/não encontrada/)
  })
})

describe("auditoria", () => {
  it("registra criação, edição e arquivamento em logsAuditoria", async () => {
    const created = await createOmniAgentMemory(STORE_A, { tipo: "nota", titulo: "X", conteudo: "y" })
    await updateOmniAgentMemory(STORE_A, created.id, { titulo: "Y" })
    await archiveOmniAgentMemory(STORE_A, created.id)

    const actions = h.store.auditLogs.map((l) => l.action)
    expect(actions).toEqual(["OMNI_AGENT_MEMORY_CREATE", "OMNI_AGENT_MEMORY_UPDATE", "OMNI_AGENT_MEMORY_ARCHIVE"])
  })
})
