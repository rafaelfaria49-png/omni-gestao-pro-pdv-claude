/**
 * OMNI-AGENT-HUB-TIMELINE-REAL-001 — Server action da Timeline Operacional Real (Prisma EM MEMÓRIA).
 *
 * Cobre: agregação de múltiplas origens, isolamento por storeId (inclusive logs_auditoria,
 * que não tem coluna storeId própria), timeline vazia, filtro por origem/cliente, paginação,
 * e o fallback de OS sem `payload.timeline`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

const STORE_A = "loja-a"
const STORE_B = "loja-b"

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const store = {
    memories: [] as Row[],
    commands: [] as Row[],
    auditLogs: [] as Row[],
    ordens: [] as Row[],
    clientes: [] as Row[],
  }
  const reset = () => {
    store.memories = []
    store.commands = []
    store.auditLogs = []
    store.ordens = []
    store.clientes = []
  }

  const prisma = {
    omniAgentMemory: {
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const rows = store.memories.filter(
          (r) => r.storeId === where.storeId && (where.clienteId === undefined || r.clienteId === where.clienteId),
        )
        return take ? rows.slice(0, take) : rows
      },
    },
    omniAgentCommand: {
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const rows = store.commands.filter((r) => r.storeId === where.storeId)
        return take ? rows.slice(0, take) : rows
      },
    },
    logsAuditoria: {
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const actions = (where.action as Row).in as string[]
        const rows = store.auditLogs.filter((r) => actions.includes(r.action as string))
        return take ? rows.slice(0, take) : rows
      },
    },
    ordemServico: {
      findMany: async ({ where, take }: { where: Row; take?: number }) => {
        const rows = store.ordens.filter(
          (r) => r.storeId === where.storeId && (where.clienteId === undefined || r.clienteId === where.clienteId),
        )
        return take ? rows.slice(0, take) : rows
      },
    },
    cliente: {
      findFirst: async ({ where }: { where: Row }) =>
        store.clientes.find((c) => c.id === where.id && c.storeId === where.storeId) ?? null,
    },
  }

  type GuardResult = { ok: true; session: Record<string, never>; permissions: Record<string, never> } | { ok: false; error: string }
  const requireEnterpriseWith = vi.fn<() => Promise<GuardResult>>(async () => ({ ok: true, session: {}, permissions: {} }))

  return { store, prisma, requireEnterpriseWith, reset }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: h.requireEnterpriseWith }))

import { getOmniAgentTimeline } from "./omni-agent-timeline"

beforeEach(() => {
  h.reset()
  h.requireEnterpriseWith.mockClear()
})

describe("getOmniAgentTimeline", () => {
  it("timeline vazia (loja sem nenhum fato registrado) não gera erro", async () => {
    const page = await getOmniAgentTimeline(STORE_A)
    expect(page.events).toEqual([])
    expect(page.total).toBe(0)
  })

  it("agrega múltiplas origens (memória, comando, auditoria de config, OS, cliente) na mesma loja", async () => {
    h.store.memories.push({
      id: "mem-1",
      storeId: STORE_A,
      clienteId: "cli-1",
      tipo: "nota",
      titulo: "Nota",
      conteudo: "x",
      tags: [],
      origem: "manual",
      criadoPor: "Op",
      status: "ativo",
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      updatedAt: new Date("2026-07-01T10:00:00.000Z"),
    })
    h.store.commands.push({
      id: "cmd-1",
      storeId: STORE_A,
      canal: "texto_interno",
      comandoOriginal: "financeiro hoje",
      interpretacao: { intent: "FINANCE_SUMMARY", action: "Resumo financeiro" },
      status: "EXECUTADO",
      resultado: {},
      executadoEm: new Date("2026-07-02T10:00:00.000Z"),
      createdAt: new Date("2026-07-02T09:59:00.000Z"),
    })
    h.store.auditLogs.push({
      id: "log-1",
      action: "OMNI_AGENT_CONFIG_SAVE",
      detail: "Configuração atualizada",
      metadata: JSON.stringify({ storeId: STORE_A }),
      createdAt: new Date("2026-07-03T10:00:00.000Z"),
    })
    h.store.ordens.push({
      id: "os-1",
      storeId: STORE_A,
      clienteId: "cli-1",
      numero: "OS-1",
      payload: {
        timeline: [
          { id: "ev1", tipo: "criacao", autor: "Sistema", conteudo: "OS criada", criadoEm: "2026-07-04T10:00:00.000Z" },
        ],
      },
      createdAt: new Date("2026-07-04T09:00:00.000Z"),
    })
    h.store.clientes.push({ id: "cli-1", storeId: STORE_A, name: "Maria", createdAt: new Date("2026-01-01T00:00:00.000Z") })

    const page = await getOmniAgentTimeline(STORE_A, { clienteId: "cli-1" })
    const origens = page.events.map((e) => e.origem).sort()
    expect(origens).toEqual(["cliente", "memoria", "ordem_servico"].sort())
    // comando não tem clienteId real (resultado vazio) — não deve aparecer no filtro por cliente
    expect(page.events.some((e) => e.origem === "comando")).toBe(false)
  })

  it("sem filtro de cliente, comando e auditoria de config (loja-wide) aparecem", async () => {
    h.store.commands.push({
      id: "cmd-1",
      storeId: STORE_A,
      canal: "whatsapp",
      comandoOriginal: "financeiro hoje",
      interpretacao: { intent: "FINANCE_SUMMARY", action: "Resumo financeiro" },
      status: "EXECUTADO",
      resultado: {},
      executadoEm: new Date("2026-07-02T10:00:00.000Z"),
      createdAt: new Date("2026-07-02T09:59:00.000Z"),
    })
    h.store.auditLogs.push({
      id: "log-1",
      action: "OMNI_AGENT_CONFIG_SAVE",
      detail: "Configuração atualizada",
      metadata: JSON.stringify({ storeId: STORE_A }),
      createdAt: new Date("2026-07-03T10:00:00.000Z"),
    })
    const page = await getOmniAgentTimeline(STORE_A)
    const origens = page.events.map((e) => e.origem).sort()
    expect(origens).toEqual(["auditoria", "comando"])
  })

  it("isola por storeId, inclusive logs_auditoria (sem coluna storeId própria)", async () => {
    h.store.memories.push({
      id: "mem-b",
      storeId: STORE_B,
      clienteId: null,
      tipo: "nota",
      titulo: "Da loja B",
      conteudo: "x",
      tags: [],
      origem: "manual",
      criadoPor: "Op",
      status: "ativo",
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      updatedAt: new Date("2026-07-01T10:00:00.000Z"),
    })
    h.store.auditLogs.push({
      id: "log-b",
      action: "OMNI_AGENT_CONFIG_SAVE",
      detail: "Config da loja B",
      metadata: JSON.stringify({ storeId: STORE_B }),
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
    })

    const page = await getOmniAgentTimeline(STORE_A)
    expect(page.events).toEqual([])
  })

  it("OS sem payload.timeline usa o evento de fallback (criação)", async () => {
    h.store.ordens.push({
      id: "os-legado",
      storeId: STORE_A,
      clienteId: null,
      numero: "OS-LEGADO",
      payload: { algumSnapshotLegado: true },
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    })
    const page = await getOmniAgentTimeline(STORE_A, { origens: ["ordem_servico"] })
    expect(page.events).toHaveLength(1)
    expect(page.events[0]!.tipo).toBe("os_criacao")
  })

  it("filtro de origens evita buscar fontes não pedidas", async () => {
    h.store.memories.push({
      id: "mem-1",
      storeId: STORE_A,
      clienteId: null,
      tipo: "nota",
      titulo: "x",
      conteudo: "x",
      tags: [],
      origem: "manual",
      criadoPor: "Op",
      status: "ativo",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    h.store.commands.push({
      id: "cmd-1",
      storeId: STORE_A,
      canal: "texto_interno",
      comandoOriginal: "x",
      interpretacao: { intent: "UNKNOWN", action: "x" },
      status: "EXECUTADO",
      resultado: {},
      executadoEm: new Date(),
      createdAt: new Date(),
    })
    const page = await getOmniAgentTimeline(STORE_A, { origens: ["memoria"] })
    expect(page.events.every((e) => e.origem === "memoria")).toBe(true)
  })

  it("paginação: page/pageSize refletidos no resultado", async () => {
    for (let i = 0; i < 5; i++) {
      h.store.memories.push({
        id: `mem-${i}`,
        storeId: STORE_A,
        clienteId: null,
        tipo: "nota",
        titulo: `Nota ${i}`,
        conteudo: "x",
        tags: [],
        origem: "manual",
        criadoPor: "Op",
        status: "ativo",
        createdAt: new Date(2026, 0, i + 1),
        updatedAt: new Date(2026, 0, i + 1),
      })
    }
    const page = await getOmniAgentTimeline(STORE_A, { page: 1, pageSize: 2 })
    expect(page.events).toHaveLength(2)
    expect(page.total).toBe(5)
    expect(page.hasMore).toBe(true)
  })

  it("propaga erro de permissão quando o gate falha", async () => {
    h.requireEnterpriseWith.mockImplementationOnce(async () => ({ ok: false as const, error: "Sem permissão" }))
    await expect(getOmniAgentTimeline(STORE_A)).rejects.toThrow("Sem permissão")
  })
})
